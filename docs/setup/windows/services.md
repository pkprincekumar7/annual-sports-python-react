# Windows - Run as Services (NSSM)

This uses **NSSM** (Non-Sucking Service Manager) to run the frontend preview server and FastAPI services as Windows services.

## 1) Install NSSM

Download: https://nssm.cc/download

Extract and add the folder to PATH or reference the full path to `nssm.exe`.

## 2) Configure Environment

Create `frontend/.env` and set `VITE_API_URL` before building:

```powershell
cd C:\annual-sports-event-full\new-structure\frontend
"VITE_API_URL=/" | Out-File -FilePath .env -Encoding ascii
```

## 3) Build the Frontend

```powershell
cd C:\annual-sports-event-full\new-structure\frontend
npm install
npm run build
```

## 4) Create Frontend Service

```powershell
nssm install AnnualSportsFrontend "C:\\Program Files\\nodejs\\npm.cmd" "run preview"
```

Set:
- **Startup directory**: `C:\annual-sports-event-full\new-structure\frontend`
- **Environment**: `NODE_ENV=production`, `PORT=5173`

Start the service:
```powershell
nssm start AnnualSportsFrontend
```

## 5) Create Backend Services (FastAPI)

```powershell
cd C:\annual-sports-event-full\new-structure\identity-service
pip install -r requirements.txt
```

Find your Python path:

```powershell
where python
```

Create the Identity service:

```powershell
nssm install AnnualSportsIdentity "C:\\Path\\To\\python.exe" "-m uvicorn main:app --host 0.0.0.0 --port 8001"
```

Set:
- **Startup directory**: `C:\annual-sports-event-full\new-structure\identity-service`

Start the service:
```powershell
nssm start AnnualSportsIdentity
```

Create services for the remaining services and ports:
- Enrollment: `8002`
- Department: `8003`
- Sports Participation: `8004`
- Event Configuration: `8005`
- Scheduling: `8006`
- Scoring: `8007`
- Reporting: `8008`

## 6) Manage Services

```powershell
nssm status AnnualSportsFrontend
nssm restart AnnualSportsFrontend
nssm stop AnnualSportsFrontend
```

```powershell
nssm status AnnualSportsIdentity
nssm restart AnnualSportsIdentity
nssm stop AnnualSportsIdentity
```
