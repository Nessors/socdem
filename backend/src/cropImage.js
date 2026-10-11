import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "scripts",
  "crop-image.ps1"
);

export function pngSize(buf) {
  if (buf?.length > 24 && buf.toString("ascii", 1, 4) === "PNG") {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  return null;
}

export function jpegSize(buf) {
  if (!buf || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

export function imageSize(buf) {
  return pngSize(buf) || jpegSize(buf);
}

/** Полный рост — высокий кадр (~2:3 и выше). По грудь ближе к 3:4 и 4:5. */
export const FULL_BODY_ASPECT = 1.65;
export const BUST_ASPECT = 1.52;

export function photoAspectRatio(buf) {
  const sz = imageSize(buf);
  if (!sz?.width || !sz?.height) return null;
  return sz.height / sz.width;
}

export function looksLikeFullBody(buf) {
  const ratio = photoAspectRatio(buf);
  return ratio != null && ratio >= FULL_BODY_ASPECT;
}

export function looksLikeBust(buf) {
  const ratio = photoAspectRatio(buf);
  return ratio != null && ratio <= BUST_ASPECT;
}

export function frameKind(buf) {
  const ratio = photoAspectRatio(buf);
  if (ratio == null) return "unknown";
  if (ratio >= FULL_BODY_ASPECT) return "full";
  if (ratio <= BUST_ASPECT) return "bust";
  return "mid";
}

function runCrop(args) {
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
        ...args,
      ],
      { windowsHide: true }
    );
    let err = "";
    child.stderr.on("data", (chunk) => {
      err += String(chunk);
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("таймаут обрезки фото"));
    }, 25000);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(err.trim() || `crop exit ${code}`));
    });
  });
}

async function withTempImage(buffer, run) {
  if (process.platform !== "win32" || !buffer?.length) return null;
  const dir = await mkdtemp(join(tmpdir(), `socdem-crop-${randomBytes(4).toString("hex")}-`));
  const inputPath = join(dir, "in.bin");
  const outputPath = join(dir, "out.png");
  try {
    await writeFile(inputPath, buffer);
    await run(inputPath, outputPath);
    const png = await readFile(outputPath);
    if (png.length >= 8 && png[0] === 0x89 && png[1] === 0x50) {
      return { mime: "image/png", data: png };
    }
    return null;
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Обрезка по долям сторон (как a:srcRect в Word: 0..1 с каждой стороны).
 */
export async function cropBySrcRect(buffer, rect) {
  if (!rect) return null;
  const sz = imageSize(buffer);
  if (!sz) return null;
  const l = Math.min(0.45, Math.max(0, Number(rect.l) || 0));
  const t = Math.min(0.45, Math.max(0, Number(rect.t) || 0));
  const r = Math.min(0.45, Math.max(0, Number(rect.r) || 0));
  const b = Math.min(0.8, Math.max(0, Number(rect.b) || 0));
  if (l + r >= 0.85 || t + b >= 0.85) return null;
  if (l + t + r + b < 0.02) return null;
  const x = Math.round(sz.width * l);
  const y = Math.round(sz.height * t);
  const w = Math.max(8, Math.round(sz.width * (1 - l - r)));
  const h = Math.max(8, Math.round(sz.height * (1 - t - b)));
  return withTempImage(buffer, (inputPath, outputPath) =>
    runCrop([
      "-InputPath",
      inputPath,
      "-OutputPath",
      outputPath,
      "-Mode",
      "pixels",
      "-X",
      String(x),
      "-Y",
      String(y),
      "-Width",
      String(w),
      "-Height",
      String(h),
    ])
  );
}

/** Кадр по грудь / нашивки: от макушки до груди, без ног. */
export async function cropToBust(buffer, { force = false } = {}) {
  const ratio = photoAspectRatio(buffer);
  if (!force && ratio != null && ratio < 1.28) return null;
  return withTempImage(buffer, (inputPath, outputPath) => {
    const args = ["-InputPath", inputPath, "-OutputPath", outputPath, "-Mode", "bust"];
    if (force) args.push("-ForceBust");
    return runCrop(args);
  });
}

/** Запасная обрезка верхней половины кадра, если авто-режим не сработал. */
export async function cropToBustFallback(buffer) {
  const sz = imageSize(buffer);
  if (!sz?.width || !sz?.height) return null;
  const keepH = Math.max(8, Math.round(sz.height * 0.5));
  const b = Math.max(0, 1 - keepH / sz.height - 0.02);
  return cropBySrcRect(buffer, { l: 0.06, t: 0.02, r: 0.06, b });
}

export function sameImageBuffer(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return false;
  return a.equals(b);
}
