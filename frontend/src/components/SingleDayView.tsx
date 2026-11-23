import type { LabRecord } from "../types/lab";

interface SingleDayViewProps {
  records: LabRecord[];
  onFocusItem: (itemKey: string) => void;
}

/** 單日橫向比較檢視。
 *
 * @param props 元件屬性，包含單日資料與切換到單項趨勢的回呼。
 * @returns 同一天各數值指標的表格與相對長條。
 */
export function SingleDayView({ records, onFocusItem }: SingleDayViewProps) {
  const sorted = [...records]
    .filter((record) => record.value_numeric !== null)
    .sort((a, b) => a.item_name.localeCompare(b.item_name, "zh-Hant"));
  const maxAbsValue = Math.max(...sorted.map((record) => Math.abs(record.value_numeric ?? 0)), 1);

  if (sorted.length === 0) {
    return (
      <section className="panel empty-state">
        <h2>這一天沒有符合條件的數值資料</h2>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">單日比較</p>
          <h2>{sorted[0].test_date} 的數值檢驗</h2>
        </div>
        <span className="muted">{sorted.length.toLocaleString()} 筆</span>
      </div>
      <div className="single-day-table">
        {sorted.map((record) => {
          const width = `${Math.max(3, (Math.abs(record.value_numeric ?? 0) / maxAbsValue) * 100)}%`;
          const itemKey = `${record.item_name}||${record.unit || "-"}`;
          return (
            <button className="single-day-row" key={`${itemKey}-${record.hospital}-${record.value_raw}`} onClick={() => onFocusItem(itemKey)}>
              <span>
                <strong>{record.item_name}</strong>
                <small>
                  {record.hospital} · {record.unit || "-"} · 參考 {record.ref_raw || "-"}
                </small>
              </span>
              <span className="bar-cell">
                <span className="bar" style={{ width }} />
              </span>
              <strong>{record.value_raw}</strong>
            </button>
          );
        })}
      </div>
    </section>
  );
}
