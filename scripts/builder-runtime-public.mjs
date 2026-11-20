import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.cwd();
const sourcePublic = join(root, "public");
const targetPublic = join(root, "builder-runtime", "public");
const fontSource = join(sourcePublic, "fonts");
const iconFiles = [
  "ornigami-favicon.svg",
  "ornigami-mark-16.png",
  "ornigami-mark-32.png",
  "ornigami-mark-180.png",
];

if (!existsSync(fontSource)) {
  throw new Error("Builder runtime assets: public/fonts is missing.");
}

mkdirSync(targetPublic, { recursive: true });

// The builder app has its own public root. Keep the generated copy bounded to
// the admitted local fonts and builder metadata icons.
rmSync(join(targetPublic, "fonts"), { recursive: true, force: true });
cpSync(fontSource, join(targetPublic, "fonts"), { recursive: true });

for (const file of iconFiles) {
  const source = join(sourcePublic, file);
  if (!existsSync(source)) {
    throw new Error(`Builder runtime assets: public/${file} is missing.`);
  }
  cpSync(source, join(targetPublic, file));
}

console.log(`Prepared builder runtime public assets in ${resolve(targetPublic)}.`);
