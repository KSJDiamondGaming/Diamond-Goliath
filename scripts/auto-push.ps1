param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("dev", "beta", "production")]
    [string]$TargetEnv,

    [string]$Message = "",

    [switch]$SkipPull,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Run-Step {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Label,
        [Parameter(Mandatory=$true)]
        [scriptblock]$Command
    )

    Write-Host ""
    Write-Host "▶ $Label"
    & $Command

    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed: $Label"
        exit $LASTEXITCODE
    }
}

Write-Host "========================================"
Write-Host "🚀 Goliath Git Helper"
Write-Host "📦 Target: $TargetEnv"
Write-Host "🧪 Dry run: $DryRun"
Write-Host "========================================"

Run-Step "Switch branch" { git checkout $TargetEnv }

if (-not $SkipPull) {
    Run-Step "Pull latest $TargetEnv" { git pull origin $TargetEnv }
}

$changesBeforeStage = git status --porcelain
if (-not $changesBeforeStage) {
    Write-Host "✅ No local changes to push."
    exit 0
}

Write-Host ""
Write-Host "Changed files:"
$changesBeforeStage | ForEach-Object { Write-Host "  $_" }

if ($DryRun) {
    Write-Host ""
    Write-Host "🧪 Dry run complete. No files staged, committed, or pushed."
    exit 0
}

Run-Step "Stage changes" { git add -A }

$commitMessage = $Message.Trim()
if (-not $commitMessage) {
    $commitMessage = "chore($TargetEnv): sync local changes"
}

Run-Step "Commit changes" { git commit -m $commitMessage }
Run-Step "Push $TargetEnv" { git push origin $TargetEnv }

Write-Host ""
Write-Host "✅ SUCCESS: $TargetEnv updated"
