import { getItemKey } from "../analytics/filterRecords";
import type { LabRecord } from "../types/lab";

interface ItemResultTablesProps {
  records: LabRecord[];
  /** 要以表格顯示的選取指標鍵（文字型，或僅有單一數值點的項目）。 */
  tableItemKeys: string[];
  onCloseItem: (itemKeys: string[]) => void;
}

/** 將選取後改以表格呈現的指標顯示為結果表。
 *
 * @param props 元件屬性，包含篩選後資料、表格指標鍵與關閉回呼。
 * @returns 每個表格型指標一張結果表。
 */
export function ItemResultTables({ records, tableItemKeys, onCloseItem }: ItemResultTablesProps) {
  const tableKeySet = new Set(tableItemKeys);
  const grouped = new Map<string, LabRecord[]>();

  records
    .filter((record) => Boolean(record.test_date))
    .filter((record) => tableKeySet.has(getItemKey(record)))
    .forEach((record) => {
      const itemKey = getItemKey(record);
      grouped.set(itemKey, [...(grouped.get(itemKey) ?? []), record]);
    });

  const panels = Array.from(grouped.entries())
    .map(([itemKey, group]) => {
      const sorted = [...group].sort((a, b) => (a.test_date as string).localeCompare(b.test_date as string));
      return {
        itemKey,
        title: `${sorted[0].item_name}（${sorted[0].unit || "-"}）`,
        records: sorted,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title, "zh-Hant"));

  if (panels.length === 0) {
    return null;
  }

  return (
    <section className="item-result-stack" aria-label="指標結果表">
      {panels.map((panel) => (
        <div
          className="panel item-result-panel pdf-chart-panel"
          id={toTextPanelDomId(panel.itemKey)}
          key={panel.itemKey}
          data-chart-title={panel.title}
        >
          <button
            type="button"
            className="chart-close-button"
            aria-label={`關閉表格 ${panel.title}`}
            title="關閉此表格"
            onClick={() => onCloseItem([panel.itemKey])}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path
                d="M3.5 3.5 L12.5 12.5 M12.5 3.5 L3.5 12.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <div className="section-heading">
            <div>
              <p className="eyebrow">結果表格</p>
              <h2>{panel.title}</h2>
            </div>
            <span className="muted">{panel.records.length.toLocaleString()} 筆</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>檢驗日期</th>
                  <th>結果</th>
                  <th>單位</th>
                  <th>參考值</th>
                  <th>醫院</th>
                  <th>醫令</th>
                </tr>
              </thead>
              <tbody>
                {panel.records.map((record) => (
                  <tr key={`${record.test_date}-${record.value_raw}-${record.hospital}-${record.source_file}`}>
                    <td>{record.test_date ?? "-"}</td>
                    <td>{record.value_raw || "-"}</td>
                    <td>{record.unit || "-"}</td>
                    <td>{record.ref_raw || "-"}</td>
                    <td>{record.hospital}</td>
                    <td>{record.order_name || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}

/** 表格型結果面板的 DOM id。
 *
 * @param itemKey 指標鍵。
 * @returns 編碼後可供 scrollIntoView 使用的 id。
 */
export function toTextPanelDomId(itemKey: string): string {
  return `text-panel-${encodeURIComponent(itemKey)}`;
}
