import type { LabRecord, TrendDirection, TrendSummary } from "../types/lab";
import { getItemKey } from "./filterRecords";

/** 依目前篩選後資料計算各指標的趨勢摘要。
 *
 * @param records 已套用時間、醫院與指標條件的數值型資料。
 * @returns 每個指標一筆趨勢摘要。
 */
export function buildTrendSummaries(records: LabRecord[]): TrendSummary[] {
  const grouped = new Map<string, LabRecord[]>();

  records
    .filter((record) => record.value_numeric !== null && record.test_date)
    .forEach((record) => {
      const itemKey = getItemKey(record);
      grouped.set(itemKey, [...(grouped.get(itemKey) ?? []), record]);
    });

  return Array.from(grouped.entries())
    .map(([itemKey, group]) => buildTrendSummary(itemKey, group))
    .filter((summary): summary is TrendSummary => summary !== null)
    .sort((a, b) => a.itemName.localeCompare(b.itemName, "zh-Hant"));
}

/** 判斷檢驗值是否超出該筆資料的參考值區間。
 *
 * @param record 單筆檢驗資料。
 * @returns 有參考上下限且超出時回傳 true。
 */
export function isOutOfRange(record: LabRecord): boolean {
  if (record.value_numeric === null) {
    return false;
  }

  if (record.ref_min !== null && record.value_numeric < record.ref_min) {
    return true;
  }

  if (record.ref_max !== null && record.value_numeric > record.ref_max) {
    return true;
  }

  return false;
}

function buildTrendSummary(itemKey: string, records: LabRecord[]): TrendSummary | null {
  const sorted = [...records]
    .filter((record) => record.value_numeric !== null && record.test_date)
    .sort((a, b) => (a.test_date as string).localeCompare(b.test_date as string));

  if (sorted.length === 0) {
    return null;
  }

  const firstRecord = sorted[0];
  const latestRecord = sorted.at(-1) as LabRecord;
  const values = sorted.map((record) => record.value_numeric as number);
  const firstValue = firstRecord.value_numeric as number;
  const latestValue = latestRecord.value_numeric as number;
  const delta = latestValue - firstValue;

  return {
    itemKey,
    itemName: firstRecord.item_name,
    unit: firstRecord.unit || "-",
    count: sorted.length,
    first: { date: firstRecord.test_date as string, value: firstValue },
    latest: { date: latestRecord.test_date as string, value: latestValue },
    delta,
    deltaPercent: firstValue === 0 ? null : (delta / Math.abs(firstValue)) * 100,
    direction: getDirection(delta, values),
    min: Math.min(...values),
    max: Math.max(...values),
    avg: values.reduce((sum, value) => sum + value, 0) / values.length,
    outOfRangeCount: sorted.filter(isOutOfRange).length,
    points: sorted.map((record) => ({
      date: record.test_date as string,
      value: record.value_numeric as number,
      refMin: record.ref_min,
      refMax: record.ref_max,
    })),
  };
}

function getDirection(delta: number, values: number[]): TrendDirection {
  if (values.length < 2) {
    return "flat";
  }

  const tolerance = Math.max(0.0001, Math.abs(values[0]) * 0.01);
  if (Math.abs(delta) <= tolerance) {
    return "flat";
  }
  return delta > 0 ? "up" : "down";
}
