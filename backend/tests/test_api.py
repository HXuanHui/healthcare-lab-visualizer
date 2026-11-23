from pathlib import Path

from fastapi.testclient import TestClient

from backend.main import app

SAMPLE_FILE = Path(__file__).parents[2] / "檢驗檢查結果_1150612.html"


def test_parse_endpoint_returns_records() -> None:
    """確認上傳樣本 HTML 後 API 可回傳全量解析結果。"""

    client = TestClient(app)
    with SAMPLE_FILE.open("rb") as file_handle:
        response = client.post(
            "/api/parse",
            files=[("files", (SAMPLE_FILE.name, file_handle, "text/html"))],
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_count"] > 500
    assert payload["numeric_count"] > 0
    assert payload["text_count"] > 0
    item_names = {record["item_name"] for record in payload["records"]}
    assert "Hematocrit" in item_names
    assert "ALT/GPT" in item_names


def test_chart_group_settings_auto_create_on_get(tmp_path, monkeypatch) -> None:
    """確認設定檔不存在時，GET 會自動建立預設 chart-groups.json。"""

    test_file = tmp_path / "chart-groups.json"
    monkeypatch.setattr("backend.settings_store.CHART_GROUPS_FILE", test_file)
    monkeypatch.setattr("backend.settings_store.SETTINGS_DIR", tmp_path)

    client = TestClient(app)
    response = client.get("/api/settings/chart-groups")

    assert response.status_code == 200
    assert response.json() == {"version": 1, "groups": []}
    assert test_file.exists()
    assert test_file.read_text(encoding="utf-8").strip().startswith("{")


def test_chart_group_settings_roundtrip(tmp_path, monkeypatch) -> None:
    """確認圖表分組設定可寫入並讀回本機 JSON 檔。"""

    test_file = tmp_path / "chart-groups.json"
    monkeypatch.setattr("backend.settings_store.CHART_GROUPS_FILE", test_file)
    monkeypatch.setattr("backend.settings_store.SETTINGS_DIR", tmp_path)

    client = TestClient(app)
    payload = {
        "version": 1,
        "groups": [
            {
                "id": "blood",
                "name": "血球",
                "item_keys": ["Hemoglobin||g/dL", "Hematocrit||%"],
            }
        ],
    }

    put_response = client.put("/api/settings/chart-groups", json=payload)
    assert put_response.status_code == 200

    get_response = client.get("/api/settings/chart-groups")
    assert get_response.status_code == 200
    assert get_response.json()["groups"][0]["name"] == "血球"
    assert test_file.exists()


def test_export_csv_after_parse() -> None:
    """確認解析後可匯出 CSV。"""

    client = TestClient(app)
    with SAMPLE_FILE.open("rb") as file_handle:
        client.post(
            "/api/parse",
            files=[("files", (SAMPLE_FILE.name, file_handle, "text/html"))],
        )

    response = client.get("/api/export/csv")
    assert response.status_code == 200
    assert "item_name" in response.text
    assert "Hematocrit" in response.text
