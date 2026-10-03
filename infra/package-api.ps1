param(
  [Parameter(Mandatory = $true)]
  [string]$Destination
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
  & npm --prefix api run build
  if ($LASTEXITCODE -ne 0) { throw 'API compilation failed' }
  foreach ($path in @('api\host.json', 'api\package.json', 'api\dist', 'api\node_modules')) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Missing API package input: $path" }
  }
  if (Test-Path -LiteralPath $Destination) { throw 'Destination already exists; use a new package name.' }
  Compress-Archive -LiteralPath 'api\host.json','api\package.json','api\dist','api\node_modules' -DestinationPath $Destination -CompressionLevel Optimal
  Write-Output "API package created: $Destination"
} finally {
  Pop-Location
}
