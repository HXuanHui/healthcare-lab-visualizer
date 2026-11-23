import { useMemo, useState } from "react";
import type { ItemOption } from "../types/lab";

interface ItemPickerProps {
  items: ItemOption[];
  selectedItems: string[];
  onSelectedItemsChange: (itemKeys: string[]) => void;
}

/** 指標搜尋與單選、多選控制。
 *
 * @param props 元件屬性，包含可選指標、目前選取指標與更新回呼。
 * @returns 可搜尋且帶全期間 sparkline 的指標列表。
 */
export function ItemPicker({ items, selectedItems, onSelectedItemsChange }: ItemPickerProps) {
  const [query, setQuery] = useState("");
  const [selectionMode, setSelectionMode] = useState<"single" | "multiple">("multiple");

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return items;
    }
    return items.filter((item) => `${item.itemName} ${item.unit}`.toLowerCase().includes(normalizedQuery));
  }, [items, query]);

  return (
    <div className="item-picker">
      <div className="item-picker-toolbar">
        <input
          aria-label="搜尋檢驗指標"
          placeholder="搜尋指標，例如 Hemoglobin"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          aria-label="指標選擇模式"
          value={selectionMode}
          onChange={(event) => {
            const nextMode = event.target.value as "single" | "multiple";
            setSelectionMode(nextMode);
            if (nextMode === "single" && selectedItems.length > 1) {
              onSelectedItemsChange([selectedItems[0]]);
            }
          }}
        >
          <option value="multiple">多項指標</option>
          <option value="single">單項指標</option>
        </select>
      </div>

      <div className="item-list">
        {filteredItems.map((item) => {
          const checked = selectedItems.includes(item.itemKey);
          return (
            <label className="item-row" key={item.itemKey}>
              <input
                type={selectionMode === "single" ? "radio" : "checkbox"}
                name="lab-item"
                checked={checked}
                onChange={(event) => {
                  if (selectionMode === "single") {
                    onSelectedItemsChange([item.itemKey]);
                    return;
                  }
                  onSelectedItemsChange(
                    event.currentTarget.checked
                      ? [...selectedItems, item.itemKey]
                      : selectedItems.filter((itemKey) => itemKey !== item.itemKey),
                  );
                }}
              />
              <span className="item-row-main">
                <span>
                  <strong>{item.itemName}</strong>
                  <small>
                    {item.unit || "-"} · {item.count.toLocaleString()} 筆
                  </small>
                </span>
                <Sparkline points={item.points} />
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function Sparkline({ points }: { points: ItemOption["points"] }) {
  const path = buildSparklinePath(points);
  return (
    <svg className="sparkline" viewBox="0 0 120 36" role="img" aria-label="全期間迷你趨勢">
      <path d={path} />
    </svg>
  );
}

function buildSparklinePath(points: ItemOption["points"]): string {
  if (points.length === 0) {
    return "";
  }

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return points
    .map((point, index) => {
      const x = points.length === 1 ? 60 : (index / (points.length - 1)) * 116 + 2;
      const y = 34 - ((point.value - min) / range) * 30;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}
