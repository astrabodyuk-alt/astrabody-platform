#!/usr/bin/env node
/**
 * Generate placeholder PWA icons (192x192 + 512x512) from an inline SVG.
 *
 * Run once with:
 *   node scripts/generate-pwa-icons.mjs
 *
 * Replace these with a designer asset later (TODO: Nigel). The output
 * is committed to public/icons/.
 */
import sharp from "sharp";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public", "icons");

async function makeIcon(size, outFile) {
  const cornerRadius = Math.round(size * 0.22);
  const fontSize = Math.round(size * 0.55);
  // Cormorant Garamond falls back to Georgia/serif on systems without it.
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect x="0" y="0" width="${size}" height="${size}" rx="${cornerRadius}" ry="${cornerRadius}" fill="#F6F3EE"/>
  <text x="${size / 2}" y="${size / 2}" text-anchor="middle" dominant-baseline="central"
        font-family="Cormorant Garamond, Georgia, serif" font-weight="500" font-size="${fontSize}"
        fill="#5C6B4E">A</text>
</svg>`;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  await writeFile(outFile, buf);
  console.log(`wrote ${outFile} (${buf.length} bytes)`);
}

await mkdir(OUT_DIR, { recursive: true });
await makeIcon(192, join(OUT_DIR, "icon-192.png"));
await makeIcon(512, join(OUT_DIR, "icon-512.png"));
console.log("done.");
