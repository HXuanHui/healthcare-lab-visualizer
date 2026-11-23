import ReactECharts from "echarts-for-react";
import { buildChartPanels, toChartPanelDomId } from "../analytics/chartGrouping";
import { buildTrendChartOption } from "../analytics/buildSeries";
import type { ChartGroupSettings, LabRecord, TrendSummary } from "../types/lab";

interface TrendChartProps {
  records: LabRecord[];
  summaries: TrendSummary[];
  chartGroupSettings: ChartGroupSettings;
  onClosePanel: (itemKeys: string[]) => void;
}

/** 多指標趨勢圖。
 *
 * @param props 元件屬性，包含已篩選數值資料、趨勢摘要、圖表分組設定與關閉回呼。
 * @returns 預設每指標一圖，或依本機設定合併的 ECharts 折線圖。
 */
export function TrendChart({ records, summaries, chartGroupSettings, onClosePanel }: TrendChartProps) {
  if (records.length === 0) {
    return (
      <section className="panel empty-state">
        <h2>尚未選取指標</h2>
        <p>請點選右側指標導覽，開啟對應趨勢圖或結果表。</p>
      </section>
    );
  }

  // 再過濾一次：面板內若所有指標都不足兩點，整張圖不顯示。
  const panels = buildChartPanels(records, chartGroupSettings).filter((panel) => {
    const counts = new Map<string, number>();
    panel.records.forEach((record) => {
      if (record.value_numeric === null || !record.test_date) {
        return;
      }
      const key = `${record.item_name}||${record.unit || "-"}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return Array.from(counts.values()).some((count) => count >= 2);
  });

  if (panels.length === 0) {
    return null;
  }

  return (
    <section className="chart-stack" id="trend-chart-stack">
      {panels.map((panel) => {
        const panelSummaryKeys = new Set(panel.itemKeys);
        const panelSummaries = summaries.filter((summary) => panelSummaryKeys.has(summary.itemKey));
        return (
          <div
            className="panel chart-panel pdf-chart-panel"
            id={toChartPanelDomId(panel.panelId)}
            key={panel.panelId}
            data-chart-title={panel.title}
          >
            <button
              type="button"
              className="chart-close-button"
              aria-label={`關閉圖表 ${panel.title}`}
              title="關閉此圖表"
              onClick={() => onClosePanel(panel.itemKeys)}
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
            <ReactECharts
              notMerge
              lazyUpdate
              opts={{ renderer: "canvas" }}
              option={buildTrendChartOption(panel.records, panelSummaries, panel.title)}
              style={{ height: 520, width: "100%", maxWidth: "100%" }}
            />
          </div>
        );
      })}
    </section>
  );
}
