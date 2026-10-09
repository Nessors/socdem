import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { parseSocdemDocxBuffer } from "../src/parseSocdemDocx.js";

function ps(script) {
  const r = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-STA", "-Command", script],
    { encoding: "utf8", windowsHide: true }
  );
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || "powershell failed");
}

async function makeEmf(path, color) {
  const escaped = path.replace(/'/g, "''");
  ps(`
    Add-Type -AssemblyName System.Drawing
    $bmp = New-Object System.Drawing.Bitmap 60,80
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::${color})
    $g.Dispose()
    $bmp.Save('${escaped}', [System.Drawing.Imaging.ImageFormat]::Emf)
    $bmp.Dispose()
  `);
}

const dir = await mkdtemp(join(tmpdir(), "socdem-docx-"));
const emf1 = join(dir, "a.emf");
const emf2 = join(dir, "b.emf");
await makeEmf(emf1, "Navy");
await makeEmf(emf2, "Maroon");

const zip = new JSZip();
zip.file(
  "[Content_Types].xml",
  `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="emf" ContentType="image/x-emf"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
);
zip.file(
  "word/document.xml",
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Социально-демографические данные</w:t></w:r></w:p>
    <w:p><w:r><w:t>Ф.И.О.: Тестов Тест Тестович</w:t></w:r></w:p>
    <w:p><w:r><w:t>Дата рождения и место рождения: 01 января 2000 года, г. Тест</w:t></w:r></w:p>
    <w:p><w:r><w:t>Номер телефона: 89001234567</w:t></w:r></w:p>
    <w:p><w:r><w:t>Цветное фото:</w:t></w:r></w:p>
    <w:p><w:r><w:drawing><wp:inline><wp:extent cx="1000000" cy="1200000"/><a:graphic><a:graphicData>
      <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:blipFill><a:blip r:embed="rId5"/></pic:blipFill></pic:pic>
    </a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>
    <w:p><w:r><w:drawing><wp:inline><wp:extent cx="1000000" cy="1200000"/><a:graphic><a:graphicData>
      <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:blipFill><a:blip r:embed="rId6"/></pic:blipFill></pic:pic>
    </a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>
  </w:body>
</w:document>`
);
zip.file(
  "word/_rels/document.xml.rels",
  `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.emf"/>
  <Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image2.emf"/>
</Relationships>`
);
zip.file("word/media/image1.emf", await readFile(emf1));
zip.file("word/media/image2.emf", await readFile(emf2));

const buf = await zip.generateAsync({ type: "nodebuffer" });
const parsed = await parseSocdemDocxBuffer(buf);
console.log(
  JSON.stringify(
    {
      photos: parsed.photos.length,
      mimes: parsed.photos.map((p) => p.mime),
      bytes: parsed.photos.map((p) => p.data.length),
      warnings: parsed.warnings,
    },
    null,
    2
  )
);
if (parsed.photos.length !== 2) process.exitCode = 1;
if (parsed.photos.some((p) => p.mime !== "image/png")) process.exitCode = 1;

const zip2 = new JSZip();
zip2.file(
  "word/document.xml",
  `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
  <w:p><w:r><w:t>Социально-демографические данные</w:t></w:r></w:p>
  <w:p><w:r><w:t>Ф.И.О.: Тестов Тест</w:t></w:r></w:p>
  <w:p><w:r><w:t>Цветное фото:</w:t></w:r></w:p>
  </w:body></w:document>`
);
zip2.file("word/media/image1.emf", await readFile(emf1));
zip2.file("word/media/image2.emf", await readFile(emf2));
const parsed2 = await parseSocdemDocxBuffer(await zip2.generateAsync({ type: "nodebuffer" }));
console.log("media-only", parsed2.photos.length, parsed2.photos.map((p) => p.mime));
if (parsed2.photos.length !== 2) process.exitCode = 1;

await rm(dir, { recursive: true, force: true });
