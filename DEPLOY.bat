@echo off
echo === CO2 Grid Deployment ===
echo.

echo [1/3] Pushing Backend Changes...
cd /d C:\Users\antho\OneDrive\Desktop\.windsurf\ecobe-engineclaude
git add -A
git commit -m "fix: wire HaloGrid to Coolify backend"
git push origin main
echo Backend pushed!
echo.

echo [2/3] Pushing Dashboard Changes...
cd /d C:\Users\antho\OneDrive\Desktop\.windsurf\ecobe-engineclaude\ecobe-dashboard
git add -A
git commit -m "fix: connect dashboard to Coolify backend"
git push origin main
echo Dashboard pushed!
echo.

echo [3/3] Manual Deployment Steps:
echo 1. Go to http://5.78.135.11:8000 (Coolify)
echo 2. Create new service for ecobe-engineclaude
echo 3. Use docker-compose.prod.yml
echo 4. Set environment variables
echo 5. Deploy dashboard with: vercel --prod
echo.
pause
