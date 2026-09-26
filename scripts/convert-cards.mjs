// One-off / repeatable utility to prepare card artwork for the app.
// Usage: node scripts/convert-cards.mjs <source-dir>
// Reads all .png files from <source-dir> (numbered, any zero-padding),
// resizes them to the app's card aspect ratio and writes sequential
// 001.webp..NNN.webp files into public/cards/.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = process.argv[2];
if (!SRC_DIR) {
  console.error("Usage: node scripts/convert-cards.mjs <source-dir>");
  process.exit(1);
}
const OUT_DIR = path.join(__dirname, "..", "public", "cards");
const WIDTH = 600;
const HEIGHT = 840;

const files = fs.readdirSync(SRC_DIR).filter((f) => f.toLowerCase().endsWith(".png"));

function numericId(filename) {
  return parseInt(filename.replace(/\D/g, ""), 10);
}

const parsed = files.map((f) => ({ file: f, id: numericId(f) })).sort((a, b) => a.id - b.id);

const ids = parsed.map((p) => p.id);
if (new Set(ids).size !== parsed.length) {
  throw new Error("Duplicate card ids detected: " + JSON.stringify(ids));
}
const minId = Math.min(...ids);
const maxId = Math.max(...ids);
if (minId !== 1 || maxId !== parsed.length) {
  throw new Error(`Expected a contiguous 1..N range, got min=${minId} max=${maxId} count=${parsed.length}`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const { file, id } of parsed) {
  const srcPath = path.join(SRC_DIR, file);
  const outPath = path.join(OUT_DIR, String(id).padStart(3, "0") + ".webp");
  await sharp(srcPath)
    .resize(WIDTH, HEIGHT, { fit: "fill" })
    .webp({ quality: 82 })
    .toFile(outPath);
}

console.log(`Converted ${parsed.length} cards into ${OUT_DIR}`);
console.log(`Update DECK_SIZE in lib/types.ts to ${parsed.length} if it changed.`);
