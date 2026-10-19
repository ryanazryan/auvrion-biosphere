/**
 * One-time, idempotent change to three local Drizzle configs.
 * Won't remove existing schemas or touch any database. Safely fails if unknown.
 * Run: node scripts/wc007-add-slice03-schema.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const configFiles = [
  "drizzle.config.ts",
  "drizzle.wc004.config.ts",
  "drizzle.wc007.config.ts",
];
const existing = '"./src/server/db/observation-domain-schema.ts",';
const next = '"./src/server/db/operations-domain-schema.ts",';

// Validate ALL config files before editing any to prevent partial updates.
const patches = configFiles.map((file) => {
  const content = readFileSync(file, "utf8");
  if (!content.includes(existing)) {
    throw new Error(
      `REFUSED: ${file} does not contain Slice 01 schema. Review manually.`,
    );
  }
  const count = content.split(existing).length - 1;
  if (count !== 1) {
    throw new Error(`REFUSED: ${file} has unexpected repeated schema entries`);
  }
  if (content.includes(next)) {
    return { file, previous: content, updated: content, changed: false };
  }
  return {
    file,
    previous: content,
    updated: content.replace(existing, `${existing}\n    ${next}`),
    changed: true,
  };
});

for (const patch of patches) {
  if (patch.changed) {
    writeFileSync(patch.file, patch.updated, "utf8");
  }
  console.log(
    `${patch.changed ? "UPDATED" : "ALREADY PRESENT"}: ${patch.file}`,
  );
}
console.log("PASS: Slice 03 registered; no database modified");
