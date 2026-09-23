param(
    [string]$BinaryPath = ""
)

$ErrorActionPreference = "Stop"
$HostName = "com.paperflow.ai"
$ExtensionId = "dffiahjmpkmellmjijffpcofoahbccoc"
$ScriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path

if ([string]::IsNullOrWhiteSpace($BinaryPath)) {
    $PackagedBinary = Join-Path $ScriptDirectory "paperflow-host.exe"
    $BuiltBinary = Join-Path (Split-Path -Parent $ScriptDirectory) "target\release\paperflow-host.exe"
    $BinaryPath = if (Test-Path $PackagedBinary) { $PackagedBinary } else { $BuiltBinary }
}

if (-not (Test-Path -PathType Leaf $BinaryPath)) {
    throw "PaperFlow native host binary not found: $BinaryPath"
}

$RuntimeDirectory = Join-Path $env:LOCALAPPDATA "PaperFlow AI"
$RuntimeBinary = Join-Path $RuntimeDirectory "paperflow-host.exe"
$ManifestPath = Join-Path $RuntimeDirectory "$HostName.json"
$RegistryPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName"

New-Item -ItemType Directory -Path $RuntimeDirectory -Force | Out-Null
Copy-Item -LiteralPath $BinaryPath -Destination $RuntimeBinary -Force

$Manifest = [ordered]@{
    name = $HostName
    description = "PaperFlow AI secure native host"
    path = $RuntimeBinary
    type = "stdio"
    allowed_origins = @("chrome-extension://$ExtensionId/")
}
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($ManifestPath, ($Manifest | ConvertTo-Json -Depth 3), $Utf8NoBom)

New-Item -Path $RegistryPath -Force | Out-Null
Set-Item -Path $RegistryPath -Value $ManifestPath

Write-Host "PaperFlow native host installed."
Write-Host "Binary: $RuntimeBinary"
Write-Host "Manifest: $ManifestPath"
Write-Host "Reload PaperFlow AI from chrome://extensions."
