import { getItemKey } from "./filterRecords";
import type { ChartGroup, ChartGroupSettings, LabRecord } from "../types/lab";

/** 單一圖表面板（預設每指標一圖，或使用者自訂分組）。 */
export interface ChartPanel {
  panelId: string;
  title: string;
  itemKeys: string[];
  records: LabRecord[];
}

/** 依設定將檢驗資料拆成多個圖表面板。
 *
 * 預設行為：每個 `itemKey` 各自一張圖。
 * 若指標出現在使用者自訂分組中，則與同組指標共用一張圖。
 *
 * @param records 已篩選的數值型資料。
 * @param settings 本機圖表分組設定。
 * @returns 依顯示順序排列的圖表面板清單。
 */
export function buildChartPanels(records: LabRecord[], settings: ChartGroupSettings): ChartPanel[] {
  const itemKeyToGroup = buildItemKeyToGroupMap(settings);
  const panels = new Map<string, ChartPanel>();

  records
    .filter((record) => record.value_numeric !== null && record.test_date)
    .forEach((record) => {
      const itemKey = getItemKey(record);
      const customGroup = itemKeyToGroup.get(itemKey);
      const panelId = customGroup ? `group:${customGroup.id}` : `solo:${itemKey}`;
      const title = customGroup ? customGroup.name : `${record.item_name}（${record.unit || "-"}）`;

      const current = panels.get(panelId) ?? {
        panelId,
        title,
        itemKeys: [],
        records: [],
      };

      if (!current.itemKeys.includes(itemKey)) {
        current.itemKeys.push(itemKey);
      }
      current.records.push(record);
      panels.set(panelId, current);
    });

  return Array.from(panels.values()).sort((a, b) => a.title.localeCompare(b.title, "zh-Hant"));
}

/** 依指標鍵找出對應圖表面板 id（自訂分組或單指標）。
 *
 * @param itemKey 指標鍵（`item_name||unit`）。
 * @param settings 本機圖表分組設定。
 * @returns 面板 id，格式為 `group:...` 或 `solo:...`。
 */
export function resolveChartPanelId(itemKey: string, settings: ChartGroupSettings): string {
  const customGroup = buildItemKeyToGroupMap(settings).get(itemKey);
  return customGroup ? `group:${customGroup.id}` : `solo:${itemKey}`;
}

/** 將面板 id 轉成可作為 DOM `id` 的字串。
 *
 * @param panelId 圖表面板 id。
 * @returns 適合 `document.getElementById` 的編碼後 id。
 */
export function toChartPanelDomId(panelId: string): string {
  return `chart-panel-${encodeURIComponent(panelId)}`;
}

/** 建立指標鍵到自訂分組的對照表。 */
function buildItemKeyToGroupMap(settings: ChartGroupSettings): Map<string, ChartGroup> {
  const map = new Map<string, ChartGroup>();
  settings.groups.forEach((group) => {
    group.item_keys.forEach((itemKey) => {
      map.set(itemKey, group);
    });
  });
  return map;
}
