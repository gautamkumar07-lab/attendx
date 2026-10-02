import React,{useEffect,useRef,useState} from 'react';
import {ResponsiveContainer,AreaChart,Area,XAxis,YAxis,Tooltip,BarChart,Bar,CartesianGrid} from 'recharts';
let token=localStorage.t||'';
const api=async(p,o={})=>{const r=await fetch('/api'+p,{method:o.body?'POST':(o.method||'GET'),headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:o.body&&JSON.stringify(o.body)});
 const j=r.headers.get('content-type')?.includes('json')?await r.json():await r.text();if(!r.ok)throw new Error(j.error||'Error');return j};
const T=({rows,cols})=><div className="tbl"><table><thead><tr>{cols.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{cols.map(c=><td key={c}>{String(r[c]??'-').slice(0,24)}</td>)}</tr>)}</tbody></table></div>;
function Login({done}){const[f,setF]=useState({email:'admin@example.com',password:'Admin@123'}),[mfa,setM]=useState(false),[err,setE]=useState(''),[su,setS]=useState(false);
 const go=async()=>{try{const r=await api(su?'/auth/signup':'/auth/login',{body:f});if(r.mfa_required)return setM(true);token=r.token;localStorage.t=token;done()}catch(e){setE(e.message)}};
 const s=k=>e=>setF({...f,[k]:e.target.value});
 return<div className="glass login"><h2>AttendX</h2>{su&&<input placeholder="Full name" onChange={s('full_name')}/>}<input placeholder="Email" value={f.email} onChange={s('email')}/>
 <input type="password" placeholder="Password" value={f.password} onChange={s('password')}/>{mfa&&<input placeholder="6-digit MFA code" onChange={s('code')}/>}
 <button className="p" onClick={go}>{su?'Sign up':'Sign in'}</button><small style={{color:'crimson'}}>{err}</small><a href="#" onClick={e=>{e.preventDefault();setS(!su)}}>{su?'Have an account?':'Create account'}</a></div>}
function Dashboard(){const[d,setD]=useState();useEffect(()=>{const l=()=>api('/analytics/summary').then(setD).catch(()=>{});l();const i=setInterval(l,15000);return()=>clearInterval(i)},[]);
 if(!d)return<div className="glass">Loading…</div>;const pct=d.total?Math.round(100*d.present/d.total):0;
 return<><div className="grid">{[['Employees',d.total],['Present',d.present],['Late',d.late],['On leave',d.on_leave],['Absent',d.absent],['Attendance %',pct+'%']].map(([k,v])=><div className="glass stat" key={k}><b>{v}</b><span>{k}</span></div>)}</div>
 <div className="glass"><h3>14-day trend</h3><ResponsiveContainer height={240}><AreaChart data={d.trend}><XAxis dataKey="d" tickFormatter={x=>x.slice(5)}/><YAxis/><Tooltip/><Area dataKey="present" stroke="#3b6ef5" fill="#3b6ef555"/><Area dataKey="late" stroke="#f59e0b" fill="#f59e0b44"/></AreaChart></ResponsiveContainer></div>
 <div className="glass"><h3>Department attendance % (30d)</h3><ResponsiveContainer height={220}><BarChart data={d.dept}><CartesianGrid strokeDasharray="3 3" opacity={.2}/><XAxis dataKey="name"/><YAxis/><Tooltip/><Bar dataKey="pct" fill="#8b5cf6" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div></>}
function Attend(){const[rows,setR]=useState([]),[msg,setMsg]=useState(''),[cam,setCam]=useState(false),v=useRef();const load=()=>api('/attendance/mine').then(setR);useEffect(()=>{load()},[]);
 const pos=()=>new Promise(r=>navigator.geolocation?navigator.geolocation.getCurrentPosition(p=>r({lat:p.coords.latitude,lng:p.coords.longitude}),()=>r({}),{timeout:6000}):r({}));
 const act=async(p,body={})=>{try{setMsg('');await api(p,{body});load();setMsg('Done ✓')}catch(e){setMsg(e.message)}};
 const device_id=localStorage.dev||(localStorage.dev=crypto.randomUUID());
 const checkIn=async(method='manual',extra={})=>act('/attendance/check-in',{...await pos(),method,device_id,...extra});
 const openCam=async()=>{setCam(true);const s=await navigator.mediaDevices.getUserMedia({video:true});setTimeout(()=>{v.current.srcObject=s},50)};
 return<><div className="glass"><h3>My attendance</h3><div className="row"><button className="p" onClick={()=>checkIn()}>Check in</button><button onClick={()=>act('/attendance/check-out')}>Check out</button>
 <button onClick={()=>act('/attendance/break',{minutes:15})}>+15m break</button><button onClick={openCam}>Live camera</button><button onClick={()=>{const c=prompt('Scan/enter QR code');c&&checkIn('qr',{qr:c})}}>QR</button></div>
 <p>{msg}</p>{cam&&<><video ref={v} autoPlay playsInline muted/><div><button className="p" onClick={()=>checkIn('face')}>Capture &amp; check in</button></div></>}</div>
 <div className="glass"><T rows={rows.map(r=>({...r,check_in:r.check_in?.slice(11,16),check_out:r.check_out?.slice(11,16),work_date:r.work_date.slice(0,10)}))} cols={['work_date','check_in','check_out','status','is_late','work_hours','overtime_hours']}/></div></>}
function Employees(){const[rows,setR]=useState([]),[s,setS]=useState(''),[f,setF]=useState({});const load=()=>api('/employees?search='+encodeURIComponent(s)).then(setR);useEffect(()=>{load()},[s]);
 return<><div className="glass"><h3>Employees</h3><div className="row"><input placeholder="Search…" onChange={e=>setS(e.target.value)}/>
 <input placeholder="Name" onChange={e=>setF({...f,full_name:e.target.value})}/><input placeholder="Email" onChange={e=>setF({...f,email:e.target.value})}/>
 <select onChange={e=>setF({...f,role:e.target.value})}>{['employee','manager','hr','admin'].map(r=><option key={r}>{r}</option>)}</select>
 <button className="p" onClick={()=>api('/employees',{body:f}).then(load).catch(e=>alert(e.message))}>Add</button></div></div>
 <div className="glass"><T rows={rows} cols={['emp_code','full_name','email','role','department','designation']}/></div></>}
function Leave({me}){const[rows,setR]=useState([]),[bal,setB]=useState([]),[types,setT]=useState([]),[f,setF]=useState({}),mgr=['admin','hr','manager'].includes(me.role);
 const load=()=>{api('/leave').then(setR);api('/leave/balance').then(setB)};useEffect(()=>{load();api('/leave/types').then(setT)},[]);
 return<><div className="grid">{bal.map(b=><div className="glass stat" key={b.name}><b>{b.remaining}</b><span>{b.name} left / {b.yearly_quota}</span></div>)}</div>
 <div className="glass row"><select onChange={e=>setF({...f,leave_type_id:e.target.value})}><option>Type</option>{types.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
 <input type="date" onChange={e=>setF({...f,from_date:e.target.value})}/><input type="date" onChange={e=>setF({...f,to_date:e.target.value})}/><input placeholder="Reason" onChange={e=>setF({...f,reason:e.target.value})}/>
 <button className="p" onClick={()=>api('/leave',{body:f}).then(load)}>Request</button></div>
 <div className="glass"><T rows={rows.map(r=>({...r,from_date:r.from_date.slice(0,10),to_date:r.to_date.slice(0,10)}))} cols={['full_name','type','from_date','to_date','status']}/>
 {mgr&&rows.filter(r=>r.status==='pending').map(r=><div className="row" key={r.id}>#{r.id} {r.full_name}<button onClick={()=>api(`/leave/${r.id}/approve`,{body:{}}).then(load)}>Approve</button><button onClick={()=>api(`/leave/${r.id}/reject`,{body:{}}).then(load)}>Reject</button></div>)}</div></>}
function Reports(){const[rows,setR]=useState([]);useEffect(()=>{api('/attendance').then(setR)},[]);
 const csv=async()=>{const t=await api('/reports/attendance.csv');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([t]));a.download='attendance.csv';a.click()};
 return<div className="glass"><div className="row"><h3>Reports</h3><button className="p" onClick={csv}>Export CSV</button><button onClick={()=>window.print()}>Print / PDF</button></div>
 <T rows={rows.map(r=>({...r,work_date:r.work_date.slice(0,10)}))} cols={['work_date','full_name','department','status','is_late','work_hours','overtime_hours']}/></div>}
function Admin(){const[a,setA]=useState([]),[u,setU]=useState([]);useEffect(()=>{api('/admin/audit').then(setA);api('/admin/users').then(setU)},[]);
 return<><div className="glass"><h3>Users</h3><T rows={u} cols={['id','email','role','active','mfa_enabled']}/></div><div className="glass"><h3>Audit log</h3><T rows={a} cols={['created_at','user_id','action']}/></div></>}
function Security(){const[s,setS]=useState(),[c,setC]=useState('');return<div className="glass"><h3>Multi-factor authentication</h3>
 <button onClick={()=>api('/auth/mfa/setup',{body:{}}).then(setS)}>Generate secret</button>
 {s&&<><p>Add this secret to an authenticator app: <code>{s.secret}</code></p><div className="row"><input placeholder="Code" onChange={e=>setC(e.target.value)}/><button className="p" onClick={()=>api('/auth/mfa/enable',{body:{code:c}}).then(()=>alert('MFA enabled')).catch(e=>alert(e.message))}>Enable</button></div></>}</div>}
export default function App(){const[me,setMe]=useState(),[tab,setTab]=useState('Dashboard'),[th,setTh]=useState(localStorage.th||'light');
 useEffect(()=>{document.documentElement.dataset.theme=th;localStorage.th=th},[th]);
 const boot=()=>token?api('/auth/me').then(setMe).catch(()=>{token='';localStorage.t='';setMe(null)}):setMe(null);useEffect(()=>{boot()},[]);
 if(me===undefined)return null;if(!me)return<Login done={boot}/>;
 const mgr=['admin','hr','manager'].includes(me.role);
 const tabs=[mgr&&'Dashboard','Attendance',mgr&&'Employees','Leave',mgr&&'Reports',me.role==='admin'&&'Admin','Security'].filter(Boolean);const t=tabs.includes(tab)?tab:tabs[0];
 const V={Dashboard:<Dashboard/>,Attendance:<Attend/>,Employees:<Employees/>,Leave:<Leave me={me}/>,Reports:<Reports/>,Admin:<Admin/>,Security:<Security/>}[t];
 return<div className="app"><nav className="glass"><b>AttendX</b><small>{me.full_name} · {me.role}</small>{tabs.map(x=><button key={x} className={x===t?'on':''} onClick={()=>setTab(x)}>{x}</button>)}
 <button onClick={()=>setTh(th==='dark'?'light':'dark')}>{th==='dark'?'☀ Light':'🌙 Dark'}</button><button onClick={()=>{token='';localStorage.t='';setMe(null)}}>Sign out</button></nav><main>{V}</main></div>}
