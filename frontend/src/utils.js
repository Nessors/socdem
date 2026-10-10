import { formatDuty, formatRank } from "./serviceTitle.js";

export function fullName({ last_name, first_name, patronymic }) {
  return [last_name, first_name, patronymic].filter(Boolean).join(" ");
}

export function dashText(value) {
  const t = String(value ?? "").trim();
  return t || "—";
}

export function personCategory(person) {
  return person?.category === "officer" || person?.category === "civilian"
    ? person.category
    : "cadet";
}

export function personnelListPath(category) {
  if (category === "officer") return "/officers";
  if (category === "civilian") return "/civilians";
  return "/students";
}

/** Куда вести «назад» из карточки, если открыли из списка состава. */
export function personnelListReturn(category) {
  if (category === "officer") {
    return { pathname: "/officers", label: "К списку офицеров" };
  }
  if (category === "civilian") {
    return { pathname: "/civilians", label: "К гражданскому персоналу" };
  }
  return { pathname: "/students", label: "К личному составу" };
}

export function newPersonPath(category) {
  return `${personnelListPath(category)}/new`;
}

export function personSearchHay(person) {
  return `${formatDuty(person)} ${formatRank(person)} ${person.position ?? ""} ${person.military_rank ?? ""} ${fullName(person)}`;
}

const MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

/** Backend отдаёт даты строкой YYYY-MM-DD; берём первые 10 символов без часовых поясов */
export function toInputDate(isoDate) {
  if (!isoDate) return "";
  const s = String(isoDate).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

/** Уникальные значения полей карточек для подсказок при вводе */
export function mergeProfileSuggestions(fromCards, fromCatalog, placeKeys) {
  const merged = { ...fromCards };
  for (const key of placeKeys) {
    const set = new Set([...(fromCatalog?.[key] ?? []), ...(fromCards?.[key] ?? [])]);
    merged[key] = [...set].sort((a, b) => a.localeCompare(b, "ru"));
  }
  return merged;
}

export function buildProfileFieldSuggestions(people, fieldKeys) {
  const sets = Object.fromEntries(fieldKeys.map((key) => [key, new Set()]));
  for (const person of people) {
    for (const key of fieldKeys) {
      const value = String(person[key] ?? "").trim();
      if (value) sets[key].add(value);
    }
  }
  return Object.fromEntries(
    fieldKeys.map((key) => [key, [...sets[key]].sort((a, b) => a.localeCompare(b, "ru"))])
  );
}

/** 2006-11-24 -> «24 ноября 2006» */
export function formatDate(isoDate) {
  const s = toInputDate(isoDate);
  if (!s) return "—";
  const [y, m, d] = s.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** 2013-09-01 -> «01.09.2013» */
export function formatShortDate(isoDate) {
  const s = toInputDate(isoDate);
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return `${d}.${m}.${y}`;
}

/** 2006-11-24 -> «24 ноября» */
export function formatBirthdayDayMonth(isoDate) {
  const s = toInputDate(isoDate);
  if (!s) return "—";
  const [, m, d] = s.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Ближайший день рождения (сегодня или позже). */
export function nextBirthdayOn(isoDate, today = new Date()) {
  const s = toInputDate(isoDate);
  if (!s) return null;
  const [, m, d] = s.split("-").map(Number);
  const base = startOfDay(today);
  let next = new Date(base.getFullYear(), m - 1, d);
  if (next < base) next = new Date(base.getFullYear() + 1, m - 1, d);
  return next;
}

export function daysUntilBirthday(isoDate, today = new Date()) {
  const next = nextBirthdayOn(isoDate, today);
  if (!next) return null;
  const base = startOfDay(today);
  return Math.round((next - base) / 86400000);
}

const CSV_SEP = /[;,]/;

export function parseStudentsCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];

  const split = (line) => line.split(CSV_SEP).map((c) => c.trim());

  let start = 0;
  const first = split(lines[0]).map((h) => h.toLowerCase());
  const hasHeader =
    first.includes("фамилия") ||
    first.includes("last_name") ||
    first.includes("lastname");

  const rows = [];
  for (let i = hasHeader ? 1 : start; i < lines.length; i++) {
    const cols = split(lines[i]);
    if (cols.length < 5) continue;

    const [last_name, first_name, patronymic, phone, birth_date, group_name] =
      cols;
    rows.push({
      last_name,
      first_name,
      patronymic: patronymic || null,
      phone,
      birth_date: normalizeBirthDate(birth_date),
      group_name,
    });
  }
  return rows;
}

function normalizeBirthDate(raw) {
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return raw;
}
