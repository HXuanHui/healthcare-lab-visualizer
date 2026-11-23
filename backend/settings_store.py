from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel, Field

# 設定檔固定寫在專案根目錄，重啟後仍可保留圖表分組偏好。
SETTINGS_DIR = Path(__file__).resolve().parents[1] / "settings"
CHART_GROUPS_FILE = SETTINGS_DIR / "chart-groups.json"


class ChartGroup(BaseModel):
    """使用者自訂的圖表分組。"""

    id: str = Field(description="分組唯一識別碼")
    name: str = Field(description="圖表標題顯示名稱")
    item_keys: list[str] = Field(default_factory=list, description="指標鍵清單（item_name||unit）")


class ChartGroupSettings(BaseModel):
    """圖表分組設定根物件。"""

    version: int = Field(default=1, description="設定檔格式版本")
    groups: list[ChartGroup] = Field(default_factory=list, description="自訂分組清單")


def load_chart_group_settings() -> ChartGroupSettings:
    """從本機 JSON 檔讀取圖表分組設定。

    Returns:
        已解析的設定；檔案不存在時建立預設設定檔後回傳。
    """

    if not CHART_GROUPS_FILE.exists():
        # 首次使用時寫入預設空設定，避免使用者手動建立 settings 目錄與 JSON。
        return save_chart_group_settings(ChartGroupSettings())

    raw = json.loads(CHART_GROUPS_FILE.read_text(encoding="utf-8"))
    return ChartGroupSettings.model_validate(raw)


def save_chart_group_settings(settings: ChartGroupSettings) -> ChartGroupSettings:
    """將圖表分組設定寫入本機 JSON 檔。

    Args:
        settings: 待儲存的設定。

    Returns:
        寫入後的設定（與輸入相同）。
    """

    SETTINGS_DIR.mkdir(parents=True, exist_ok=True)
    CHART_GROUPS_FILE.write_text(
        json.dumps(settings.model_dump(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return settings
