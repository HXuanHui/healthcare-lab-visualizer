from pathlib import Path

from backend.parser.nhia_parser import parse_nhia_html, parse_number, parse_reference_range, parse_roc_date


SAMPLE_FILE = Path(__file__).parents[2] / "檢驗檢查結果_1150612.html"


def test_parse_sample_html_extracts_expected_records() -> None:
    """確認樣本 HTML 可解析出健保署檢驗結果主表格。"""

    records = parse_nhia_html(SAMPLE_FILE.read_bytes(), SAMPLE_FILE.name)

    assert len(records) > 500
    assert records[0].hospital == "林口長庚"
    assert records[0].item_name == "Hematocrit"
    assert records[0].value_numeric == 34.2
    assert records[0].unit == "%"
    assert records[0].test_date and records[0].test_date.isoformat() == "2023-06-26"
    assert records[0].ref_min == 36
    assert records[0].ref_max == 46


def test_parse_sample_html_keeps_text_results() -> None:
    """確認文字型檢驗結果會保留原始值但不進入數值欄位。"""

    records = parse_nhia_html(SAMPLE_FILE.read_bytes(), SAMPLE_FILE.name)
    text_record = next(record for record in records if record.value_raw == "Negative")

    assert text_record.item_name
    assert text_record.value_numeric is None


def test_parse_roc_date_converts_minguo_year() -> None:
    """確認民國日期可轉換成西元日期。"""

    parsed = parse_roc_date("112/06/26")

    assert parsed and parsed.isoformat() == "2023-06-26"


def test_parse_number_rejects_non_numeric_values() -> None:
    """確認文字型結果不會被誤判為數值。"""

    assert parse_number("34.2") == 34.2
    assert parse_number("Negative") is None


def test_parse_reference_range_reads_bracket_format() -> None:
    """確認 `[下限][上限]` 參考值格式可拆成數值區間。"""

    assert parse_reference_range("[36][46]") == (36, 46)
    assert parse_reference_range("[Negative][]") == (None, None)
