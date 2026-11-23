import { useEffect, useMemo, useRef, useState } from "react";
import { downloadJsonText } from "../api/client";
import { normalizeChartGroupSettings } from "../store/settingsStore";
import type { ChartGroup, ChartGroupSettings, ItemOption } from "../types/lab";

interface ChartGroupSettingsPanelProps {
  open: boolean;
  items: ItemOption[];
  settings: ChartGroupSettings;
  onClose: () => void;
  onSave: (settings: ChartGroupSettings) => void;
}

/** 圖表分組設定面板。儲存目標是此瀏覽器的 localStorage。
 *
 * @param props 元件屬性，包含可選指標、目前設定與儲存回呼。
 * @returns 自訂哪些指標共用同一張圖的設定 UI。
 */
export function ChartGroupSettingsPanel({
  open,
  items,
  settings,
  onClose,
  onSave,
}: ChartGroupSettingsPanelProps) {
  const [draft, setDraft] = useState<ChartGroupSettings>(settings);
  const [importError, setImportError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setDraft(settings);
      setImportError(null);
    }
  }, [open, settings]);

  const assignedKeys = useMemo(() => new Set(draft.groups.flatMap((group) => group.item_keys)), [draft.groups]);

  if (!open) {
    return null;
  }

  function updateGroup(groupId: string, patch: Partial<ChartGroup>): void {
    setDraft((current) => ({
      ...current,
      groups: current.groups.map((group) => (group.id === groupId ? { ...group, ...patch } : group)),
    }));
  }

  function addGroup(): void {
    const id = `group-${Date.now()}`;
    setDraft((current) => ({
      ...current,
      groups: [...current.groups, { id, name: "新分組", item_keys: [] }],
    }));
  }

  function removeGroup(groupId: string): void {
    setDraft((current) => ({
      ...current,
      groups: current.groups.filter((group) => group.id !== groupId),
    }));
  }

  /** 從使用者選取的 JSON 還原分組。檔案只在瀏覽器讀取。 */
  async function importSettingsFile(file: File): Promise<void> {
    setImportError(null);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        throw new Error("設定檔不是有效的 JSON。");
      }
      setDraft(normalizeChartGroupSettings(parsed));
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "無法讀取設定檔。");
    }
  }

  function toggleItem(groupId: string, itemKey: string, checked: boolean): void {
    setDraft((current) => ({
      ...current,
      groups: current.groups.map((group) => {
        if (group.id === groupId) {
          const nextKeys = checked
            ? [...group.item_keys.filter((key) => key !== itemKey), itemKey]
            : group.item_keys.filter((key) => key !== itemKey);
          return { ...group, item_keys: nextKeys };
        }
        // 同一指標只能屬於一個分組，勾選時從其他分組移除。
        return { ...group, item_keys: group.item_keys.filter((key) => key !== itemKey) };
      }),
    }));
  }

  return (
    <div className="settings-overlay" role="dialog" aria-modal="true" aria-label="圖表分組設定">
      <section className="panel settings-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">圖表分組</p>
            <h2>自訂哪些指標在同一張圖</h2>
            <p className="muted">預設每個指標各一張圖。按下儲存後只寫入這台瀏覽器，不會上傳。</p>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>
            關閉
          </button>
        </div>

        <div className="settings-groups">
          {draft.groups.map((group) => (
            <article className="settings-group-card" key={group.id}>
              <div className="settings-group-header">
                <input
                  aria-label="分組名稱"
                  value={group.name}
                  onChange={(event) => updateGroup(group.id, { name: event.target.value })}
                />
                <button type="button" className="danger-button" onClick={() => removeGroup(group.id)}>
                  刪除分組
                </button>
              </div>
              <div className="settings-item-grid">
                {items.map((item) => {
                  const checked = group.item_keys.includes(item.itemKey);
                  const assignedElsewhere = !checked && assignedKeys.has(item.itemKey);
                  return (
                    <label className={`checkbox-row${assignedElsewhere ? " is-muted" : ""}`} key={`${group.id}-${item.itemKey}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => toggleItem(group.id, item.itemKey, event.currentTarget.checked)}
                      />
                      {item.itemName} ({item.unit})
                    </label>
                  );
                })}
              </div>
            </article>
          ))}
        </div>

        {importError ? <div className="error-banner">{importError}</div> : null}

        <div className="settings-actions">
          <button type="button" onClick={addGroup}>
            新增分組
          </button>
          <button type="button" onClick={() => downloadJsonText(JSON.stringify(draft, null, 2), "chart-groups.json")}>
            匯出設定檔
          </button>
          <button type="button" className="ghost-button" onClick={() => importInputRef.current?.click()}>
            匯入設定檔
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.currentTarget.value = "";
              if (file) {
                void importSettingsFile(file);
              }
            }}
          />
          <button type="button" onClick={() => onSave({ ...draft, version: 1 })}>
            儲存在此瀏覽器
          </button>
        </div>
      </section>
    </div>
  );
}
