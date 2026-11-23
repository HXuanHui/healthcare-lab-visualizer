import { useMemo, useState } from "react";
import type { ItemNavSummary } from "../types/lab";

interface ItemTrendCardsProps {
  summaries: ItemNavSummary[];
  selectedItems: string[];
  onToggleItem: (itemKey: string) => void;
  onSelectItems: (itemKeys: string[]) => void;
}

/** 右側指標導覽：以卡片選擇要顯示的圖表或結果表。
 *
 * @param props 元件屬性，包含摘要清單、目前選取指標與切換／批次選取回呼。
 * @returns 右側可搜尋、可點選的指標導覽清單。
 */
export function ItemTrendCards({
  summaries,
  selectedItems,
  onToggleItem,
  onSelectItems,
}: ItemTrendCardsProps) {
  const [query, setQuery] = useState("");
  const selectedSet = useMemo(() => new Set(selectedItems), [selectedItems]);

  const filteredSummaries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return summaries;
    }
    return summaries.filter((summary) =>
      `${summary.itemName} ${summary.unit}`.toLowerCase().includes(normalizedQuery),
    );
  }, [query, summaries]);

  const abnormalCount = useMemo(
    () => summaries.filter((summary) => summary.outOfRangeCount > 0).length,
    [summaries],
  );

  return (
    <aside className="panel item-nav-panel" aria-label="指標導覽">
      <div className="item-nav-header">
        <div>
          <p className="eyebrow">指標導覽</p>
          <h2>選擇要顯示的圖表</h2>
          <p className="muted">
            已選 {selectedItems.length.toLocaleString()} / {summaries.length.toLocaleString()} 項
          </p>
        </div>
        <div className="item-nav-quick-actions" role="group" aria-label="快速選取指標">
          <button
            type="button"
            disabled={summaries.length === 0}
            onClick={() => onSelectItems(summaries.map((summary) => summary.itemKey))}
          >
            全部
          </button>
          <button
            type="button"
            className="item-nav-abnormal-button"
            disabled={abnormalCount === 0}
            onClick={() =>
              onSelectItems(
                summaries
                  .filter((summary) => summary.outOfRangeCount > 0)
                  .map((summary) => summary.itemKey),
              )
            }
          >
            有異常（{abnormalCount}）
          </button>
          <button type="button" disabled={selectedItems.length === 0} onClick={() => onSelectItems([])}>
            清除
          </button>
        </div>
        <label className="trend-card-search">
          <span className="visually-hidden">搜尋指標</span>
          <input
            aria-label="搜尋檢驗指標"
            placeholder="搜尋指標"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      {summaries.length === 0 ? (
        <p className="muted">目前篩選條件下沒有可用指標。</p>
      ) : (
        <nav className="item-nav-list" aria-label="檢驗指標列表">
          {filteredSummaries.map((summary) => {
            const selected = selectedSet.has(summary.itemKey);
            const isMetricCard = summary.cardStyle === "metric";
            return (
              <button
                type="button"
                className={`trend-card${selected ? " selected" : ""}`}
                key={summary.itemKey}
                aria-pressed={selected}
                onClick={() => onToggleItem(summary.itemKey)}
              >
                <div className="trend-card-header">
                  <div>
                    <h3>{summary.itemName}</h3>
                    <p className="muted">
                      {summary.unit} · {summary.count} 筆
                    </p>
                  </div>
                  <span className={`direction direction-${summary.direction}`}>
                    {isMetricCard ? directionLabel(summary.direction) : "文字"}
                  </span>
                </div>
                <div className="latest-value">
                  <strong>{summary.latestLabel}</strong>
                  <span>{summary.latestDate}</span>
                </div>
                {isMetricCard ? (
                  <MiniSparkline points={summary.sparkPoints} />
                ) : (
                  <div className="text-item-placeholder">點選後以結果表顯示</div>
                )}
                <dl className="metric-grid">
                  <div>
                    <dt>變化</dt>
                    <dd>{summary.deltaLabel}</dd>
                  </div>
                  <div>
                    <dt>{isMetricCard ? "區間" : "結果"}</dt>
                    <dd>{summary.rangeLabel}</dd>
                  </div>
                  <div>
                    <dt>平均</dt>
                    <dd>{summary.avgLabel}</dd>
                  </div>
                  <div className={summary.outOfRangeCount > 0 ? "metric-alert" : undefined}>
                    <dt>異常</dt>
                    <dd>{summary.outOfRangeCount.toLocaleString()} 次</dd>
                  </div>
                </dl>
                <span className="trend-card-hint">
                  {selected ? "已顯示 · 再點一次可關閉" : isMetricCard ? "點擊顯示圖表" : "點擊顯示表格"}
                </span>
              </button>
            );
          })}
        </nav>
      )}
    </aside>
  );
}

function MiniSparkline({ points }: { points: number[] }) {
  const path = buildPath(points);
  return (
    <svg className="trend-sparkline" viewBox="0 0 180 44" role="img" aria-label="篩選區間趨勢">
      <path d={path} />
    </svg>
  );
}

function buildPath(values: number[]): string {
  if (values.length === 0) {
    return "";
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((value, index) => {
      const x = values.length === 1 ? 90 : (index / (values.length - 1)) * 174 + 3;
      const y = 40 - ((value - min) / range) * 34;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function directionLabel(direction: ItemNavSummary["direction"]): string {
  if (direction === "up") {
    return "上升";
  }
  if (direction === "down") {
    return "下降";
  }
  return "持平";
}
