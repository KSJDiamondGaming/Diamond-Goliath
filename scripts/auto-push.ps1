param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("dev", "beta", "production")]
    [string]$env
)

Write-Host "========================================"
Write-Host "🚀 Goliath Auto Push System"
Write-Host "📦 Environment: $env"
Write-Host "========================================"

# Safety check
if (-not $env) {
    Write-Host "❌ No environment provided (dev | beta | production)"
    exit 1
}

# Step 1: Switch branch
Write-Host "🔄 Switching to branch: $env"
git checkout $env

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to switch branch"
    exit 1
}

# Step 2: Sync latest changes
Write-Host "⬇️ Pulling latest changes..."
git pull origin $env

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Git pull failed"
    exit 1
}

# Step 3: Stage changes
Write-Host "📦 Staging changes..."
git add -A

# Step 4: Commit safely (only if changes exist)
$hasChanges = (git status --porcelain | Measure-Object).Count -gt 0

if ($hasChanges) {
    Write-Host "💾 Committing changes..."
    git commit -m "auto-push: sync $env environment"
} else {
    Write-Host "⚠️ No changes to commit"
}

# Step 5: Push
Write-Host "🚀 Pushing to $env..."
git push origin $env

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Push failed"
    exit 1
}

Write-Host "========================================"
Write-Host "✅ SUCCESS: $env deployed and synced"
Write-Host "========================================"