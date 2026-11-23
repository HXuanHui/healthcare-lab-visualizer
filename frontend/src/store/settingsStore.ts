import type { ChartGroupSettings } from "../types/lab";

/** 圖表分組只放在此瀏覽器，換網址或換電腦不會跟著走，也不會送到 Cloudflare。 */
const STORAGE_KEY = "healthcare-lab-chart-groups";

/** 讀取此瀏覽器儲存的圖表分組。
 *
 * @returns 有效設定；沒有資料或內容損壞時回傳空分組。
 */
export function loadChartGroupSettings(): ChartGroupSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return emptySettings();
    }
    return normalizeChartGroupSettings(JSON.parse(raw));
  } catch {
    // 私密瀏覽或損壞的 JSON 不應讓整個頁面無法使用。
    return emptySettings();
  }
}

/** 將圖表分組寫入此瀏覽器的 localStorage。
 *
 * @param settings 使用者編輯後的分組。
 * @returns 正規化後實際寫入的設定。
 * @throws 設定不合法，或瀏覽器拒絕寫入時拋出。
 */
export function saveChartGroupSettings(settings: ChartGroupSettings): ChartGroupSettings {
  const normalized = normalizeChartGroupSettings(settings);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    throw new Error("此瀏覽器無法儲存設定。請檢查是否停用網站資料，或改用匯出設定檔備份。");
  }
  return normalized;
}

/** 檢查分組設定格式，並拒絕同一指標出現在多個分組。
 *
 * @param value 來自 localStorage 或使用者匯入的 JSON。
 * @returns 可安全使用的設定。
 * @throws 格式不符或指標重複時拋出。
 */
export function normalizeChartGroupSettings(value: unknown): ChartGroupSettings {
  if (!value || typeof value !== "object") {
    throw new Error("設定檔格式不正確。");
  }

  const record = value as { version?: unknown; groups?: unknown };
  if (!Array.isArray(record.groups)) {
    throw new Error("設定檔缺少 groups。");
  }

  const seenKeys = new Set<string>();
  const groups = record.groups.map((group) => {
    if (!group || typeof group !== "object") {
      throw new Error("分組內容不正確。");
    }
    const item = group as { id?: unknown; name?: unknown; item_keys?: unknown };
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!id || !name) {
      throw new Error("分組 id 與名稱不可為空。");
    }
    if (!Array.isArray(item.item_keys) || item.item_keys.some((key) => typeof key !== "string")) {
      throw new Error(`分組「${name}」的指標清單不正確。`);
    }
    item.item_keys.forEach((key) => {
      if (seenKeys.has(key)) {
        throw new Error(`指標 ${key} 不可同時出現在多個分組。`);
      }
      seenKeys.add(key);
    });
    return { id, name, item_keys: [...item.item_keys] };
  });

  return { version: 1, groups };
}

function emptySettings(): ChartGroupSettings {
  return { version: 1, groups: [] };
}
