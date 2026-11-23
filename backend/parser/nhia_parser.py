from __future__ import annotations

import re
from datetime import date
from html import unescape

from bs4 import BeautifulSoup

from backend.models.lab_record import LabRecord

_WHITESPACE_RE = re.compile(r"\s+")
_NUMBER_RE = re.compile(r"^[+-]?\d+(?:,\d{3})*(?:\.\d+)?$|^[+-]?\d+(?:\.\d+)?$")
_BRACKET_REF_RE = re.compile(r"\[([^\]]*)\]\[([^\]]*)\]")


def parse_nhia_html(content: bytes | str, source_file: str) -> list[LabRecord]:
    """解析健保署健康存摺「檢驗檢查結果」HTML。

    Args:
        content: HTML 檔案內容，可為 bytes 或文字。
        source_file: 來源檔名，會寫入每筆資料供前端追蹤。

    Returns:
        已正規化的檢驗結果清單；無法辨識主表格時回傳空清單。
    """

    html_text = _decode_html(content)
    soup = BeautifulSoup(html_text, "lxml")
    table = soup.select_one("table.list")
    if table is None:
        return []

    records: list[LabRecord] = []
    for row in table.find_all("tr"):
        cells = row.find_all("td", recursive=False)
        if len(cells) < 11:
            continue

        values = [_clean_text(cell.get_text(" ", strip=True)) for cell in cells[:11]]
        value_numeric = parse_number(values[8])
        ref_min, ref_max = parse_reference_range(values[10])

        records.append(
            LabRecord(
                region=values[0],
                hospital=values[1],
                visit_date=parse_roc_date(values[2]),
                test_date=parse_roc_date(values[3]),
                upload_date=parse_roc_date(values[4]),
                order_code=values[5],
                order_name=values[6],
                item_name=values[7],
                value_raw=values[8],
                value_numeric=value_numeric,
                unit=values[9],
                ref_raw=values[10],
                ref_min=ref_min,
                ref_max=ref_max,
                source_file=source_file,
            )
        )

    return records


def parse_roc_date(value: str) -> date | None:
    """將民國年日期轉為西元日期。

    Args:
        value: 例如 `112/06/26` 的日期字串。

    Returns:
        西元日期；格式不合法時回傳 `None`。
    """

    normalized = _clean_text(value)
    if not normalized:
        return None

    parts = normalized.split("/")
    if len(parts) != 3:
        return None

    try:
        year = int(parts[0])
        month = int(parts[1])
        day = int(parts[2])
        if year < 1911:
            year += 1911
        return date(year, month, day)
    except ValueError:
        return None


def parse_number(value: str) -> float | None:
    """將檢驗結果或參考值片段轉為數字。

    Args:
        value: 原始數值字串。

    Returns:
        可解析時回傳 float；文字型或空值回傳 `None`。
    """

    normalized = _clean_text(value).replace(",", "")
    if not normalized or not _NUMBER_RE.match(normalized):
        return None

    try:
        return float(normalized)
    except ValueError:
        return None


def parse_reference_range(value: str) -> tuple[float | None, float | None]:
    """解析健保署常見的 `[下限][上限]` 參考值格式。

    Args:
        value: 原始參考值字串。

    Returns:
        `(ref_min, ref_max)`；任一側不是數值時以 `None` 表示。
    """

    normalized = _clean_text(value)
    match = _BRACKET_REF_RE.search(normalized)
    if not match:
        return (None, None)

    return (parse_number(match.group(1)), parse_number(match.group(2)))


def _decode_html(content: bytes | str) -> str:
    """解碼 HTML 內容並保留 UTF-8 健保署檔案文字。"""

    if isinstance(content, str):
        return content

    for encoding in ("utf-8-sig", "utf-8", "big5"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="replace")


def _clean_text(value: str) -> str:
    """清理表格儲存格文字，避免換行與多餘空白影響比對。"""

    return _WHITESPACE_RE.sub(" ", unescape(value)).strip()
