param(
  [switch]$SkipTests
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ResourceRoot = Join-Path $Root "src-tauri\resources"
$FfmpegDir = Join-Path $ResourceRoot "ffmpeg"
$WhisperDir = Join-Path $ResourceRoot "whisper"
$BuildTools = Join-Path $env:TEMP "EditMaster-BuildTools"

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "============================================================" -ForegroundColor DarkYellow
  Write-Host "  EDIT MASTER | $Message" -ForegroundColor Yellow
  Write-Host "============================================================" -ForegroundColor DarkYellow
}

function Invoke-Checked([string]$Command, [string[]]$Arguments, [string]$FailureMessage) {
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FailureMessage (exit code: $LASTEXITCODE)"
  }
}

function Require-Command([string]$Name, [string]$InstallHint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Ferramenta obrigatória não encontrada: $Name. $InstallHint"
  }
}

New-Item -ItemType Directory -Force -Path $BuildTools, $FfmpegDir, $WhisperDir | Out-Null
Set-Location $Root

Write-Step "Verificando ferramentas"
Require-Command "node" "Instale o Node.js 22 LTS."
Require-Command "npm" "Instale o Node.js 22 LTS, que inclui npm."
Require-Command "cargo" "Instale o Rust pelo rustup."
Require-Command "git" "Instale o Git para Windows."
Require-Command "cmake" "Instale o CMake e adicione-o ao PATH."
Require-Command "cl" "Abra o Developer PowerShell do Visual Studio Build Tools com C++ Desktop Development."

$NodeVersion = (& node --version).Trim()
if ($NodeVersion -notmatch '^v22\.') {
  Write-Warning "Este projeto usa Node.js 22 no CI. Versão detectada: $NodeVersion"
}

Write-Step "Preparando FFmpeg e FFprobe"
$FfmpegExe = Join-Path $FfmpegDir "ffmpeg.exe"
$FfprobeExe = Join-Path $FfmpegDir "ffprobe.exe"
$FfmpegValid = $false
if ((Test-Path $FfmpegExe) -and (Test-Path $FfprobeExe)) {
  $FilterOutput = (& $FfmpegExe -hide_banner -filters 2>&1 | Out-String)
  $FfmpegValid = ($LASTEXITCODE -eq 0) -and (($FilterOutput -split "\r?\n" | Where-Object { $_ -match '(?i)\bsubtitles\b' -and $_ -match '(?i)libass' }).Count -gt 0)
}
if (-not $FfmpegValid) {
  $FfmpegZip = Join-Path $BuildTools "ffmpeg.zip"
  $FfmpegExtract = Join-Path $BuildTools "ffmpeg"
  Invoke-WebRequest "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip" -OutFile $FfmpegZip
  if (Test-Path $FfmpegExtract) { Remove-Item $FfmpegExtract -Recurse -Force }
  Expand-Archive -Path $FfmpegZip -DestinationPath $FfmpegExtract -Force
  $FoundFfmpeg = Get-ChildItem $FfmpegExtract -Filter "ffmpeg.exe" -Recurse | Select-Object -First 1
  $FoundFfprobe = Get-ChildItem $FfmpegExtract -Filter "ffprobe.exe" -Recurse | Select-Object -First 1
  if (-not $FoundFfmpeg -or -not $FoundFfprobe) {
    throw "O pacote baixado não contém ffmpeg.exe e ffprobe.exe."
  }
  Copy-Item $FoundFfmpeg.FullName $FfmpegExe -Force
  Copy-Item $FoundFfprobe.FullName $FfprobeExe -Force
  $FilterOutput = (& $FfmpegExe -hide_banner -filters 2>&1 | Out-String)
  if ($LASTEXITCODE -ne 0 -or -not (($FilterOutput -split "\r?\n" | Where-Object { $_ -match '(?i)\bsubtitles\b' -and $_ -match '(?i)libass' }).Count -gt 0)) {
    Write-Host $FilterOutput
    throw "O FFmpeg baixado não confirmou o filtro subtitles com libass."
  }
}
Write-Host "FFmpeg/FFprobe prontos e filtro subtitles/libass confirmado." -ForegroundColor Green

Write-Step "Preparando Whisper local"
$WhisperExe = Join-Path $WhisperDir "whisper-cli.exe"
$WhisperModel = Join-Path $WhisperDir "ggml-tiny.bin"
if (-not (Test-Path $WhisperExe)) {
  $WhisperSource = Join-Path $BuildTools "whisper.cpp"
  $WhisperBuild = Join-Path $BuildTools "whisper-build"
  if (-not (Test-Path (Join-Path $WhisperSource ".git"))) {
    if (Test-Path $WhisperSource) { Remove-Item $WhisperSource -Recurse -Force }
    Invoke-Checked "git" @("clone", "--depth", "1", "https://github.com/ggml-org/whisper.cpp.git", $WhisperSource) "Falha ao baixar whisper.cpp."
  }
  Invoke-Checked "cmake" @("-S", $WhisperSource, "-B", $WhisperBuild, "-A", "x64", "-DWHISPER_BUILD_TESTS=OFF", "-DWHISPER_BUILD_EXAMPLES=ON", "-DWHISPER_BUILD_SERVER=OFF") "Falha ao configurar whisper.cpp."
  Invoke-Checked "cmake" @("--build", $WhisperBuild, "--config", "Release", "--target", "whisper-cli") "Falha ao compilar whisper-cli."
  $BuiltWhisper = Get-ChildItem $WhisperBuild -Filter "whisper-cli.exe" -Recurse | Select-Object -First 1
  if (-not $BuiltWhisper) { throw "whisper-cli.exe não foi encontrado após a compilação." }
  Copy-Item $BuiltWhisper.FullName $WhisperExe -Force
  Get-ChildItem $WhisperBuild -Filter "*.dll" -Recurse | ForEach-Object {
    Copy-Item $_.FullName $WhisperDir -Force
  }
}
if (-not (Test-Path $WhisperModel) -or (Get-Item $WhisperModel).Length -lt 1000000) {
  Invoke-WebRequest "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin" -OutFile $WhisperModel
}
if ((Get-Item $WhisperModel).Length -lt 1000000) {
  throw "O modelo Whisper Tiny baixado parece inválido."
}
Write-Host "Whisper CLI e modelo Tiny prontos." -ForegroundColor Green

Write-Step "Instalando dependências JavaScript"
Invoke-Checked "npm" @("ci") "Falha ao instalar dependências JavaScript."

if (-not $SkipTests) {
  Write-Step "Executando testes JavaScript"
  Invoke-Checked "npm" @("test") "Os testes JavaScript falharam; o instalador não será gerado."
  Write-Step "Executando testes Rust"
  Invoke-Checked "cargo" @("test", "--manifest-path", "src-tauri/Cargo.toml") "Os testes Rust falharam; o instalador não será gerado."
} else {
  Write-Warning "Testes ignorados por solicitação explícita (-SkipTests)."
}

Write-Step "Gerando instalador Windows NSIS"
Invoke-Checked "npm" @("run", "tauri:build") "A geração do instalador Tauri/NSIS falhou."

$InstallerDirectory = Join-Path $Root "src-tauri\target\release\bundle\nsis"
$Installer = Get-ChildItem $InstallerDirectory -Filter "*-setup.exe" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if (-not $Installer) {
  throw "A compilação terminou, mas nenhum instalador *-setup.exe foi encontrado em $InstallerDirectory."
}

Write-Step "Instalador concluído"
Write-Host "Arquivo: $($Installer.FullName)" -ForegroundColor Green
Write-Host ("Tamanho: {0:N1} MB" -f ($Installer.Length / 1MB)) -ForegroundColor Green
Write-Host "O instalador inclui opções de seleção para FFmpeg/FFprobe e Whisper."
Start-Process explorer.exe -ArgumentList $InstallerDirectory
