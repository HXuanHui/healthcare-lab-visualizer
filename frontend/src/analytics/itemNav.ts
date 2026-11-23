import type { ItemNavSummary, LabRecord } from "../types/lab";
import { getItemKey } from "./filterRecords";
import { buildTrendSummaries } from "./trendSummary";

/** 判斷該指標是否足以畫趨勢圖（至少兩個數值點）。
 *
 * @param count 該指標的數值資料筆數。
 * @returns 兩筆以上才回傳 true。
 */
export function canDrawTrendChart(count: number): boolean {
  return count >= 2;
}

/** 建立右側導覽用指標摘要（數值卡外觀維持一致；單點改在中間用結果表）。
 *
 * @param records 已套用時間與醫院篩選的資料。
 * @returns 依項目名稱排序的導覽卡片摘要。
 */
export function buildItemNavSummaries(records: LabRecord[]): ItemNavSummary[] {
  const withDate = records.filter((record) => Boolean(record.test_date));
  const numericSummaries = buildTrendSummaries(withDate);
  const numericKeys = new Set(numericSummaries.map((summary) => summary.itemKey));

  // 數值型卡片外觀一律維持原樣；僅 kind 決定中間開圖或開表。
  const numericCards: ItemNavSummary[] = numericSummaries.map((summary) => ({
    itemKey: summary.itemKey,
    itemName: summary.itemName,
    unit: summary.unit,
    kind: canDrawTrendChart(summary.count) ? "chart" : "table",
    cardStyle: "metric",
    count: summary.count,
    latestLabel: formatNumber(summary.latest.value),
    latestDate: summary.latest.date,
    direction: summary.direction,
    deltaLabel:
      summary.deltaPercent !== null
        ? `${formatSigned(summary.delta)} (${formatSigned(summary.deltaPercent)}%)`
        : formatSigned(summary.delta),
    rangeLabel: `${formatNumber(summary.min)} - ${formatNumber(summary.max)}`,
    avgLabel: formatNumber(summary.avg),
    outOfRangeCount: summary.outOfRangeCount,
    sparkPoints: summary.points.map((point) => point.value),
  }));

  const textGrouped = new Map<string, LabRecord[]>();
  withDate
    .filter((record) => record.value_numeric === null)
    .forEach((record) => {
      const itemKey = getItemKey(record);
      if (numericKeys.has(itemKey)) {
        return;
      }
      textGrouped.set(itemKey, [...(textGrouped.get(itemKey) ?? []), record]);
    });

  const textCards: ItemNavSummary[] = Array.from(textGrouped.entries()).map(([itemKey, group]) => {
    const sorted = [...group].sort((a, b) => (a.test_date as string).localeCompare(b.test_date as string));
    const first = sorted[0];
    const latest = sorted.at(-1) as LabRecord;
    const uniqueValues = Array.from(new Set(sorted.map((record) => record.value_raw.trim()).filter(Boolean)));

    return {
      itemKey,
      itemName: first.item_name,
      unit: first.unit || "-",
      kind: "table",
      cardStyle: "text",
      count: sorted.length,
      latestLabel: latest.value_raw || "-",
      latestDate: latest.test_date as string,
      direction: "flat",
      deltaLabel: "-",
      rangeLabel: uniqueValues.length <= 3 ? uniqueValues.join(" / ") || "-" : `${uniqueValues.length} 種結果`,
      avgLabel: "-",
      outOfRangeCount: 0,
      sparkPoints: [],
    };
  });

  return [...numericCards, ...textCards].sort((a, b) => a.itemName.localeCompare(b.itemName, "zh-Hant"));
}

function formatNumber(value: number): string {
  return Number(value.toFixed(3)).toLocaleString();
}

function formatSigned(value: number): string {
  const formatted = formatNumber(value);
  return value > 0 ? `+${formatted}` : formatted;
}
