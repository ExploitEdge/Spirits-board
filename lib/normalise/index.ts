// Plain code (no AI) that turns trade notation into clean values.
// Anything with a fixed format is handled here: it's instant, free and
// never "creative". The AI is only used for what code can't do reliably.

import type { CustomsStatus, Incoterm, Packaging, PriceUnit, QtyUnit } from "@/lib/types";
import { INCOTERMS } from "@/lib/types";

const clean = (s: unknown) => (s == null ? "" : String(s)).replace(/ /g, " ").trim();

/** "58,03" -> 58.03, "1.234,56" -> 1234.56, "$1,234.56" -> 1234.56, "185,-" -> 185 */
export function parseNumber(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  let s = clean(input).replace(/,-$/, "").replace(/\.-$/, "");
  const m = s.match(/-?\d[\d.,' ]*/);
  if (!m) return null;
  s = m[0].replace(/[' ]/g, "");
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma > -1) {
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, "");
  }
  s = s.replace(/[.,]$/, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** A value with its unit -> centilitres. */
function toCl(value: number, unit: string | undefined): number | null {
  const u = (unit || "").toLowerCase();
  let cl: number;
  if (u.startsWith("ml")) cl = value / 10;
  else if (u === "cl") cl = value;
  else if (u.startsWith("l")) cl = value * 100;
  else if (value <= 5) cl = value * 100; // bare "0,7" / "1.75" = litres
  else if (value < 200) cl = value; // bare "70" / "100" = cl
  else cl = value / 10; // bare "700" = ml
  cl = round(cl, 1);
  return cl >= 3 && cl <= 600 ? cl : null;
}

const SIZE_RE = /(\d+(?:[.,]\d+)?)\s*(ml|cl|ltr|lt|liter|litre|l)\b/i;

/** "70cl", "0,7", "1L", "700ml", "0,70L", "1.75" -> centilitres */
export function parseSize(input: unknown): number | null {
  if (typeof input === "number") return toCl(input, undefined);
  const s = clean(input);
  if (!s) return null;
  const m = s.match(SIZE_RE);
  if (m) return toCl(parseNumber(m[1])!, m[2]);
  const n = parseNumber(s);
  return n == null ? null : toCl(n, undefined);
}

/** Find a size written inside a product name ("Absolut 1L GBX"). Returns the name without it. */
export function sizeFromText(input: string): { size: number | null; rest: string } {
  const m = input.match(new RegExp(`(^|\\s)${SIZE_RE.source}`, "i"));
  if (!m) return { size: null, rest: input };
  return { size: toCl(parseNumber(m[2])!, m[3]), rest: input.replace(m[0], " ").replace(/\s+/g, " ").trim() };
}

/** "40%", "37,5", "43.1" -> 40, 37.5, 43.1 */
export function parseAbv(input: unknown): number | null {
  const n = parseNumber(input);
  return n != null && n > 0 && n <= 100 ? round(n, 1) : null;
}

export interface CaseConfig { bottles_per_case?: number; bottle_size_cl?: number; abv?: number }

/** "12/100/40", "6x70cl", "12x1L", "24x35cl", "6x", "12" -> bottles per case (+ size/abv if present) */
export function parseCaseConfig(input: unknown): CaseConfig {
  const s = clean(input).toLowerCase();
  if (!s) return {};
  let m = s.match(/^(\d{1,2})\s*\/\s*(\d+(?:[.,]\d+)?)\s*(?:\/\s*(\d+(?:[.,]\d+)?))?/);
  if (m) {
    const out: CaseConfig = { bottles_per_case: +m[1] };
    const size = toCl(parseNumber(m[2])!, undefined); if (size) out.bottle_size_cl = size;
    if (m[3]) { const a = parseAbv(m[3]); if (a) out.abv = a; }
    return out;
  }
  m = s.match(/(\d{1,2})\s*[x×]\s*(\d+(?:[.,]\d+)?)?\s*(ml|cl|ltr|lt|l)?\b/);
  if (m) {
    const out: CaseConfig = { bottles_per_case: +m[1] };
    if (m[2]) { const size = toCl(parseNumber(m[2])!, m[3]); if (size) out.bottle_size_cl = size; }
    return out;
  }
  const n = parseNumber(s);
  return n && Number.isInteger(n) && n > 0 && n <= 120 ? { bottles_per_case: n } : {};
}

/** Detects currency symbols/codes and per-bottle/per-case wording. */
export function parsePrice(input: unknown): { price: number | null; currency?: string; unit?: PriceUnit } {
  if (typeof input === "number") return { price: input };
  const s = clean(input);
  const out: { price: number | null; currency?: string; unit?: PriceUnit } = { price: parseNumber(s) };
  const cur = detectCurrency(s);
  if (cur) out.currency = cur;
  const unit = detectPriceUnit(s);
  if (unit) out.unit = unit;
  return out;
}

export function detectCurrency(s: string): string | undefined {
  if (/US\$|\$|\busd\b/i.test(s)) return "USD";
  if (/€|\beur\b|\beuro?s?\b|\d\s*e\b/i.test(s)) return "EUR";
  if (/£|\bgbp\b/i.test(s)) return "GBP";
  if (/\bsgd\b|S\$/i.test(s)) return "SGD";
  if (/\bchf\b/i.test(s)) return "CHF";
  return undefined;
}

export function detectPriceUnit(s: string): PriceUnit | undefined {
  const t = s.toLowerCase();
  if (/(\/|per |p\/|pro )\s*(cs|case|ctn|carton|doos|karton|kt)\b|\/cs\b/.test(t)) return "case";
  if (/(\/|per |p\/|pro )\s*(btl|bottle|fl|fles|flasche|bt)\b|\/btl\b/.test(t)) return "bottle";
  return undefined;
}

/** "2 FTL", "5 pallets", "300 cs", "56" -> { quantity, unit } */
export function parseQuantity(input: unknown, fallbackUnit: QtyUnit = "cases"): { quantity: number | null; unit: QtyUnit | null } {
  const s = clean(input).toLowerCase();
  const q = parseNumber(s);
  if (q == null) return { quantity: null, unit: null };
  let unit: QtyUnit = fallbackUnit;
  if (/ftl|truck|lkw/.test(s)) unit = "ftl";
  else if (/pal|plt|pll/.test(s)) unit = "pallets";
  else if (/btl|bottle|fl\b|fles/.test(s)) unit = "bottles";
  else if (/cs|case|ctn|crt|kt|karton|doos/.test(s)) unit = "cases";
  return { quantity: q, unit };
}

/** "prompt", "ex stock", "sofort" -> 0; "2-3 wks" -> 14 (lower bound); "10 days" -> 10 */
export function parseLeadTime(input: unknown): { text: string | null; days: number | null } {
  const s = clean(input);
  if (!s) return { text: null, days: null };
  const t = s.toLowerCase();
  if (/prompt|ex[\s-]?stock|in stock|on stock|sofort|direct|immediate|spot|available now|ready/.test(t)) return { text: s, days: 0 };
  const m = t.match(/(\d+)\s*(?:-\s*\d+\s*)?(wk|week|woche|weken|w\b|day|tag|dag|d\b|month|monat|maand)/);
  if (m) {
    const n = +m[1], u = m[2];
    const days = /day|tag|dag|^d/.test(u) ? n : /month|monat|maand/.test(u) ? n * 30 : n * 7;
    return { text: s, days };
  }
  return { text: s, days: null };
}

export function parsePackaging(input: unknown): Packaging | null {
  const t = ` ${clean(input).toLowerCase()} `;
  if (/\bngbx\b|no gift ?box|without gift ?box|w\/o gbx|ohne gp|ohne gesch|\bngb\b/.test(t)) return "NGBX";
  if (/\bgbx\b|gift ?box|giftbox|\bmit gp\b|\bgp\b|geschenk|\bgb\b/.test(t)) return "GBX";
  if (/\btin\b|\bdose\b/.test(t)) return "TIN";
  return null;
}

export function parseFlags(input: unknown): { is_coded?: boolean; is_refillable?: boolean; market_spec?: string } {
  const t = ` ${clean(input).toLowerCase()} `;
  const out: { is_coded?: boolean; is_refillable?: boolean; market_spec?: string } = {};
  if (/\buncoded\b|\bun-coded\b|\bdecoded\b/.test(t)) out.is_coded = false;
  else if (/\bcoded\b/.test(t)) out.is_coded = true;
  if (/non[\s-]?ref|non[\s-]?refill/.test(t)) out.is_refillable = false;
  else if (/\bref(ill)?\b|\brefillable\b/.test(t)) out.is_refillable = true;
  const spec = t.match(/\b(uk|eu|us|tr|asia|asian|china|duty free|travel retail)\b\s*(spec|labels?|market)?/);
  if (spec && (spec[2] || /\b(uk|eu|tr) spec|\btr\b/.test(t))) {
    const v = spec[1];
    out.market_spec = v === "asian" ? "ASIA" : v === "travel retail" || v === "duty free" ? "TR" : v.toUpperCase();
  }
  return out;
}

export function normaliseIncoterm(input: unknown): Incoterm | null {
  const t = clean(input).toUpperCase().replace(/[.\s-]/g, "");
  if (!t) return null;
  if (/^(EXW|EXWORKS|EXWAREHOUSE|EXWH|ABLAGER|EXCELLAR)/.test(t)) return "EXW";
  if (/^(CNF|CFR|C&F|CANDF)/.test(t)) return "CNF";
  const found = INCOTERMS.find((i) => t.startsWith(i));
  return found ?? null;
}

export function normaliseCustoms(input: unknown): CustomsStatus | null {
  const t = clean(input).toUpperCase();
  if (/\bT1\b/.test(t)) return "T1";
  if (/\bT2\b/.test(t)) return "T2";
  return null;
}

const CITY_COUNTRY: Record<string, string> = {
  rotterdam: "NL", amsterdam: "NL", venlo: "NL", tilburg: "NL", veghel: "NL", groningen: "NL",
  antwerp: "BE", antwerpen: "BE", brussels: "BE", hamburg: "DE", bremen: "DE", duisburg: "DE",
  riga: "LV", tallinn: "EE", vilnius: "LT", gdansk: "PL", warsaw: "PL", london: "GB", felixstowe: "GB",
  le_havre: "FR", "le havre": "FR", marseille: "FR", barcelona: "ES", valencia: "ES", genoa: "IT",
  singapore: "SG", sin: "SG", dubai: "AE", jebel_ali: "AE", "jebel ali": "AE", "hong kong": "HK",
};

export function countryForCity(city: string | null | undefined): string | null {
  if (!city) return null;
  return CITY_COUNTRY[city.toLowerCase().trim()] ?? null;
}

export function normaliseCity(city: string | null | undefined): string | null {
  if (!city) return null;
  // a "Terms" column often holds both: "FOB SIN", "EXW Rotterdam"
  const c = city.trim().replace(/^(ex[\s-]?works|ex[\s-]?warehouse|exw|fca|fas|fob|cnf|c&f|cfr|cif|cpt|cip|dap|dpu|ddp)\b\s*/i, "").trim();
  if (!c) return null;
  if (/^sin$/i.test(c)) return "Singapore";
  if (/^antwerpen$/i.test(c)) return "Antwerp";
  return c.replace(/\b\w/g, (ch) => ch.toUpperCase());
}
