CREATE TABLE IF NOT EXISTS departments(id SERIAL PRIMARY KEY,name TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS designations(id SERIAL PRIMARY KEY,title TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'employee' CHECK(role IN('admin','hr','manager','employee')),
 mfa_secret TEXT,mfa_enabled BOOLEAN DEFAULT false,active BOOLEAN DEFAULT true,created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS employees(id SERIAL PRIMARY KEY,user_id INT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
 emp_code TEXT UNIQUE,full_name TEXT NOT NULL,phone TEXT,photo_url TEXT,
 department_id INT REFERENCES departments(id),designation_id INT REFERENCES designations(id),
 manager_id INT REFERENCES employees(id),joined_on DATE DEFAULT CURRENT_DATE);
CREATE TABLE IF NOT EXISTS attendance(id SERIAL PRIMARY KEY,employee_id INT REFERENCES employees(id) ON DELETE CASCADE,
 work_date DATE NOT NULL DEFAULT CURRENT_DATE,check_in TIMESTAMPTZ,check_out TIMESTAMPTZ,break_minutes INT DEFAULT 0,
 status TEXT DEFAULT 'present' CHECK(status IN('present','absent','leave','holiday')),
 is_late BOOLEAN DEFAULT false,left_early BOOLEAN DEFAULT false,work_hours NUMERIC(5,2),overtime_hours NUMERIC(5,2),
 method TEXT DEFAULT 'manual',lat DOUBLE PRECISION,lng DOUBLE PRECISION,device_id TEXT,UNIQUE(employee_id,work_date));
CREATE TABLE IF NOT EXISTS leave_types(id SERIAL PRIMARY KEY,name TEXT UNIQUE NOT NULL,yearly_quota INT DEFAULT 12);
CREATE TABLE IF NOT EXISTS leave_requests(id SERIAL PRIMARY KEY,employee_id INT REFERENCES employees(id),leave_type_id INT REFERENCES leave_types(id),
 from_date DATE,to_date DATE,reason TEXT,status TEXT DEFAULT 'pending' CHECK(status IN('pending','approved','rejected')),decided_by INT REFERENCES users(id));
CREATE TABLE IF NOT EXISTS holidays(id SERIAL PRIMARY KEY,on_date DATE UNIQUE,name TEXT);
CREATE TABLE IF NOT EXISTS corrections(id SERIAL PRIMARY KEY,attendance_id INT REFERENCES attendance(id),requested_by INT REFERENCES users(id),
 new_check_in TIMESTAMPTZ,new_check_out TIMESTAMPTZ,reason TEXT,status TEXT DEFAULT 'pending');
CREATE TABLE IF NOT EXISTS audit_logs(id SERIAL PRIMARY KEY,user_id INT,action TEXT,detail JSONB,created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT);
INSERT INTO settings VALUES('shift_start','09:30'),('shift_end','18:00'),('std_hours','8'),('office_lat','28.6139'),('office_lng','77.2090'),('geo_radius_m','300') ON CONFLICT DO NOTHING;
INSERT INTO leave_types(name,yearly_quota) VALUES('Casual',12),('Sick',10),('Earned',15) ON CONFLICT DO NOTHING;
