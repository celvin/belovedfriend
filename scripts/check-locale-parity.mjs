import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "artifacts",
  "memorial",
  "public",
  "locales",
);
const langs = ["en", "es", "fr"];
const load = (l) => JSON.parse(readFileSync(join(dir, `${l}.json`), "utf8"));
const data = Object.fromEntries(langs.map((l) => [l, load(l)]));
const enKeys = Object.keys(data.en).sort();

let failed = false;
for (const l of langs.filter((x) => x !== "en")) {
  const present = new Set(Object.keys(data[l]));
  const missing = enKeys.filter((k) => !present.has(k));
  const extra = Object.keys(data[l]).filter((k) => !(k in data.en));
  if (missing.length) {
    failed = true;
    console.error(`[${l}] missing ${missing.length} key(s):`, missing);
  }
  if (extra.length) {
    failed = true;
    console.error(`[${l}] ${extra.length} extra key(s) not in en:`, extra);
  }
}
if (failed) {
  console.error("Locale parity check FAILED");
  process.exit(1);
}
console.log(`Locale parity OK — ${enKeys.length} keys across ${langs.join(", ")}`);
