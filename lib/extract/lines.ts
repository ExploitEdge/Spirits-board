// Free text (emails, WhatsApp, letter-style PDFs, screenshots): the AI reads
// it and returns one lot per product offered. Long texts are split in chunks.

import type Anthropic from "@anthropic-ai/sdk";
import type { ListDefaults, Lot } from "@/lib/types";
import { INCOTERMS } from "@/lib/types";
import { arr, askJson, bool, int, nullable, num, obj, oneOf, pool, str } from "./claude";
import { GLOSSARY } from "./glossary";

const qtyUnit = nullable(oneOf(["bottles", "cases", "pallets", "ftl"]));
const lotSchema = obj({
  line_no: int,
  raw_text: str,
  product_text: str,
  bottle_size_cl: nullable(num),
  abv: nullable(num),
  bottles_per_case: nullable(int),
  cases_per_pallet: nullable(int),
  packaging: nullable(oneOf(["GBX", "NGBX", "TIN", "OTHER"])),
  is_coded: nullable(bool),
  is_refillable: nullable(bool),
  market_spec: nullable(str),
  customs_status: nullable(oneOf(["T1", "T2"])),
  warehouse_city: nullable(str),
  warehouse_country: nullable(str),
  incoterm: nullable(oneOf(INCOTERMS)),
  price: nullable(num),
  price_unit: nullable(oneOf(["bottle", "case"])),
  currency: nullable(str),
  quantity: nullable(num),
  quantity_unit: qtyUnit,
  moq: nullable(num),
  moq_unit: qtyUnit,
  lead_time_text: nullable(str),
  lead_time_days: nullable(int),
  valid_until: nullable(str),
  remarks: nullable(str),
  confidence: num,
  uncertain_fields: arr(str),
});

const schema = obj({
  list_defaults: obj({
    currency: nullable(str),
    price_unit: nullable(oneOf(["bottle", "case"])),
    incoterm: nullable(oneOf(INCOTERMS)),
    customs_status: nullable(oneOf(["T1", "T2"])),
    warehouse_city: nullable(str),
    warehouse_country: nullable(str),
    lead_time_text: nullable(str),
    lead_time_days: nullable(int),
    valid_until: nullable(str),
  }),
  lots: arr(lotSchema),
});

const SYSTEM = (side: "offer" | "request", today: string) => `You extract ${side === "offer" ? "product offers" : "product requests (a buyer's wanted list)"} from spirits traders' messages.
Today is ${today}.
${GLOSSARY}

Rules:
- One lot per product ${side === "offer" ? "offered" : "requested"}. Ignore greetings, signatures, disclaimers and questions.
- line_no: the number of the line where the product appears. raw_text: that line exactly as written.
- product_text: the product as written (brand + name), without size, ABV, case config, packaging or price.
- If a later message corrects an earlier one ("sorry, price is 9.10 not 9.01"), use the corrected value and keep the original line_no.
- If extra info for a product comes in a later line ("2 pallets jd"), merge it into that product's lot.
- list_defaults: terms stated for the whole message (e.g. "all goods T2, EXW Riga, prices per case in EUR").
  Don't copy list_defaults into every lot: put a value in a lot only if that line states it.
- ${side === "request" ? "price = the buyer's target / maximum price if given, else null." : "price = the offered price."}
- Bottle size in centilitres. lead_time_days: 0 for prompt/ex-stock, lower bound for ranges ("2-3 weeks" = 14).
- valid_until only as YYYY-MM-DD if you can determine the actual date ("valid until Friday" -> the coming Friday).
- Use null for anything not stated. Never invent values.
- confidence: 0-1 for the whole lot. uncertain_fields: names of fields you had to guess.`;

interface RawLot extends Omit<Lot, "raw_line" | "field_confidence"> { raw_text: string; uncertain_fields: string[] }
type Out = { list_defaults: ListDefaults; lots: RawLot[] };

const CHUNK = 50;

export async function extractText(text: string, side: "offer" | "request"): Promise<{ defaults: ListDefaults; lots: Lot[] }> {
  const lines = text.split("\n");
  const numbered = lines.map((l, i) => `${i + 1}: ${l}`);
  const header = numbered.slice(0, 12).join("\n");
  const chunks: { from: number; body: string }[] = [];
  for (let i = 0; i < numbered.length; i += CHUNK) chunks.push({ from: i, body: numbered.slice(i, i + CHUNK).join("\n") });

  const today = new Date().toISOString().slice(0, 10);
  const outs = await pool(chunks, 4, (c) =>
    askJson<Out>({
      system: SYSTEM(side, today),
      content: c.from === 0 ? c.body : `Start of the message (for context only, already processed):\n${header}\n\nExtract from these lines:\n${c.body}`,
      schema,
    }),
  );

  const defaults: ListDefaults = {};
  for (const o of outs) for (const [k, v] of Object.entries(o.list_defaults)) if (v != null && (defaults as Record<string, unknown>)[k] == null) (defaults as Record<string, unknown>)[k] = v;
  const lots = outs.flatMap((o) => o.lots).map((l) => toLot(l, lines[l.line_no - 1]));
  return { defaults, lots };
}

export async function extractImage(
  image: { base64: string; mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif" },
  side: "offer" | "request",
): Promise<{ defaults: ListDefaults; lots: Lot[] }> {
  const content: Anthropic.Messages.ContentBlockParam[] = [
    { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.base64 } },
    { type: "text", text: "This is a picture of an offer list. Number the lines as they appear (title = line 1) and extract every product." },
  ];
  const out = await askJson<Out>({ system: SYSTEM(side, new Date().toISOString().slice(0, 10)), content, schema });
  return { defaults: out.list_defaults, lots: out.lots.map((l) => toLot(l)) };
}

function toLot(l: RawLot, originalLine?: string): Lot {
  const { raw_text, uncertain_fields, confidence, ...rest } = l;
  const field_confidence: Record<string, number> = {};
  for (const f of uncertain_fields) field_confidence[f] = 0.5;
  return { ...rest, raw_line: originalLine?.trim() || raw_text, confidence, field_confidence };
}
