// Tables: the AI looks at the top of the sheet once and says which column is
// what. Plain code then reads every row with that mapping.

import type { ListDefaults, Lot, QtyUnit } from "@/lib/types";
import { INCOTERMS } from "@/lib/types";
import type { Sheet } from "@/lib/parse";
import { askJson, int, nullable, obj, oneOf, str } from "./claude";
import { GLOSSARY } from "./glossary";
import {
  normaliseCity, normaliseCustoms, normaliseIncoterm, parseAbv, parseCaseConfig, parseFlags,
  parseLeadTime, parsePackaging, parsePrice, parseQuantity, parseSize, sizeFromText, countryForCity,
} from "@/lib/normalise";

const COLUMN_KEYS = [
  "product", "brand", "category", "size", "abv", "bottles_per_case", "case_config", "packaging", "price",
  "quantity", "moq", "lead_time", "customs_status", "incoterm", "warehouse", "remarks",
] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

export interface ColumnMapping {
  header_row: number | null; // 1-based row number of the header, null if none
  columns: Record<ColumnKey, number | null>; // 0-based column index
  price_unit: "bottle" | "case" | null;
  currency: string | null;
  quantity_unit: QtyUnit | null;
  list_defaults: ListDefaults;
  notes: string;
  header_cells?: string[]; // stored so the mapping can be re-used for the next list
}

const defaultsSchema = obj({
  currency: nullable(str),
  price_unit: nullable(oneOf(["bottle", "case"])),
  incoterm: nullable(oneOf(INCOTERMS)),
  customs_status: nullable(oneOf(["T1", "T2"])),
  warehouse_city: nullable(str),
  warehouse_country: nullable(str),
  lead_time_text: nullable(str),
  lead_time_days: nullable(int),
  valid_until: nullable(str),
});

const mappingSchema = obj({
  header_row: nullable(int),
  columns: obj(Object.fromEntries(COLUMN_KEYS.map((k) => [k, nullable(int)]))),
  price_unit: nullable(oneOf(["bottle", "case"])),
  currency: nullable(str),
  quantity_unit: nullable(oneOf(["bottles", "cases", "pallets", "ftl"])),
  list_defaults: defaultsSchema,
  notes: str,
});

const SYSTEM = `You read offer lists from spirits traders and work out the layout of a table.
${GLOSSARY}

You get the top rows of one sheet, each row numbered and each cell prefixed with its 0-based column index like [3].
Return:
- header_row: the row number of the column header row (null if there is none).
- columns: for each field, the 0-based index of the column holding it, or null if no column holds it.
  product = the product description column. brand = only if brand is in a SEPARATE column from the description.
  case_config = a column with combined notation like "12/100/40" or "6x70cl" (use bottles_per_case for a plain count like "6" or "12x").
  remarks = a free-text notes/remarks column.
- price_unit: whether the price column is per bottle or per case (from header or notes), or null if truly unknown.
- currency: ISO code of the price column (EUR, USD, GBP...), from the header, symbols in cells, or notes above the table.
- quantity_unit: unit of the quantity column if it has no unit in the cells.
- list_defaults: terms stated for the whole list (in rows above/below the table or the sheet title), e.g.
  "all prices EXW Rotterdam, T1, valid 7 days". Use null for anything not stated. Don't guess.
  valid_until as YYYY-MM-DD only if an actual date is given.
- notes: one short sentence on anything unusual.`;

function renderRows(rows: string[][], max: number) {
  return rows
    .slice(0, max)
    .map((r, i) => `Row ${i + 1}: ` + r.map((c, j) => (c ? `[${j}] ${c}` : "")).filter(Boolean).join("  "))
    .join("\n");
}

export async function mapColumns(sheet: Sheet, preamble: string): Promise<ColumnMapping> {
  const tail = sheet.rows.slice(-6).filter((r) => r.some((c) => c));
  const content =
    (preamble ? `Text above the table:\n${preamble}\n\n` : "") +
    `Sheet name: ${sheet.name}\n\n${renderRows(sheet.rows, 30)}` +
    (sheet.rows.length > 36 ? `\n\n(... ${sheet.rows.length - 36} more rows ...)\n\nLast rows:\n${tail.map((r) => r.filter(Boolean).join(" | ")).join("\n")}` : "");
  const m = await askJson<ColumnMapping>({ system: SYSTEM, content, schema: mappingSchema, maxTokens: 2000 });
  m.header_cells = m.header_row ? sheet.rows[m.header_row - 1] : undefined;
  return m;
}

/** Re-use a previous mapping if the header row is identical (same distributor, same layout). */
export function reuseMapping(sheet: Sheet, prev: ColumnMapping | null | undefined): ColumnMapping | null {
  if (!prev?.header_row || !prev.header_cells) return null;
  const row = sheet.rows[prev.header_row - 1];
  if (!row || row.length !== prev.header_cells.length) return null;
  return row.every((c, i) => c === prev.header_cells![i]) ? prev : null;
}

const has = (v: unknown) => v !== undefined && v !== null && v !== "";

/** Apply the mapping to every row. No AI. */
export function readRows(sheet: Sheet, m: ColumnMapping, startLineNo: number, showSheetName = false): Lot[] {
  const col = (row: string[], key: ColumnKey) => {
    const i = m.columns[key];
    return i == null ? "" : (row[i] ?? "").trim();
  };
  const lots: Lot[] = [];
  const first = m.header_row ?? 0;
  sheet.rows.forEach((row, idx) => {
    if (idx < first) return;
    let product = col(row, "product");
    if (!product) return;
    const brand = col(row, "brand");
    const cfg = parseCaseConfig(col(row, "case_config"));
    const bpcCell = parseCaseConfig(col(row, "bottles_per_case"));
    const priceCell = parsePrice(col(row, "price"));

    let size = parseSize(col(row, "size")) ?? cfg.bottle_size_cl ?? bpcCell.bottle_size_cl ?? null;
    if (size == null) {
      const found = sizeFromText(product);
      if (found.size) { size = found.size; product = found.rest; }
    } else {
      product = sizeFromText(product).rest; // strip a duplicate size from the name
    }

    // Rows without a price and without any spec are section titles or remarks.
    if (priceCell.price == null && size == null && !has(cfg.bottles_per_case) && !has(bpcCell.bottles_per_case)) return;

    const remarks = col(row, "remarks");
    const packaging = parsePackaging(col(row, "packaging")) ?? parsePackaging(remarks) ?? parsePackaging(product);
    product = product.replace(/\b(N?GBX|giftbox|gift box)\b/gi, "").replace(/\s+/g, " ").trim();
    const flags = { ...parseFlags(product), ...parseFlags(remarks) };
    const qty = parseQuantity(col(row, "quantity"), m.quantity_unit ?? "cases");
    const moq = parseQuantity(col(row, "moq"), m.quantity_unit ?? "cases");
    const lead = parseLeadTime(col(row, "lead_time"));
    const city = normaliseCity(col(row, "warehouse") || null);

    lots.push({
      line_no: startLineNo + lots.length,
      raw_line: (showSheetName ? `[${sheet.name}] ` : "") + row.filter(Boolean).join(" | "),
      product_text: [brand, product].filter(Boolean).join(" "),
      bottle_size_cl: size,
      abv: parseAbv(col(row, "abv")) ?? cfg.abv ?? bpcCell.abv ?? null,
      bottles_per_case: cfg.bottles_per_case ?? bpcCell.bottles_per_case ?? null,
      packaging,
      ...flags,
      price: priceCell.price,
      price_unit: priceCell.unit ?? m.price_unit ?? null,
      currency: priceCell.currency ?? m.currency ?? null,
      quantity: qty.quantity,
      quantity_unit: qty.quantity != null ? qty.unit : null,
      moq: moq.quantity,
      moq_unit: moq.quantity != null ? moq.unit : null,
      lead_time_text: lead.text,
      lead_time_days: lead.days,
      customs_status: normaliseCustoms(col(row, "customs_status")),
      incoterm: normaliseIncoterm(col(row, "incoterm")),
      warehouse_city: city,
      warehouse_country: countryForCity(city),
      remarks: remarks || null,
    });
  });
  return lots;
}
