# =============================================================================
# SCRIPT 2 — Ejecutar en el WINDOWS SERVER (como Administrador)
# =============================================================================
# Qué hace: instala Node.js, PM2, configura el backend como servicio,
#           y publica el widget en IIS.
# Cómo usarlo: clic derecho → "Ejecutar como administrador"
# =============================================================================
# ANTES DE EJECUTAR: pon este script junto a las carpetas "backend" y "widget"
#   Es decir, la estructura debe ser:
#
#   C:\USH-ChatBot\
#     2-instalar-en-servidor.ps1   ← este script
#     backend\                     ← carpeta copiada desde tu PC
#       dist\
#       package.json
#       pm2.config.js
#       .env                       ← ¡DEBES crear este archivo!
#     widget\                      ← carpeta copiada desde tu PC
#       ush-chat-widget.iife.js    (el CSS va incluido dentro del JS)
#       web.config
# =============================================================================

$ErrorActionPreference = "Stop"

# Carpeta donde está este script (raíz del deploy)
$raiz = $PSScriptRoot

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  USH ChatBot — Instalando en el servidor  " -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ── Verificar que se ejecuta como Administrador ───────────────────────────────
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]"Administrator")) {
    Write-Host "ERROR: Debes ejecutar este script como Administrador." -ForegroundColor Red
    Write-Host "       Clic derecho en el script → 'Ejecutar como administrador'" -ForegroundColor Red
    pause; exit 1
}

# ── Verificar que existe el .env ──────────────────────────────────────────────
if (-not (Test-Path "$raiz\backend\.env")) {
    Write-Host "ERROR: No se encontró el archivo backend\.env" -ForegroundColor Red
    Write-Host "       Copia backend\.env.example como backend\.env y rellena los valores." -ForegroundColor Red
    pause; exit 1
}

# ── 1. Instalar Node.js (si no está instalado) ────────────────────────────────
Write-Host "[1/5] Verificando Node.js..." -ForegroundColor Yellow
$nodeOk = $false
try { $v = node --version; $nodeOk = $true; Write-Host "      Node.js ya instalado: $v" -ForegroundColor Green } catch {}

if (-not $nodeOk) {
    Write-Host "      Node.js no encontrado. Descargando instalador..." -ForegroundColor Yellow
    $installerUrl = "https://nodejs.org/dist/v20.17.0/node-v20.17.0-x64.msi"
    $installerPath = "$env:TEMP\nodejs-installer.msi"
    Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath
    Write-Host "      Instalando Node.js (esto puede tardar 1-2 minutos)..." -ForegroundColor Yellow
    Start-Process msiexec.exe -ArgumentList "/i `"$installerPath`" /quiet /norestart" -Wait
    # Recargar PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    $v = node --version
    Write-Host "      Node.js instalado: $v" -ForegroundColor Green
}

# ── 2. Instalar PM2 (gestor de procesos) ──────────────────────────────────────
Write-Host "[2/5] Instalando PM2..." -ForegroundColor Yellow
npm install -g pm2
npm install -g pm2-windows-startup
pm2-startup install
Write-Host "      PM2 instalado OK" -ForegroundColor Green

# ── 3. Instalar dependencias del backend e iniciar ────────────────────────────
Write-Host "[3/5] Instalando dependencias del backend..." -ForegroundColor Yellow
Set-Location "$raiz\backend"
npm install --omit=dev
Write-Host "      Dependencias instaladas OK" -ForegroundColor Green

Write-Host "      Iniciando el backend con PM2..." -ForegroundColor Yellow
# Detener instancia anterior si existe
pm2 delete ush-chatbot-api 2>$null

pm2 start pm2.config.js
pm2 save
Write-Host "      Backend iniciado y guardado como servicio OK" -ForegroundColor Green

# ── 4. Publicar widget en IIS ─────────────────────────────────────────────────
Write-Host "[4/5] Publicando widget en IIS..." -ForegroundColor Yellow
$iisWidgetPath = "C:\inetpub\wwwroot\ush-widget"

if (Test-Path $iisWidgetPath) {
    Remove-Item $iisWidgetPath -Recurse -Force
}
New-Item -ItemType Directory -Path $iisWidgetPath | Out-Null
Copy-Item "$raiz\widget\*" $iisWidgetPath -Recurse

Write-Host "      Widget publicado en: $iisWidgetPath" -ForegroundColor Green

# ── 5. Verificar que el backend responde ─────────────────────────────────────
Write-Host "[5/5] Verificando que el backend responde..." -ForegroundColor Yellow
Start-Sleep -Seconds 5  # dar tiempo a que arranque
try {
    $resp = Invoke-WebRequest -Uri "http://localhost:3001/health" -UseBasicParsing -TimeoutSec 10
    if ($resp.StatusCode -eq 200) {
        Write-Host "      Backend respondiendo OK en puerto 3001" -ForegroundColor Green
    }
} catch {
    Write-Host "      ADVERTENCIA: El backend no respondió aún." -ForegroundColor Yellow
    Write-Host "      Espera 10 segundos y revisa con: pm2 status" -ForegroundColor Yellow
}

# ── Resumen final ─────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  ¡Instalación completa!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Obtener la IP del servidor
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike "*Loopback*" } | Select-Object -First 1).IPAddress

Write-Host "  Backend (API):  http://$ip`:3001/health" -ForegroundColor White
Write-Host "  Widget (IIS):   http://$ip/ush-widget/ush-chat-widget.iife.js" -ForegroundColor White
Write-Host ""
Write-Host "  Pega esto en WordPress (WPCode → Footer):" -ForegroundColor Yellow
Write-Host ""
Write-Host "  <script>" -ForegroundColor Gray
Write-Host "    window.USHChatConfig = { apiUrl: 'http://$ip`:3001/api' };" -ForegroundColor Gray
Write-Host "  </script>" -ForegroundColor Gray
Write-Host "  <script src=`"http://$ip/ush-widget/ush-chat-widget.iife.js`" defer></script>" -ForegroundColor Gray
Write-Host ""
Write-Host "  Comandos útiles de PM2:" -ForegroundColor Yellow
Write-Host "    pm2 status          → ver si está corriendo" -ForegroundColor White
Write-Host "    pm2 logs            → ver errores en tiempo real" -ForegroundColor White
Write-Host "    pm2 restart all     → reiniciar el backend" -ForegroundColor White
Write-Host ""
pause
