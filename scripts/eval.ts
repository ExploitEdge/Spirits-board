// Test harness: runs the real extraction on every sample list and scores it
// against the correct answers in samples/expected/.
//
// Run:   npm run eval              (all samples)
//        npm run eval -- 09 14     (only samples whose name contains 09 or 14)
// Needs: ANTHROPIC_API_KEY in .env.local (it uses the real AI, costs a little per run)

import fs from "node:fs";
import path from "node:path";
import { parseFile } from "../lib/parse";
import { extract } from "../lib/extract";
import type { Lot } from "../lib/types";

const ROOT = path.join(__dirname, "..");
const FILES = path.join(ROOT, "samples", "files");
const EXPECTED = path.join(ROOT, "samples", "expected");
const RESULTS = path.join(ROOT, "samples", "results");

type Exp = Record<string, unknown>;

// ---- comparing values -------------------------------------------------------
const tokens = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/(\d+)\s*yo\b/g, "$1").replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !["the", "year", "years", "old", "yo", "y", "yrs"].includes(t));

const squash = (s: unknown) => tokens(s).join("");

function sameBrand(a: unknown, b: unknown) {
  const x = squash(a), y = squash(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
}

function sameProduct(exp: Exp, got: Lot) {
  const e = new Set(tokens([exp.product_name, exp.edition, exp.age_statement].join(" ")));
  const g = new Set(tokens([got.product_name, got.edition, got.age_statement].join(" ")));
  if (!e.size) return true;
  const hit = [...e].filter((t) => g.has(t)).length;
  return hit / e.size >= 0.6 && (g.size === 0 ? false : hit / g.size >= 0.5);
}

function fieldOk(field: string, exp: unknown, got: unknown): boolean {
  if (typeof exp === "number") return typeof got === "number" && Math.abs(got - exp) < 0.011;
  if (field === "warehouse_city") return squash(exp) === squash(got);
  return exp === got;
}

const SCORED = [
  "bottle_size_cl", "abv", "bottles_per_case", "price", "price_unit", "currency",
  "packaging", "customs_status", "incoterm", "warehouse_city", "quantity", "quantity_unit",
  "lead_time_days", "is_coded", "is_refillable", "market_spec", "category",
];
const CORE = ["brand", "product", "bottle_size_cl", "abv", "bottles_per_case", "price", "currency"];

// ---- matching expected lots to extracted lots ---------------------------------
function similarity(e: Exp, g: Lot) {
  let s = 0;
  if (sameBrand(e.brand, g.brand)) s += 3;
  if (sameProduct(e, g)) s += 2;
  if (e.bottle_size_cl === g.bottle_size_cl) s += 1;
  if (typeof e.price === "number" && typeof g.price === "number" && Math.abs(e.price - g.price) < 0.011) s += 2;
  return s;
}

function match(exp: Exp[], got: Lot[], byOrder: boolean): (Lot | null)[] {
  if (byOrder && exp.length === got.length) return got;
  const used = new Set<number>();
  return exp.map((e, i) => {
    let best = -1, bestScore = 2; // need at least something in common
    got.forEach((g, j) => {
      if (used.has(j)) return;
      const sc = similarity(e, g) + (j === i ? 0.5 : 0);
      if (sc > bestScore) { best = j; bestScore = sc; }
    });
    if (best < 0) return null;
    used.add(best);
    return got[best];
  });
}

// ---- run ---------------------------------------------------------------------
function loadEnv() {
  const f = path.join(ROOT, ".env.local");
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

async function main() {
  loadEnv();
  const filters = process.argv.slice(2);
  const totals: Record<string, { ok: number; n: number }> = {};
  const report: unknown[] = [];
  const pct = (o: { ok: number; n: number }) => (o.n ? `${((100 * o.ok) / o.n).toFixed(1)}%` : "-");

  for (const f of fs.readdirSync(EXPECTED).sort()) {
    const expected = JSON.parse(fs.readFileSync(path.join(EXPECTED, f), "utf8"));
    if (filters.length && !filters.some((x) => expected.file.includes(x))) continue;
    const t0 = Date.now();
    let lots: Lot[] = [];
    let error: string | null = null;
    try {
      const doc = await parseFile(fs.readFileSync(path.join(FILES, expected.file)), expected.file);
      lots = (await extract(doc, { side: expected.side })).lots;
    } catch (e) {
      error = (e as Error).message;
    }
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const matched = match(expected.lots, lots, expected.match_by === "order");
    const per: Record<string, { ok: number; n: number }> = {};
    const errors: unknown[] = [];
    const bump = (k: string, ok: boolean) => {
      for (const bucket of [per, totals]) { bucket[k] ??= { ok: 0, n: 0 }; bucket[k].n++; if (ok) bucket[k].ok++; }
    };
    expected.lots.forEach((e: Exp, i: number) => {
      const g = matched[i];
      bump("lot found", !!g);
      if (!g) { errors.push({ i, missing: e }); return; }
      const checks: [string, boolean][] = [["brand", sameBrand(e.brand, g.brand)], ["product", sameProduct(e, g)]];
      for (const k of SCORED) if (e[k] !== undefined) checks.push([k, fieldOk(k, e[k], (g as unknown as Record<string, unknown>)[k])]);
      for (const [k, ok] of checks) {
        bump(k, ok);
        if (!ok && errors.length < 25) errors.push({ i, field: k, expected: k === "product" ? [e.brand, e.product_name] : e[k], got: k === "product" ? [g.brand, g.product_name] : (g as unknown as Record<string, unknown>)[k], line: g.raw_line });
      }
    });
    const extra = Math.max(0, lots.length - matched.filter(Boolean).length);
    const coreOk = CORE.reduce((a, k) => a + (per[k]?.ok ?? 0), 0), coreN = CORE.reduce((a, k) => a + (per[k]?.n ?? 0), 0);
    console.log(
      `${expected.file.padEnd(42)} ${String(lots.length).padStart(5)}/${String(expected.lots.length).padEnd(5)} lots  ` +
        `core ${pct({ ok: coreOk, n: coreN }).padStart(6)}  extra ${extra}  ${secs}s${error ? "  ERROR: " + error : ""}`,
    );
    report.push({ file: expected.file, seconds: +secs, error, extracted: lots.length, expected: expected.lots.length, extra, fields: per, errors });
  }

  console.log("\nAccuracy per field (all samples):");
  for (const k of ["lot found", ...CORE, ...SCORED.filter((s) => !CORE.includes(s))]) {
    if (totals[k]) console.log(`  ${k.padEnd(18)} ${pct(totals[k]).padStart(6)}   (${totals[k].ok}/${totals[k].n})`);
  }
  fs.mkdirSync(RESULTS, { recursive: true });
  const out = path.join(RESULTS, `eval-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(out, JSON.stringify({ model: process.env.EXTRACTION_MODEL || "default", totals, samples: report }, null, 1));
  console.log(`\nFull report with every mistake: ${path.relative(ROOT, out)}`);
}

main();
