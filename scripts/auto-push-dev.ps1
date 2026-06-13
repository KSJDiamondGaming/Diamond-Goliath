# Goliath DEV auto-sync watcher
#
# Watches local source files, commits changes to the dev branch, pushes to GitHub,
# then optionally runs a deploy command.
#
# Usage from repo root:
#   npm run auto:dev
#
# Optional deploy env vars:
#   $env:GOLIATH_DEV_DEPLOY_HOST="root@your-server"
#   $env:GOLIATH_DEV_DEPLOY_COMMAND="bash /home/goliath/deploy-dev.sh"

param(
  [int]$DebounceSeconds = 8,
  [string]$Branch = "dev",
  [string]$Remote = "origin"
)

$ErrorActionPreference = "Continue"

function Write-Info($Message) { Write-Host "[auto-dev] $Message" -ForegroundColor Cyan }
function Write-Ok($Message) { Write-Host "[auto-dev] $Message" -ForegroundColor Green }
function Write-Warn($Message) { Write-Host "[auto-dev] $Message" -ForegroundColor Yellow }
function Write-Fail($Message) { Write-Host "[auto-dev] $Message" -ForegroundColor Red }

function Invoke-Git($Arguments) {
  $output = & git @Arguments 2>&1
  $exitCode = $LASTEXITCODE

  if ($output) {
    $output | ForEach-Object { Write-Host $_ }
  }

  return $exitCode
}

function Test-CommandExists($Command) {
  return [bool](Get-Command $Command -ErrorAction SilentlyContinue)
}

function Get-CurrentBranch {
  return (& git rev-parse --abbrev-ref HEAD 2>$null).Trim()
}

function Get-GitChanges {
  return (& git status --porcelain 2>$null)
}

function Invoke-OptionalDeploy {
  $deployHost = $env:GOLIATH_DEV_DEPLOY_HOST
  $deployCommand = $env:GOLIATH_DEV_DEPLOY_COMMAND

  if (-not $deployHost -or -not $deployCommand) {
    Write-Warn "Deploy skipped. Set GOLIATH_DEV_DEPLOY_HOST and GOLIATH_DEV_DEPLOY_COMMAND to auto-update VPS."
    return
  }

  if (-not (Test-CommandExists "ssh")) {
    Write-Fail "ssh was not found in PATH. Deploy skipped."
    return
  }

  Write-Ok "Triggering VPS DEV deploy..."

  $sshOutput = & ssh $deployHost $deployCommand 2>&1
  $sshExitCode = $LASTEXITCODE

  if ($sshOutput) {
    $sshOutput | ForEach-Object { Write-Host $_ }
  }

  if ($sshExitCode -ne 0) {
    Write-Fail "VPS deploy failed. Check SSH access and deploy command."
    return
  }

  Write-Ok "VPS DEV deploy complete."
}

function Start-Sync {
  if ($script:IsSyncing) {
    Write-Warn "Sync already running. Skipping this change batch."
    return
  }

  $script:IsSyncing = $true

  try {
    $currentBranch = Get-CurrentBranch

    if ($currentBranch -ne $Branch) {
      Write-Warn "Current branch is '$currentBranch'. Expected '$Branch'. Sync skipped."
      return
    }

    $changes = Get-GitChanges

    if (-not $changes) {
      Write-Info "No git changes to sync."
      return
    }

    Write-Info "Changes detected. Preparing DEV sync..."

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $commitMessage = "dev auto sync - $timestamp"

    if ((Invoke-Git @("add", ".")) -ne 0) {
      Write-Fail "git add failed."
      return
    }

    if (-not (Get-GitChanges)) {
      Write-Info "No staged changes after git add."
      return
    }

    if ((Invoke-Git @("commit", "-m", $commitMessage)) -ne 0) {
      Write-Warn "git commit failed. This can happen if there are no commit-ready changes."
      return
    }

    if ((Invoke-Git @("push", $Remote, $Branch)) -ne 0) {
      Write-Fail "git push failed. Deploy skipped."
      return
    }

    Write-Ok "Pushed to $Remote/$Branch."
    Invoke-OptionalDeploy
    Write-Ok "DEV sync complete."
  }
  finally {
    $script:IsSyncing = $false
  }
}

if (-not (Test-CommandExists "git")) {
  Write-Fail "git was not found in PATH."
  exit 1
}

$repoRoot = (Get-Location).Path

if (-not (Test-Path (Join-Path $repoRoot ".git"))) {
  Write-Fail "Run this from the Goliath repository root."
  exit 1
}

$currentBranch = Get-CurrentBranch

if ($currentBranch -ne $Branch) {
  Write-Warn "You are currently on '$currentBranch'. Switch to '$Branch' before using auto DEV sync."
  Write-Warn "Run: git checkout $Branch"
  exit 1
}

Write-Info "Watching Goliath for DEV changes..."
Write-Info "Repo: $repoRoot"
Write-Info "Branch: $Branch"
Write-Info "Debounce: $DebounceSeconds second(s)"
Write-Warn "Press CTRL+C to stop."

$ignoredPatterns = @(
  "\.git[\\/]",
  "node_modules[\\/]",
  "src[\\/]runtime[\\/]",
  "logs[\\/]",
  "dist[\\/]",
  "build[\\/]",
  "\.cache[\\/]",
  "\.env",
  "\.log$",
  "\.tmp$",
  "\.sqlite",
  "\.db$"
)

$script:IsSyncing = $false
$script:PendingSync = $false
$script:LastChangeAt = $null

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $repoRoot
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true
$watcher.Filter = "*.*"

$onChange = {
  $path = $Event.SourceEventArgs.FullPath

  foreach ($pattern in $ignoredPatterns) {
    if ($path -match $pattern) {
      return
    }
  }

  $script:PendingSync = $true
  $script:LastChangeAt = Get-Date
  Write-Info "Change detected: $path"
}

$subscriptions = @()
$subscriptions += Register-ObjectEvent $watcher Changed -Action $onChange
$subscriptions += Register-ObjectEvent $watcher Created -Action $onChange
$subscriptions += Register-ObjectEvent $watcher Deleted -Action $onChange
$subscriptions += Register-ObjectEvent $watcher Renamed -Action $onChange

try {
  while ($true) {
    Start-Sleep -Seconds 1

    if ($script:PendingSync -and $script:LastChangeAt) {
      $elapsed = (New-TimeSpan -Start $script:LastChangeAt -End (Get-Date)).TotalSeconds

      if ($elapsed -ge $DebounceSeconds) {
        $script:PendingSync = $false
        Start-Sync
      }
    }
  }
}
finally {
  foreach ($subscription in $subscriptions) {
    Unregister-Event -SubscriptionId $subscription.Id -ErrorAction SilentlyContinue
  }

  $watcher.Dispose()
  Write-Warn "Auto DEV sync stopped."
}
