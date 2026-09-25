param(
    [string]$BinaryPath = ""
)

$ErrorActionPreference = "Stop"
$HostName = "com.paperflow.ai"
$ExtensionId = "dffiahjmpkmellmjijffpcofoahbccoc"
$ScriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$NativeHostDirectory = Split-Path -Parent $ScriptDirectory

if ([string]::IsNullOrWhiteSpace($BinaryPath)) {
    $PackagedBinary = Join-Path $ScriptDirectory "paperflow-host.exe"
    $BuiltBinary = Join-Path $NativeHostDirectory "target\release\paperflow-host.exe"
    if (Test-Path $PackagedBinary) {
        $BinaryPath = $PackagedBinary
    } elseif (Test-Path $BuiltBinary) {
        $BinaryPath = $BuiltBinary
    } else {
        $Cargo = Get-Command cargo -ErrorAction SilentlyContinue
        if ($null -eq $Cargo) {
            throw @"
PaperFlow Native Host is needed only for ChatGPT/Codex subscription mode.
OpenAI-compatible API mode does not need Cargo or the Native Host.

To use ChatGPT/Codex, install:
1. Visual Studio Build Tools 2022 with "Desktop development with C++".
2. Rust from https://rustup.rs/ or: winget install --id Rustlang.Rustup -e

Close and reopen PowerShell, verify "cargo --version", then run this installer again.
"@
        }

        Write-Host "Building the PaperFlow Native Host..."
        Push-Location $NativeHostDirectory
        try {
            & $Cargo.Source build --release --locked
            if ($LASTEXITCODE -ne 0) {
                throw "Building the PaperFlow Native Host failed with exit code $LASTEXITCODE."
            }
        } finally {
            Pop-Location
        }
        $BinaryPath = $BuiltBinary
    }
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
