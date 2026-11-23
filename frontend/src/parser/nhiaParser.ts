import type { ImportFileSummary, ImportResponse, LabRecord } from "../types/lab";
import { getRecordDedupeKey } from "../store/labStore";
import { parseLabCsv } from "./csvLabParser";

const WHITESPACE_RE = /\s+/g;
/** 與後端相同：允許千分位或一般小數，文字型結果（例如 Negative）不視為數字。 */
const NUMBER_RE = /^[+-]?\d+(?:,\d{3})*(?:\.\d+)?$|^[+-]?\d+(?:\.\d+)?$/;
const BRACKET_REF_RE = /\[([^\]]*)\]\[([^\]]*)\]/;

/** 在瀏覽器內解析健保署健康存摺「檢驗檢查結果」HTML。
 *
 * 只取出主表格 11 個欄位。頁首的身分證號等文字會隨暫存字串一起丟掉，不會寫進回傳資料。
 *
 * @param html HTML 文字。
 * @param sourceFile 來源檔名，寫入每筆資料供畫面顯示。
 * @returns 已正規化的檢驗結果；找不到主表格時回傳空陣列。
 */
export function parseNhiaHtml(html: string, sourceFile: string): LabRecord[] {
  const document = new DOMParser().parseFromString(html, "text/html");
  const table = document.querySelector("table.list");
  if (!table) {
    return [];
  }

  const records: LabRecord[] = [];
  for (const row of table.querySelectorAll("tr")) {
    // 只取這一列的直接 td，避免表頭或巢狀表格混進資料列。
    const cells = Array.from(row.children).filter((cell) => cell.tagName === "TD");
    if (cells.length < 11) {
      continue;
    }

    const values = cells.slice(0, 11).map((cell) => cleanText(cellText(cell)));
    const valueNumeric = parseNumber(values[8]);
    const [refMin, refMax] = parseReferenceRange(values[10]);

    records.push({
      region: values[0],
      hospital: values[1],
      visit_date: parseRocDate(values[2]),
      test_date: parseRocDate(values[3]),
      upload_date: parseRocDate(values[4]),
      order_code: values[5],
      order_name: values[6],
      item_name: values[7],
      value_raw: values[8],
      value_numeric: valueNumeric,
      unit: values[9],
      ref_raw: values[10],
      ref_min: refMin,
      ref_max: refMax,
      source_file: sourceFile,
    });
  }

  return records;
}

/** 將使用者選取的 HTML 或本站匯出 CSV 在本機瀏覽器解析成檢驗資料。
 *
 * 檔案位元組只存在這個函式執行期間，不會送到任何伺服器。
 *
 * @param files 使用者選取的健保署 HTML 或本站 CSV 檔。
 * @returns 去重後的檢驗列與各檔摘要。
 * @throws 未選檔、副檔名不符，或所有檔案都解析不到資料時拋出。
 */
export async function parseLabFiles(files: File[]): Promise<ImportResponse> {
  if (files.length === 0) {
    throw new Error("請至少上傳一個 HTML 或 CSV 檔案。");
  }

  const allRecords: LabRecord[] = [];
  const summaries: ImportFileSummary[] = [];

  for (const file of files) {
    const fileName = file.name || "uploaded.dat";
    const lowerName = fileName.toLowerCase();
    const isHtml = lowerName.endsWith(".html") || lowerName.endsWith(".htm");
    const isCsv = lowerName.endsWith(".csv");
    if (!isHtml && !isCsv) {
      throw new Error(`${fileName} 不是 HTML 或 CSV 檔案。`);
    }

    // 讀完立刻解析，不把原始檔內容放進 React 狀態。
    const text = decodeHtmlBytes(await file.arrayBuffer());
    const records = isCsv ? parseLabCsv(text, fileName) : parseNhiaHtml(text, fileName);
    summaries.push(buildFileSummary(fileName, records));
    allRecords.push(...records);
  }

  const deduped = dedupeRecords(allRecords);
  if (deduped.length === 0) {
    throw new Error("找不到可匯入的檢驗資料（HTML 主表格或本站 CSV）。");
  }

  return {
    records: deduped,
    files: summaries,
    total_count: deduped.length,
    numeric_count: deduped.filter((record) => record.value_numeric !== null).length,
    text_count: deduped.filter((record) => record.value_numeric === null).length,
  };
}

/** 將民國年日期轉成 ISO 日期字串。
 *
 * @param value 例如 `112/06/26`。
 * @returns `YYYY-MM-DD`；格式不合法時回傳 `null`。
 */
export function parseRocDate(value: string): string | null {
  const normalized = cleanText(value);
  if (!normalized) {
    return null;
  }

  const parts = normalized.split("/");
  if (parts.length !== 3) {
    return null;
  }

  const yearText = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isInteger(yearText) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  // 健保署日期是民國年；已是西元年（>= 1911）則不再加。
  const year = yearText < 1911 ? yearText + 1911 : yearText;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

/** 將檢驗結果或參考值片段轉成數字。
 *
 * @param value 原始數值字串。
 * @returns 可解析時回傳 number；文字型或空值回傳 `null`。
 */
export function parseNumber(value: string): number | null {
  const normalized = cleanText(value).replace(/,/g, "");
  if (!normalized || !NUMBER_RE.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/** 解析健保署常見的 `[下限][上限]` 參考值格式。
 *
 * @param value 原始參考值字串。
 * @returns `[refMin, refMax]`；某一側不是數值時該側為 `null`。
 */
export function parseReferenceRange(value: string): [number | null, number | null] {
  const match = BRACKET_REF_RE.exec(cleanText(value));
  if (!match) {
    return [null, null];
  }

  return [parseNumber(match[1]), parseNumber(match[2])];
}

/** 依 UTF-8（含 BOM）或 Big5 解碼健保署 HTML。
 *
 * @param content 檔案位元組。
 * @returns 解碼後的 HTML 文字。
 */
export function decodeHtmlBytes(content: ArrayBuffer): string {
  const bytes = new Uint8Array(content);
  const utf8Bytes = stripUtf8Bom(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(utf8Bytes);
  } catch {
    // 舊檔偶爾是 Big5；兩種都失敗時以替換字元讀完，避免整檔中斷。
    try {
      return new TextDecoder("big5", { fatal: true }).decode(bytes);
    } catch {
      return new TextDecoder("utf-8").decode(utf8Bytes);
    }
  }
}

/** 取出儲存格文字，並在標籤邊界補空白，對齊舊版 BeautifulSoup 的行為。 */
function cellText(cell: Element): string {
  const parts: string[] = [];
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? "");
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    const element = node as Element;
    if (element.tagName === "BR") {
      parts.push(" ");
      return;
    }
    element.childNodes.forEach(walk);
  };

  walk(cell);
  return parts.join(" ");
}

function cleanText(value: string): string {
  return value.replace(WHITESPACE_RE, " ").trim();
}

function stripUtf8Bom(bytes: Uint8Array): Uint8Array {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return bytes.subarray(3);
  }
  return bytes;
}

function buildFileSummary(fileName: string, records: LabRecord[]): ImportFileSummary {
  const dates = records.map((record) => record.test_date).filter((date): date is string => Boolean(date)).sort();
  return {
    file_name: fileName,
    total_count: records.length,
    numeric_count: records.filter((record) => record.value_numeric !== null).length,
    text_count: records.filter((record) => record.value_numeric === null).length,
    date_from: dates[0] ?? null,
    date_to: dates.at(-1) ?? null,
  };
}

function dedupeRecords(records: LabRecord[]): LabRecord[] {
  const deduped = new Map<string, LabRecord>();
  records.forEach((record) => {
    if (!deduped.has(getRecordDedupeKey(record))) {
      deduped.set(getRecordDedupeKey(record), record);
    }
  });

  return Array.from(deduped.values()).sort((a, b) => {
    const dateCompare = (a.test_date ?? "").localeCompare(b.test_date ?? "");
    if (dateCompare !== 0) {
      return dateCompare;
    }
    return a.item_name.localeCompare(b.item_name, "zh-Hant");
  });
}
