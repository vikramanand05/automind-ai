$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env'
if (Test-Path -LiteralPath $envPath) { Write-Host '.env already exists; preserving it.'; exit 0 }
$randomBytes = New-Object byte[] 24
$generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$generator.GetBytes($randomBytes)
$databasePassword = -join ($randomBytes | ForEach-Object { $_.ToString('x2') })
$generator.GetBytes($randomBytes)
$grafanaPassword = -join ($randomBytes | ForEach-Object { $_.ToString('x2') })
$generator.Dispose()
$content = Get-Content -LiteralPath (Join-Path $projectRoot '.env.example') -Raw
$content = $content.Replace('POSTGRES_PASSWORD=replace-with-local-password', "POSTGRES_PASSWORD=$databasePassword")
$content = $content.Replace('automind:replace-with-local-password@', "automind:$databasePassword@")
$content = $content.Replace('GRAFANA_ADMIN_PASSWORD=replace-with-local-password', "GRAFANA_ADMIN_PASSWORD=$grafanaPassword")
[IO.File]::WriteAllText($envPath, $content)
Write-Host 'Created ignored .env with random local database and Grafana credentials.'
