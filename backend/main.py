"""舊版本機解析 API。

網站已改在瀏覽器內解析檢驗檔與儲存圖表分組，頁面不再呼叫這些端點。
不要把這個服務部署到 Cloudflare 或其他公開位址，否則上傳內容會留在伺服器記憶體。
"""

from __future__ import annotations

import csv
from io import StringIO
from typing import Iterable

from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from backend.models.lab_record import ImportFileSummary, ImportResponse, LabRecord
from backend.parser import parse_nhia_html
from backend.settings_store import ChartGroupSettings, load_chart_group_settings, save_chart_group_settings

@asynccontextmanager
async def lifespan(_app: FastAPI):
    """應用程式生命週期：啟動時確保圖表分組設定檔存在。"""

    load_chart_group_settings()
    yield


app = FastAPI(title="檢驗檢查結果視覺化 API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.state.records = []


@app.get("/api/health")
def health_check() -> dict[str, str]:
    """回傳 API 健康狀態。

    Returns:
        簡單狀態物件，供前端或啟動腳本確認服務可用。
    """

    return {"status": "ok"}


@app.post("/api/parse", response_model=ImportResponse)
async def parse_files(files: list[UploadFile] = File(...)) -> ImportResponse:
    """解析一或多個健保署 HTML 檔案。

    Args:
        files: 使用者上傳的 `檢驗檢查結果_*.html` 檔案清單。

    Returns:
        去重後全量資料與各檔案摘要。

    Raises:
        HTTPException: 未提供檔案、檔案格式不符或無法解析任何列時拋出。
    """

    if not files:
        raise HTTPException(status_code=400, detail="請至少上傳一個 HTML 檔案。")

    all_records: list[LabRecord] = []
    summaries: list[ImportFileSummary] = []

    for upload in files:
        file_name = upload.filename or "uploaded.html"
        if not file_name.lower().endswith((".html", ".htm")):
            raise HTTPException(status_code=400, detail=f"{file_name} 不是 HTML 檔案。")

        content = await upload.read()
        records = parse_nhia_html(content, file_name)
        summaries.append(_build_file_summary(file_name, records))
        all_records.extend(records)

    deduped_records = _dedupe_records(all_records)
    if not deduped_records:
        raise HTTPException(status_code=422, detail="找不到健保署檢驗檢查結果表格。")

    app.state.records = deduped_records

    return ImportResponse(
        records=deduped_records,
        files=summaries,
        total_count=len(deduped_records),
        numeric_count=sum(1 for record in deduped_records if record.value_numeric is not None),
        text_count=sum(1 for record in deduped_records if record.value_numeric is None),
    )


@app.get("/api/settings/chart-groups", response_model=ChartGroupSettings)
def get_chart_group_settings() -> ChartGroupSettings:
    """讀取本機圖表分組設定檔。

    Returns:
        儲存在 `settings/chart-groups.json` 的分組設定。
    """

    return load_chart_group_settings()


@app.put("/api/settings/chart-groups", response_model=ChartGroupSettings)
def put_chart_group_settings(settings: ChartGroupSettings) -> ChartGroupSettings:
    """更新本機圖表分組設定檔。

    Args:
        settings: 前端編輯後的分組設定。

    Returns:
        寫入磁碟後的設定。
    """

    _validate_chart_group_settings(settings)
    return save_chart_group_settings(settings)


@app.get("/api/export/csv")
def export_csv() -> StreamingResponse:
    """匯出最近一次解析的全量資料為 CSV。

    Returns:
        UTF-8 BOM CSV 下載串流，方便使用者交給其他資料分析工具。

    Raises:
        HTTPException: 尚未匯入資料時拋出。
    """

    records: list[LabRecord] = app.state.records
    if not records:
        raise HTTPException(status_code=404, detail="尚未匯入可匯出的資料。")

    csv_text = _records_to_csv(records)
    response = StreamingResponse(iter([csv_text]), media_type="text/csv; charset=utf-8")
    response.headers["Content-Disposition"] = 'attachment; filename="lab-records.csv"'
    return response


def _validate_chart_group_settings(settings: ChartGroupSettings) -> None:
    """驗證分組設定，避免同一指標被重複分配到多個群組。"""

    seen_keys: set[str] = set()
    for group in settings.groups:
        if not group.id.strip() or not group.name.strip():
            raise HTTPException(status_code=400, detail="分組 id 與名稱不可為空。")
        for item_key in group.item_keys:
            if item_key in seen_keys:
                raise HTTPException(status_code=400, detail=f"指標 {item_key} 不可同時出現在多個分組。")
            seen_keys.add(item_key)


def _build_file_summary(file_name: str, records: list[LabRecord]) -> ImportFileSummary:
    """依單一檔案資料建立解析摘要。"""

    dates = [record.test_date for record in records if record.test_date is not None]
    return ImportFileSummary(
        file_name=file_name,
        total_count=len(records),
        numeric_count=sum(1 for record in records if record.value_numeric is not None),
        text_count=sum(1 for record in records if record.value_numeric is None),
        date_from=min(dates) if dates else None,
        date_to=max(dates) if dates else None,
    )


def _dedupe_records(records: Iterable[LabRecord]) -> list[LabRecord]:
    """以穩定鍵去除多檔重複資料並依檢驗日期排序。"""

    deduped: dict[tuple[str, str, str, str, str], LabRecord] = {}
    for record in records:
        deduped.setdefault(record.dedupe_key(), record)

    return sorted(
        deduped.values(),
        key=lambda record: (
            record.test_date.isoformat() if record.test_date else "",
            record.item_name,
            record.hospital,
        ),
    )


def _records_to_csv(records: Iterable[LabRecord]) -> str:
    """將檢驗結果轉成 CSV 文字。"""

    output = StringIO()
    output.write("\ufeff")
    fieldnames = [
        "region",
        "hospital",
        "visit_date",
        "test_date",
        "upload_date",
        "order_code",
        "order_name",
        "item_name",
        "value_raw",
        "value_numeric",
        "unit",
        "ref_raw",
        "ref_min",
        "ref_max",
        "source_file",
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    for record in records:
        row = record.model_dump()
        writer.writerow({key: row.get(key) for key in fieldnames})

    return output.getvalue()
