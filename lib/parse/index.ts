// Turns any uploaded file into one of two shapes:
//  - "table": rows of cells (Excel, CSV, tab-pasted text, PDFs with a clear table)
//  - "text":  numbered lines (emails, WhatsApp, letter-style PDFs)
//  - "image": a picture for Claude to read
// No AI here; this is just reading the file.

import ExcelJS from "exceljs";
import Papa from "papaparse";

export interface Sheet { name: string; rows: string[][] }
export type ParsedDoc =
  | { kind: "table"; sheets: Sheet[]; preamble: string }
  | { kind: "text"; text: string }
  | { kind: "image"; base64: string; mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif" };

export type SourceType = "xlsx" | "csv" | "pdf" | "image" | "text" | "email";

export function sourceTypeFor(filename: string | null): SourceType {
  const ext = (filename || "").toLowerCase().split(".").pop();
  if (ext === "xlsx" || ext === "xlsm") return "xlsx";
  if (ext === "csv" || ext === "tsv") return "csv";
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext || "")) return "image";
  if (ext === "eml") return "email";
  return "text";
}

export async function parseFile(buf: Buffer, filename: string): Promise<ParsedDoc> {
  const type = sourceTypeFor(filename);
  const ext = filename.toLowerCase().split(".").pop() || "";
  if (ext === "xls") throw new Error("Old .xls files aren't supported yet. Please open it in Excel and save as .xlsx.");
  if (type === "xlsx") return parseXlsx(buf);
  if (type === "csv") return parseDelimited(buf.toString("utf8"));
  if (type === "pdf") return parsePdf(buf);
  if (type === "image") {
    const mediaType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : "image/jpeg";
    return { kind: "image", base64: buf.toString("base64"), mediaType };
  }
  return parseText(buf.toString("utf8"));
}

/** Pasted text: if it looks like a tab-separated table (copied from Excel) treat it as one. */
export function parseText(text: string): ParsedDoc {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const tabbed = lines.filter((l) => (l.match(/\t/g) || []).length >= 2);
  if (tabbed.length >= 5 && tabbed.length >= lines.filter((l) => l.trim()).length * 0.6) {
    return parseDelimited(text, "\t");
  }
  return { kind: "text", text: text.trim() };
}

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text);
    if ("error" in v) return "";
  }
  return String(v);
}

async function parseXlsx(buf: Buffer): Promise<ParsedDoc> {
  const wb = new ExcelJS.Workbook();
  // exceljs' types expect an older Buffer type; the runtime accepts it fine
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const sheets: Sheet[] = [];
  wb.eachSheet((ws) => {
    const rows: string[][] = [];
    const width = ws.columnCount;
    ws.eachRow({ includeEmpty: true }, (row, rowNo) => {
      const cells: string[] = [];
      for (let c = 1; c <= width; c++) {
        const cell = row.getCell(c);
        // merged header cells: only the first cell keeps the text
        cells.push(cell.isMerged && cell.master.address !== cell.address ? "" : cellText(cell.value).trim());
      }
      rows[rowNo - 1] = cells;
    });
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    if (rows.some((r) => r.some((c) => c))) sheets.push({ name: ws.name, rows: trimColumns(rows) });
  });
  if (!sheets.length) throw new Error("The spreadsheet looks empty.");
  return { kind: "table", sheets, preamble: "" };
}

function parseDelimited(text: string, delimiter?: string): ParsedDoc {
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ""), { delimiter: delimiter ?? "", skipEmptyLines: false });
  const rows = res.data.map((r) => r.map((c) => (c ?? "").trim()));
  return { kind: "table", sheets: [{ name: "Sheet1", rows: trimColumns(rows) }], preamble: "" };
}

/** Drop columns that are empty in every row (common in messy Excel layouts). */
function trimColumns(rows: string[][]): string[][] {
  const width = Math.max(0, ...rows.map((r) => r.length));
  const keep: number[] = [];
  for (let c = 0; c < width; c++) if (rows.some((r) => (r[c] ?? "").trim())) keep.push(c);
  return rows.map((r) => keep.map((c) => r[c] ?? ""));
}

/**
 * PDFs: rebuild lines from text positions, split into cells where there is a
 * clear horizontal gap. If most lines then share the same number of cells,
 * it's a table; otherwise it's treated as text.
 */
async function parsePdf(buf: Buffer): Promise<ParsedDoc> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const lines: string[][] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    type Item = { str: string; x: number; y: number; w: number };
    const items: Item[] = [];
    for (const it of content.items as Array<{ str?: string; transform?: number[]; width?: number }>) {
      if (!it.str || !it.str.trim() || !it.transform) continue;
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width ?? 0 });
    }
    const byY = new Map<number, Item[]>();
    for (const it of items) {
      const key = [...byY.keys()].find((k) => Math.abs(k - it.y) < 3) ?? it.y;
      byY.set(key, [...(byY.get(key) || []), it]);
    }
    for (const y of [...byY.keys()].sort((a, b) => b - a)) {
      const row = byY.get(y)!.sort((a, b) => a.x - b.x);
      const cells: string[] = [];
      let prevEnd = -Infinity;
      for (const it of row) {
        if (it.x - prevEnd > 8 || !cells.length) cells.push(it.str.trim());
        else cells[cells.length - 1] += (it.x - prevEnd > 1 ? " " : "") + it.str.trim();
        prevEnd = it.x + it.w;
      }
      lines.push(cells);
    }
  }
  const counts = new Map<number, number>();
  for (const l of lines) if (l.length >= 3) counts.set(l.length, (counts.get(l.length) || 0) + 1);
  const [bestWidth, bestCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [0, 0];
  if (bestCount >= 5 && bestCount >= lines.length * 0.5) {
    const firstIdx = lines.findIndex((l) => l.length === bestWidth);
    const preamble = lines.slice(0, firstIdx).map((l) => l.join(" ")).join("\n");
    const rows = lines.slice(firstIdx).map((l) => (l.length === bestWidth ? l : [l.join(" ")]));
    return { kind: "table", sheets: [{ name: "PDF", rows }], preamble };
  }
  return { kind: "text", text: lines.map((l) => l.join("   ")).join("\n") };
}
