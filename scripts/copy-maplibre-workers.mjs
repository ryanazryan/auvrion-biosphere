import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const pkgDir = path.join(process.cwd(), "node_modules", "maplibre-gl");
const sourceDir = path.join(pkgDir, "dist");
const targetDir = path.join(process.cwd(), "public", "vendor", "maplibre");
const files = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

for (const name of files) {
  if (!existsSync(path.join(sourceDir, name))) {
    throw new Error(
      `MapLibre worker asset missing: ${name}. Run npm ci before build.`,
    );
  }
}
const { version } = JSON.parse(
  readFileSync(path.join(pkgDir, "package.json"), "utf8"),
);
mkdirSync(targetDir, { recursive: true });
for (const name of files) {
  copyFileSync(path.join(sourceDir, name), path.join(targetDir, name));
}
console.log(
  `Prepared MapLibre GL JS ${version} worker + shared module at public/vendor/maplibre/`,
);
