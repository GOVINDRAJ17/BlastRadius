# ==============================================================================
# BlastRadius 2.0 - Fault Tolerance & Load Balancing Failover Demo (PowerShell)
# Sends requests through NGINX (http://localhost:8080/health),
# tallies replica distribution, stops api-2, verifies zero 5xx errors,
# and verifies recovery after restarting api-2.
# ==============================================================================

param(
    [string]$TargetUrl = "http://localhost:8080/health",
    [string]$StatusUrl = "http://localhost:8080/api/infra/status"
)

$ErrorActionPreference = "Continue"

function Send-Batch {
    param([int]$Count, [string]$PhaseName)
    Write-Host "`n>>> Running $PhaseName ($Count requests to $TargetUrl)..." -ForegroundColor Cyan
    $tallies = @{}
    $errors = 0

    for ($i = 1; $i -le $Count; $i++) {
        try {
            $resp = Invoke-RestMethod -Uri $TargetUrl -Method Get -TimeoutSec 3 -ErrorAction Stop
            $instance = if ($resp.instance_id) { $resp.instance_id } else { "unknown" }
            if (-not $tallies.ContainsKey($instance)) {
                $tallies[$instance] = 0
            }
            $tallies[$instance]++
        }
        catch {
            $errors++
            Write-Host " [!] Request $i failed: $($_.Exception.Message)" -ForegroundColor Red
        }
    }

    Write-Host "--- Results for $PhaseName ---" -ForegroundColor Yellow
    foreach ($k in ($tallies.Keys | Sort-Object)) {
        Write-Host "  * Replica $k : $($tallies[$k]) requests" -ForegroundColor Green
    }
    Write-Host "  * Failed/5xx : $errors errors" -ForegroundColor $(if ($errors -eq 0) { "Green" } else { "Red" })

    return @{ Tallies = $tallies; Errors = $errors }
}

Write-Host "==========================================================" -ForegroundColor Magenta
Write-Host "  BlastRadius 2.0 - NGINX Load Balancing & Failover Test" -ForegroundColor Magenta
Write-Host "==========================================================" -ForegroundColor Magenta

# Step 1: Baseline 3-replica distribution
$batch1 = Send-Batch -Count 30 -PhaseName "Phase 1: All 3 Replicas Online"

# Step 2: Stop api-2
Write-Host "`n>>> Stopping api-2 (simulating sudden container failure)..." -ForegroundColor Red
docker compose stop api-2

# Wait 2 seconds for NGINX passive window
Start-Sleep -Seconds 2

# Step 3: Send 30 requests while api-2 is down
$batch2 = Send-Batch -Count 30 -PhaseName "Phase 2: api-2 Offline (Failover Verification)"

if ($batch2.Errors -eq 0 -and (-not $batch2.Tallies.ContainsKey("api-2"))) {
    Write-Host "  SUCCESS: Zero 5xx errors during failover. Requests gracefully routed to api-1 and api-3!" -ForegroundColor Green
} else {
    Write-Host "  FAIL: Errors occurred or stopped replica answered." -ForegroundColor Red
}

# Step 4: Check infra status endpoint
Write-Host "`n>>> Checking /api/infra/status..." -ForegroundColor Cyan
try {
    $infra = Invoke-RestMethod -Uri $StatusUrl -Method Get -TimeoutSec 3
    Write-Host "  Active Replicas : $($infra.active_replicas)/$($infra.total_replicas)" -ForegroundColor Yellow
    foreach ($r in $infra.replicas) {
        Write-Host "   - $($r.instance_id) : $($r.status)" -ForegroundColor $(if ($r.status -eq "healthy") { "Green" } else { "DarkYellow" })
    }
} catch {
    Write-Host "  Could not reach $StatusUrl ($($_.Exception.Message))" -ForegroundColor DarkGray
}

# Step 5: Restart api-2 and confirm recovery
Write-Host "`n>>> Restarting api-2 (simulating container recovery)..." -ForegroundColor Cyan
docker compose start api-2
Write-Host "  Waiting 6s for api-2 container healthcheck..."
Start-Sleep -Seconds 6

$batch3 = Send-Batch -Count 30 -PhaseName "Phase 3: api-2 Recovered (Full Cluster Restored)"

Write-Host "`n==========================================================" -ForegroundColor Magenta
Write-Host "  Failover and Recovery Verification Complete!" -ForegroundColor Magenta
Write-Host "==========================================================" -ForegroundColor Magenta

