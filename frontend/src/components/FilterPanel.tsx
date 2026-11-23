import { applyQuickRange } from "../store/filterStore";
import type { AnalysisFilters, LabRecord } from "../types/lab";

interface FilterPanelProps {
  records: LabRecord[];
  filters: AnalysisFilters;
  availableDates: string[];
  hospitals: string[];
  onFiltersChange: (filters: AnalysisFilters) => void;
}

/** 多維度分析篩選面板（置於資料匯入區下方）。
 *
 * @param props 元件屬性，包含全量資料、目前篩選條件與可選維度。
 * @returns 時間與醫院篩選 UI；指標改由右側導覽選擇。
 */
export function FilterPanel({
  records,
  filters,
  availableDates,
  hospitals,
  onFiltersChange,
}: FilterPanelProps) {
  const allHospitalsSelected = hospitals.length > 0 && filters.hospitals.length === hospitals.length;

  return (
    <section className="panel filter-panel">
      <div className="filter-panel-heading">
        <div>
          <p className="eyebrow">分析維度</p>
          <h2>篩選條件</h2>
        </div>
      </div>

      <div className="filter-panel-grid">
        <section className="filter-section">
          <h3>時間</h3>
          <div className="segmented">
            {[
              ["all", "全部"],
              ["range", "區間"],
              ["singleDay", "單日"],
            ].map(([mode, label]) => (
              <button
                className={filters.timeMode === mode ? "active" : ""}
                key={mode}
                type="button"
                onClick={() => onFiltersChange({ ...filters, timeMode: mode as AnalysisFilters["timeMode"] })}
              >
                {label}
              </button>
            ))}
          </div>

          {filters.timeMode === "range" && (
            <div className="date-grid">
              <label>
                起日
                <input
                  type="date"
                  value={filters.dateFrom ?? ""}
                  onChange={(event) => onFiltersChange({ ...filters, dateFrom: event.target.value })}
                />
              </label>
              <label>
                迄日
                <input
                  type="date"
                  value={filters.dateTo ?? ""}
                  onChange={(event) => onFiltersChange({ ...filters, dateTo: event.target.value })}
                />
              </label>
            </div>
          )}

          {filters.timeMode === "singleDay" && (
            <label>
              檢驗日期
              <select
                value={filters.singleDay ?? ""}
                onChange={(event) => onFiltersChange({ ...filters, singleDay: event.target.value })}
              >
                {availableDates.map((date) => (
                  <option key={date} value={date}>
                    {date}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="quick-range">
            <button type="button" onClick={() => onFiltersChange(applyQuickRange(filters, records, 3))}>
              近 3 月
            </button>
            <button type="button" onClick={() => onFiltersChange(applyQuickRange(filters, records, 12))}>
              近 1 年
            </button>
            <button type="button" onClick={() => onFiltersChange(applyQuickRange(filters, records, null))}>
              全部
            </button>
          </div>
        </section>

        <section className="filter-section">
          <h3>醫院</h3>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={allHospitalsSelected}
              onChange={(event) =>
                onFiltersChange({ ...filters, hospitals: event.currentTarget.checked ? hospitals : [] })
              }
            />
            全選
          </label>
          <div className="hospital-list">
            {hospitals.map((hospital) => (
              <label className="checkbox-row" key={hospital}>
                <input
                  type="checkbox"
                  checked={filters.hospitals.includes(hospital)}
                  onChange={(event) =>
                    onFiltersChange({
                      ...filters,
                      hospitals: event.currentTarget.checked
                        ? [...filters.hospitals, hospital]
                        : filters.hospitals.filter((selected) => selected !== hospital),
                    })
                  }
                />
                {hospital}
              </label>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
