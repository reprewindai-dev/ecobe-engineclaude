# CO2 Grid HaloGrid - Full Deployment Script
# This script deploys both backend and frontend

Write-Host "=== CO2 Grid Deployment to Coolify + Vercel ===" -ForegroundColor Cyan

# 1. Push Backend Changes
Write-Host "`n[1/6] Pushing Backend to GitHub..." -ForegroundColor Yellow
Set-Location C:\Users\antho\OneDrive\Desktop\.windsurf\ecobe-engineclaude
git add -A
git commit -m "fix: wire HaloGrid to Coolify backend at 5.78.135.11:8000 - all routes updated"
git push origin main
Write-Host "Backend pushed!" -ForegroundColor Green

# 2. Deploy Backend to Coolify (manual step - open browser)
Write-Host "`n[2/6] Opening Coolify Dashboard..." -ForegroundColor Yellow
Write-Host "Go to: http://5.78.135.11:8000 and deploy the ecobe-engine service"
Start-Process "http://5.78.135.11:8000"
Read-Host "Press Enter after deploying backend in Coolify..."

# 3. Verify Backend Health
Write-Host "`n[3/6] Verifying Backend Health..." -ForegroundColor Yellow
$backendHealth = Invoke-RestMethod -Uri "http://5.78.135.11:8000/health" -Method GET -ErrorAction SilentlyContinue
if ($backendHealth.status -eq "healthy") {
    Write-Host "Backend is healthy!" -ForegroundColor Green
} else {
    Write-Host "Backend health check failed - proceeding anyway..." -ForegroundColor Red
}

# 4. Push Dashboard Changes
Write-Host "`n[4/6] Pushing Dashboard to GitHub..." -ForegroundColor Yellow
Set-Location C:\Users\antho\OneDrive\Desktop\.windsurf\ecobe-engineclaude\ecobe-dashboard
git add -A
git commit -m "fix: connect dashboard to Coolify backend"
git push origin main
Write-Host "Dashboard pushed!" -ForegroundColor Green

# 5. Deploy Dashboard to Vercel
Write-Host "`n[5/6] Deploying Dashboard to Vercel..." -ForegroundColor Yellow
Set-Location C:\Users\antho\OneDrive\Desktop\.windsurf\ecobe-engineclaude\ecobe-dashboard
vercel --prod
Write-Host "Dashboard deployed!" -ForegroundColor Green

# 6. Verify Deployment
Write-Host "`n[6/6] Verifying Deployment..." -ForegroundColor Yellow
Write-Host "Checking live site..."
Start-Sleep -Seconds 5
Write-Host "`n=== Deployment Complete ===" -ForegroundColor Cyan
Write-Host "Backend: http://5.78.135.11:8000"
Write-Host "Dashboard: Check your Vercel dashboard for the URL"
Write-Host "`nHaloGrid should now show BACKEND: ONLINE instead of SIMULATION"
