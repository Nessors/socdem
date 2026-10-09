import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "scripts",
  "rasterize-image.ps1"
);

const META_EXT = new Set(["emf", "wmf", "emz", "wmz", "tif", "tiff"]);

function looksLikeEmf(data) {
  return (
    data?.length >= 44 &&
    data[0] === 0x01 &&
    data[1] === 0x00 &&
    data[2] === 0x00 &&
    data[3] === 0x00 &&
    data.slice(40, 44).toString("ascii") === " EMF"
  );
}

function looksLikeWmf(data) {
  return (
    data?.length >= 4 &&
    data[0] === 0xd7 &&
    data[1] === 0xcd &&
    data[2] === 0xc6 &&
    data[3] === 0x9a
  );
}

export function needsRasterize(pathOrExt, data) {
  const ext = String(pathOrExt).split(".").pop()?.toLowerCase() ?? "";
  if (META_EXT.has(ext)) return true;
  return looksLikeEmf(data) || looksLikeWmf(data);
}

function unzipMetafile(buffer, ext) {
  if (ext !== "emz" && ext !== "wmz") return { buffer, ext };
  try {
    return { buffer: gunzipSync(buffer), ext: ext === "emz" ? "emf" : "wmf" };
  } catch {
    return { buffer, ext };
  }
}

function runPowershell(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-STA",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        SCRIPT,
        "-InputPath",
        inputPath,
        "-OutputPath",
        outputPath,
      ],
      { windowsHide: true }
    );
    let err = "";
    child.stderr.on("data", (chunk) => {
      err += String(chunk);
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("таймаут конвертации картинки Word"));
    }, 20000);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(err.trim() || `powershell exit ${code}`));
    });
  });
}

/**
 * EMF/WMF/TIFF из Word → PNG (через GDI+), чтобы браузер мог показать фото.
 */
export async function rasterizeToPng(buffer, ext = "emf") {
  if (process.platform !== "win32" || !buffer?.length) return null;
  const unpacked = unzipMetafile(buffer, String(ext).toLowerCase());
  const safeExt = /^[a-z0-9]+$/i.test(unpacked.ext) ? unpacked.ext : "emf";
  const dir = await mkdtemp(join(tmpdir(), `socdem-img-${randomBytes(4).toString("hex")}-`));
  const inputPath = join(dir, `in.${safeExt}`);
  const outputPath = join(dir, "out.png");
  try {
    await writeFile(inputPath, unpacked.buffer);
    await runPowershell(inputPath, outputPath);
    const png = await readFile(outputPath);
    if (png.length >= 8 && png[0] === 0x89 && png[1] === 0x50) return png;
    return null;
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
