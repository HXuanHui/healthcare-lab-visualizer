import type { ImportFileSummary, LabRecord } from "../types/lab";

/** 匯入後前端記憶體資料狀態。 */
export interface LabDataState {
  records: LabRecord[];
  files: ImportFileSummary[];
  totalCount: number;
  numericCount: number;
  textCount: number;
}

/** 建立空的前端資料狀態。
 *
 * @returns 沒有任何匯入資料的初始狀態。
 */
export function createEmptyLabDataState(): LabDataState {
  return {
    records: [],
    files: [],
    totalCount: 0,
    numericCount: 0,
    textCount: 0,
  };
}

/** 依全量 records 重新計算前端資料狀態。
 *
 * @param records 後端解析後回傳的全量資料。
 * @param files 各來源檔案摘要。
 * @returns 可供 App 使用的記憶體快取狀態。
 */
export function createLabDataState(records: LabRecord[], files: ImportFileSummary[]): LabDataState {
  return {
    records,
    files,
    totalCount: records.length,
    numericCount: records.filter((record) => record.value_numeric !== null).length,
    textCount: records.filter((record) => record.value_numeric === null).length,
  };
}

/** 產生與後端一致的去重鍵，供多檔匯入合併使用。
 *
 * @param record 單筆檢驗資料。
 * @returns 穩定去重鍵字串。
 */
export function getRecordDedupeKey(record: LabRecord): string {
  return [record.item_name, record.test_date ?? "", record.hospital, record.value_raw, record.order_code].join("||");
}

/** 合併既有與新匯入資料，並去除重複列。
 *
 * @param existing 目前已載入的資料狀態。
 * @param incomingRecords 新解析出的檢驗列。
 * @param incomingFiles 新檔案摘要。
 * @returns 合併去重後的資料狀態。
 */
export function mergeLabDataState(
  existing: LabDataState,
  incomingRecords: LabRecord[],
  incomingFiles: ImportFileSummary[],
): LabDataState {
  const deduped = new Map<string, LabRecord>();
  [...existing.records, ...incomingRecords].forEach((record) => {
    deduped.set(getRecordDedupeKey(record), record);
  });

  const mergedRecords = Array.from(deduped.values()).sort((a, b) => {
    const dateCompare = (a.test_date ?? "").localeCompare(b.test_date ?? "");
    if (dateCompare !== 0) {
      return dateCompare;
    }
    return a.item_name.localeCompare(b.item_name, "zh-Hant");
  });

  const fileMap = new Map(existing.files.map((file) => [file.file_name, file]));
  incomingFiles.forEach((file) => fileMap.set(file.file_name, file));

  return createLabDataState(mergedRecords, Array.from(fileMap.values()));
}
