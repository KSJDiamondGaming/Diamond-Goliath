# Goliath BETA Auto Push + Deploy
# Watches the BETA repo, auto commits, pushes to GitHub,
# then optionally triggers VPS BETA deployment.

param(
    [int]$DebounceSeconds = 2,
    [string]$Branch = "beta",
    [string]$Remote = "origin"
)

$ErrorActionPreference = "Continue"

$ScriptName = "auto-push-beta.ps1"
$LogPrefix = "[auto-beta]"

function Log-Info($msg) { Write-Host "$LogPrefix $msg" -ForegroundColor Cyan }
function Log-Ok($msg) { Write-Host "$LogPrefix $msg" -ForegroundColor Green }
function Log-Warn($msg) { Write-Host "$LogPrefix $msg" -ForegroundColor Yellow }
function Log-Error($msg) { Write-Host "$LogPrefix $msg" -ForegroundColor Red }

function Invoke-Deploy {
    if (-not $env:GOLIATH_BETA_DEPLOY_HOST) {
        Log-Warn "GOLIATH_BETA_DEPLOY_HOST not set. Skipping VPS deploy."
        return
    }

    if (-not $env:GOLIATH_BETA_DEPLOY_COMMAND) {
        Log-Warn "GOLIATH_BETA_DEPLOY_COMMAND not set. Skipping VPS deploy."
        return
    }

    Log-Ok "Triggering VPS BETA deploy..."

    ssh $env:GOLIATH_BETA_DEPLOY_HOST $env:GOLIATH_BETA_DEPLOY_COMMAND

    if ($LASTEXITCODE -eq 0) {
        Log-Ok "VPS BETA deploy complete."
    }
    else {
        Log-Error "VPS BETA deploy failed."
    }
}

function Sync-Repo {
    $changes = git status --porcelain

    if (-not $changes) {
        return
    }

    Log-Info "Changes detected. Preparing BETA sync..."

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

    git add .

    git diff --cached --quiet

    if ($LASTEXITCODE -eq 0) {
        Log-Warn "No staged changes after git add. Skipping commit."
        return
    }

    git commit -m "beta auto sync - $timestamp"

    if ($LASTEXITCODE -ne 0) {
        Log-Warn "Commit skipped or failed."
        return
    }

    git push $Remote $Branch

    if ($LASTEXITCODE -ne 0) {
        Log-Error "Push to $Remote/$Branch failed."
        return
    }

    Log-Ok "Pushed to $Remote/$Branch"

    Invoke-Deploy

    Log-Ok "BETA sync complete."
}

$repoRoot = (Get-Location).Path

Log-Info "Watching Goliath BETA for changes..."
Log-Info "Repo: $repoRoot"
Log-Info "Branch: $Branch"
Log-Info "Remote: $Remote"
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
        $_.Name -ne $ScriptName
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