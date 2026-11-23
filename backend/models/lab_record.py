from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


class LabRecord(BaseModel):
    """單筆健保署檢驗檢查結果列。

    這個模型保留原始文字與可數值化欄位，讓前端可以同時支援趨勢圖與文字型結果表。
    """

    region: str = Field(description="健保署服務單位")
    hospital: str = Field(description="醫事機構名稱")
    visit_date: date | None = Field(default=None, description="就醫日期或入院日期")
    test_date: date | None = Field(default=None, description="檢驗或檢查日期")
    upload_date: date | None = Field(default=None, description="資料上傳時間")
    order_code: str = Field(description="醫囑代碼")
    order_name: str = Field(description="醫囑名稱")
    item_name: str = Field(description="檢驗項目名稱")
    value_raw: str = Field(description="原始結果值")
    value_numeric: float | None = Field(default=None, description="可數值化的結果值")
    unit: str = Field(description="結果單位")
    ref_raw: str = Field(description="原始參考值")
    ref_min: float | None = Field(default=None, description="參考值下限")
    ref_max: float | None = Field(default=None, description="參考值上限")
    source_file: str = Field(description="來源 HTML 檔名")

    def dedupe_key(self) -> tuple[str, str, str, str, str]:
        """回傳多檔匯入時用來去除重複列的穩定鍵。

        同一項目、同一檢驗日期、同一醫院與同一原始結果通常代表同一筆健保署資料。
        """

        return (
            self.item_name,
            self.test_date.isoformat() if self.test_date else "",
            self.hospital,
            self.value_raw,
            self.order_code,
        )


class ImportFileSummary(BaseModel):
    """單一 HTML 檔案的解析摘要。"""

    file_name: str = Field(description="匯入檔名")
    total_count: int = Field(description="解析出的總列數")
    numeric_count: int = Field(description="可數值化列數")
    text_count: int = Field(description="文字型結果列數")
    date_from: date | None = Field(default=None, description="檔案內最早檢驗日期")
    date_to: date | None = Field(default=None, description="檔案內最晚檢驗日期")


class ImportResponse(BaseModel):
    """匯入 API 回應。"""

    records: list[LabRecord] = Field(description="去重後的全量檢驗結果")
    files: list[ImportFileSummary] = Field(description="各檔案解析摘要")
    total_count: int = Field(description="去重後總列數")
    numeric_count: int = Field(description="去重後可數值化列數")
    text_count: int = Field(description="去重後文字型結果列數")
