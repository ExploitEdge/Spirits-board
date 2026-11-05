// Shows how each sample file is read before any AI is involved.
// Run: npx tsx scripts/inspect-parse.ts [file]
import fs from "node:fs";
import path from "node:path";
import { parseFile } from "../lib/parse";

const dir = path.join(__dirname, "..", "samples", "files");
const only = process.argv[2];
(async () => {
  for (const f of fs.readdirSync(dir).sort()) {
    if (only && !f.includes(only)) continue;
    const doc = await parseFile(fs.readFileSync(path.join(dir, f)), f);
    if (doc.kind === "table") {
      const rows = doc.sheets.reduce((n, s) => n + s.rows.length, 0);
      console.log(`${f}: table, ${doc.sheets.length} sheet(s), ${rows} rows`);
      if (only) for (const s of doc.sheets) console.log(s.name, s.rows.slice(0, 9));
    } else if (doc.kind === "text") {
      console.log(`${f}: text, ${doc.text.split("\n").length} lines`);
      if (only) console.log(doc.text);
    } else console.log(`${f}: image`);
  }
})();
