import { readFileSync, writeFileSync } from "node:fs";

const configs = [
  "drizzle.config.ts",
  "drizzle.wc004.config.ts",
  "drizzle.wc007.config.ts",
];
const preceding = '"./src/server/db/operations-domain-schema.ts",';
const entry = '"./src/server/db/report-domain-schema.ts",';

// Validate every file before any modifications.
const plans = configs.map((path) => {
  const current = readFileSync(path, "utf8");
  if (current.split(preceding).length !== 2) {
    throw new Error(`REFUSED: unexpected Slice03 schema entry in ${path}`);
  }
  const occurrences = current.split(entry).length - 1;
  if (occurrences > 1) {
    throw new Error(`REFUSED: duplicate Slice04 entry in ${path}`);
  }
  return {
    path,
    changed: occurrences === 0,
    updated:
      occurrences === 0
        ? current.replace(preceding, `${preceding}\n    ${entry}`)
        : current,
  };
});

for (const plan of plans) {
  if (plan.changed) writeFileSync(plan.path, plan.updated, "utf8");
  console.log(`${plan.changed ? "UPDATED" : "ALREADY PRESENT"}: ${plan.path}`);
}
console.log("PASS: Slice04 registered; no database modified");
