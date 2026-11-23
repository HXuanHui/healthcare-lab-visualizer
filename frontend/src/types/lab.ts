/** 前端時間篩選模式。 */
export type TimeMode = "all" | "range" | "singleDay";

/** 指標趨勢方向。 */
export type TrendDirection = "up" | "down" | "flat";

/** 單筆健保署檢驗檢查結果。 */
export interface LabRecord {
  region: string;
  hospital: string;
  visit_date: string | null;
  test_date: string | null;
  upload_date: string | null;
  order_code: string;
  order_name: string;
  item_name: string;
  value_raw: string;
  value_numeric: number | null;
  unit: string;
  ref_raw: string;
  ref_min: number | null;
  ref_max: number | null;
  source_file: string;
}

/** 單一 HTML／CSV 檔案解析摘要。 */
export interface ImportFileSummary {
  file_name: string;
  total_count: number;
  numeric_count: number;
  text_count: number;
  date_from: string | null;
  date_to: string | null;
}

/** 匯入 API 的完整回應。 */
export interface ImportResponse {
  records: LabRecord[];
  files: ImportFileSummary[];
  total_count: number;
  numeric_count: number;
  text_count: number;
}

/** 前端多維度分析篩選條件。 */
export interface AnalysisFilters {
  timeMode: TimeMode;
  dateFrom?: string;
  dateTo?: string;
  singleDay?: string;
  selectedItems: string[];
  hospitals: string[];
}

/** 指標清單中供搜尋、選取與 sparkline 使用的選項。 */
export interface ItemOption {
  itemKey: string;
  itemName: string;
  unit: string;
  count: number;
  firstDate?: string;
  latestDate?: string;
  points: Array<{ date: string; value: number }>;
}

/** 使用者自訂圖表分組。 */
export interface ChartGroup {
  id: string;
  name: string;
  item_keys: string[];
}

/** 圖表分組設定。只存在此瀏覽器的 localStorage，不會上傳。 */
export interface ChartGroupSettings {
  version: number;
  groups: ChartGroup[];
}

/** 單一檢驗指標在目前篩選範圍內的趨勢摘要。 */
export interface TrendSummary {
  itemKey: string;
  itemName: string;
  unit: string;
  count: number;
  latest: { date: string; value: number };
  first: { date: string; value: number };
  delta: number;
  deltaPercent: number | null;
  direction: TrendDirection;
  min: number;
  max: number;
  avg: number;
  outOfRangeCount: number;
  points: Array<{ date: string; value: number; refMin: number | null; refMax: number | null }>;
}

/** 右側導覽卡片用的指標摘要（數值型與文字型共用）。 */
export interface ItemNavSummary {
  itemKey: string;
  itemName: string;
  unit: string;
  /** chart：中間顯示趨勢圖；table：中間顯示結果表格。 */
  kind: "chart" | "table";
  /** metric：右側數值卡原樣；text：右側文字型卡。 */
  cardStyle: "metric" | "text";
  count: number;
  latestLabel: string;
  latestDate: string;
  direction: TrendDirection;
  deltaLabel: string;
  rangeLabel: string;
  avgLabel: string;
  outOfRangeCount: number;
  /** 數值型才有 sparkline 點位；文字型為空陣列。 */
  sparkPoints: number[];
}
