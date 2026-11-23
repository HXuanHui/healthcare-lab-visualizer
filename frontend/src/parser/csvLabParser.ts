import type { LabRecord } from "../types/lab";

const NUMBER_RE = /^[+-]?\d+(?:,\d{3})*(?:\.\d+)?$|^[+-]?\d+(?:\.\d+)?$/;
const BRACKET_REF_RE = /\[([^\]]*)\]\[([^\]]*)\]/;

/** 網站前端匯出 CSV 的欄位順序。 */
const FRONTEND_EXPORT_HEADERS = [
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
] as const;

/** 解析本站匯出的檢驗 CSV（含 BOM、引號欄位）。
 *
 * 同時相容前端精簡匯出與後端完整欄位格式。
 *
 * @param csvText CSV 文字內容。
 * @param sourceFile 來源檔名；列上若無 source_file 則以此填入。
 * @returns 正規化後的 LabRecord 清單。
 */
export function parseLabCsv(csvText: string, sourceFile: string): LabRecord[] {
  const rows = parseCsvRows(stripBom(csvText));
  if (rows.length < 2) {
    return [];
  }

  const headerCells = rows[0].map((cell) => cell.trim().toLowerCase());
  const headerIndex = new Map(headerCells.map((header, index) => [header, index]));

  // 至少要有項目名稱，才能辨識為本站匯出格式。
  if (!headerIndex.has("item_name")) {
    throw new Error(`${sourceFile} 不是本站匯出的 CSV（缺少 item_name 欄）。`);
  }

  const records: LabRecord[] = [];
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const cells = rows[rowIndex];
    if (cells.every((cell) => cell.trim() === "")) {
      continue;
    }

    const get = (name: string): string => {
      const index = headerIndex.get(name);
      return index === undefined ? "" : (cells[index] ?? "").trim();
    };

    const itemName = get("item_name");
    if (!itemName) {
      continue;
    }

    const valueRaw = get("value_raw");
    const valueNumericText = get("value_numeric");
    const refRaw = get("ref_raw");
    const refMinText = get("ref_min");
    const refMaxText = get("ref_max");

    // 優先使用 CSV 內既有數值欄；缺值時再從 value_raw / ref_raw 推估。
    const valueNumeric =
      valueNumericText !== "" ? parseCsvNumber(valueNumericText) : parseCsvNumber(valueRaw);
    const bracketRefs = parseBracketReference(refRaw);
    const refMin = refMinText !== "" ? parseCsvNumber(refMinText) : bracketRefs[0];
    const refMax = refMaxText !== "" ? parseCsvNumber(refMaxText) : bracketRefs[1];

    records.push({
      region: get("region"),
      hospital: get("hospital"),
      visit_date: normalizeDate(get("visit_date")),
      test_date: normalizeDate(get("test_date")),
      upload_date: normalizeDate(get("upload_date")),
      order_code: get("order_code"),
      order_name: get("order_name"),
      item_name: itemName,
      value_raw: valueRaw,
      value_numeric: valueNumeric,
      unit: get("unit"),
      ref_raw: refRaw,
      ref_min: refMin,
      ref_max: refMax,
      source_file: get("source_file") || sourceFile,
    });
  }

  return records;
}

/** 供文件／測試參考：前端匯出欄位。 */
export function getFrontendExportHeaders(): readonly string[] {
  return FRONTEND_EXPORT_HEADERS;
}

function parseCsvNumber(value: string): number | null {
  const normalized = value.trim().replace(/,/g, "");
  if (!normalized || !NUMBER_RE.test(normalized)) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBracketReference(value: string): [number | null, number | null] {
  const match = BRACKET_REF_RE.exec(value.trim());
  if (!match) {
    return [null, null];
  }
  return [parseCsvNumber(match[1]), parseCsvNumber(match[2])];
}

function normalizeDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  // 已是 ISO 日期，或 Excel 可能帶時間的 `YYYY-MM-DD...`
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  return trimmed;
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** 簡易 RFC4180 CSV 列解析（支援引號內逗號與雙引號跳脫）。 */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
        continue;
      }
      if (char === '"') {
        inQuotes = false;
        continue;
      }
      cell += char;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (char === "\r") {
      continue;
    }
    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}
