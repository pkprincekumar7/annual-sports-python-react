# macOS - Run as launchd Services

This uses launchd to run the frontend preview server and FastAPI services as services.

## 1) Configure Environment

Create `frontend/.env` and set `VITE_API_URL` before building:

```bash
cd ~/projects/annual-sports-python-react/frontend
printf "VITE_API_URL=/\n" > .env
```

## 2) Build the Frontend

```bash
cd ~/projects/annual-sports-python-react/frontend
npm install
npm run build
```

## 3) Frontend launchd Service

Create `~/Library/LaunchAgents/com.annualsports.frontend.plist`:

Before editing, find your npm path:
```bash
which npm
```
Use that path in `ProgramArguments` (e.g., `/opt/homebrew/bin/npm` on Apple Silicon).

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.annualsports.frontend</string>
    <key>ProgramArguments</key>
    <array>
      <string>/usr/local/bin/npm</string>
      <string>run</string>
      <string>preview</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/YOUR_USER/projects/annual-sports-python-react/frontend</string>
    <key>EnvironmentVariables</key>
    <dict>
      <key>NODE_ENV</key>
      <string>production</string>
      <key>PORT</key>
      <string>5173</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
  </dict>
</plist>
```

Load the service:
```bash
launchctl load ~/Library/LaunchAgents/com.annualsports.frontend.plist
```

## 4) Backend Services (FastAPI)

Create one launchd plist per service. Example for Identity:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.annualsports.identity</string>
    <key>ProgramArguments</key>
    <array>
      <string>/usr/bin/env</string>
      <string>uvicorn</string>
      <string>main:app</string>
      <string>--host</string>
      <string>0.0.0.0</string>
      <string>--port</string>
      <string>8001</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/YOUR_USER/projects/annual-sports-python-react/identity-service</string>
    <key>EnvironmentVariables</key>
    <dict>
      <key>PYTHONUNBUFFERED</key>
      <string>1</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
  </dict>
</plist>
```

Load the service:
```bash
launchctl load ~/Library/LaunchAgents/com.annualsports.identity.plist
```

Create services for the remaining services and ports:
- Enrollment: `8002`
- Department: `8003`
- Sports Participation: `8004`
- Event Configuration: `8005`
- Scheduling: `8006`
- Scoring: `8007`
- Reporting: `8008`

## 5) Manage Services

```bash
launchctl list | grep annualsports
launchctl unload ~/Library/LaunchAgents/com.annualsports.frontend.plist
launchctl unload ~/Library/LaunchAgents/com.annualsports.identity.plist
```
