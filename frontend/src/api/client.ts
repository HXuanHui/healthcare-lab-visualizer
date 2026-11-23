/** 將文字內容下載成 CSV 檔。檔案由瀏覽器產生，不會經過伺服器。
 *
 * @param csvText CSV 文字內容。
 * @param fileName 下載檔名。
 */
export function downloadCsvText(csvText: string, fileName: string): void {
  downloadBlob(new Blob(["\ufeff", csvText], { type: "text/csv;charset=utf-8" }), fileName);
}

/** 將 JSON 文字下載成檔案，供使用者自行備份圖表分組。
 *
 * @param jsonText JSON 文字。
 * @param fileName 下載檔名。
 */
export function downloadJsonText(jsonText: string, fileName: string): void {
  downloadBlob(new Blob([jsonText], { type: "application/json;charset=utf-8" }), fileName);
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
