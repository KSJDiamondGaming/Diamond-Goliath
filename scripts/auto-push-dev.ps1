# Goliath DEV Auto Push + Deploy
# Watches the repo, auto commits, pushes to GitHub,
# then triggers VPS deployment.

param(
    [int]$DebounceSeconds = 2,
    [string]$Branch = "dev",
    [string]$Remote = "origin"
)

$ErrorActionPreference = "Continue"

function Log-Info($msg) { Write-Host "[auto-dev] $msg" -ForegroundColor Cyan }
function Log-Ok($msg) { Write-Host "[auto-dev] $msg" -ForegroundColor Green }
function Log-Warn($msg) { Write-Host "[auto-dev] $msg" -ForegroundColor Yellow }
function Log-Error($msg) { Write-Host "[auto-dev] $msg" -ForegroundColor Red }

function Invoke-Deploy {
    if (-not $env:GOLIATH_DEV_DEPLOY_HOST) { return }
    if (-not $env:GOLIATH_DEV_DEPLOY_COMMAND) { return }

    Log-Ok "Triggering VPS DEV deploy..."

    ssh $env:GOLIATH_DEV_DEPLOY_HOST $env:GOLIATH_DEV_DEPLOY_COMMAND

    if ($LASTEXITCODE -eq 0) {
        Log-Ok "VPS DEV deploy complete."
    }
    else {
        Log-Error "VPS deploy failed."
    }
}

function Sync-Repo {

    $changes = git status --porcelain

    if (-not $changes) {
        return
    }

    Log-Info "Changes detected. Preparing DEV sync..."

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

    git add .

    git diff --cached --quiet

    if ($LASTEXITCODE -eq 0) {
        return
    }

    git commit -m "dev auto sync - $timestamp"

    if ($LASTEXITCODE -ne 0) {
        Log-Warn "Commit skipped."
        return
    }

    git push $Remote $Branch

    if ($LASTEXITCODE -ne 0) {
        Log-Error "Push failed."
        return
    }

    Log-Ok "Pushed to $Remote/$Branch"

    Invoke-Deploy

    Log-Ok "DEV sync complete."
}

$repoRoot = (Get-Location).Path

Log-Info "Watching Goliath for DEV changes..."
Log-Info "Repo: $repoRoot"
Log-Info "Branch: $Branch"
Log-Info "Debounce: $DebounceSeconds second(s)"
Log-Warn "Press CTRL+C to stop."

function Get-RepoSnapshot {

    Get-ChildItem $repoRoot -Recurse -File |
    Where-Object {

        $_.FullName -notmatch "\\\.git\\" -and
        $_.FullName -notmatch "\\node_modules\\" -and
        $_.FullName -notmatch "\\dist\\" -and
        $_.FullName -notmatch "\\build\\" -and
        $_.FullName -notmatch "\\src\\runtime\\" -and
        $_.FullName -notmatch "\\logs\\" -and
        $_.Name -ne ".env" -and
        $_.Name -notmatch "\.log$" -and
        $_.Name -notmatch "\.tmp$" -and
        $_.Name -notmatch "\.db$" -and
        $_.Name -notmatch "\.sqlite$" -and
        $_.Name -ne "auto-push-dev.ps1"
    } |
    Sort-Object FullName |
    ForEach-Object {
        "$($_.FullName)|$($_.LastWriteTimeUtc.Ticks)|$($_.Length)"
    }
}

$lastSnapshot = Get-RepoSnapshot

while ($true) {

    Start-Sleep -Seconds $DebounceSeconds

    $currentSnapshot = Get-RepoSnapshot

    if (($currentSnapshot -join "`n") -ne ($lastSnapshot -join "`n")) {

        Log-Info "Change batch detected."

        $lastSnapshot = $currentSnapshot

        Sync-Repo

        $lastSnapshot = Get-RepoSnapshot
    }
}