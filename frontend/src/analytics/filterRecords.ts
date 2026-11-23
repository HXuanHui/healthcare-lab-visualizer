import type { AnalysisFilters, ItemOption, LabRecord } from "../types/lab";

/** 產生指標的穩定鍵，避免同名但不同單位的資料混在一起。
 *
 * @param record 單筆檢驗資料。
 * @returns `檢驗項目||單位` 格式的鍵。
 */
export function getItemKey(record: Pick<LabRecord, "item_name" | "unit">): string {
  return `${record.item_name}||${record.unit || "-"}`;
}

/** 依前端多維度條件過濾資料。
 *
 * @param records 待過濾資料。
 * @param filters 目前分析篩選條件。
 * @param options 是否套用 selectedItems 條件。
 * @returns 過濾後資料。
 */
export function filterRecords(
  records: LabRecord[],
  filters: AnalysisFilters,
  options: { includeItemFilter?: boolean } = {},
): LabRecord[] {
  const includeItemFilter = options.includeItemFilter ?? true;
  const selectedHospitalSet = new Set(filters.hospitals);
  const selectedItemSet = new Set(filters.selectedItems);

  return records.filter((record) => {
    if (!record.test_date) {
      return false;
    }

    if (selectedHospitalSet.size === 0 || !selectedHospitalSet.has(record.hospital)) {
      return false;
    }

    if (includeItemFilter && selectedItemSet.size > 0 && !selectedItemSet.has(getItemKey(record))) {
      return false;
    }

    if (filters.timeMode === "singleDay") {
      return record.test_date === filters.singleDay;
    }

    if (filters.timeMode === "range") {
      if (filters.dateFrom && record.test_date < filters.dateFrom) {
        return false;
      }
      if (filters.dateTo && record.test_date > filters.dateTo) {
        return false;
      }
    }

    return true;
  });
}

/** 取得可繪圖的數值型資料。
 *
 * @param records 全量檢驗資料。
 * @returns 僅保留 value_numeric 的資料列。
 */
export function getNumericRecords(records: LabRecord[]): LabRecord[] {
  return records.filter((record) => record.value_numeric !== null);
}

/** 取得文字型檢驗資料。
 *
 * @param records 全量檢驗資料。
 * @returns 無法數值化的資料列。
 */
export function getTextRecords(records: LabRecord[]): LabRecord[] {
  return records.filter((record) => record.value_numeric === null);
}

/** 建立指標選項清單與全期間 sparkline 點位。
 *
 * @param records 數值型檢驗資料。
 * @param hospitals 目前選取的醫院；空陣列代表不顯示任何醫院。
 * @returns 依中文名稱排序的指標選項。
 */
export function buildItemOptions(records: LabRecord[], hospitals: string[]): ItemOption[] {
  const hospitalSet = new Set(hospitals);
  const grouped = new Map<string, ItemOption>();

  records
    .filter((record) => record.value_numeric !== null && record.test_date)
    .filter((record) => hospitalSet.has(record.hospital))
    .forEach((record) => {
      const itemKey = getItemKey(record);
      const current = grouped.get(itemKey) ?? {
        itemKey,
        itemName: record.item_name,
        unit: record.unit || "-",
        count: 0,
        points: [],
      };

      current.count += 1;
      current.points.push({ date: record.test_date as string, value: record.value_numeric as number });
      grouped.set(itemKey, current);
    });

  return Array.from(grouped.values())
    .map((item) => {
      const points = [...item.points].sort((a, b) => a.date.localeCompare(b.date));
      return {
        ...item,
        points,
        firstDate: points[0]?.date,
        latestDate: points.at(-1)?.date,
      };
    })
    .sort((a, b) => a.itemName.localeCompare(b.itemName, "zh-Hant"));
}

/** 將目前篩選結果轉為 CSV 文字。
 *
 * @param records 要匯出的資料列。
 * @returns CSV 文字，不含 BOM。
 */
export function recordsToCsv(records: LabRecord[]): string {
  const headers = [
    "test_date",
    "item_name",
    "value_raw",
    "value_numeric",
    "unit",
    "ref_raw",
    "ref_min",
    "ref_max",
    "hospital",
    "order_name",
    "source_file",
  ];

  const rows = records.map((record) =>
    headers.map((header) => escapeCsvValue(String(record[header as keyof LabRecord] ?? ""))).join(","),
  );

  return [headers.join(","), ...rows].join("\n");
}

function escapeCsvValue(value: string): string {
  if (!/[",\n]/.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '""')}"`;
}
