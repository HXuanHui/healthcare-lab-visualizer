import type { AnalysisFilters, LabRecord } from "../types/lab";

/** 建立預設篩選條件。
 *
 * @param records 已匯入的全量資料。
 * @returns 以全期間與全醫院為預設的分析篩選條件。
 */
export function createDefaultFilters(records: LabRecord[]): AnalysisFilters {
  const dates = getAvailableDates(records);
  return {
    timeMode: "all",
    dateFrom: dates[0],
    dateTo: dates.at(-1),
    singleDay: dates.at(-1),
    selectedItems: [],
    hospitals: getAvailableHospitals(records),
  };
}

/** 取得資料內所有可用檢驗日期。
 *
 * @param records 檢驗資料。
 * @returns 由早到晚排序的 ISO 日期清單。
 */
export function getAvailableDates(records: LabRecord[]): string[] {
  return Array.from(
    new Set(records.map((record) => record.test_date).filter((date): date is string => Boolean(date))),
  ).sort();
}

/** 取得資料內所有醫院名稱。
 *
 * @param records 檢驗資料。
 * @returns 依字母與中文排序的醫院清單。
 */
export function getAvailableHospitals(records: LabRecord[]): string[] {
  return Array.from(new Set(records.map((record) => record.hospital).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "zh-Hant"),
  );
}

/** 將快捷日期區間套用到目前篩選條件。
 *
 * @param filters 目前篩選條件。
 * @param records 全量資料。
 * @param months 回推月份；傳入 `null` 代表全期間。
 * @returns 更新後的篩選條件。
 */
export function applyQuickRange(filters: AnalysisFilters, records: LabRecord[], months: number | null): AnalysisFilters {
  const dates = getAvailableDates(records);
  if (dates.length === 0) {
    return filters;
  }

  if (months === null) {
    return { ...filters, timeMode: "all", dateFrom: dates[0], dateTo: dates.at(-1) };
  }

  const latest = new Date(`${dates.at(-1)}T00:00:00`);
  const from = new Date(latest);
  from.setMonth(from.getMonth() - months);
  return {
    ...filters,
    timeMode: "range",
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: dates.at(-1),
  };
}
