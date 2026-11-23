import type { ChartPanel } from "../analytics/chartGrouping";
import { getItemKey } from "../analytics/filterRecords";
import { isOutOfRange } from "../analytics/trendSummary";
import type { LabRecord } from "../types/lab";

type JsPdfConstructor = typeof import("jspdf")["jsPDF"];
type PdfDocument = InstanceType<JsPdfConstructor>;

/** PDF 裡的結果表。單日比較與歷史明細欄位不同。 */
export interface PdfTableSection {
  title: string;
  records: LabRecord[];
  layout: "singleDay" | "history";
}

/** 自行排版的 A4 報告，不擷取畫面上的圖。 */
export interface LabPdfReport {
  fileName: string;
  /** 頁首副標，例如日期區間。 */
  subtitle: string;
  panels: ChartPanel[];
  tables: PdfTableSection[];
}

interface PdfPoint {
  time: number;
  value: number;
  label: string;
  out: boolean;
  refMin: number | null;
  refMax: number | null;
}

interface PdfSeries {
  name: string;
  unit: string;
  color: string;
  points: PdfPoint[];
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PlacedLabel {
  text: string;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PageSurface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  title: string;
}

const PX_PER_MM = 5;
const FONT = '"Microsoft JhengHei", "Noto Sans TC", sans-serif';
const SERIES_COLORS = ["#2f6fed", "#c4320a", "#087443", "#6941c6", "#0e7090", "#b54708"];
const PAGE_W_MM = 210;
const PAGE_H_MM = 297;
const MARGIN_MM = 12;

/** 毫米轉成畫布像素。 */
function mm(value: number): number {
  return value * PX_PER_MM;
}

/** 依報告原始文字產生資料點標籤，保留小數位。 */
function toPointLabelText(record: LabRecord): string {
  return record.value_raw.trim() || (record.value_numeric == null ? "" : String(record.value_numeric));
}

/** 點數多或有多條線時佔滿整列，否則兩張並排。 */
function columnSpan(panel: ChartPanel): 1 | 2 {
  const counts = new Map<string, number>();
  panel.records.forEach((record) => {
    if (record.value_numeric === null || !record.test_date) {
      return;
    }
    const key = getItemKey(record);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const seriesCount = counts.size;
  const maxPoints = Math.max(0, ...counts.values());
  if (seriesCount > 1 || maxPoints > 8) {
    return 2;
  }
  return 1;
}

/** 把圖表排成列：一列最多兩張，整頁最多兩列（一頁 2～4 張）。 */
function packChartRows(panels: ChartPanel[]): ChartPanel[][] {
  const rows: ChartPanel[][] = [];
  let index = 0;
  while (index < panels.length) {
    const panel = panels[index];
    if (columnSpan(panel) === 2) {
      rows.push([panel]);
      index += 1;
      continue;
    }
    const next = panels[index + 1];
    if (next && columnSpan(next) === 1) {
      rows.push([panel, next]);
      index += 2;
      continue;
    }
    rows.push([panel]);
    index += 1;
  }
  return rows;
}

/** 建立一張空白 A4 畫布。 */
function createPage(title: string): PageSurface {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(mm(PAGE_W_MM));
  canvas.height = Math.round(mm(PAGE_H_MM));
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("無法建立 PDF 繪圖環境。");
  }
  context.fillStyle = "#f4f7fb";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#2f6fed";
  context.fillRect(0, 0, canvas.width, mm(2.2));
  return { canvas, ctx: context, title };
}

/** 畫頁首標題與副標。 */
function drawHeader(page: PageSurface, subtitle: string): void {
  const { ctx } = page;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#172033";
  ctx.font = `700 ${mm(4.6)}px ${FONT}`;
  ctx.fillText(page.title, mm(MARGIN_MM), mm(7));
  ctx.fillStyle = "#667085";
  ctx.font = `${mm(2.8)}px ${FONT}`;
  ctx.fillText(subtitle, mm(MARGIN_MM), mm(13));
}

/** 全部畫完後補上頁碼，才能知道總頁數。 */
function stampPageNumber(page: PageSurface, index: number, total: number): void {
  const { ctx } = page;
  const y = mm(PAGE_H_MM - 8);
  ctx.strokeStyle = "#e4e7ec";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(mm(MARGIN_MM), y - mm(3));
  ctx.lineTo(mm(PAGE_W_MM - MARGIN_MM), y - mm(3));
  ctx.stroke();
  ctx.fillStyle = "#667085";
  ctx.font = `${mm(2.6)}px ${FONT}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(`第 ${index + 1} / ${total} 頁`, mm(PAGE_W_MM - MARGIN_MM), y);
}

/** 圓角矩形路徑。 */
function traceRoundRect(ctx: CanvasRenderingContext2D, box: Box, radius: number): void {
  const r = Math.min(radius, box.w / 2, box.h / 2);
  ctx.beginPath();
  ctx.moveTo(box.x + r, box.y);
  ctx.arcTo(box.x + box.w, box.y, box.x + box.w, box.y + box.h, r);
  ctx.arcTo(box.x + box.w, box.y + box.h, box.x, box.y + box.h, r);
  ctx.arcTo(box.x, box.y + box.h, box.x, box.y, r);
  ctx.arcTo(box.x, box.y, box.x + box.w, box.y, r);
  ctx.closePath();
}

/** 超出寬度時截斷並加上省略號。 */
function ellipsis(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }
  let trimmed = text;
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}…`;
}

/** 將面板資料收成可繪製的序列。 */
function seriesFromPanel(panel: ChartPanel): PdfSeries[] {
  const grouped = new Map<string, LabRecord[]>();
  panel.records.forEach((record) => {
    if (record.value_numeric === null || !record.test_date) {
      return;
    }
    const key = getItemKey(record);
    grouped.set(key, [...(grouped.get(key) ?? []), record]);
  });

  return Array.from(grouped.values()).map((group, index) => {
    const sorted = [...group].sort((a, b) => (a.test_date as string).localeCompare(b.test_date as string));
    const first = sorted[0];
    return {
      name: `${first.item_name}（${first.unit || "-"}）`,
      unit: first.unit || "-",
      color: SERIES_COLORS[index % SERIES_COLORS.length],
      points: sorted.map((record) => ({
        time: Date.parse(record.test_date as string),
        value: record.value_numeric as number,
        label: toPointLabelText(record),
        out: isOutOfRange(record),
        refMin: record.ref_min,
        refMax: record.ref_max,
      })),
    };
  });
}

/** 數值軸範圍。上緣多留一點，讓最高點的數字留在圖內。 */
function valueDomain(points: PdfPoint[]): { min: number; max: number; dataMin: number; dataMax: number } {
  const numbers = points.flatMap((point) =>
    [point.value, point.refMin, point.refMax].filter((value): value is number => value !== null && Number.isFinite(value)),
  );
  let dataMin = Math.min(...numbers);
  let dataMax = Math.max(...numbers);
  if (!Number.isFinite(dataMin) || !Number.isFinite(dataMax)) {
    return { min: 0, max: 1, dataMin: 0, dataMax: 1 };
  }
  if (dataMin === dataMax) {
    const pad = Math.abs(dataMin) * 0.2 || 1;
    dataMin -= pad;
    dataMax += pad;
  }
  const span = dataMax - dataMin;
  let min = dataMin - span * 0.12;
  const max = dataMax + span * 0.36;
  // 數值都不是負的時，軸不要畫到 0 以下。
  if (numbers.every((value) => value >= 0)) {
    min = Math.max(0, min);
  }
  return { min, max, dataMin, dataMax };
}

/** 把標籤排進繪圖區內，重疊時上下交錯，不放到圖外。 */
function placePointLabels(
  anchors: Array<{ x: number; y: number; text: string; color: string; width: number; height: number }>,
  bounds: Box,
): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  const gap = 2;
  const sorted = [...anchors].sort((a, b) => a.x - b.x || a.y - b.y);

  sorted.forEach((anchor) => {
    const width = Math.min(anchor.width, bounds.w - 4);
    const height = anchor.height;
    const left = clamp(anchor.x - width / 2, bounds.x + 1, bounds.x + bounds.w - width - 1);
    const candidates: number[] = [];
    for (let step = 0; step < 8; step += 1) {
      candidates.push(anchor.y - gap - height - step * (height + gap));
    }
    for (let step = 0; step < 5; step += 1) {
      candidates.push(anchor.y + gap + 4 + step * (height + gap));
    }

    const inside = candidates
      .map((top) => ({ x: left, y: top, w: width, h: height }))
      .filter((box) => box.y >= bounds.y + 1 && box.y + box.h <= bounds.y + bounds.h - 1);

    const free = inside.find((box) => !placed.some((label) => overlaps(box, label, gap)));
    const chosen =
      free ??
      inside.sort(
        (a, b) => overlapArea(a, placed) - overlapArea(b, placed),
      )[0] ?? {
        x: left,
        y: clamp(anchor.y - height - gap, bounds.y + 1, bounds.y + bounds.h - height - 1),
        w: width,
        h: height,
      };

    placed.push({ text: anchor.text, color: anchor.color, ...chosen });
  });

  return placed;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function overlaps(a: Box, b: Box, gap: number): boolean {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

function overlapArea(box: Box, others: Box[]): number {
  return others.reduce((sum, other) => {
    const width = Math.min(box.x + box.w, other.x + other.w) - Math.max(box.x, other.x);
    const height = Math.min(box.y + box.h, other.y + other.h) - Math.max(box.y, other.y);
    return sum + (width > 0 && height > 0 ? width * height : 0);
  }, 0);
}

/** 在指定卡片矩形內畫一張趨勢圖，數字全部留在卡片內。 */
function drawChartCard(ctx: CanvasRenderingContext2D, card: Box, panel: ChartPanel): void {
  const series = seriesFromPanel(panel).filter((item) => item.points.length > 0);
  traceRoundRect(ctx, card, mm(3));
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#e4e7ec";
  ctx.lineWidth = 1;
  ctx.stroke();

  const pad = mm(3.2);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#172033";
  ctx.font = `700 ${mm(3.5)}px ${FONT}`;
  ctx.fillText(ellipsis(ctx, panel.title, card.w - pad * 2), card.x + pad, card.y + pad);

  let cursorY = card.y + pad + mm(5.2);
  if (series.length > 1) {
    ctx.font = `${mm(2.5)}px ${FONT}`;
    let cursorX = card.x + pad;
    series.forEach((item) => {
      const label = ellipsis(ctx, item.name, mm(42));
      const width = ctx.measureText(label).width + mm(5);
      if (cursorX + width > card.x + card.w - pad) {
        return;
      }
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.arc(cursorX + mm(1.1), cursorY + mm(1.3), mm(1.1), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#475467";
      ctx.fillText(label, cursorX + mm(3), cursorY);
      cursorX += width;
    });
    cursorY += mm(4.6);
  }

  if (series.length === 0) {
    ctx.fillStyle = "#667085";
    ctx.font = `${mm(3)}px ${FONT}`;
    ctx.fillText("沒有可繪製的數值", card.x + pad, cursorY);
    return;
  }

  const units = Array.from(new Set(series.map((item) => item.unit)));
  const domains = new Map(units.map((unit) => {
    const points = series.filter((item) => item.unit === unit).flatMap((item) => item.points);
    return [unit, valueDomain(points)] as const;
  }));

  const tickFont = `${mm(2.3)}px ${FONT}`;
  ctx.font = tickFont;
  const leftUnit = units[0];
  const rightUnit = units[1];
  const leftTicks = axisTicks(domains.get(leftUnit) as { min: number; max: number; dataMin: number; dataMax: number });
  const rightTicks = rightUnit
    ? axisTicks(domains.get(rightUnit) as { min: number; max: number; dataMin: number; dataMax: number })
    : [];
  const leftGutter = Math.max(mm(8), Math.max(...leftTicks.map((tick) => ctx.measureText(formatTick(tick)).width)) + mm(2));
  const rightGutter = rightUnit
    ? Math.max(mm(8), Math.max(...rightTicks.map((tick) => ctx.measureText(formatTick(tick)).width)) + mm(2))
    : mm(1.5);

  const plot: Box = {
    x: card.x + pad + leftGutter,
    y: cursorY + mm(1),
    w: card.w - pad * 2 - leftGutter - rightGutter,
    h: card.y + card.h - pad - mm(6) - (cursorY + mm(1)),
  };
  if (plot.w < mm(12) || plot.h < mm(12)) {
    return;
  }

  const times = series.flatMap((item) => item.points.map((point) => point.time)).filter((time) => Number.isFinite(time));
  let tMin = Math.min(...times);
  let tMax = Math.max(...times);
  if (tMin === tMax) {
    tMin -= 86_400_000;
    tMax += 86_400_000;
  }
  const tSpan = tMax - tMin;
  tMin -= tSpan * 0.04;
  tMax += tSpan * 0.06;

  const xOf = (time: number) => plot.x + ((time - tMin) / (tMax - tMin)) * plot.w;
  const yOf = (unit: string, value: number) => {
    const domain = domains.get(unit) as { min: number; max: number };
    const ratio = (value - domain.min) / (domain.max - domain.min);
    return plot.y + plot.h - ratio * plot.h;
  };

  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.x, plot.y, plot.w, plot.h);
  ctx.clip();

  leftTicks.forEach((tick) => {
    const y = yOf(leftUnit, tick);
    ctx.strokeStyle = "#eef2f6";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, y);
    ctx.lineTo(plot.x + plot.w, y);
    ctx.stroke();
  });

  series.forEach((item) => {
    const segments = referenceSegments(item.points);
    segments.forEach((segment) => {
      const x1 = xOf(segment.start);
      const x2 = xOf(segment.end);
      const y1 = yOf(item.unit, segment.refMax);
      const y2 = yOf(item.unit, segment.refMin);
      ctx.fillStyle = hexWithAlpha(item.color, 0.12);
      ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.max(mm(2), Math.abs(x2 - x1)), Math.abs(y2 - y1));
    });
  });

  series.forEach((item) => {
    const drawable = item.points.filter((point) => Number.isFinite(point.time));
    const coords = drawable.map((point) => ({ x: xOf(point.time), y: yOf(item.unit, point.value) }));
    if (coords.length === 0) {
      return;
    }
    ctx.beginPath();
    ctx.strokeStyle = item.color;
    ctx.lineWidth = mm(0.45);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    strokeSmooth(ctx, coords);
    ctx.stroke();
    coords.forEach((coord, index) => {
      ctx.beginPath();
      ctx.fillStyle = drawable[index].out ? "#b42318" : item.color;
      ctx.arc(coord.x, coord.y, mm(0.85), 0, Math.PI * 2);
      ctx.fill();
    });
  });
  ctx.restore();

  ctx.font = tickFont;
  ctx.fillStyle = "#667085";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  leftTicks.forEach((tick) => {
    ctx.fillText(formatTick(tick), plot.x - mm(1), yOf(leftUnit, tick));
  });
  if (rightUnit) {
    ctx.textAlign = "left";
    rightTicks.forEach((tick) => {
      ctx.fillText(formatTick(tick), plot.x + plot.w + mm(1), yOf(rightUnit, tick));
    });
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = tickFont;
  const compactDates = plot.w < mm(120);
  dateTicks(tMin, tMax).forEach((time) => {
    ctx.fillText(formatDateTick(time, compactDates), xOf(time), plot.y + plot.h + mm(1.2));
  });

  const pointCount = series.reduce((sum, item) => sum + item.points.length, 0);
  const labelPx = clamp(plot.w / Math.max(pointCount, 1) / 3.4, mm(2.15), mm(3.15));
  ctx.font = `600 ${labelPx}px ${FONT}`;
  const anchors = series.flatMap((item) =>
    item.points
      .filter((point) => Number.isFinite(point.time) && point.label)
      .map((point) => ({
        x: xOf(point.time),
        y: yOf(item.unit, point.value),
        text: point.label,
        color: point.out ? "#b42318" : "#172033",
        width: ctx.measureText(point.label).width + mm(0.8),
        height: labelPx + mm(0.4),
      })),
  );
  const labels = placePointLabels(anchors, plot);
  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.x, plot.y, plot.w, plot.h);
  ctx.clip();
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.lineWidth = Math.max(2, labelPx * 0.38);
  labels.forEach((label) => {
    ctx.strokeStyle = "rgba(255,255,255,0.94)";
    ctx.strokeText(label.text, label.x, label.y);
    ctx.fillStyle = label.color;
    ctx.fillText(label.text, label.x, label.y);
  });
  ctx.restore();
}

/** 依實際數值挑 2～4 個整齊刻度，不把留白邊界標上去。 */
function axisTicks(domain: { min: number; max: number; dataMin: number; dataMax: number }): number[] {
  const span = domain.dataMax - domain.dataMin;
  if (!(span > 0)) {
    return [domain.dataMin];
  }
  const step = niceStep(span / 2);
  const start = Math.ceil((domain.dataMin - step * 0.001) / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= domain.dataMax + step * 0.001; value += step) {
    ticks.push(Number(value.toFixed(6)));
  }
  if (ticks.length > 0 && ticks[0] > step && domain.min === 0 && domain.dataMin > 0) {
    ticks.unshift(0);
  }
  if (ticks.length <= 4) {
    return ticks;
  }
  const last = ticks.length - 1;
  return [ticks[0], ticks[Math.round(last / 3)], ticks[Math.round((last * 2) / 3)], ticks[last]];
}

function niceStep(rough: number): number {
  const power = 10 ** Math.floor(Math.log10(Math.max(rough, Number.MIN_VALUE)));
  const fraction = rough / power;
  const nice = fraction >= 5 ? 5 : fraction >= 2 ? 2 : 1;
  return nice * power;
}

function formatTick(value: number): string {
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return value.toLocaleString("zh-Hant", { maximumFractionDigits: digits });
}

function dateTicks(tMin: number, tMax: number): number[] {
  return [tMin + (tMax - tMin) * 0.08, (tMin + tMax) / 2, tMax - (tMax - tMin) * 0.06];
}

function formatDateTick(time: number, compact: boolean): string {
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  if (compact) {
    return `${month}/${day}`;
  }
  return `${date.getFullYear()}/${month}/${day}`;
}

function referenceSegments(points: PdfPoint[]): Array<{ start: number; end: number; refMin: number; refMax: number }> {
  const segments: Array<{ start: number; end: number; refMin: number; refMax: number }> = [];
  points.forEach((point) => {
    if (point.refMin === null || point.refMax === null || !Number.isFinite(point.time)) {
      return;
    }
    const last = segments.at(-1);
    if (last && last.refMin === point.refMin && last.refMax === point.refMax) {
      last.end = point.time;
      return;
    }
    segments.push({ start: point.time, end: point.time, refMin: point.refMin, refMax: point.refMax });
  });
  return segments;
}

function hexWithAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 以中點二次貝茲把折線畫順，點數不足時改畫直線。 */
function strokeSmooth(ctx: CanvasRenderingContext2D, points: Array<{ x: number; y: number }>): void {
  ctx.moveTo(points[0].x, points[0].y);
  if (points.length < 3) {
    points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    return;
  }
  for (let index = 1; index < points.length - 2; index += 1) {
    const next = points[index + 1];
    const midX = (points[index].x + next.x) / 2;
    const midY = (points[index].y + next.y) / 2;
    ctx.quadraticCurveTo(points[index].x, points[index].y, midX, midY);
  }
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  ctx.quadraticCurveTo(prev.x, prev.y, last.x, last.y);
}

/** 兩列一頁；最後若只剩一列，併回前一頁變成三列，避免尾頁只剩一張圖。 */
function paginateChartRows(rows: ChartPanel[][]): ChartPanel[][][] {
  const pages: ChartPanel[][][] = [];
  for (let index = 0; index < rows.length; index += 2) {
    pages.push(rows.slice(index, index + 2));
  }
  if (pages.length > 1 && pages[pages.length - 1].length === 1) {
    const leftover = pages.pop();
    if (leftover) {
      pages[pages.length - 1].push(leftover[0]);
    }
  }
  return pages;
}

/** 畫趨勢頁。一頁通常 2～4 張，尾頁不足時最多三列。 */
function drawChartPages(panels: ChartPanel[], subtitle: string): PageSurface[] {
  const pagesOfRows = paginateChartRows(packChartRows(panels));
  const pages: PageSurface[] = [];
  const contentTop = mm(20);
  const contentBottom = mm(PAGE_H_MM - MARGIN_MM - 10);
  const contentH = contentBottom - contentTop;
  const contentW = mm(PAGE_W_MM - MARGIN_MM * 2);
  const gap = mm(4);

  pagesOfRows.forEach((pageRows) => {
    const page = createPage("檢驗趨勢");
    drawHeader(page, `${subtitle} · 紅字為超出參考值`);
    const rowH = (contentH - gap * (pageRows.length - 1)) / pageRows.length;
    pageRows.forEach((row, rowIndex) => {
      const y = contentTop + rowIndex * (rowH + gap);
      const cardW = (contentW - gap * (row.length - 1)) / row.length;
      row.forEach((panel, column) => {
        drawChartCard(page.ctx, { x: mm(MARGIN_MM) + column * (cardW + gap), y, w: cardW, h: rowH }, panel);
      });
    });
    pages.push(page);
  });
  return pages;
}

interface TableColumn {
  title: string;
  width: number;
  value: (record: LabRecord) => string;
  emphasize?: boolean;
}

/** 畫明細表，列不夠時換頁並重印表頭，不把一列從中間切開。 */
function drawTablePages(tables: PdfTableSection[], subtitle: string): PageSurface[] {
  const pages: PageSurface[] = [];
  const contentTop = mm(20);
  const contentBottom = mm(PAGE_H_MM - MARGIN_MM - 10);
  const contentW = mm(PAGE_W_MM - MARGIN_MM * 2);
  const rowH = mm(7.2);
  let page = createPage("檢驗明細");
  drawHeader(page, subtitle);
  pages.push(page);
  let y = contentTop;

  const nextPage = () => {
    page = createPage("檢驗明細");
    drawHeader(page, subtitle);
    pages.push(page);
    y = contentTop;
  };

  tables.forEach((table) => {
    const columns = tableColumns(table.layout, contentW);
    const blockH = mm(6) + rowH + rowH;
    if (y + blockH > contentBottom) {
      nextPage();
    }
    page.ctx.fillStyle = "#172033";
    page.ctx.font = `700 ${mm(3.4)}px ${FONT}`;
    page.ctx.textAlign = "left";
    page.ctx.textBaseline = "top";
    page.ctx.fillText(ellipsis(page.ctx, table.title, contentW - mm(20)), mm(MARGIN_MM), y);
    page.ctx.fillStyle = "#667085";
    page.ctx.font = `${mm(2.6)}px ${FONT}`;
    page.ctx.textAlign = "right";
    page.ctx.fillText(`${table.records.length} 筆`, mm(PAGE_W_MM - MARGIN_MM), y);
    y += mm(6);
    y = drawTableHeader(page, columns, y);

    table.records.forEach((record, rowIndex) => {
      if (y + rowH > contentBottom) {
        nextPage();
        y = drawTableHeader(page, columns, y);
      }
      drawTableRow(page, columns, record, y, rowH, rowIndex % 2 === 0);
      y += rowH;
    });
    y += mm(4);
  });

  return pages;
}

function tableColumns(layout: PdfTableSection["layout"], totalWidth: number): TableColumn[] {
  if (layout === "singleDay") {
    const fixed = [mm(28), mm(22), mm(36), mm(40)];
    return [
      { title: "項目", width: totalWidth - fixed.reduce((sum, width) => sum + width, 0), value: (record) => record.item_name },
      { title: "結果", width: fixed[0], value: (record) => record.value_raw || "-", emphasize: true },
      { title: "單位", width: fixed[1], value: (record) => record.unit || "-" },
      { title: "參考值", width: fixed[2], value: (record) => record.ref_raw || "-" },
      { title: "醫院", width: fixed[3], value: (record) => record.hospital },
    ];
  }
  const fixed = [mm(32), mm(24), mm(18), mm(32), mm(36)];
  return [
    { title: "檢驗日期", width: fixed[0], value: (record) => record.test_date ?? "-" },
    { title: "結果", width: fixed[1], value: (record) => record.value_raw || "-", emphasize: true },
    { title: "單位", width: fixed[2], value: (record) => record.unit || "-" },
    { title: "參考值", width: fixed[3], value: (record) => record.ref_raw || "-" },
    { title: "醫院", width: fixed[4], value: (record) => record.hospital },
    { title: "醫令", width: totalWidth - fixed.reduce((sum, width) => sum + width, 0), value: (record) => record.order_name || "-" },
  ];
}

function drawTableHeader(page: PageSurface, columns: TableColumn[], y: number): number {
  const height = mm(7.2);
  page.ctx.fillStyle = "#e8f0fe";
  page.ctx.fillRect(mm(MARGIN_MM), y, mm(PAGE_W_MM - MARGIN_MM * 2), height);
  page.ctx.fillStyle = "#2451c6";
  page.ctx.font = `700 ${mm(2.5)}px ${FONT}`;
  page.ctx.textAlign = "left";
  page.ctx.textBaseline = "middle";
  let x = mm(MARGIN_MM);
  columns.forEach((column) => {
    page.ctx.fillText(ellipsis(page.ctx, column.title, column.width - mm(2)), x + mm(1.4), y + height / 2);
    x += column.width;
  });
  return y + height;
}

function drawTableRow(
  page: PageSurface,
  columns: TableColumn[],
  record: LabRecord,
  y: number,
  height: number,
  zebra: boolean,
): void {
  if (zebra) {
    page.ctx.fillStyle = "#f8fafc";
    page.ctx.fillRect(mm(MARGIN_MM), y, mm(PAGE_W_MM - MARGIN_MM * 2), height);
  }
  page.ctx.font = `${mm(2.6)}px ${FONT}`;
  page.ctx.textAlign = "left";
  page.ctx.textBaseline = "middle";
  let x = mm(MARGIN_MM);
  const alert = isOutOfRange(record);
  columns.forEach((column) => {
    page.ctx.fillStyle = column.emphasize && alert ? "#b42318" : "#172033";
    if (column.emphasize && alert) {
      page.ctx.font = `700 ${mm(2.6)}px ${FONT}`;
    } else {
      page.ctx.font = `${mm(2.6)}px ${FONT}`;
    }
    page.ctx.fillText(ellipsis(page.ctx, column.value(record), column.width - mm(2)), x + mm(1.4), y + height / 2);
    x += column.width;
  });
}

/** 畫出 A4 報告各頁，不寫入檔案。
 *
 * @param report 圖表面板、明細表與頁首副標。
 * @returns 每一頁一張與 A4 同比例的畫布。
 */
export function renderLabReportCanvases(report: Omit<LabPdfReport, "fileName">): HTMLCanvasElement[] {
  const panels = report.panels.filter((panel) =>
    panel.records.some((record) => record.value_numeric !== null && record.test_date),
  );
  const tables = report.tables.filter((table) => table.records.length > 0);
  if (panels.length === 0 && tables.length === 0) {
    throw new Error("目前沒有可匯出的圖表或表格。請先點選指標。");
  }

  const subtitle = report.subtitle.trim() || "檢驗檢查結果";
  const pages = [
    ...drawChartPages(panels, subtitle),
    ...(tables.length > 0 ? drawTablePages(tables, subtitle) : []),
  ];
  pages.forEach((page, index) => stampPageNumber(page, index, pages.length));
  return pages.map((page) => page.canvas);
}

/** 依目前篩選資料產生 A4 PDF。圖表自行繪製並一頁排多張，不截畫面。
 *
 * @param report 圖表面板、明細表與頁首副標。
 */
export async function exportLabReport(report: LabPdfReport): Promise<void> {
  const pages = renderLabReportCanvases(report);
  const { jsPDF } = await loadJsPdf();

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  pages.forEach((page, index) => {
    if (index > 0) {
      pdf.addPage();
    }
    pdf.addImage(page.toDataURL("image/png"), "PNG", 0, 0, PAGE_W_MM, PAGE_H_MM, undefined, "FAST");
  });
  pdf.save(report.fileName);
}

/** 按需載入 jsPDF，避免缺套件時整個模組無法使用。 */
async function loadJsPdf(): Promise<{ jsPDF: JsPdfConstructor }> {
  try {
    const jspdfModule = await import("jspdf");
    return { jsPDF: jspdfModule.jsPDF };
  } catch {
    throw new Error("PDF 套件未安裝。請在 frontend 目錄執行 npm install 後重啟前端。");
  }
}
