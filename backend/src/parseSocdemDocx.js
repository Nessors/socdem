import JSZip from "jszip";
import {
  cropBySrcRect,
  cropToBust,
  cropToBustFallback,
  frameKind,
  looksLikeFullBody,
  photoAspectRatio,
  sameImageBuffer,
} from "./cropImage.js";
import { foldDeathsFromRelatives, mergeMourning, parseDeathMention } from "./deathFromSocdem.js";
import { needsRasterize, rasterizeToPng } from "./rasterizeImage.js";
import {
  PROFILE_LABEL_TO_KEY,
  SECTION_MARKERS,
  normalizeFieldValue,
  parseBirthFromParagraphs,
  parseBirthLine,
  parseFioLine,
  lineFieldValue,
  normalizePhone,
  parsePhoneFromParagraphs,
  parseLongDateRu,
  parseShortDateDot,
} from "./socdemDocxFormat.js";

const RANKS =
  /(рядовой|ефрейтор|сержант|старшина|прапорщик|мичман|лейтенант|капитан|майор|подполковник|полковник|генерал[-\s]?[\w]*)/i;

function decodeXml(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** Параграфы документа в порядке следования (как в export .docx) */
export async function extractParagraphs(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) {
    throw new Error("Файл не похож на документ Word (.docx)");
  }
  const paragraphs = [];
  const re = /<w:p[\s>][\s\S]*?<\/w:p>/g;
  let block;
  while ((block = re.exec(xml))) {
    const chunk = block[0]
      .replace(/<w:tab\/>/g, " ")
      .replace(/<w:br\/>/g, " ");
    const texts = [...chunk.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map(
      (m) => decodeXml(m[1])
    );
    const line = texts.join("").replace(/\s+/g, " ").trim();
    if (line) paragraphs.push(line);
  }
  return { zip, paragraphs };
}

function parseLabeledFields(paragraphs) {
  const profile = {};
  let fio = null;
  let birth = { birth_date: null, birth_place: null };
  const labelKeys = Object.keys(PROFILE_LABEL_TO_KEY);

  for (const line of paragraphs) {
    const fioVal = lineFieldValue(line, "Ф.И.О.") ?? lineFieldValue(line, "Ф. И. О.");
    if (fioVal != null) {
      fio = parseFioLine(fioVal);
      continue;
    }
    const birthVal = lineFieldValue(line, "Дата рождения и место рождения");
    if (birthVal != null) {
      birth = parseBirthLine(birthVal);
      continue;
    }
    for (const label of labelKeys) {
      const val = lineFieldValue(line, label);
      if (val != null) {
        const key = PROFILE_LABEL_TO_KEY[label];
        profile[key] =
          key === "phone" ? normalizePhone(val) ?? normalizeFieldValue(val) : normalizeFieldValue(val);
      }
    }
    // Частые опечатки/варианты в шаблонах
    const abroad =
      lineFieldValue(line, "Был ли за границей (когда, где)") ??
      lineFieldValue(line, "Был-ли за границей (когда, где)");
    if (abroad != null) profile.been_abroad = normalizeFieldValue(abroad);
    const contract =
      lineFieldValue(line, "Контракт заключен") ??
      lineFieldValue(line, "Контракт заключён");
    if (contract != null) profile.contract_status = normalizeFieldValue(contract);
  }

  if (!birth.birth_date && !birth.birth_place) {
    birth = parseBirthFromParagraphs(paragraphs);
  } else if (birth.birth_date && !birth.birth_place) {
    const extra = parseBirthFromParagraphs(paragraphs);
    if (extra.birth_place) birth.birth_place = extra.birth_place;
  }

  if (profile.phone) {
    profile.phone = normalizePhone(profile.phone) ?? profile.phone;
  } else {
    profile.phone = parsePhoneFromParagraphs(paragraphs);
  }

  return { fio, birth, profile };
}

function indexOfMarker(paragraphs, marker) {
  return paragraphs.findIndex((p) => p === marker || p.startsWith(marker));
}

function parseRelativeLine(line) {
  const cleaned = line.replace(/;+\s*$/, "").trim();
  const colon = cleaned.indexOf(":");
  if (colon <= 0) return null;
  const relation = cleaned.slice(0, colon).trim();
  if (PROFILE_LABEL_TO_KEY[relation] || relation.startsWith("Адрес")) return null;

  let rest = cleaned.slice(colon + 1).trim();
  let birth_date = null;
  const birthM = rest.match(/,?\s*(\d{1,2}\s+[а-яёА-ЯЁ]+\s+\d{4})\s+года\s+рождения/i);
  if (birthM) {
    birth_date = parseLongDateRu(birthM[1]);
    rest = rest.replace(birthM[0], "").trim();
  }

  let phone = null;
  const phoneM = rest.match(/\(номер телефона для связи\s+([^)]+)\)/i);
  if (phoneM) {
    phone = normalizePhone(phoneM[1]) ?? phoneM[1].trim();
    rest = rest.replace(phoneM[0], "").trim();
  }

  rest = rest.replace(/^,\s*/, "").replace(/,\s*$/, "").trim();
  let full_name = rest;
  let details = null;
  const comma = rest.indexOf(",");
  if (comma > 0 && !birth_date) {
    full_name = rest.slice(0, comma).trim();
    details = rest.slice(comma + 1).trim() || null;
  } else if (comma > 0 && birth_date) {
    full_name = rest.slice(0, comma).trim();
    details = rest.slice(comma + 1).replace(/^,\s*/, "").trim() || null;
  } else if (birth_date && rest.includes(",")) {
    const parts = rest.split(",").map((p) => p.trim());
    full_name = parts[0];
    details = parts.slice(1).join(", ") || null;
  }

  if (!full_name) return null;
  return { relation, full_name, birth_date, details, phone };
}

function parseRelatives(paragraphs) {
  const regIdx = paragraphs.findIndex((p) =>
    p.startsWith("Адрес по месту регистрации:")
  );
  const maritalIdx = paragraphs.findIndex((p) =>
    p.startsWith("Семейное положение:")
  );
  if (regIdx < 0 || maritalIdx < 0 || regIdx <= maritalIdx + 1) return [];

  const items = [];
  for (let i = maritalIdx + 1; i < regIdx; i++) {
    const rel = parseRelativeLine(paragraphs[i]);
    if (rel) items.push(rel);
  }
  return items;
}

function parseCommanderParagraph(text) {
  const t = text.trim();
  if (!t) return null;
  const c = {
    position: "",
    rank: "",
    full_name: "",
    birth_date: null,
    in_position_since: null,
    education: null,
    contract: null,
    marital_status: null,
  };

  const sentences = t.split(/\.\s+/).filter(Boolean);
  for (const s of sentences) {
    if (/^Окончил/i.test(s)) {
      c.education = s.replace(/^Окончил\s+/i, "").trim();
    } else if (/^Контракт/i.test(s)) {
      c.contract = s.replace(/^Контракт\s+/i, "").trim();
    } else if (!c.marital_status && sentences.indexOf(s) === sentences.length - 1 && !/рождения|должности/i.test(s)) {
      c.marital_status = s.replace(/\.$/, "");
    }
  }

  let head = sentences[0] || t;
  const birthM = head.match(/,\s*(\d{1,2}\s+[а-яёА-ЯЁ]+\s+\d{4})\s+года\s+рождения/i);
  if (birthM) {
    c.birth_date = parseLongDateRu(birthM[1]);
    head = head.replace(birthM[0], "");
  }
  const posM = head.match(/,\s*в\s+должности\s+с\s+([^.,]+)/i);
  if (posM) {
    c.in_position_since = posM[1].trim();
    head = head.replace(posM[0], "");
  }
  head = head.replace(/,\s*$/, "").trim();

  const rankM = head.match(RANKS);
  if (rankM) {
    c.rank = rankM[1];
    const idx = head.indexOf(rankM[0]);
    c.position = head.slice(0, idx).trim();
    c.full_name = head.slice(idx + rankM[0].length).trim();
  } else {
    const words = head.split(/\s+/);
    if (words.length >= 4) {
      c.position = words.slice(0, 2).join(" ");
      c.full_name = words.slice(2).join(" ");
    } else {
      c.position = head;
      c.full_name = "—";
    }
  }

  c.position = c.position || "Командир";
  if (!c.full_name || c.full_name === "—") return null;
  return c;
}

function parseCommanders(paragraphs) {
  const start = indexOfMarker(paragraphs, SECTION_MARKERS.commanders);
  const end = indexOfMarker(paragraphs, SECTION_MARKERS.career);
  if (start < 0) return [];
  const items = [];
  const to = end >= 0 ? end : paragraphs.length;
  for (let i = start + 1; i < to; i++) {
    const line = paragraphs[i];
    if (!line || line === SECTION_MARKERS.career) continue;
    const c = parseCommanderParagraph(line);
    if (c) items.push(c);
  }
  return items;
}

function parseCareer(paragraphs) {
  const start = indexOfMarker(paragraphs, SECTION_MARKERS.career);
  const end = indexOfMarker(paragraphs, SECTION_MARKERS.mourning);
  const end2 = indexOfMarker(paragraphs, SECTION_MARKERS.photos);
  const stop = [end, end2].filter((x) => x >= 0).sort((a, b) => a - b)[0] ?? paragraphs.length;
  if (start < 0) return [];

  const items = [];
  const range = paragraphs.slice(start + 1, stop);
  const dateLineRe =
    /^(\d{2}\.\d{2}\.\d{4})\s*[–-]\s*((?:\d{2}\.\d{2}\.\d{4})|настоящее\s+время)\s*$/i;

  for (let i = 0; i < range.length; i++) {
    const line = range[i];
    if (line === "—") continue;
    const dm = line.match(dateLineRe);
    if (dm) {
      const date_from = parseShortDateDot(dm[1]);
      const date_to =
        /настоящее/i.test(dm[2]) ? null : parseShortDateDot(dm[2]);
      let description = "";
      const next = range[i + 1];
      if (next && !dateLineRe.test(next)) {
        description = next.replace(/^\-\s*/, "").trim();
        i++;
      }
      if (date_from && description) items.push({ date_from, date_to, description });
      continue;
    }
    const inline = line.match(
      /^(\d{2}\.\d{2}\.\d{4})\s*[–-]\s*((?:\d{2}\.\d{2}\.\d{4})|настоящее\s+время)\s*-\s*(.+)$/i
    );
    if (inline) {
      items.push({
        date_from: parseShortDateDot(inline[1]),
        date_to: /настоящее/i.test(inline[2])
          ? null
          : parseShortDateDot(inline[2]),
        description: inline[3].trim(),
      });
    }
  }
  return items.filter((c) => c.date_from && c.description);
}

function splitWho(who) {
  let relation = null;
  let full_name = who.trim();
  if (full_name.includes(" — ")) {
    const [rel, name] = full_name.split(" — ").map((s) => s.trim());
    relation = rel;
    full_name = name;
  } else {
    const colon = full_name.match(/^(Отец|Мать|Брат|Сестра|Дед|Бабушка|Супруг[аи]?|Жена|Муж)\s*[:—-]\s*(.+)$/i);
    if (colon) {
      relation = colon[1];
      full_name = colon[2].trim();
    }
  }
  return { relation, full_name };
}

function parseMourning(paragraphs) {
  const start = indexOfMarker(paragraphs, SECTION_MARKERS.mourning);
  const end = indexOfMarker(paragraphs, SECTION_MARKERS.photos);
  if (start < 0) return [];
  const items = [];
  for (let i = start + 1; i < (end >= 0 ? end : paragraphs.length); i++) {
    const line = paragraphs[i];
    const m = line.match(
      /^(.+?):\s*дата\s+смерти\s+(\d{1,2}\s+[а-яёА-ЯЁ]+\s+\d{4}\s+года?),\s*причина\s+смерти\s*[—-]\s*(.+)$/i
    );
    if (m) {
      const who = splitWho(m[1]);
      let cause = m[3].trim();
      let notes = null;
      const dot = cause.indexOf(". ");
      if (dot > 0) {
        notes = cause.slice(dot + 2).trim();
        cause = cause.slice(0, dot).trim();
      }
      items.push({
        ...who,
        death_date: parseLongDateRu(m[2]),
        cause_of_death: cause,
        notes,
      });
      continue;
    }
    const death = parseDeathMention(line);
    if (!death?.death_date) continue;
    const before = death.leftover || line;
    const who = splitWho(before.replace(/^[–—\-]\s*/, ""));
    if (!who.full_name) continue;
    items.push({
      ...who,
      death_date: death.death_date,
      cause_of_death: death.cause_of_death,
      notes: death.year_only ? "в соцдеме указан только год" : null,
    });
  }
  return items.filter((x) => x.death_date && x.cause_of_death && x.full_name);
}

const IMAGE_EXT = new Set([
  "jpeg",
  "jpg",
  "jfif",
  "png",
  "gif",
  "bmp",
  "webp",
  "tif",
  "tiff",
  "emf",
  "wmf",
  "emz",
  "wmz",
  "bin",
]);
const SKIP_IMAGE_EXT = new Set(["svg", "tmp"]);
/** Мельче — скорее иконка; если в архиве ровно 2 картинки, берём обе даже меньше этого */
const MIN_PHOTO_BYTES = 1500;

function mimeFromPath(path) {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "bmp") return "image/bmp";
  if (ext === "webp") return "image/webp";
  if (ext === "tif" || ext === "tiff") return "image/tiff";
  return "image/jpeg";
}

function mimeFromBuffer(data) {
  if (!data?.length) return null;
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47
  ) {
    return "image/png";
  }
  if (data.length >= 6 && data.slice(0, 6).toString("ascii") === "GIF89a") {
    return "image/gif";
  }
  if (data.length >= 6 && data.slice(0, 6).toString("ascii") === "GIF87a") {
    return "image/gif";
  }
  if (data.length >= 12 && data.slice(0, 4).toString("ascii") === "RIFF") {
    return "image/webp";
  }
  return null;
}

function isImageMediaPath(path) {
  if (!path || path.endsWith("/")) return false;
  const ext = path.split(".").pop()?.toLowerCase();
  if (SKIP_IMAGE_EXT.has(ext)) return false;
  return IMAGE_EXT.has(ext);
}

function normalizeRelationshipTarget(targetRaw) {
  if (!targetRaw || /^https?:/i.test(targetRaw) || targetRaw.startsWith("file:")) {
    return null;
  }
  let target = decodeURIComponent(String(targetRaw).replace(/\\/g, "/"));
  target = target.replace(/^\.\.\//, "").replace(/^\/+/, "");
  if (target.startsWith("word/")) return target;
  if (target.startsWith("media/")) return `word/${target}`;
  return `word/${target}`;
}

function findZipEntry(zip, path) {
  if (!path) return null;
  const norm = path.replace(/\\/g, "/").replace(/^\/+/, "");
  const direct = zip.file(norm);
  if (direct) return direct;
  const lower = norm.toLowerCase();
  const key = Object.keys(zip.files).find((k) => k.replace(/\\/g, "/").toLowerCase() === lower);
  return key ? zip.file(key) : null;
}

async function loadDocumentRelationships(zip) {
  const map = new Map();
  const relsPaths = Object.keys(zip.files).filter((p) =>
    /^word\/_rels\/document\.xml\.rels$/i.test(p.replace(/\\/g, "/"))
  );
  const relsXml =
    (relsPaths[0] && (await zip.file(relsPaths[0])?.async("string"))) ??
    (await zip.file("word/_rels/document.xml.rels")?.async("string"));
  if (!relsXml) return map;
  for (const m of relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const attrs = m[1];
    const id = attrs.match(/\bId="([^"]+)"/i)?.[1];
    const targetRaw =
      attrs.match(/\bTarget="([^"]+)"/i)?.[1] ?? attrs.match(/\bTarget='([^']+)'/i)?.[1];
    const type = attrs.match(/\bType="([^"]+)"/i)?.[1] ?? "";
    const mode = attrs.match(/\bTargetMode="([^"]+)"/i)?.[1] ?? "";
    if (!id || !targetRaw) continue;
    if (mode && /external/i.test(mode)) continue;
    const isImageRel =
      /\/image/i.test(type) ||
      /\/media\//i.test(targetRaw) ||
      IMAGE_EXT.has(targetRaw.split(".").pop()?.toLowerCase());
    if (type && !isImageRel) continue;
    const target = normalizeRelationshipTarget(targetRaw);
    if (target) map.set(id, target);
  }
  return map;
}

async function readPhotoAtPath(zip, path) {
  const norm = path ? normalizeRelationshipTarget(path) : path;
  if (!norm) return null;
  const ext = norm.split(".").pop()?.toLowerCase();
  if (SKIP_IMAGE_EXT.has(ext)) return null;

  const file = findZipEntry(zip, norm);
  if (!file) return null;
  let data = await file.async("nodebuffer");
  if (!data.length) return null;

  if (needsRasterize(norm, data)) {
    const png = await rasterizeToPng(data, ext);
    if (png?.length) return { mime: "image/png", data: png };
    return null;
  }

  let mime = isImageMediaPath(norm) && ext !== "bin" ? mimeFromPath(norm) : null;
  mime = mimeFromBuffer(data) ?? mime;
  if (!mime?.startsWith("image/")) return null;
  if (mime === "image/tiff") {
    const png = await rasterizeToPng(data, "tif");
    if (png?.length) return { mime: "image/png", data: png };
  }
  return { mime, data };
}

function photoMarkerIndex(docXml) {
  const m = docXml.match(/Цветн[\s\S]{0,160}?фото/i);
  if (!m) return -1;
  return docXml.indexOf(m[0]);
}

function sliceAfterPhotoMarker(docXml) {
  const idx = photoMarkerIndex(docXml);
  return idx >= 0 ? docXml.slice(idx) : null;
}

function collectRelationshipIds(xmlFragment) {
  const ids = [];
  const push = (id) => {
    if (id) ids.push(id);
  };
  for (const m of xmlFragment.matchAll(/\br:embed=["']([^"']+)["']/gi)) push(m[1]);
  for (const m of xmlFragment.matchAll(/\br:link=["']([^"']+)["']/gi)) push(m[1]);
  for (const m of xmlFragment.matchAll(/\br:id=["']([^"']+)["']/gi)) push(m[1]);
  for (const m of xmlFragment.matchAll(/\bo:relid=["']([^"']+)["']/gi)) push(m[1]);
  for (const m of xmlFragment.matchAll(/\bembed=["'](rId[^"']+)["']/gi)) push(m[1]);
  return ids;
}

function parseOOXMLPercent(raw) {
  if (raw == null || raw === "") return 0;
  const s = String(raw).trim();
  if (s.endsWith("%")) {
    const n = Number(s.slice(0, -1));
    return Number.isFinite(n) ? n / 100 : 0;
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n === 0) return 0;
  if (Math.abs(n) <= 1) return n;
  if (Math.abs(n) <= 100) return n / 100;
  return n / 100_000;
}

function parseSrcRect(xml) {
  const m = xml.match(/<(?:[a-z0-9]+:)?srcRect\b([^>]*)\/?>/i);
  if (!m) return null;
  const attr = (name) => {
    const a = m[1].match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"));
    return a ? parseOOXMLPercent(a[1]) : 0;
  };
  const rect = { l: attr("l"), t: attr("t"), r: attr("r"), b: attr("b") };
  if (rect.l + rect.t + rect.r + rect.b < 0.02) return null;
  return rect;
}

function parseVmlCropValue(raw) {
  if (raw == null || raw === "") return 0;
  const s = String(raw).trim();
  if (s.endsWith("%")) {
    const n = Number(s.slice(0, -1));
    return Number.isFinite(n) ? n / 100 : 0;
  }
  const numbered = s.replace(/f$/i, "");
  const n = Number(numbered);
  if (!Number.isFinite(n) || n === 0) return 0;
  if (Math.abs(n) <= 1) return n;
  return n / 65536;
}

function parseVmlCrop(xml) {
  const attr = (name) => {
    const a = xml.match(new RegExp(`\\b(?:o:)?crop${name}=["']([^"']*)["']`, "i"));
    return a ? parseVmlCropValue(a[1]) : 0;
  };
  const rect = { l: attr("left"), t: attr("top"), r: attr("right"), b: attr("bottom") };
  if (rect.l + rect.t + rect.r + rect.b < 0.02) return null;
  return rect;
}

function cropFromXml(xml) {
  return parseSrcRect(xml) ?? parseVmlCrop(xml);
}

async function applyRectCrop(photo, srcRect) {
  if (!photo) return null;
  if (!srcRect) return { ...photo, cropped: false };
  const cropped = await cropBySrcRect(photo.data, srcRect);
  if (!cropped) return { ...photo, cropped: false };
  return { ...photo, mime: cropped.mime, data: cropped.data, cropped: true };
}

async function materializePhoto(zip, rels, item) {
  const photo = await readPhotoAtPath(zip, rels.get(item.rid));
  if (!photo) return null;
  return applyRectCrop({ ...item, ...photo }, item.srcRect);
}

async function firstPhotoInFragment(zip, rels, xmlFragment) {
  for (const item of collectImageDrawings(xmlFragment)) {
    const photo = await materializePhoto(zip, rels, item);
    if (photo) return photo;
  }
  const srcRect = cropFromXml(xmlFragment);
  for (const rid of collectRelationshipIds(xmlFragment)) {
    const photo = await readPhotoAtPath(zip, rels.get(rid));
    if (photo) return applyRectCrop(photo, srcRect);
  }
  return null;
}

/**
 * Образец соцдема и экспорт портала: заголовок «Цветное фото:», затем таблица 1×2 —
 * левое фото → слот 1, правое → слот 2.
 */
async function extractPhotosFromPhotoTable(zip, rels, docXml, max = 2) {
  const scope = sliceAfterPhotoMarker(docXml);
  if (!scope) return [];

  const tables = [...scope.matchAll(/<w:tbl[\s\S]*?<\/w:tbl>/gi)].map((m) => m[0]);
  const photos = [];

  for (const tbl of tables) {
    const cells = [...tbl.matchAll(/<w:tc[\s>][\s\S]*?<\/w:tc>/gi)].map((m) => m[0]);
    for (let i = 0; i < Math.min(cells.length, max); i++) {
      const photo = await firstPhotoInFragment(zip, rels, cells[i]);
      if (photo) photos.push({ slot: i + 1, ...photo });
    }
    if (photos.length >= max) break;
  }

  return photos;
}

/** ~1 см в EMU — картинки меньше считаем значками/подписями, а не фото */
const MIN_PHOTO_EMU = 360000;

function parseEmu(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Все картинки документа в порядке следования: rId, позиция в XML, размер
 * и горизонтальное смещение для плавающих (wp:anchor) изображений.
 */
function collectImageDrawings(docXml) {
  const items = [];

  for (const m of docXml.matchAll(/<w:drawing\b[\s\S]*?<\/w:drawing>/g)) {
    const d = m[0];
    const rid =
      d.match(/\br:embed=["']([^"']+)["']/i)?.[1] ??
      d.match(/\br:link=["']([^"']+)["']/i)?.[1];
    if (!rid) continue;

    const extent = d.match(/<wp:extent\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/);
    const cx = extent ? parseEmu(extent[1]) : null;
    const cy = extent ? parseEmu(extent[2]) : null;

    let posH = null;
    const posHBlock = d.match(/<wp:positionH\b[^>]*>([\s\S]*?)<\/wp:positionH>/);
    if (posHBlock) {
      const off = posHBlock[1].match(/<wp:posOffset>(-?\d+)<\/wp:posOffset>/);
      if (off) {
        posH = parseEmu(off[1]);
      } else {
        const align = posHBlock[1].match(/<wp:align>(\w+)<\/wp:align>/)?.[1];
        if (align === "left" || align === "inside") posH = 0;
        else if (align === "center") posH = 3_000_000;
        else if (align === "right" || align === "outside") posH = 6_000_000;
      }
    }

    items.push({ rid, index: m.index, cx, cy, posH, srcRect: cropFromXml(d) });
  }

  // Старый Word (VML): обрезка croptop/cropbottom на v:shape / v:imagedata
  const vmlRanges = [];
  for (const m of docXml.matchAll(/<v:shape\b[\s\S]*?<\/v:shape>/gi)) {
    const block = m[0];
    vmlRanges.push([m.index, m.index + block.length]);
    const img = block.match(/<v:imagedata\b[^>]*>/i)?.[0];
    if (!img) continue;
    const rid =
      img.match(/\br:id=["']([^"']+)["']/i)?.[1] ??
      img.match(/\bo:relid=["']([^"']+)["']/i)?.[1];
    if (!rid) continue;
    items.push({
      rid,
      index: m.index,
      cx: null,
      cy: null,
      posH: null,
      srcRect: cropFromXml(block),
    });
  }
  for (const m of docXml.matchAll(/<v:imagedata\b[^>]*>/gi)) {
    if (vmlRanges.some(([a, b]) => m.index >= a && m.index < b)) continue;
    const rid =
      m[0].match(/\br:id=["']([^"']+)["']/i)?.[1] ??
      m[0].match(/\bo:relid=["']([^"']+)["']/i)?.[1];
    if (rid) {
      items.push({
        rid,
        index: m.index,
        cx: null,
        cy: null,
        posH: null,
        srcRect: parseVmlCrop(m[0]),
      });
    }
  }

  items.sort((a, b) => a.index - b.index);
  return items;
}

function isLikelyPhoto(item) {
  if (item.cx == null || item.cy == null) return true;
  return item.cx >= MIN_PHOTO_EMU && item.cy >= MIN_PHOTO_EMU;
}

/** Слоты: левое фото → 1, правое → 2 (по горизонтальной позиции); иначе — порядок в документе */
function assignSlots(photos) {
  const canUsePosition =
    photos.length === 2 &&
    photos.every((p) => p.posH != null) &&
    photos[0].posH !== photos[1].posH;
  const ordered = canUsePosition
    ? [...photos].sort((a, b) => a.posH - b.posH)
    : photos;
  return ordered.map((p, i) => ({
    slot: i + 1,
    mime: p.mime,
    data: p.data,
    cropped: Boolean(p.cropped),
  }));
}

/**
 * Образец соцдема: фото плавают над таблицей в конце документа (wp:anchor).
 * Берём последние `max` картинок «фотографического» размера и раскладываем по слотам.
 */
async function extractPhotosFromPhotoSection(zip, rels, docXml, max = 2) {
  const start = photoMarkerIndex(docXml);
  if (start < 0) return [];

  const sectionItems = collectImageDrawings(docXml).filter((c) => c.index >= start);
  const photos = [];
  for (const item of sectionItems) {
    if (!isLikelyPhoto(item)) continue;
    const photo = await materializePhoto(zip, rels, item);
    if (!photo) continue;
    photos.push(photo);
  }
  if (photos.length > 0) return assignSlots(photos.slice(-max));

  const scope = docXml.slice(start);
  const seen = new Set();
  for (const rid of collectRelationshipIds(scope)) {
    if (seen.has(rid)) continue;
    seen.add(rid);
    const photo = await readPhotoAtPath(zip, rels.get(rid));
    if (!photo || photo.data.length < MIN_PHOTO_BYTES) continue;
    photos.push({ index: start, posH: null, ...photo });
    if (photos.length >= max) break;
  }
  return assignSlots(photos);
}

async function extractPhotosFromDrawings(zip, rels, docXml, max = 2) {
  const careerIdx = docXml.search(/Работа\s+в\s+прошлом/i);
  const photoStart = photoMarkerIndex(docXml);
  const candidates = [];
  for (const item of collectImageDrawings(docXml)) {
    if (!isLikelyPhoto(item)) continue;
    const photo = await materializePhoto(zip, rels, item);
    if (!photo) continue;
    candidates.push(photo);
  }
  if (candidates.length === 0) return [];

  let pool = candidates;
  if (careerIdx >= 0) {
    const afterCareer = candidates.filter((c) => c.index >= careerIdx);
    if (afterCareer.length > 0) pool = afterCareer;
  }
  if (photoStart >= 0) {
    const inPhoto = pool.filter((c) => c.index >= photoStart);
    if (inPhoto.length > 0) pool = inPhoto;
  }
  return assignSlots(pool.slice(-max));
}

/** Порядок файлов как в document.xml (rId по порядку вставки) + остальные из media/ */
async function extractPhotosFromMediaOrdered(zip, rels, docXml, max = 2) {
  const paths = [];
  const seen = new Set();

  for (const item of collectImageDrawings(docXml)) {
    const p = rels.get(item.rid);
    if (p && isImageMediaPath(p) && !seen.has(p)) {
      seen.add(p);
      paths.push(p);
    }
  }

  const mediaPaths = Object.keys(zip.files)
    .filter((p) => /^word\/media\/[^/]+$/i.test(p.replace(/\\/g, "/")))
    .filter((p) => isImageMediaPath(p) || !SKIP_IMAGE_EXT.has(p.split(".").pop()?.toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  for (const p of mediaPaths) {
    const norm = p.replace(/^\/+/, "");
    if (!seen.has(norm)) {
      seen.add(norm);
      paths.push(norm);
    }
  }

  const photos = [];
  // Берём последние картинки документа (фото соцдема в конце), не логотип в шапке
  const tail = paths.slice(-max);
  for (let i = 0; i < tail.length; i++) {
    const photo = await readPhotoAtPath(zip, tail[i]);
    if (photo) photos.push({ slot: i + 1, ...photo });
  }
  return photos;
}

/** Если rId не сработали — берём 2 самых больших файла из word/media/ (в т.ч. EMF→PNG). */
async function extractPhotosFromMediaBySize(zip, max = 2) {
  const candidates = [];
  for (const path of Object.keys(zip.files)) {
    const norm = path.replace(/\\/g, "/");
    if (!/^word\/media\/[^/]+$/i.test(norm) || norm.endsWith("/")) continue;
    const photo = await readPhotoAtPath(zip, norm);
    if (!photo || photo.data.length < 400) continue;
    candidates.push(photo);
  }
  candidates.sort((a, b) => b.data.length - a.data.length);
  const unique = [];
  const large = candidates.filter((p) => p.data.length >= MIN_PHOTO_BYTES);
  const pool = large.length >= max ? large : candidates;
  for (const photo of pool) {
    if (unique.some((u) => u.data.equals(photo.data))) continue;
    unique.push(photo);
    if (unique.length >= max) break;
  }
  return unique.map((p, i) => ({ slot: i + 1, mime: p.mime, data: p.data }));
}

function betterPhoto(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (b.cropped && !a.cropped) return b;
  return a;
}

function mergePhotoSets(primary, secondary, max = 2) {
  const bySlot = new Map();
  const consider = (p) => {
    const slot = p.slot ?? bySlot.size + 1;
    if (slot < 1 || slot > max) return;
    bySlot.set(slot, betterPhoto(bySlot.get(slot), p));
  };
  for (const p of primary) consider(p);
  for (const p of secondary) consider(p);
  const out = [];
  for (let s = 1; s <= max; s++) {
    if (bySlot.has(s)) out.push({ ...bySlot.get(s), slot: s });
  }
  if (out.length >= max) return out;
  for (const p of [...primary, ...secondary]) {
    if (out.length >= max) break;
    if (out.some((x) => x.data?.equals?.(p.data) || x.data === p.data)) continue;
    out.push({ ...p, slot: out.length + 1 });
  }
  return out.slice(0, max);
}

async function refineBustSlot(photo, { force = true } = {}) {
  if (!photo?.data?.length) return photo;
  const beforeRatio = photoAspectRatio(photo.data) ?? 0;

  for (const useForce of force ? [false, true] : [false]) {
    const cropped = await cropToBust(photo.data, { force: useForce });
    if (!cropped?.data) continue;
    const afterRatio = photoAspectRatio(cropped.data) ?? beforeRatio;
    if (
      !sameImageBuffer(cropped.data, photo.data) ||
      afterRatio < beforeRatio - 0.04
    ) {
      return { mime: cropped.mime, data: cropped.data };
    }
    if (afterRatio <= BUST_SLOT_MAX_ASPECT) {
      return { mime: cropped.mime, data: cropped.data };
    }
  }

  const fallback = await cropToBustFallback(photo.data);
  if (fallback?.data && !sameImageBuffer(fallback.data, photo.data)) {
    return { mime: fallback.mime, data: fallback.data };
  }
  return photo;
}

/** В превью л/с слот 2 не должен выглядеть как полный рост. */
const BUST_SLOT_MAX_ASPECT = 1.58;

async function finalizeBustSlot(fullPhoto, bustPhoto) {
  let bust = await refineBustSlot(bustPhoto, { force: true });
  if (sameImageBuffer(fullPhoto.data, bust.data)) {
    const made = await cropToBust(fullPhoto.data, { force: true });
    if (made?.data && !sameImageBuffer(made.data, fullPhoto.data)) {
      bust = { mime: made.mime, data: made.data };
    }
  }
  const ratio = photoAspectRatio(bust.data) ?? 0;
  if (ratio >= BUST_SLOT_MAX_ASPECT) {
    const fallback = await cropToBustFallback(bust.data);
    if (fallback?.data) bust = { mime: fallback.mime, data: fallback.data };
  }
  return bust;
}

/**
 * Слот 1 — фото в полный рост (левое в таблице Word), слот 2 — по грудь (правое).
 * Меняем местами только если в документе явно перепутаны: слева по грудь, справа в рост.
 * Слот 2 при необходимости обрезается; готовый кадр по грудь не трогаем.
 */
async function ensureBustPhotos(photos, max = 2) {
  const list = photos.filter((p) => p?.data?.length);
  if (!list.length) return [];
  if (max < 2) {
    return [{ slot: 1, mime: list[0].mime, data: list[0].data }];
  }

  const ordered = [...list].sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99));

  if (ordered.length === 1) {
    const only = ordered[0];
    if (!looksLikeFullBody(only.data)) {
      return [{ slot: 2, mime: only.mime, data: only.data }];
    }
    const bust = await cropToBust(only.data, { force: true });
    const out = [{ slot: 1, mime: only.mime, data: only.data }];
    if (bust?.data) out.push({ slot: 2, mime: bust.mime, data: bust.data });
    return out;
  }

  let full = ordered[0];
  let bust = ordered[1];
  const leftKind = frameKind(full.data);
  const rightKind = frameKind(bust.data);

  if (leftKind === "bust" && rightKind === "full") {
    full = ordered[1];
    bust = ordered[0];
  }

  bust = await finalizeBustSlot(full, bust);

  return [
    { slot: 1, mime: full.mime, data: full.data },
    { slot: 2, mime: bust.mime, data: bust.data },
  ];
}

/**
 * До 2 фото. Собираем из таблицы, плавающих картинок и word/media/ — берём лучший результат.
 */
async function extractPhotos(zip, max = 2) {
  const rels = await loadDocumentRelationships(zip);
  const docFile =
    findZipEntry(zip, "word/document.xml") ?? zip.file("word/document.xml");
  const docXml = (await docFile?.async("string")) ?? "";

  const fromTable = await extractPhotosFromPhotoTable(zip, rels, docXml, max);
  const fromSection = await extractPhotosFromPhotoSection(zip, rels, docXml, max);
  const fromDrawings = await extractPhotosFromDrawings(zip, rels, docXml, max);
  const fromMedia = await extractPhotosFromMediaOrdered(zip, rels, docXml, max);
  const fromMediaSize = await extractPhotosFromMediaBySize(zip, max);

  if (fromTable.length >= max) {
    return ensureBustPhotos(fromTable, max);
  }

  let photos = mergePhotoSets(fromTable, fromSection, max);
  photos = mergePhotoSets(photos, fromDrawings, max);
  if (photos.length < max) {
    photos = mergePhotoSets(photos, fromMedia, max);
  }
  if (photos.length < max) {
    photos = mergePhotoSets(photos, fromMediaSize, max);
  }
  return ensureBustPhotos(photos, max);
}

/**
 * Разбор .docx в структуру карточки (формат экспорта портала и близкие документы).
 */
export async function parseSocdemDocxBuffer(buffer) {
  const { zip, paragraphs } = await extractParagraphs(buffer);
  if (!paragraphs.some((p) => /социально-демограф/i.test(p))) {
    throw new Error(
      "В документе нет заголовка «Социально-демографические данные». Проверьте, что это соцдем Word."
    );
  }

  const { fio, birth, profile } = parseLabeledFields(paragraphs);
  const { relatives, mourning: fromFamily } = foldDeathsFromRelatives(
    parseRelatives(paragraphs)
  );
  const commanders = parseCommanders(paragraphs);
  const career = parseCareer(paragraphs);
  const mourning = mergeMourning(parseMourning(paragraphs), fromFamily);
  const photos = await extractPhotos(zip);

  const warnings = [];
  if (!fio?.last_name || !fio?.first_name) {
    warnings.push("Не удалось однозначно прочитать Ф.И.О. из документа.");
  }
  if (!birth.birth_date) {
    warnings.push(
      "Не удалось прочитать дату рождения — проверьте строку «Дата рождения и место рождения» в Word."
    );
  } else if (!birth.birth_place) {
    warnings.push("Место рождения не распознано — при необходимости допишите в карточке вручную.");
  }
  if (!profile.phone) {
    warnings.push("Не найден номер телефона — для новой записи его нужно указать в документе или вручную.");
  }
  if (photos.length === 0) {
    const hasMedia = Object.keys(zip.files).some((p) =>
      /^word\/media\//i.test(p)
    );
    if (hasMedia) {
      const names = Object.keys(zip.files)
        .filter((p) => /^word\/media\/[^/]+$/i.test(p.replace(/\\/g, "/")) && !p.endsWith("/"))
        .join(", ");
      warnings.push(
        `В архиве Word есть файлы (${names || "media"}), но фото не прочитались. Повторите загрузку или вставьте фото в документ как рисунок, не ссылкой.`
      );
    }
  } else if (photos.length === 1) {
    warnings.push(
      "Из Word загружено 1 фото (в образце обычно 2 в таблице под «Цветное фото»)."
    );
  }

  return {
    fio,
    birth,
    profile,
    relatives,
    commanders,
    career,
    mourning,
    photos,
    warnings,
    paragraphs,
  };
}
