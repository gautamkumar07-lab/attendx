const express=require('express'),cors=require('cors'),helmet=require('helmet'),rl=require('express-rate-limit');
const bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken'),{authenticator}=require('otplib'),{Pool}=require('pg');
const fs=require('fs'),path=require('path'),nodemailer=require('nodemailer');
const SECRET=process.env.JWT_SECRET||'change-me';
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const q=(s,p)=>pool.query(s,p).then(r=>r.rows);
const app=express();app.use(helmet(),cors({origin:process.env.CORS_ORIGIN||true}),express.json({limit:'5mb'}));
app.use('/api/auth',rl({windowMs:60000,max:30}));
const mailer=process.env.SMTP_HOST?nodemailer.createTransport({host:process.env.SMTP_HOST,port:587,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}}):null;
const notify=async(to,subject,text)=>{try{mailer?await mailer.sendMail({from:process.env.SMTP_USER,to,subject,text}):console.log('[mail]',to,subject)}catch(e){console.error(e.message)}};
const audit=(u,a,d)=>q('INSERT INTO audit_logs(user_id,action,detail) VALUES($1,$2,$3)',[u,a,d||{}]).catch(()=>{});
const wrap=f=>(req,res)=>f(req,res).catch(e=>{console.error(e);res.status(500).json({error:e.message})});
const auth=(...roles)=>(req,res,next)=>{try{const u=jwt.verify((req.headers.authorization||'').replace('Bearer ',''),SECRET);
 if(roles.length&&!roles.includes(u.role))return res.status(403).json({error:'Forbidden'});req.user=u;next()}catch{res.status(401).json({error:'Unauthorized'})}};
const sign=u=>jwt.sign({id:u.id,role:u.role,email:u.email},SECRET,{expiresIn:'8h'});
const HR=['admin','hr'],MGR=['admin','hr','manager'];
const setting=async k=>(await q('SELECT value FROM settings WHERE key=$1',[k]))[0].value;

// ---- Auth
app.post('/api/auth/signup',wrap(async(req,res)=>{const{email,password,full_name}=req.body;
 if(!email||!password||password.length<8)return res.status(400).json({error:'Email and 8+ char password required'});
 const [u]=await q('INSERT INTO users(email,password_hash,role) VALUES($1,$2,\'employee\') RETURNING *',[email.toLowerCase(),await bcrypt.hash(password,12)]);
 await q('INSERT INTO employees(user_id,full_name,emp_code) VALUES($1,$2,$3)',[u.id,full_name||email,'E'+String(u.id).padStart(4,'0')]);
 res.json({token:sign(u)})}));
app.post('/api/auth/login',wrap(async(req,res)=>{const{email,password,code}=req.body;
 const [u]=await q('SELECT * FROM users WHERE email=$1 AND active',[(email||'').toLowerCase()]);
 if(!u||!await bcrypt.compare(password||'',u.password_hash))return res.status(401).json({error:'Invalid credentials'});
 if(u.mfa_enabled){if(!code)return res.json({mfa_required:true});if(!authenticator.check(code,u.mfa_secret))return res.status(401).json({error:'Invalid MFA code'})}
 await audit(u.id,'login');res.json({token:sign(u),role:u.role})}));
app.get('/api/auth/me',auth(),wrap(async(req,res)=>res.json((await q('SELECT u.id,u.email,u.role,u.mfa_enabled,e.id employee_id,e.full_name FROM users u LEFT JOIN employees e ON e.user_id=u.id WHERE u.id=$1',[req.user.id]))[0])));
app.post('/api/auth/mfa/setup',auth(),wrap(async(req,res)=>{const s=authenticator.generateSecret();await q('UPDATE users SET mfa_secret=$1 WHERE id=$2',[s,req.user.id]);
 res.json({secret:s,otpauth:authenticator.keyuri(req.user.email,'AttendX',s)})}));
app.post('/api/auth/mfa/enable',auth(),wrap(async(req,res)=>{const[u]=await q('SELECT mfa_secret FROM users WHERE id=$1',[req.user.id]);
 if(!authenticator.check(req.body.code,u.mfa_secret))return res.status(400).json({error:'Bad code'});
 await q('UPDATE users SET mfa_enabled=true WHERE id=$1',[req.user.id]);res.json({ok:true})}));

// ---- Employees / departments / designations
app.get('/api/employees',auth(...MGR),wrap(async(req,res)=>{const{search='',department_id}=req.query;
 res.json(await q(`SELECT e.*,u.email,u.role,d.name department,g.title designation FROM employees e JOIN users u ON u.id=e.user_id
 LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN designations g ON g.id=e.designation_id
 WHERE (e.full_name ILIKE $1 OR e.emp_code ILIKE $1 OR u.email ILIKE $1) AND ($2::int IS NULL OR e.department_id=$2) ORDER BY e.id`,['%'+search+'%',department_id||null]))}));
app.post('/api/employees',auth(...HR),wrap(async(req,res)=>{const b=req.body;
 const[u]=await q('INSERT INTO users(email,password_hash,role) VALUES($1,$2,$3) RETURNING id',[b.email.toLowerCase(),await bcrypt.hash(b.password||'Welcome@123',12),b.role||'employee']);
 const[e]=await q('INSERT INTO employees(user_id,emp_code,full_name,phone,photo_url,department_id,designation_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
  [u.id,b.emp_code||'E'+String(u.id).padStart(4,'0'),b.full_name,b.phone,b.photo_url,b.department_id||null,b.designation_id||null]);
 await audit(req.user.id,'employee.create',{id:e.id});res.json(e)}));
app.put('/api/employees/:id',auth(...HR),wrap(async(req,res)=>{const b=req.body;
 const[e]=await q('UPDATE employees SET full_name=COALESCE($1,full_name),phone=COALESCE($2,phone),photo_url=COALESCE($3,photo_url),department_id=COALESCE($4,department_id),designation_id=COALESCE($5,designation_id) WHERE id=$6 RETURNING *',
  [b.full_name,b.phone,b.photo_url,b.department_id,b.designation_id,req.params.id]);
 if(b.role)await q('UPDATE users SET role=$1 WHERE id=$2',[b.role,e.user_id]);await audit(req.user.id,'employee.update',{id:e.id});res.json(e)}));
app.delete('/api/employees/:id',auth('admin'),wrap(async(req,res)=>{const[e]=await q('SELECT user_id FROM employees WHERE id=$1',[req.params.id]);
 if(e)await q('DELETE FROM users WHERE id=$1',[e.user_id]);await audit(req.user.id,'employee.delete',{id:req.params.id});res.json({ok:true})}));
for(const[t,c]of[['departments','name'],['designations','title']]){
 app.get('/api/'+t,auth(),wrap(async(_,res)=>res.json(await q(`SELECT * FROM ${t} ORDER BY id`))));
 app.post('/api/'+t,auth(...HR),wrap(async(req,res)=>res.json((await q(`INSERT INTO ${t}(${c}) VALUES($1) RETURNING *`,[req.body[c]]))[0])));
 app.delete('/api/'+t+'/:id',auth(...HR),wrap(async(req,res)=>{await q(`DELETE FROM ${t} WHERE id=$1`,[req.params.id]);res.json({ok:true})}))}

// ---- Attendance
const dist=(a,b,c,d)=>{const R=6371e3,r=x=>x*Math.PI/180,h=Math.sin(r(c-a)/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(r(d-b)/2)**2;return 2*R*Math.asin(Math.sqrt(h))};
async function myEmp(uid){return(await q('SELECT id FROM employees WHERE user_id=$1',[uid]))[0]}
app.post('/api/attendance/check-in',auth(),wrap(async(req,res)=>{const{lat,lng,method='manual',device_id,qr}=req.body;const e=await myEmp(req.user.id);
 if(lat!=null){const d=dist(lat,lng,+await setting('office_lat'),+await setting('office_lng'));
  if(d>+await setting('geo_radius_m'))return res.status(403).json({error:`Outside allowed area (${Math.round(d)} m away)`})}
 if(method==='qr'&&qr!==(process.env.QR_SECRET||'ATTENDX-OFFICE'))return res.status(403).json({error:'Invalid QR'});
 const start=await setting('shift_start'),now=new Date(),[h,m]=start.split(':').map(Number);
 const late=now.getHours()*60+now.getMinutes()>h*60+m;
 const r=await q(`INSERT INTO attendance(employee_id,check_in,is_late,method,lat,lng,device_id) VALUES($1,now(),$2,$3,$4,$5,$6)
  ON CONFLICT(employee_id,work_date) DO NOTHING RETURNING *`,[e.id,late,method,lat,lng,device_id]);
 if(!r[0])return res.status(409).json({error:'Already checked in today'});
 if(late)notify(req.user.email,'Late arrival','You were marked late today.');res.json(r[0])}));
app.post('/api/attendance/check-out',auth(),wrap(async(req,res)=>{const e=await myEmp(req.user.id);
 const std=+await setting('std_hours'),end=(await setting('shift_end')).split(':').map(Number);
 const[r]=await q(`UPDATE attendance SET check_out=now(),
  work_hours=ROUND((EXTRACT(EPOCH FROM now()-check_in)/3600-break_minutes/60.0)::numeric,2),
  overtime_hours=GREATEST(0,ROUND((EXTRACT(EPOCH FROM now()-check_in)/3600-break_minutes/60.0-$2::numeric)::numeric,2)),
  left_early=(now()::time < make_time($3::int,$4::int,0)) WHERE employee_id=$1 AND work_date=CURRENT_DATE AND check_out IS NULL RETURNING *`,[e.id,std,end[0],end[1]]);
 r?res.json(r):res.status(409).json({error:'No open check-in'})}));
app.post('/api/attendance/break',auth(),wrap(async(req,res)=>{const e=await myEmp(req.user.id);
 res.json((await q('UPDATE attendance SET break_minutes=break_minutes+$1 WHERE employee_id=$2 AND work_date=CURRENT_DATE RETURNING *',[+req.body.minutes||0,e.id]))[0])}));
app.get('/api/attendance/mine',auth(),wrap(async(req,res)=>{const e=await myEmp(req.user.id);
 res.json(await q('SELECT * FROM attendance WHERE employee_id=$1 ORDER BY work_date DESC LIMIT 60',[e.id]))}));
app.get('/api/attendance',auth(...MGR),wrap(async(req,res)=>{const{from,to,department_id}=req.query;
 res.json(await q(`SELECT a.*,e.full_name,e.emp_code,d.name department FROM attendance a JOIN employees e ON e.id=a.employee_id LEFT JOIN departments d ON d.id=e.department_id
  WHERE a.work_date BETWEEN COALESCE($1::date,CURRENT_DATE-30) AND COALESCE($2::date,CURRENT_DATE) AND ($3::int IS NULL OR e.department_id=$3) ORDER BY a.work_date DESC,e.full_name`,[from||null,to||null,department_id||null]))}));
app.post('/api/corrections',auth(),wrap(async(req,res)=>{const b=req.body;
 res.json((await q('INSERT INTO corrections(attendance_id,requested_by,new_check_in,new_check_out,reason) VALUES($1,$2,$3,$4,$5) RETURNING *',[b.attendance_id,req.user.id,b.new_check_in,b.new_check_out,b.reason]))[0])}));
app.get('/api/corrections',auth(...HR),wrap(async(_,res)=>res.json(await q('SELECT * FROM corrections ORDER BY id DESC'))));
app.post('/api/corrections/:id/approve',auth(...HR),wrap(async(req,res)=>{const[c]=await q("UPDATE corrections SET status='approved' WHERE id=$1 RETURNING *",[req.params.id]);
 await q('UPDATE attendance SET check_in=COALESCE($1,check_in),check_out=COALESCE($2,check_out) WHERE id=$3',[c.new_check_in,c.new_check_out,c.attendance_id]);
 await audit(req.user.id,'correction.approve',{id:c.id});res.json(c)}));

// ---- Leave
app.get('/api/leave/types',auth(),wrap(async(_,res)=>res.json(await q('SELECT * FROM leave_types'))));
app.get('/api/leave/balance',auth(),wrap(async(req,res)=>{const e=await myEmp(req.user.id);
 res.json(await q(`SELECT t.name,t.yearly_quota,t.yearly_quota-COALESCE(SUM(r.to_date-r.from_date+1) FILTER(WHERE r.status='approved'),0)::int remaining
  FROM leave_types t LEFT JOIN leave_requests r ON r.leave_type_id=t.id AND r.employee_id=$1 GROUP BY t.id`,[e.id]))}));
app.post('/api/leave',auth(),wrap(async(req,res)=>{const e=await myEmp(req.user.id),b=req.body;
 res.json((await q('INSERT INTO leave_requests(employee_id,leave_type_id,from_date,to_date,reason) VALUES($1,$2,$3,$4,$5) RETURNING *',[e.id,b.leave_type_id,b.from_date,b.to_date,b.reason]))[0])}));
app.get('/api/leave',auth(),wrap(async(req,res)=>{const mgr=MGR.includes(req.user.role),e=await myEmp(req.user.id);
 res.json(await q(`SELECT r.*,x.full_name,t.name type FROM leave_requests r JOIN employees x ON x.id=r.employee_id JOIN leave_types t ON t.id=r.leave_type_id
  WHERE ($1::boolean OR r.employee_id=$2) ORDER BY r.id DESC`,[mgr,e.id]))}));
app.post('/api/leave/:id/:decision',auth(...MGR),wrap(async(req,res)=>{const st=req.params.decision==='approve'?'approved':'rejected';
 const[r]=await q('UPDATE leave_requests SET status=$1,decided_by=$2 WHERE id=$3 RETURNING *',[st,req.user.id,req.params.id]);
 if(st==='approved')await q(`INSERT INTO attendance(employee_id,work_date,status) SELECT $1,d::date,'leave' FROM generate_series($2::date,$3::date,'1 day') d ON CONFLICT DO NOTHING`,[r.employee_id,r.from_date,r.to_date]);
 const[u]=await q('SELECT u.email FROM users u JOIN employees e ON e.user_id=u.id WHERE e.id=$1',[r.employee_id]);
 notify(u.email,'Leave '+st,`Your leave request was ${st}.`);await audit(req.user.id,'leave.'+st,{id:r.id});res.json(r)}));
app.get('/api/holidays',auth(),wrap(async(_,res)=>res.json(await q('SELECT * FROM holidays ORDER BY on_date'))));
app.post('/api/holidays',auth(...HR),wrap(async(req,res)=>res.json((await q('INSERT INTO holidays(on_date,name) VALUES($1,$2) RETURNING *',[req.body.on_date,req.body.name]))[0])));

// ---- Analytics, reports, admin
app.get('/api/analytics/summary',auth(...MGR),wrap(async(_,res)=>{
 const[t]=await q('SELECT COUNT(*)::int total FROM employees');
 const[today]=await q(`SELECT COUNT(*) FILTER(WHERE status='present')::int present,COUNT(*) FILTER(WHERE is_late)::int late,COUNT(*) FILTER(WHERE status='leave')::int on_leave FROM attendance WHERE work_date=CURRENT_DATE`);
 const trend=await q(`SELECT work_date::text d,COUNT(*) FILTER(WHERE status='present')::int present,COUNT(*) FILTER(WHERE is_late)::int late FROM attendance WHERE work_date>CURRENT_DATE-14 GROUP BY 1 ORDER BY 1`);
 const dept=await q(`SELECT COALESCE(d.name,'Unassigned') name,ROUND(100.0*COUNT(*) FILTER(WHERE a.status='present')/NULLIF(COUNT(*),0),1)::float pct,ROUND(AVG(a.work_hours),1)::float avg_hours
  FROM attendance a JOIN employees e ON e.id=a.employee_id LEFT JOIN departments d ON d.id=e.department_id WHERE a.work_date>CURRENT_DATE-30 GROUP BY 1`);
 res.json({total:t.total,...today,absent:Math.max(0,t.total-today.present-today.on_leave),trend,dept})}));
app.get('/api/reports/attendance.csv',auth(...MGR),wrap(async(req,res)=>{
 const rows=await q(`SELECT e.emp_code,e.full_name,a.work_date::text,a.check_in,a.check_out,a.status,a.is_late,a.work_hours,a.overtime_hours FROM attendance a JOIN employees e ON e.id=a.employee_id
  WHERE a.work_date BETWEEN COALESCE($1::date,CURRENT_DATE-30) AND COALESCE($2::date,CURRENT_DATE) ORDER BY 3`,[req.query.from||null,req.query.to||null]);
 const head=Object.keys(rows[0]||{emp_code:1});res.type('text/csv').attachment('attendance.csv')
  .send([head.join(','),...rows.map(r=>head.map(k=>JSON.stringify(r[k]??'')).join(','))].join('\n'))}));
app.get('/api/admin/audit',auth('admin'),wrap(async(_,res)=>res.json(await q('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 200'))));
app.get('/api/admin/settings',auth('admin'),wrap(async(_,res)=>res.json(await q('SELECT * FROM settings'))));
app.put('/api/admin/settings',auth('admin'),wrap(async(req,res)=>{for(const[k,v]of Object.entries(req.body))await q('INSERT INTO settings VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2',[k,String(v)]);res.json({ok:true})}));
app.get('/api/admin/users',auth('admin'),wrap(async(_,res)=>res.json(await q('SELECT id,email,role,active,mfa_enabled FROM users ORDER BY id'))));
app.put('/api/admin/users/:id',auth('admin'),wrap(async(req,res)=>{await q('UPDATE users SET role=COALESCE($1,role),active=COALESCE($2,active) WHERE id=$3',[req.body.role,req.body.active,req.params.id]);await audit(req.user.id,'user.update',{id:req.params.id});res.json({ok:true})}));
app.get('/health',(_,res)=>res.json({ok:true}));

(async()=>{for(let i=0;i<20;i++){try{await pool.query(fs.readFileSync(path.join(__dirname,'../db/schema.sql'),'utf8'));break}catch(e){console.log('waiting for db...');await new Promise(r=>setTimeout(r,2000))}}
 if(!(await q('SELECT 1 FROM users LIMIT 1')).length){const[u]=await q("INSERT INTO users(email,password_hash,role) VALUES('admin@example.com',$1,'admin') RETURNING id",[await bcrypt.hash('Admin@123',12)]);
  await q("INSERT INTO employees(user_id,full_name,emp_code) VALUES($1,'System Admin','E0001')",[u.id]);console.log('Seeded admin@example.com / Admin@123')}
 app.listen(process.env.PORT||4000,()=>console.log('API up'))})();
