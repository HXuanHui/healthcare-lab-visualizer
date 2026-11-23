import { useMemo, useState } from "react";
import { downloadCsvText } from "./api/client";
import { parseLabFiles } from "./parser/nhiaParser";
import { loadChartGroupSettings, saveChartGroupSettings } from "./store/settingsStore";
import { buildChartPanels, resolveChartPanelId, toChartPanelDomId } from "./analytics/chartGrouping";
import { buildItemOptions, filterRecords, getItemKey, getNumericRecords, recordsToCsv } from "./analytics/filterRecords";
import { buildItemNavSummaries } from "./analytics/itemNav";
import { buildTrendSummaries } from "./analytics/trendSummary";
import { ChartGroupSettingsPanel } from "./components/ChartGroupSettingsPanel";
import { FileUpload } from "./components/FileUpload";
import { FilterPanel } from "./components/FilterPanel";
import { ItemResultTables, toTextPanelDomId } from "./components/ItemResultTables";
import { ItemTrendCards } from "./components/ItemTrendCards";
import { TrendChart } from "./components/TrendChart";
import { createDefaultFilters, getAvailableDates, getAvailableHospitals } from "./store/filterStore";
import { createEmptyLabDataState, mergeLabDataState } from "./store/labStore";
import type { AnalysisFilters, ChartGroupSettings, ItemNavSummary, LabRecord } from "./types/lab";
import { exportLabReport, type PdfTableSection } from "./utils/exportPdf";

/** 檢驗檢查結果視覺化網站主元件。
 *
 * @returns 本機資料匯入、多維度篩選與趨勢分析畫面。
 */
export default function App() {
  const [labData, setLabData] = useState(createEmptyLabDataState);
  const [filters, setFilters] = useState<AnalysisFilters>(createDefaultFilters([]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartGroupSettings, setChartGroupSettings] = useState<ChartGroupSettings>(() => loadChartGroupSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const numericRecords = useMemo(() => getNumericRecords(labData.records), [labData.records]);
  const availableDates = useMemo(() => getAvailableDates(labData.records), [labData.records]);
  const hospitals = useMemo(() => getAvailableHospitals(labData.records), [labData.records]);
  const itemOptions = useMemo(() => buildItemOptions(numericRecords, filters.hospitals), [numericRecords, filters.hospitals]);

  // 導覽與內容共用：先依時間／醫院篩選，再依選取指標決定顯示。
  const scopedRecords = useMemo(
    () => filterRecords(labData.records, filters, { includeItemFilter: false }),
    [labData.records, filters],
  );
  const selectedRecords = useMemo(
    () => filterRecords(labData.records, filters, { includeItemFilter: true }),
    [labData.records, filters],
  );
  const scopedNumericRecords = useMemo(() => getNumericRecords(scopedRecords), [scopedRecords]);
  const selectedNumericRecords = useMemo(() => getNumericRecords(selectedRecords), [selectedRecords]);
  const navSummaries = useMemo(() => buildItemNavSummaries(scopedRecords), [scopedRecords]);
  const navSummaryMap = useMemo(
    () => new Map(navSummaries.map((summary) => [summary.itemKey, summary])),
    [navSummaries],
  );
  // 僅「兩個點以上」進趨勢圖；單點與文字型一律走同一套結果表。
  const chartNumericRecords = useMemo(
    () =>
      selectedNumericRecords.filter((record) => navSummaryMap.get(getItemKey(record))?.kind === "chart"),
    [selectedNumericRecords, navSummaryMap],
  );
  const tableItemKeys = useMemo(
    () => filters.selectedItems.filter((itemKey) => navSummaryMap.get(itemKey)?.kind === "table"),
    [filters.selectedItems, navSummaryMap],
  );
  const selectedTrendSummaries = useMemo(
    () => buildTrendSummaries(chartNumericRecords),
    [chartNumericRecords],
  );

  async function handleUpload(files: File[]): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const response = await parseLabFiles(files);
      const nextLabData = mergeLabDataState(labData, response.records, response.files);
      const nextFilters = createDefaultFilters(nextLabData.records);
      setLabData(nextLabData);
      setFilters({ ...nextFilters, selectedItems: [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "解析檔案時發生未知錯誤。");
    } finally {
      setLoading(false);
    }
  }

  function handleFocusItem(itemKey: string): void {
    setFilters((current) => ({
      ...current,
      timeMode: "range",
      selectedItems: [itemKey],
      dateFrom: availableDates[0],
      dateTo: availableDates.at(-1),
    }));
    scrollToItemPanel(itemKey, navSummaryMap.get(itemKey), chartGroupSettings);
  }

  /** 切換指標選取；開啟時跳轉到對應圖表或表格。 */
  function handleToggleItem(itemKey: string): void {
    const alreadySelected = filters.selectedItems.includes(itemKey);
    const nextSelected = alreadySelected
      ? filters.selectedItems.filter((key) => key !== itemKey)
      : [...filters.selectedItems, itemKey];

    setFilters((current) => ({
      ...current,
      timeMode: current.timeMode === "singleDay" ? "range" : current.timeMode,
      selectedItems: nextSelected,
    }));

    if (!alreadySelected) {
      scrollToItemPanel(itemKey, navSummaryMap.get(itemKey), chartGroupSettings);
    }
  }

  /** 批次選取指標（全部／有異常／清除）。 */
  function handleSelectItems(itemKeys: string[]): void {
    setFilters((current) => ({
      ...current,
      timeMode: current.timeMode === "singleDay" ? "range" : current.timeMode,
      selectedItems: itemKeys,
    }));

    if (itemKeys.length > 0) {
      scrollToItemPanel(itemKeys[0], navSummaryMap.get(itemKeys[0]), chartGroupSettings);
    }
  }

  /** 關閉圖表或結果表：取消對應指標選取。 */
  function handleClosePanel(itemKeys: string[]): void {
    const closingKeys = new Set(itemKeys);
    setFilters((current) => ({
      ...current,
      selectedItems: current.selectedItems.filter((key) => !closingKeys.has(key)),
    }));
  }

  function handleExportFilteredCsv(): void {
    const recordsToExport =
      filters.selectedItems.length > 0 ? selectedRecords : scopedRecords;
    downloadCsvText(recordsToCsv(recordsToExport), "filtered-lab-records.csv");
  }

  function handleSaveChartGroupSettings(settings: ChartGroupSettings): void {
    setError(null);
    try {
      // 只寫入此瀏覽器的 localStorage，不送出任何請求。
      const saved = saveChartGroupSettings(settings);
      setChartGroupSettings(saved);
      setSettingsOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存圖表分組設定失敗。");
    }
  }

  async function handleExportPdf(): Promise<void> {
    setExportingPdf(true);
    setError(null);
    try {
      const subtitle =
        filters.timeMode === "singleDay"
          ? (filters.singleDay ?? "單日")
          : filters.timeMode === "range"
            ? `${filters.dateFrom ?? ""} – ${filters.dateTo ?? ""}`
            : "全部日期";
      await exportLabReport({
        fileName: "lab-analysis.pdf",
        subtitle,
        panels: filters.timeMode === "singleDay" ? [] : buildChartPanels(chartNumericRecords, chartGroupSettings),
        tables: collectPdfTables(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "匯出 PDF 失敗。");
    } finally {
      setExportingPdf(false);
    }
  }

  /** 把目前要列印的表格收成 PDF 區段。單日用項目列，其餘用歷史明細。 */
  function collectPdfTables(): PdfTableSection[] {
    if (filters.timeMode === "singleDay") {
      const records = [...scopedNumericRecords].sort((a, b) => a.item_name.localeCompare(b.item_name, "zh-Hant"));
      return records.length
        ? [{ title: `${filters.singleDay ?? "單日"} 數值檢驗`, records, layout: "singleDay" }]
        : [];
    }

    const keySet = new Set(tableItemKeys);
    const grouped = new Map<string, LabRecord[]>();
    scopedRecords
      .filter((record) => record.test_date && keySet.has(getItemKey(record)))
      .forEach((record) => {
        const key = getItemKey(record);
        grouped.set(key, [...(grouped.get(key) ?? []), record]);
      });

    return Array.from(grouped.values())
      .map((group) => {
        const records = [...group].sort((a, b) => (a.test_date as string).localeCompare(b.test_date as string));
        const first = records[0];
        return {
          title: `${first.item_name}（${first.unit || "-"}）`,
          records,
          layout: "history" as const,
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title, "zh-Hant"));
  }

  const hasSelectedContent = filters.selectedItems.length > 0;

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Healthcare Lab Visualizer</p>
          <h1>檢驗檢查結果視覺化</h1>
          <p>匯入健保署 HTML 或本站匯出的 CSV 後，可用單日、區間與醫院篩選，並點選右側指標查看趨勢圖或結果表。解析與圖表設定都只留在這台瀏覽器。</p>
        </div>
        <div className="hero-stats">
          <StatCard label="總筆數" value={labData.totalCount} />
          <StatCard label="數值" value={labData.numericCount} />
          <StatCard label="文字" value={labData.textCount} />
        </div>
      </header>

      <FileUpload loading={loading} files={labData.files} onUpload={handleUpload} />
      {error && <div className="error-banner">{error}</div>}

      {labData.records.length > 0 && (
        <>
          <FilterPanel
            records={labData.records}
            filters={filters}
            availableDates={availableDates}
            hospitals={hospitals}
            onFiltersChange={setFilters}
          />
          <div className="workspace">
            <div className="analysis-area">
              <div className="toolbar panel">
                <div>
                  <p className="eyebrow">目前篩選</p>
                  <strong>{scopedRecords.length.toLocaleString()} 筆資料</strong>
                  <p className="muted">右側點選指標後，中間顯示趨勢圖或結果表。</p>
                </div>
                <div className="toolbar-actions">
                  <button type="button" onClick={() => setSettingsOpen(true)}>
                    圖表分組設定
                  </button>
                  <button type="button" onClick={handleExportFilteredCsv}>
                    匯出 CSV
                  </button>
                  <button type="button" disabled={exportingPdf} onClick={handleExportPdf}>
                    {exportingPdf ? "匯出 PDF 中..." : "匯出 PDF"}
                  </button>
                </div>
              </div>
              <div id="pdf-export-area">
                {!hasSelectedContent ? (
                  <section className="panel empty-state">
                    <h2>尚未選取指標</h2>
                    <p>請點選右側指標導覽，開啟對應趨勢圖或結果表。</p>
                  </section>
                ) : null}
                {chartNumericRecords.length > 0 ? (
                  <TrendChart
                    records={chartNumericRecords}
                    summaries={selectedTrendSummaries}
                    chartGroupSettings={chartGroupSettings}
                    onClosePanel={handleClosePanel}
                  />
                ) : null}
                <ItemResultTables
                  records={scopedRecords}
                  tableItemKeys={tableItemKeys}
                  onCloseItem={handleClosePanel}
                />
              </div>
            </div>
            <ItemTrendCards
              summaries={navSummaries}
              selectedItems={filters.selectedItems}
              onToggleItem={handleToggleItem}
              onSelectItems={handleSelectItems}
            />
          </div>
          <ChartGroupSettingsPanel
            open={settingsOpen}
            items={itemOptions}
            settings={chartGroupSettings}
            onClose={() => setSettingsOpen(false)}
            onSave={handleSaveChartGroupSettings}
          />
        </>
      )}
    </main>
  );
}

/** 平滑捲動到指定指標對應的圖表或文字結果面板。 */
function scrollToItemPanel(
  itemKey: string,
  summary: ItemNavSummary | undefined,
  settings: ChartGroupSettings,
): void {
  const domId =
    summary?.kind === "table"
      ? toTextPanelDomId(itemKey)
      : toChartPanelDomId(resolveChartPanelId(itemKey, settings));

  window.setTimeout(() => {
    document.getElementById(domId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 80);
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </div>
  );
}
