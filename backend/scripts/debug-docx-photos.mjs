#!/usr/bin/env node
/**
 * Диагностика фото в .docx: node scripts/debug-docx-photos.mjs path/to/file.docx
 */
import { readFileSync } from "fs";
import JSZip from "jszip";
import { parseSocdemDocxBuffer } from "../src/parseSocdemDocx.js";

const path = process.argv[2];
if (!path) {
  console.error("Usage: node scripts/debug-docx-photos.mjs <file.docx>");
  process.exit(1);
}

const buffer = readFileSync(path);
const zip = await JSZip.loadAsync(buffer);
const docXml = (await zip.file("word/document.xml")?.async("string")) ?? "";
const media = Object.keys(zip.files).filter((p) => /^word\/media\//i.test(p) && !p.endsWith("/"));
const relsXml = (await zip.file("word/_rels/document.xml.rels")?.async("string")) ?? "";

console.log("--- zip ---");
console.log("media files:", media.length, media);
console.log("document.xml length:", docXml.length);
console.log("w:drawing count:", (docXml.match(/<w:drawing>/g) || []).length);
console.log("v:imagedata count:", (docXml.match(/v:imagedata/gi) || []).length);
console.log(
  "photo marker:",
  docXml.match(/Цветн[\s\S]{0,80}?фото/i)?.[0] ?? "(not found)"
);
console.log("image relationships:", (relsXml.match(/\/image"/g) || []).length);

const parsed = await parseSocdemDocxBuffer(buffer);
console.log("--- parse ---");
console.log("photos extracted:", parsed.photos.length);
for (const p of parsed.photos) {
  console.log(`  slot ${p.slot}: ${p.mime}, ${p.data?.length ?? 0} bytes`);
}
if (parsed.warnings.length) console.log("warnings:", parsed.warnings);
