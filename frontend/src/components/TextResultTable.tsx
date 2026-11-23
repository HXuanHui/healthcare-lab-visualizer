import { useMemo, useState } from "react";
import type { LabRecord } from "../types/lab";

interface TextResultTableProps {
  records: LabRecord[];
}

/** 文字型檢驗結果表格。
 *
 * @param props 元件屬性，包含已套用時間與醫院篩選的文字型結果。
 * @returns 可依關鍵字搜尋的文字結果表格。
 */
export function TextResultTable({ records }: TextResultTableProps) {
  const [query, setQuery] = useState("");
  const filteredRecords = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return records;
    }
    return records.filter((record) =>
      `${record.item_name} ${record.value_raw} ${record.hospital} ${record.order_name}`.toLowerCase().includes(normalizedQuery),
    );
  }, [records, query]);

  return (
    <section className="panel text-table-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">文字型結果</p>
          <h2>不進入趨勢圖的檢驗資料</h2>
        </div>
        <span className="muted">{filteredRecords.length.toLocaleString()} 筆</span>
      </div>
      <input
        aria-label="搜尋文字型結果"
        placeholder="搜尋 Negative、項目或醫院"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>檢驗日期</th>
              <th>項目</th>
              <th>結果</th>
              <th>單位</th>
              <th>參考值</th>
              <th>醫院</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.slice(0, 300).map((record) => (
              <tr key={`${record.test_date}-${record.item_name}-${record.value_raw}-${record.hospital}`}>
                <td>{record.test_date ?? "-"}</td>
                <td>{record.item_name}</td>
                <td>{record.value_raw}</td>
                <td>{record.unit || "-"}</td>
                <td>{record.ref_raw || "-"}</td>
                <td>{record.hospital}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filteredRecords.length > 300 && <p className="muted">目前僅顯示前 300 筆，請用搜尋縮小範圍。</p>}
    </section>
  );
}
