# =============================================================================
# SCRIPT 1 — Ejecutar en TU PC antes de copiar al servidor
# =============================================================================
# Qué hace: compila el backend y el widget, y crea una carpeta lista para copiar
# Cómo usarlo: clic derecho → "Ejecutar con PowerShell"
# =============================================================================

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  USH ChatBot — Preparando para deploy  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Compilar el backend (TypeScript → JavaScript) ─────────────────────────
Write-Host "[1/4] Compilando el backend..." -ForegroundColor Yellow
Set-Location "$raiz\backend"
npm install
npm run build
if (-not $?) { Write-Host "ERROR al compilar el backend." -ForegroundColor Red; exit 1 }
Write-Host "      Backend compilado OK" -ForegroundColor Green

# ── 2. Compilar el widget ─────────────────────────────────────────────────────
Write-Host "[2/4] Compilando el widget..." -ForegroundColor Yellow
Set-Location "$raiz\frontend"
npm install
npm run build:widget
if (-not $?) { Write-Host "ERROR al compilar el widget." -ForegroundColor Red; exit 1 }
Write-Host "      Widget compilado OK" -ForegroundColor Green

# ── 3. Crear carpeta de distribución ─────────────────────────────────────────
Write-Host "[3/4] Creando carpeta de distribución..." -ForegroundColor Yellow
$destino = "$raiz\deploy\para-copiar-al-servidor"
if (Test-Path $destino) { Remove-Item $destino -Recurse -Force }
New-Item -ItemType Directory -Path "$destino\backend" | Out-Null
New-Item -ItemType Directory -Path "$destino\widget"  | Out-Null

# Copiar backend compilado
Copy-Item "$raiz\backend\dist"          "$destino\backend\dist"       -Recurse
Copy-Item "$raiz\backend\package.json"  "$destino\backend\package.json"
Copy-Item "$raiz\backend\package-lock.json" "$destino\backend\package-lock.json" -ErrorAction SilentlyContinue
Copy-Item "$raiz\backend\pm2.config.js" "$destino\backend\pm2.config.js"

# Copiar widget compilado
Copy-Item "$raiz\frontend\dist-widget\*" "$destino\widget\" -Recurse

Write-Host "      Carpeta creada OK" -ForegroundColor Green

# ── 4. Recordatorio del .env ──────────────────────────────────────────────────
Write-Host "[4/4] Recordatorio importante..." -ForegroundColor Yellow
Write-Host ""
Write-Host "  *** ANTES DE COPIAR AL SERVIDOR ***" -ForegroundColor Red
Write-Host "  Crea el archivo: deploy\para-copiar-al-servidor\backend\.env" -ForegroundColor Red
Write-Host "  (copia backend\.env.example y rellena los valores reales)" -ForegroundColor Red
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Listo. Ahora copia la carpeta:" -ForegroundColor Cyan
Write-Host "  deploy\para-copiar-al-servidor\" -ForegroundColor White
Write-Host "  al servidor Windows." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
