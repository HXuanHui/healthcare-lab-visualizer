param(
    [switch]$Install
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontend = Join-Path $root "frontend"
$backendPort = 8000
$frontendPort = 5173

function Stop-PortListener {
    param(
        [int]$Port
    )

    # 釋放連接埠，避免舊的 vite 或先前的 API 行程還佔著。
    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($connection in $connections) {
        $processId = $connection.OwningProcess
        if ($processId -and $processId -ne 0) {
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        }
    }
}

if ($Install) {
    $packageJson = Join-Path $frontend "package.json"
    if (-not (Test-Path $packageJson)) {
        throw "找不到 frontend/package.json，無法安裝前端依賴。"
    }
    npm install --prefix $frontend
}

# 頁面已改在瀏覽器解析，不再需要 API。關掉舊的後端，避免殘留行程仍留著檢驗資料。
Stop-PortListener -Port $backendPort
Stop-PortListener -Port $frontendPort
Start-Sleep -Seconds 1

# 用 WorkingDirectory 指定目錄，避免路徑含空白時 cd 字串被 PowerShell 解析錯誤。
$frontendArgs = @(
    "-NoExit"
    "-Command"
    "npm run dev -- --host 127.0.0.1 --port $frontendPort"
)

Start-Process -FilePath "powershell.exe" -ArgumentList $frontendArgs -WorkingDirectory $frontend

Write-Host "已啟動前端 http://127.0.0.1:$frontendPort"
Write-Host "檢驗檔與圖表設定只留在瀏覽器，不會送到後端。"
