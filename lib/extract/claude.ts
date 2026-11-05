// One small wrapper around the Claude API: send a prompt, get back JSON that
// is guaranteed to match the schema we ask for (structured outputs).

import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.EXTRACTION_MODEL || "claude-sonnet-5-5";

let client: Anthropic | null = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set.");
  client ??= new Anthropic();
  return client;
}

type Content = Anthropic.Messages.ContentBlockParam[];

export async function askJson<T>(opts: {
  system: string;
  content: string | Content;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<T> {
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    system: opts.system,
    messages: [{ role: "user", content: opts.content }],
    output_config: { format: { type: "json_schema", schema: opts.schema } },
  });
  if (res.stop_reason === "max_tokens") throw new Error("The AI response was cut off (list chunk too long).");
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return JSON.parse(text) as T;
}

// --- tiny JSON-schema helpers -------------------------------------------------
export const str = { type: "string" };
export const num = { type: "number" };
export const int = { type: "integer" };
export const bool = { type: "boolean" };
export const nullable = (s: object) => ({ anyOf: [s, { type: "null" }] });
export const oneOf = (values: readonly string[]) => ({ type: "string", enum: [...values] });
export const obj = (properties: Record<string, object>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
export const arr = (items: object) => ({ type: "array", items });

/** Run async jobs with at most `limit` at the same time. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}
