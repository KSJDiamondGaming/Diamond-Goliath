param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("dev", "beta", "production")]
    [string]$TargetEnv,

    [string]$Message = "",

    [switch]$SkipPull,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Run-Step {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Label,

        [Parameter(Mandatory = $true)]
        [scriptblock]$Command
    )

    Write-Host ""
    Write-Host ">> $Label"

    & $Command

    if ($LASTEXITCODE -ne 0) {
        Write-Host "FAILED: $Label"
        exit $LASTEXITCODE
    }
}

Write-Host "========================================"
Write-Host "Goliath Git Helper"
Write-Host "Target: $TargetEnv"
Write-Host "Dry run: $DryRun"
Write-Host "========================================"

Run-Step "Check for unfinished Git operations" {
    git status
}

if (
    (Test-Path ".git\rebase-merge") -or
    (Test-Path ".git\rebase-apply") -or
    (Test-Path ".git\MERGE_HEAD")
) {
    Write-Host ""
    Write-Host "FAILED: A merge or rebase is already in progress."
    Write-Host "Finish or abort it before running this helper."
    exit 1
}

Run-Step "Fetch remote branches" {
    git fetch origin
}

Run-Step "Switch to $TargetEnv" {
    git switch $TargetEnv
}

$changes = @(git status --porcelain)

if ($changes.Count -gt 0) {
    Write-Host ""
    Write-Host "Changed files:"

    $changes | ForEach-Object {
        Write-Host "  $_"
    }

    if ($DryRun) {
        Write-Host ""
        Write-Host "Dry run complete."
        Write-Host "Local changes would be committed before pulling and pushing."
        exit 0
    }

    Run-Step "Stage local changes" {
        git add -A
    }

    $commitMessage = $Message.Trim()

    if (-not $commitMessage) {
        $commitMessage = "chore($TargetEnv): sync local changes"
    }

    Run-Step "Commit local changes" {
        git commit -m $commitMessage
    }
}
else {
    Write-Host ""
    Write-Host "No uncommitted local changes."
}

if (-not $SkipPull) {
    Run-Step "Rebase onto origin/$TargetEnv" {
        git pull --rebase origin $TargetEnv
    }
}

$localSha = git rev-parse HEAD
$remoteSha = git rev-parse "origin/$TargetEnv"

if ($localSha -ne $remoteSha) {
    Run-Step "Push $TargetEnv" {
        git push origin $TargetEnv
    }
}
else {
    Write-Host ""
    Write-Host "GitHub is already up to date."
}

Run-Step "Refresh remote state" {
    git fetch origin
}

$finalLocalSha = git rev-parse HEAD
$finalRemoteSha = git rev-parse "origin/$TargetEnv"

if ($finalLocalSha -ne $finalRemoteSha) {
    Write-Host ""
    Write-Host "FAILED: Local and GitHub commits do not match."
    Write-Host "Local:  $finalLocalSha"
    Write-Host "Remote: $finalRemoteSha"
    exit 1
}

Write-Host ""
Write-Host "SUCCESS: Local $TargetEnv and GitHub $TargetEnv are synchronized."
Write-Host "Commit: $finalLocalSha"
