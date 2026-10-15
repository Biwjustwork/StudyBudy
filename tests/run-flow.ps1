$ErrorActionPreference = 'Stop'

$projectName = "studybuddy-flow-$PID"
$composeArgs = @('compose', '--project-name', $projectName)
$runnerPath = Join-Path $PSScriptRoot 'flow-smoke.mjs'
$started = $false
$healthUrls = @(
  'http://127.0.0.1:3001/health',
  'http://127.0.0.1:3002/health',
  'http://127.0.0.1:3003/health',
  'http://127.0.0.1:3004/health',
  'http://127.0.0.1:3005/health'
)

try {
  $healthyCount = 0
  foreach ($url in $healthUrls) {
    try {
      $response = Invoke-RestMethod -Uri $url -TimeoutSec 2
      if ($response.status -eq 'ok') { $healthyCount++ }
    } catch { }
  }

  if ($healthyCount -eq $healthUrls.Count) {
    Write-Host 'Using the five services already running on ports 3001–3005.'
    Write-Warning 'FLOW-01 creates unique test records in this environment; use a disposable test stack if persistent data must stay clean.'
    node $runnerPath
    if ($LASTEXITCODE -ne 0) { throw 'The cross-service flow failed.' }
    return
  }
  if ($healthyCount -gt 0) {
    throw 'Some, but not all, service ports 3001–3005 are already occupied. Stop the partial stack or start all five services before running the flow.'
  }
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker CLI was not found and no services are running. Install/start Docker Desktop, then run this script again.'
  }

  $started = $true
  & docker @composeArgs up --build -d
  if ($LASTEXITCODE -ne 0) { throw 'Could not start the isolated Study Buddy services.' }

  $ready = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    try {
      foreach ($url in $healthUrls) {
        $response = Invoke-RestMethod -Uri $url -TimeoutSec 2
        if ($response.status -ne 'ok') { throw 'A service returned an unhealthy status.' }
      }
      $ready = $true
      break
    } catch { Start-Sleep -Seconds 2 }
  }
  if (-not $ready) { throw 'All five services did not become healthy within 80 seconds.' }

  node $runnerPath
  if ($LASTEXITCODE -ne 0) { throw 'The cross-service flow failed.' }
}
finally {
  if ($started) {
    & docker @composeArgs down --volumes --remove-orphans
    if ($LASTEXITCODE -ne 0) { Write-Warning 'Could not fully remove the isolated test stack.' }
  }
}
