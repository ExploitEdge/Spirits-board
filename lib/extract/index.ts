// The whole extraction in one call: file -> structured, standardised lots.
// Order of precedence for terms: the line itself > the list's own terms > the company's standard terms.

import type { ExtractionResult, ListDefaults, Lot, Side } from "@/lib/types";
import type { ParsedDoc } from "@/lib/parse";
import { countryForCity, normaliseCity, normaliseIncoterm } from "@/lib/normalise";
import { MODEL, pool } from "./claude";
import { mapColumns, readRows, reuseMapping, type ColumnMapping } from "./table";
import { extractImage, extractText } from "./lines";
import { aliasKey, normaliseProducts, type AliasLookup, type KnownProduct } from "./products";

export interface ExtractOptions {
  side: Side;
  companyDefaults?: ListDefaults;
  previousMappings?: (ColumnMapping & { sheet?: string })[];
  lookup?: AliasLookup;
  known?: KnownProduct[];
}

const DEFAULT_FIELDS = [
  "currency", "price_unit", "incoterm", "customs_status", "warehouse_city", "warehouse_country",
  "lead_time_text", "lead_time_days", "valid_until",
] as const;

function applyDefaults(lot: Lot, d: ListDefaults | undefined, conf: number) {
  if (!d) return;
  const rec = lot as unknown as Record<string, unknown>;
  for (const f of DEFAULT_FIELDS) {
    const v = (d as Record<string, unknown>)[f];
    if (rec[f] == null && v != null && v !== "") {
      rec[f] = v;
      lot.field_confidence = { ...lot.field_confidence, [f]: Math.min(lot.field_confidence?.[f] ?? 1, conf) };
    }
  }
}

const CORE = ["product", "bottle_size_cl", "abv", "bottles_per_case", "price", "price_unit", "currency"] as const;

export async function extract(doc: ParsedDoc, opts: ExtractOptions): Promise<ExtractionResult> {
  const warnings: string[] = [];
  let lots: Lot[] = [];
  let listDefaults: ListDefaults = {};
  let mappings: (ColumnMapping & { sheet: string })[] | undefined;

  if (doc.kind === "table") {
    mappings = await pool(doc.sheets, 4, async (sheet, i) => {
      const prev = opts.previousMappings?.find((m) => m.sheet === sheet.name) ?? opts.previousMappings?.[i];
      const m = reuseMapping(sheet, prev) ?? (await mapColumns(sheet, i === 0 ? doc.preamble : ""));
      return { ...m, sheet: sheet.name };
    });
    let lineNo = 1;
    doc.sheets.forEach((sheet, i) => {
      const m = mappings![i];
      if (m.columns.product == null) { warnings.push(`Sheet "${sheet.name}": no product column found, skipped.`); return; }
      if (m.columns.price == null) warnings.push(`Sheet "${sheet.name}": no price column found.`);
      const sheetLots = readRows(sheet, m, lineNo, doc.sheets.length > 1);
      const d = { ...m.list_defaults, currency: m.list_defaults.currency ?? m.currency, price_unit: m.list_defaults.price_unit ?? m.price_unit };
      for (const l of sheetLots) { l.confidence = 1; applyDefaults(l, d, 0.95); }
      for (const [k, v] of Object.entries(d)) if (v != null && (listDefaults as Record<string, unknown>)[k] == null) (listDefaults as Record<string, unknown>)[k] = v;
      lots.push(...sheetLots);
      lineNo += sheetLots.length;
    });
  } else {
    const out = doc.kind === "image" ? await extractImage(doc, opts.side) : await extractText(doc.text, opts.side);
    listDefaults = out.defaults;
    lots = out.lots.sort((a, b) => a.line_no - b.line_no);
    for (const l of lots) applyDefaults(l, listDefaults, 0.95);
  }

  // Standardise product names (seen-before names cost nothing)
  const products = await normaliseProducts(lots.map((l) => l.product_text || ""), { lookup: opts.lookup, known: opts.known });

  for (const l of lots) {
    applyDefaults(l, opts.companyDefaults, 0.85);
    const p = products.get(aliasKey(l.product_text || ""));
    if (p) {
      l.brand = p.brand; l.product_name = p.product_name; l.category = p.category;
      l.age_statement = p.age_statement; l.edition = p.edition;
      l.abv ??= p.abv;
    }
    // clean-up of codes and places
    l.incoterm = normaliseIncoterm(l.incoterm) ?? null;
    l.currency = l.currency ? l.currency.toUpperCase().slice(0, 3) : null;
    l.warehouse_city = normaliseCity(l.warehouse_city);
    l.warehouse_country = (l.warehouse_country || countryForCity(l.warehouse_city))?.toUpperCase().slice(0, 2) ?? null;

    // confidence per core field, overall = weakest core field
    const fc: Record<string, number> = { ...l.field_confidence };
    fc.product = Math.min(fc.product ?? 1, p?.confidence ?? 0);
    for (const f of CORE) {
      if (f === "product") continue;
      const v = (l as unknown as Record<string, unknown>)[f];
      if (v == null) fc[f] = 0.3;
    }
    l.field_confidence = fc;
    l.confidence = Math.round(Math.min(l.confidence ?? 1, ...CORE.map((f) => fc[f] ?? 1)) * 100) / 100;
  }

  return { mode: doc.kind === "table" ? "table" : "lines", list_defaults: listDefaults, column_mapping: mappings, lots, warnings, model: MODEL };
}
