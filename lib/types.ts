// Shared shapes used by the extraction pipeline, the API and the UI.

export type Side = "offer" | "request";
export type PriceUnit = "bottle" | "case";
export type QtyUnit = "bottles" | "cases" | "pallets" | "ftl";
export type Packaging = "GBX" | "NGBX" | "TIN" | "OTHER";
export type CustomsStatus = "T1" | "T2";

export const INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CNF", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"] as const;
export type Incoterm = (typeof INCOTERMS)[number];

export const CATEGORIES = [
  "whisky", "vodka", "rum", "gin", "cognac", "brandy", "tequila",
  "mezcal", "liqueur", "champagne", "wine", "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Terms that apply to every line unless the line says otherwise. */
export interface ListDefaults {
  currency?: string | null;
  price_unit?: PriceUnit | null;
  incoterm?: Incoterm | null;
  customs_status?: CustomsStatus | null;
  warehouse_city?: string | null;
  warehouse_country?: string | null;
  lead_time_text?: string | null;
  lead_time_days?: number | null;
  valid_until?: string | null; // YYYY-MM-DD
}

/** One extracted line, before it is saved. Field names match the `lots` table. */
export interface Lot {
  line_no: number;
  raw_line: string;
  product_text?: string | null; // the product as written, before normalisation

  brand?: string | null;
  product_name?: string | null;
  category?: Category | null;
  age_statement?: string | null;
  edition?: string | null;

  bottle_size_cl?: number | null;
  abv?: number | null;
  bottles_per_case?: number | null;
  cases_per_pallet?: number | null;
  packaging?: Packaging | null;
  is_coded?: boolean | null;
  is_refillable?: boolean | null;
  market_spec?: string | null;

  customs_status?: CustomsStatus | null;
  warehouse_city?: string | null;
  warehouse_country?: string | null;
  incoterm?: Incoterm | null;

  price?: number | null;
  price_unit?: PriceUnit | null;
  currency?: string | null;

  quantity?: number | null;
  quantity_unit?: QtyUnit | null;
  moq?: number | null;
  moq_unit?: QtyUnit | null;

  lead_time_text?: string | null;
  lead_time_days?: number | null;
  valid_until?: string | null;
  remarks?: string | null;

  confidence?: number;
  field_confidence?: Record<string, number>;
}

/** The fields that matter most; shown first and scored hardest. */
export const CORE_FIELDS = [
  "brand", "product_name", "bottle_size_cl", "abv", "bottles_per_case", "price", "currency",
] as const;

export interface ExtractionResult {
  mode: "table" | "lines";
  list_defaults: ListDefaults;
  column_mapping?: unknown;
  lots: Lot[];
  warnings: string[];
  model: string;
}
