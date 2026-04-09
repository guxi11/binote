import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// dist/util/pkg.js → ../../package.json
const pkgPath = join(here, "..", "..", "package.json");

export const pkg: { name: string; version: string; description: string } =
  JSON.parse(readFileSync(pkgPath, "utf8"));
