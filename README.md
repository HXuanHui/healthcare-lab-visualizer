# 檢驗檢查結果視覺化網站

這是一個純前端的健保署健康存摺視覺化工具。HTML 在瀏覽器裡解析，圖表分組存在這台瀏覽器的 localStorage。靜態頁面可以放到 Cloudflare Pages，伺服器不會收到檢驗檔或設定。

## 功能

- 上傳一或多個健保署 HTML 檔，由瀏覽器解析，不經過後端。
- 依單日、日期區間、指標與醫院篩選。
- 顯示趨勢圖、指標摘要卡、sparkline、參考值上下限與異常點。
- 文字型結果（例如 `Negative`）不進入趨勢圖，但可在表格中搜尋。
- 可匯出目前篩選結果為 CSV 或 PDF，檔案由瀏覽器下載。
- **預設每個指標各一張趨勢圖**。分組設定按「儲存在此瀏覽器」後只留在 localStorage；也可用 JSON 匯入、匯出，方便自己備份。

## 安裝與啟動

```powershell
cd frontend
npm install
npm run dev -- --host 127.0.0.1
```

或：

```powershell
.\start.ps1 -Install
```

網址預設為 `http://127.0.0.1:5173`。

## 放到 Cloudflare Pages

只發布靜態檔，不要加 Pages Functions 或 Workers。

- Root directory：`frontend`
- Build command：`npm ci && npm run build`
- Build output directory：`dist`

不要把專案根目錄的健保署 HTML、匯出的 CSV／PDF，或 `settings/chart-groups.json` 放進網站目錄。那些檔案不在 `frontend/dist` 裡。

頁面載入後，使用者選取的 HTML 與 localStorage 都留在自己的瀏覽器。清除網站資料會一併清掉圖表分組。換一台電腦要重新匯入設定檔。

## 圖表分組設定

- 預設：每個檢驗指標（名稱 + 單位）各自一張圖
- 合併指標：點「圖表分組設定」→ 新增分組 → 勾選指標 →「儲存在此瀏覽器」
- 若要帶走設定：按「匯出設定檔」，到另一台瀏覽器再「匯入設定檔」並儲存

## 測試

```powershell
cd frontend
npm run build
```

`backend/` 是先前的本機 API，頁面已經不再呼叫它。部署時不要把這支 API 放到網路上。

## 隱私提醒

健保署 HTML 屬於敏感醫療資料。這個網站不接收上傳內容；請仍避免把原始 HTML 或匯出的 CSV、PDF 放到公開位置。
