$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Move-ModuleFile {
    param([string]$Source, [string]$Destination)
    if (-not (Test-Path $Source)) { return }
    $directory = Split-Path -Parent $Destination
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
    if (Test-Path $Destination) { Remove-Item -Force $Destination }
    Move-Item -Force $Source $Destination
}

function Replace-InFile {
    param([string]$Path, [hashtable]$Replacements)
    if (-not (Test-Path $Path)) { return }
    $content = [System.IO.File]::ReadAllText((Resolve-Path $Path))
    foreach ($key in $Replacements.Keys) {
        $content = $content.Replace($key, $Replacements[$key])
    }
    [System.IO.File]::WriteAllText((Resolve-Path $Path), $content, [System.Text.UTF8Encoding]::new($false))
}

Write-Host 'Finishing module folder layout...' -ForegroundColor Cyan

# Remove Auto Roles directory bridge.
if (Test-Path 'src/modules/autoroles/index.js') {
    Remove-Item -Force 'src/modules/autoroles/index.js'
}

# Move loose module implementations into their existing module folders.
Move-ModuleFile 'src/modules/goodbye.js' 'src/modules/goodbye/goodbye.js'
Move-ModuleFile 'src/modules/welcome.js' 'src/modules/welcome/welcome.js'
Move-ModuleFile 'src/modules/verification.js' 'src/modules/verification/verification.js'
Move-ModuleFile 'src/modules/verificationRoute.js' 'src/modules/verification/verificationRoute.js'

# Move the real Verification panel implementation, not the loose compatibility wrapper.
if (Test-Path 'src/core/admin/functions/verificationAdminPanel.js') {
    Move-ModuleFile 'src/core/admin/functions/verificationAdminPanel.js' 'src/modules/verification/verificationPanel.js'
}
if (Test-Path 'src/modules/verificationPanel.js') {
    Remove-Item -Force 'src/modules/verificationPanel.js'
}

# Correct imports inside relocated implementations.
Replace-InFile 'src/modules/goodbye/goodbye.js' @{
    "require('../core/" = "require('../../core/"
    "require('./embed/" = "require('../embed/"
}
Replace-InFile 'src/modules/welcome/welcome.js' @{
    "require('../core/" = "require('../../core/"
    "require('./embed/" = "require('../embed/"
}
Replace-InFile 'src/modules/verification/verification.js' @{
    "require('./verification/verificationStore')" = "require('./verificationStore')"
    "require('./verification/verificationManager')" = "require('./verificationManager')"
}
Replace-InFile 'src/modules/verification/verificationRoute.js' @{
    "require('../core/" = "require('../../core/"
}
Replace-InFile 'src/modules/verification/verificationPanel.js' @{
    "require('../../../modules/verification/verificationManager')" = "require('./verificationManager')"
    "require('../../../modules/verification/verificationStore')" = "require('./verificationStore')"
    "require('../../guild/" = "require('../../core/guild/"
    "require('../../security/" = "require('../../core/security/"
}

# Update all JavaScript imports to explicit module files.
$files = Get-ChildItem server.js,src,scripts -Recurse -File -Include *.js,*.cjs,*.mjs,*.jsx -ErrorAction SilentlyContinue
foreach ($file in $files) {
    $content = [System.IO.File]::ReadAllText($file.FullName)
    $original = $content

    $content = $content.Replace("./src/modules/autoroles'", "./src/modules/autoroles/autoroles'")
    $content = $content.Replace('./src/modules/autoroles"', './src/modules/autoroles/autoroles"')
    $content = $content.Replace("../../modules/autoroles'", "../../modules/autoroles/autoroles'")
    $content = $content.Replace('../../modules/autoroles"', '../../modules/autoroles/autoroles"')
    $content = $content.Replace("../modules/autoroles'", "../modules/autoroles/autoroles'")
    $content = $content.Replace('../modules/autoroles"', '../modules/autoroles/autoroles"')

    $content = $content.Replace("./src/modules/verification'", "./src/modules/verification/verification'")
    $content = $content.Replace('./src/modules/verification"', './src/modules/verification/verification"')
    $content = $content.Replace("../../modules/verification'", "../../modules/verification/verification'")
    $content = $content.Replace('../../modules/verification"', '../../modules/verification/verification"')
    $content = $content.Replace("../modules/verification'", "../modules/verification/verification'")
    $content = $content.Replace('../modules/verification"', '../modules/verification/verification"')

    $content = $content.Replace('../../modules/verificationPanel', '../../modules/verification/verificationPanel')
    $content = $content.Replace('../../modules/autorolesPanel', '../../modules/autoroles/autorolesPanel')
    $content = $content.Replace('./src/modules/verificationRoute', './src/modules/verification/verificationRoute')
    $content = $content.Replace('./src/modules/autorolesRoute', './src/modules/autoroles/autorolesRoute')
    $content = $content.Replace('./src/server/routes/verification', './src/modules/verification/verificationRoute')

    $content = $content.Replace("./src/modules/welcome'", "./src/modules/welcome/welcome'")
    $content = $content.Replace('./src/modules/welcome"', './src/modules/welcome/welcome"')
    $content = $content.Replace("../../modules/welcome'", "../../modules/welcome/welcome'")
    $content = $content.Replace('../../modules/welcome"', '../../modules/welcome/welcome"')

    $content = $content.Replace("./src/modules/goodbye'", "./src/modules/goodbye/goodbye'")
    $content = $content.Replace('./src/modules/goodbye"', './src/modules/goodbye/goodbye"')
    $content = $content.Replace("../../modules/goodbye'", "../../modules/goodbye/goodbye'")
    $content = $content.Replace('../../modules/goodbye"', '../../modules/goodbye/goodbye"')

    if ($content -ne $original) {
        [System.IO.File]::WriteAllText($file.FullName, $content, [System.Text.UTF8Encoding]::new($false))
    }
}

# Remove obsolete Verification server bridge after server.js is pointed directly at the module route.
if (Test-Path 'src/server/routes/verification.js') {
    Remove-Item -Force 'src/server/routes/verification.js'
}

# Update Doctor registry and explicit runtime targets.
Replace-InFile 'scripts/goliath.js' @{
    'src/modules/autoroles.js' = 'src/modules/autoroles/autoroles.js'
    'src/modules/autorolesPanel.js' = 'src/modules/autoroles/autorolesPanel.js'
    'src/modules/autorolesRoute.js' = 'src/modules/autoroles/autorolesRoute.js'
    'src/modules/verification.js' = 'src/modules/verification/verification.js'
    'src/modules/verificationPanel.js' = 'src/modules/verification/verificationPanel.js'
    'src/modules/verificationRoute.js' = 'src/modules/verification/verificationRoute.js'
    'src/modules/welcome.js' = 'src/modules/welcome/welcome.js'
    'src/modules/goodbye.js' = 'src/modules/goodbye/goodbye.js'
}

# Verify required files and removed loose files.
$required = @(
    'src/modules/autoroles/autoroles.js',
    'src/modules/autoroles/autorolesPanel.js',
    'src/modules/autoroles/autorolesRoute.js',
    'src/modules/verification/verification.js',
    'src/modules/verification/verificationPanel.js',
    'src/modules/verification/verificationRoute.js',
    'src/modules/welcome/welcome.js',
    'src/modules/goodbye/goodbye.js'
)
foreach ($path in $required) {
    if (-not (Test-Path $path)) { throw "Required module file missing: $path" }
}

$forbidden = @(
    'src/modules/autoroles/index.js',
    'src/modules/verification.js',
    'src/modules/verificationPanel.js',
    'src/modules/verificationRoute.js',
    'src/modules/welcome.js',
    'src/modules/goodbye.js',
    'src/core/admin/functions/verificationAdminPanel.js',
    'src/server/routes/verification.js'
)
foreach ($path in $forbidden) {
    if (Test-Path $path) { throw "Obsolete file still exists: $path" }
}

node --check server.js
node --check src/modules/autoroles/autoroles.js
node --check src/modules/autoroles/autorolesPanel.js
node --check src/modules/autoroles/autorolesRoute.js
node --check src/modules/verification/verification.js
node --check src/modules/verification/verificationPanel.js
node --check src/modules/verification/verificationRoute.js
node --check src/modules/welcome/welcome.js
node --check src/modules/goodbye/goodbye.js
node --check scripts/goliath.js

npm run doctor
if ($LASTEXITCODE -ne 0) { throw 'Doctor failed after module migration.' }

# Remove this one-time script before committing the finished repository.
Remove-Item -Force $PSCommandPath

git add -A
git commit -m 'refactor: finish module folder structure'
if ($LASTEXITCODE -ne 0) { throw 'Git commit failed.' }
git push origin dev
if ($LASTEXITCODE -ne 0) { throw 'Git push failed.' }

Write-Host 'Module folder migration complete and pushed to dev.' -ForegroundColor Green
