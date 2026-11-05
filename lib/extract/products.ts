// Makes product names universal: "Balvenie 12y american oak" and
// "BALVENIE 12YO AMERICAN OAK" both become Balvenie / 12 Year Old American Oak.
// 1. Names already seen before are looked up (free, instant).
// 2. Only new names go to the AI, each unique name once, in batches.

import type { Category } from "@/lib/types";
import { CATEGORIES } from "@/lib/types";
import { arr, askJson, int, nullable, num, obj, oneOf, pool, str } from "./claude";
import { GLOSSARY, PRODUCT_CONVENTIONS } from "./glossary";

export interface ProductInfo {
  brand: string | null;
  product_name: string | null;
  category: Category | null;
  age_statement: string | null;
  edition: string | null;
  abv: number | null; // only if the name itself states it
  confidence: number;
}

export interface KnownProduct {
  brand: string;
  product_name: string;
  age_statement: string | null;
  edition: string | null;
  category: string;
}

/** Lookup of names seen before: lowercased alias -> product. Supplied by the caller (database). */
export type AliasLookup = (aliases: string[]) => Promise<Map<string, ProductInfo>>;

export const aliasKey = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

const schema = obj({
  products: arr(
    obj({
      i: int,
      brand: nullable(str),
      product_name: nullable(str),
      category: nullable(oneOf(CATEGORIES)),
      age_statement: nullable(str),
      edition: nullable(str),
      abv: nullable(num),
      confidence: num,
    }),
  ),
});

function system(known: KnownProduct[]) {
  const list = known.length
    ? `\nProducts already in the catalogue. If a name refers to one of these, return EXACTLY these values:\n` +
      known.map((k) => `- ${k.brand} | ${k.product_name} | ${k.age_statement ?? ""} | ${k.edition ?? ""} | ${k.category}`).join("\n")
    : "";
  return `You standardise spirits product names from traders' offer lists into a product catalogue.
${GLOSSARY}

${PRODUCT_CONVENTIONS}
${list}

For each numbered input name return one entry with the same i.
abv: only if the name itself contains an ABV, else null.
confidence: 0-1, how sure you are this is the right product (low for unknown brands, ambiguous or truncated names).
If a name is not a spirits product at all, return nulls with confidence 0.`;
}

export async function normaliseProducts(
  names: string[],
  opts: { lookup?: AliasLookup; known?: KnownProduct[]; batchSize?: number } = {},
): Promise<Map<string, ProductInfo>> {
  const unique = [...new Set(names.map(aliasKey).filter(Boolean))];
  const result = opts.lookup ? await opts.lookup(unique) : new Map<string, ProductInfo>();
  const todo = unique.filter((n) => !result.has(n));
  const size = opts.batchSize ?? 120;
  const batches: string[][] = [];
  for (let i = 0; i < todo.length; i += size) batches.push(todo.slice(i, i + size));

  await pool(batches, 4, async (batch) => {
    const res = await askJson<{ products: (ProductInfo & { i: number })[] }>({
      system: system(opts.known ?? []),
      content: batch.map((n, i) => `${i}: ${n}`).join("\n"),
      schema,
      maxTokens: 20000,
    });
    for (const p of res.products) {
      const name = batch[p.i];
      if (name === undefined) continue;
      const { i: _i, ...info } = p;
      void _i;
      result.set(name, info);
    }
  });
  return result;
}
