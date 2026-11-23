import type { ImportFileSummary } from "../types/lab";

interface FileUploadProps {
  loading: boolean;
  files: ImportFileSummary[];
  onUpload: (files: File[]) => void;
}

/** HTML / CSV 檔案匯入區塊。
 *
 * @param props 元件屬性，包含上傳狀態、匯入摘要與上傳回呼。
 * @returns 檔案選擇與匯入摘要 UI。
 */
export function FileUpload({ loading, files, onUpload }: FileUploadProps) {
  return (
    <section className="panel upload-panel">
      <div>
        <p className="eyebrow">資料匯入</p>
        <h2>上傳檢驗資料（HTML 或 CSV）</h2>
        <p className="muted">
          支援健保署 HTML，以及本站「匯出 CSV」產生的檔案。檔案只在這台瀏覽器裡解析。
        </p>
      </div>
      <label className="upload-dropzone">
        <input
          type="file"
          accept=".html,.htm,.csv,text/csv,text/html"
          multiple
          disabled={loading}
          onChange={(event) => {
            const selectedFiles = Array.from(event.target.files ?? []);
            if (selectedFiles.length > 0) {
              onUpload(selectedFiles);
            }
            event.currentTarget.value = "";
          }}
        />
        <span>{loading ? "解析中..." : "選擇或拖放 HTML / CSV 檔案"}</span>
      </label>

      {files.length > 0 && (
        <div className="file-summary">
          {files.map((file) => (
            <div className="file-summary-card" key={file.file_name}>
              <strong>{file.file_name}</strong>
              <span>
                {file.total_count.toLocaleString()} 筆，數值 {file.numeric_count.toLocaleString()} 筆
              </span>
              <span>
                {file.date_from ?? "-"} 至 {file.date_to ?? "-"}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
