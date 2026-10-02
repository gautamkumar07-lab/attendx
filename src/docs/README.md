# AttendX – Attendance Management System

## Architecture
Browser (React SPA served by nginx) -> REST /api (Node/Express, JWT + RBAC) -> PostgreSQL. The API is stateless, so it scales horizontally behind any load balancer.

## Folder structure
backend/src/server.js   API (auth, employees, attendance, leave, analytics, reports, admin)
backend/db/schema.sql   Schema (auto-applied on start)
frontend/src            React app (Vite, Recharts)
docker-compose.yml      db + api + web

## Database
users 1-1 employees; employees -> departments, designations; attendance (unique employee+date); leave_types, leave_requests, holidays; corrections; audit_logs; settings. Full DDL in backend/db/schema.sql.

## API
POST /auth/signup | login | mfa/setup | mfa/enable ; GET /auth/me
CRUD /employees, /departments, /designations
POST /attendance/check-in | check-out | break ; GET /attendance/mine ; GET /attendance
POST,GET /leave ; POST /leave/:id/approve|reject ; GET /leave/balance ; /holidays
POST,GET /corrections ; POST /corrections/:id/approve
GET /analytics/summary ; GET /reports/attendance.csv ; /admin/audit | users | settings

## Roles
admin: everything. hr: employees, leave, corrections, reports. manager: team data, leave approval. employee: own attendance and leave.

## Wireframes
Login: centred glass card (email, password, MFA code).
Shell: left nav (Dashboard, Attendance, Employees, Leave, Reports, Admin, Security, theme, sign out) + content; nav becomes a top scroller on mobile.
Dashboard: 6 stat cards / 14-day trend area chart / department bar chart.
Attendance: Check in/out, Break, Camera, QR buttons / live video / history table.

## Run locally
docker compose up --build  -> web http://localhost:8080, API :4000
Login admin@example.com / Admin@123 (change immediately). Set JWT_SECRET and QR_SECRET.

## Deploy
Push the two images to a registry and run them on ECS / Cloud Run / Azure Container Apps / Kubernetes with a managed Postgres (RDS / Cloud SQL). Set DATABASE_URL, JWT_SECRET, CORS_ORIGIN, SMTP_*. Terminate HTTPS at the load balancer (camera and geolocation require it). Backups: managed-DB snapshots or pg_dump.

## Not included yet
Real face recognition and anti-spoofing (camera capture is wired; plug in face-api.js or a vendor), SMS (add Twilio in notify()), server-side PDF/XLSX (CSV + browser print provided), photo upload storage, department/designation/holiday/correction UIs (APIs exist).
