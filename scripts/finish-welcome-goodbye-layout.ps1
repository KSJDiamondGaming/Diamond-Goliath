$ErrorActionPreference = 'Stop'

Write-Host 'Finishing Welcome and Goodbye module layout...' -ForegroundColor Cyan

function Move-FileSafe([string]$Source, [string]$Destination) {
    if (-not (Test-Path $Source)) { return }
    $destinationDir = Split-Path -Parent $Destination
    if ($destinationDir) { New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null }
    if (Test-Path $Destination) { Remove-Item -Force $Destination }
    Move-Item -Force $Source $Destination
}

function Replace-InFile([string]$Path, [hashtable]$Replacements) {
    if (-not (Test-Path $Path)) { return }
    $text = [System.IO.File]::ReadAllText((Resolve-Path $Path))
    foreach ($old in $Replacements.Keys) { $text = $text.Replace($old, $Replacements[$old]) }
    [System.IO.File]::WriteAllText((Resolve-Path $Path), $text, [System.Text.UTF8Encoding]::new($false))
}

# Move panels and routes into their module folders.
Move-FileSafe 'src/core/admin/functions/welcomePanel.js' 'src/modules/welcome/welcomePanel.js'
Move-FileSafe 'src/server/routes/welcome.js' 'src/modules/welcome/welcomeRoute.js'
Move-FileSafe 'src/core/admin/functions/goodbyePanel.js' 'src/modules/goodbye/goodbyePanel.js'
Move-FileSafe 'src/server/routes/goodbye.js' 'src/modules/goodbye/goodbyeRoute.js'

# Correct relative imports after relocation.
Replace-InFile 'src/modules/welcome/welcomePanel.js' @{
    "require('../../../modules/welcome/welcome')" = "require('./welcome')"
    "require('../../../modules/embed/embedTemplateManager')" = "require('../embed/embedTemplateManager')"
}
Replace-InFile 'src/modules/goodbye/goodbyePanel.js' @{
    "require('../../../modules/goodbye/goodbye')" = "require('./goodbye')"
    "require('../../../modules/embed/embedTemplateManager')" = "require('../embed/embedTemplateManager')"
}
Replace-InFile 'src/modules/welcome/welcomeRoute.js' @{
    "require('../../modules/welcome/welcome')" = "require('./welcome')"
}
Replace-InFile 'src/modules/goodbye/goodbyeRoute.js' @{
    "require('../../modules/goodbye/goodbye')" = "require('./goodbye')"
}

# Update all known runtime imports.
Replace-InFile 'server.js' @{
    "./src/server/routes/welcome" = "./src/modules/welcome/welcomeRoute"
    "./src/server/routes/goodbye" = "./src/modules/goodbye/goodbyeRoute"
}
Replace-InFile 'src/events/interactions/interactionCreate.js' @{
    "../../core/admin/functions/welcomePanel" = "../../modules/welcome/welcomePanel"
    "../../core/admin/functions/goodbyePanel" = "../../modules/goodbye/goodbyePanel"
}

# Update any remaining exact references throughout JS files.
Get-ChildItem -Path server.js,src,scripts -Recurse -File -Include *.js,*.cjs,*.mjs,*.jsx | ForEach-Object {
    $path = $_.FullName
    $text = [System.IO.File]::ReadAllText($path)
    $updated = $text.Replace("src/core/admin/functions/welcomePanel.js", "src/modules/welcome/welcomePanel.js")
    $updated = $updated.Replace("src/server/routes/welcome.js", "src/modules/welcome/welcomeRoute.js")
    $updated = $updated.Replace("src/core/admin/functions/goodbyePanel.js", "src/modules/goodbye/goodbyePanel.js")
    $updated = $updated.Replace("src/server/routes/goodbye.js", "src/modules/goodbye/goodbyeRoute.js")
    $updated = $updated.Replace("../../core/admin/functions/welcomePanel", "../../modules/welcome/welcomePanel")
    $updated = $updated.Replace("../../core/admin/functions/goodbyePanel", "../../modules/goodbye/goodbyePanel")
    $updated = $updated.Replace("./src/server/routes/welcome", "./src/modules/welcome/welcomeRoute")
    $updated = $updated.Replace("./src/server/routes/goodbye", "./src/modules/goodbye/goodbyeRoute")
    if ($updated -ne $text) { [System.IO.File]::WriteAllText($path, $updated, [System.Text.UTF8Encoding]::new($false)) }
}

# Ensure Doctor explicitly scans the relocated module files.
Replace-InFile 'scripts/goliath.js' @{
    "['src/modules/welcome/welcome.js', ['sendWelcome', 'buildHealthReport', 'startupWelcome']],`n      ['src/core/admin/functions/welcomePanel.js', ['buildWelcomePanel', 'handleWelcomeInteraction']],`n      ['src/server/routes/welcome.js']," = "['src/modules/welcome/welcome.js', ['sendWelcome', 'buildHealthReport', 'startupWelcome']],`n      ['src/modules/welcome/welcomePanel.js', ['buildWelcomePanel', 'handleWelcomeInteraction']],`n      ['src/modules/welcome/welcomeRoute.js'],"
    "['src/modules/goodbye/goodbye.js', ['sendGoodbye', 'buildHealthReport', 'startupGoodbye']],`n      ['src/core/admin/functions/goodbyePanel.js', ['buildGoodbyePanel', 'handleGoodbyeInteraction']],`n      ['src/server/routes/goodbye.js']," = "['src/modules/goodbye/goodbye.js', ['sendGoodbye', 'buildHealthReport', 'startupGoodbye']],`n      ['src/modules/goodbye/goodbyePanel.js', ['buildGoodbyePanel', 'handleGoodbyeInteraction']],`n      ['src/modules/goodbye/goodbyeRoute.js'],"
}

# Validate expected structure.
$required = @(
    'src/modules/welcome/welcome.js',
    'src/modules/welcome/welcomePanel.js',
    'src/modules/welcome/welcomeRoute.js',
    'src/modules/goodbye/goodbye.js',
    'src/modules/goodbye/goodbyePanel.js',
    'src/modules/goodbye/goodbyeRoute.js'
)
foreach ($file in $required) {
    if (-not (Test-Path $file)) { throw "Missing expected file: $file" }
    node --check $file
    if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $file" }
}

$obsolete = @(
    'src/core/admin/functions/welcomePanel.js',
    'src/server/routes/welcome.js',
    'src/core/admin/functions/goodbyePanel.js',
    'src/server/routes/goodbye.js'
)
foreach ($file in $obsolete) {
    if (Test-Path $file) { throw "Obsolete file still exists: $file" }
}

node --check server.js
node --check src/events/interactions/interactionCreate.js
npm run doctor
if ($LASTEXITCODE -ne 0) { throw 'Doctor failed.' }

# Remove this one-time script before committing.
Remove-Item -Force $PSCommandPath

git add -A
git commit -m "refactor: finish welcome and goodbye module folders"
if ($LASTEXITCODE -ne 0) { throw 'Commit failed.' }
git push origin dev
if ($LASTEXITCODE -ne 0) { throw 'Push failed.' }

Write-Host 'Welcome and Goodbye module folders complete.' -ForegroundColor Green
