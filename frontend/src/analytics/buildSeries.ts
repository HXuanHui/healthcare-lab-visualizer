import type { EChartsOption, SeriesOption } from "echarts";
import type { LabRecord, TrendSummary } from "../types/lab";
import { getItemKey } from "./filterRecords";
import { isOutOfRange } from "./trendSummary";

/** 建立數值軸共用設定，上下留白給資料點標籤。 */
function buildValueAxisBase() {
  return {
    type: "value" as const,
    scale: true,
    // 最高點的數字會往上標，預留較多上緣，避免貼到畫布邊緣被裁掉。
    boundaryGap: ["14%", "24%"] as [string, string],
  };
}

/** 建立 ECharts 折線圖設定。
 *
 * @param records 同一圖表面板內的數值型資料（可含多個指標）。
 * @param summaries 同一圖表面板內的趨勢摘要。
 * @param title 圖表標題。
 * @returns ECharts option；多單位時自動配置多 Y 軸，每個資料點都標出數值。
 */
export function buildTrendChartOption(records: LabRecord[], summaries: TrendSummary[], title: string): EChartsOption {
  const units = Array.from(new Set(records.map((record) => record.unit || "-")));
  const unitAxisIndex = new Map(units.map((unit, index) => [unit, index]));
  const series = buildLineSeries(records, unitAxisIndex);
  const referenceSeries = buildReferenceSeries(summaries, unitAxisIndex);
  const useMultipleAxes = units.length > 1;

  return {
    title: {
      text: title,
      left: "center",
      textStyle: { fontSize: 16 },
    },
    tooltip: {
      // 以資料點為單位，避免同一時間軸上一次列出多個系列數值。
      trigger: "item",
      valueFormatter: (value) => (typeof value === "number" ? Number(value).toLocaleString() : String(value)),
    },
    legend: {
      type: "scroll",
      top: 32,
    },
    grid: {
      left: useMultipleAxes ? 80 : 64,
      right: useMultipleAxes ? 88 : 72,
      top: 108,
      bottom: 88,
      // 把軸標籤算進繪圖區，避免左右刻度被容器裁掉。
      containLabel: true,
    },
    xAxis: {
      type: "time",
    },
    yAxis: useMultipleAxes
      ? units.map((unit, index) => ({
          ...buildValueAxisBase(),
          name: unit,
          position: index % 2 === 0 ? ("left" as const) : ("right" as const),
          offset: index > 1 ? (index - 1) * 48 : 0,
        }))
      : buildValueAxisBase(),
    dataZoom: [
      { type: "inside" },
      { type: "slider", bottom: 16 },
    ],
    series: [...series, ...referenceSeries],
  };
}

/** 產生資料點上的固定文字。優先用報告原始值，以保留小數位。
 *
 * @param record 單一檢驗資料列。
 * @returns 可直接顯示的數字文字。大括號會改成全形，避免被圖表當成模板。
 */
function toPointLabelText(record: LabRecord): string {
  const text = record.value_raw.trim() || (record.value_numeric == null ? "" : String(record.value_numeric));
  return text.replaceAll("{", "｛").replaceAll("}", "｝");
}

/** 依指標分組建立折線，並在每個資料點標出數值。 */
function buildLineSeries(records: LabRecord[], unitAxisIndex: Map<string, number>): SeriesOption[] {
  const grouped = new Map<string, LabRecord[]>();
  records
    .filter((record) => record.value_numeric !== null && record.test_date)
    .forEach((record) => {
      const key = getItemKey(record);
      grouped.set(key, [...(grouped.get(key) ?? []), record]);
    });

  // 少於兩個點的指標不進折線圖，改由結果表呈現。
  return Array.from(grouped.values())
    .filter((group) => group.length >= 2)
    .map((group) => {
    const first = group[0];
    const unit = first.unit || "-";
    const sorted = group.sort((a, b) => (a.test_date as string).localeCompare(b.test_date as string));
    return {
      name: `${first.item_name} (${unit})`,
      type: "line",
      smooth: true,
      showSymbol: true,
      // 每個資料點都畫符號與數字，不依刻度間隔省略。
      showAllSymbol: true,
      // 關閉繪圖區裁切，數值標籤才不會在靠近上下緣時被切掉。
      clip: false,
      yAxisIndex: unitAxisIndex.get(unit) ?? 0,
      emphasis: { focus: "series" },
      label: {
        show: true,
        position: "top",
        distance: 6,
        fontSize: 12,
        fontWeight: 600,
        color: "#172033",
        // 白邊讓數字疊在折線上仍可辨識；不截斷、不因重疊而隱藏。
        textBorderColor: "#ffffff",
        textBorderWidth: 3,
        overflow: "none",
      },
      labelLayout: (params) => ({
        hideOverlap: false,
        // 相鄰點交錯上移，數字仍全部保留，且落在軸區預留的上緣內。
        y: params.labelRect.y - ((params.dataIndex ?? 0) % 3) * 14,
      }),
      markArea: buildReferenceMarkArea(sorted),
      data: sorted.map((record) => ({
        value: [record.test_date, record.value_numeric],
        // 寫在資料點上，圖表才不會把原始報告數字正規化掉。
        label: { formatter: toPointLabelText(record) },
        itemStyle: isOutOfRange(record) ? { color: "#b42318" } : undefined,
        symbolSize: isOutOfRange(record) ? 10 : 6,
      })),
    } satisfies SeriesOption;
  });
}


/** 依連續相同參考值區間建立 markArea 帶狀背景。
 *
 * @param records 單一指標的時間排序資料列。
 * @returns ECharts markArea 設定；無參考值時回傳 undefined。
 */
function buildReferenceMarkArea(records: LabRecord[]): SeriesOption["markArea"] {
  const segments: Array<{ start: string; end: string; refMin: number; refMax: number }> = [];

  records.forEach((record) => {
    if (record.ref_min === null || record.ref_max === null || !record.test_date) {
      return;
    }

    const last = segments.at(-1);
    if (
      last &&
      last.refMin === record.ref_min &&
      last.refMax === record.ref_max
    ) {
      last.end = record.test_date;
      return;
    }

    segments.push({
      start: record.test_date,
      end: record.test_date,
      refMin: record.ref_min,
      refMax: record.ref_max,
    });
  });

  if (segments.length === 0) {
    return undefined;
  }

  return {
    silent: true,
    itemStyle: { color: "rgba(47, 111, 237, 0.12)" },
    data: segments.map((segment) => [
      { xAxis: segment.start, yAxis: segment.refMin },
      { xAxis: segment.end, yAxis: segment.refMax },
    ]),
  };
}

function buildReferenceSeries(summaries: TrendSummary[], unitAxisIndex: Map<string, number>): SeriesOption[] {
  const result: SeriesOption[] = [];

  summaries.forEach((summary) => {
    const lowerPoints = summary.points.filter((point) => point.refMin !== null);
    const upperPoints = summary.points.filter((point) => point.refMax !== null);
    const yAxisIndex = unitAxisIndex.get(summary.unit) ?? 0;

    if (lowerPoints.length > 0) {
      result.push({
        name: `${summary.itemName} 參考下限`,
        type: "line",
        yAxisIndex,
        data: lowerPoints.map((point) => [point.date, point.refMin as number]),
        lineStyle: { type: "dashed", opacity: 0.55 },
        symbol: "none",
        tooltip: { show: false },
      });
    }

    if (upperPoints.length > 0) {
      result.push({
        name: `${summary.itemName} 參考上限`,
        type: "line",
        yAxisIndex,
        data: upperPoints.map((point) => [point.date, point.refMax as number]),
        lineStyle: { type: "dashed", opacity: 0.55 },
        symbol: "none",
        tooltip: { show: false },
      });
    }
  });

  return result;
}
