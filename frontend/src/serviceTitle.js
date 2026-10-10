const DUTIES = [
  {
    title: "Заместитель командира взвода",
    re: /заместител[а-яё]*\s+командир[а-яё]*\s+взвод|зам\.?\s*ком(?:андира)?\.?\s*взвод|\bзкв\b/i,
  },
  {
    title: "Командир взвода",
    re: /командир[а-яё]*\s+взвод/i,
  },
  {
    title: "Командир отделения",
    re: /командир[а-яё]*\s+отделен/i,
  },
  {
    title: "Старшина",
    re: /старшин/i,
  },
  {
    title: "Курсант",
    re: /курсант|слушател/i,
  },
];

const RANKS = [
  "младший лейтенант",
  "старший лейтенант",
  "старший прапорщик",
  "младший сержант",
  "старший сержант",
  "генерал-полковник",
  "генерал-лейтенант",
  "генерал-майор",
  "подполковник",
  "прапорщик",
  "лейтенант",
  "ефрейтор",
  "рядовой",
  "сержант",
  "старшина",
  "капитан",
  "майор",
  "полковник",
  "мичман",
];

/** Звания для выбора в форме — только наименование, без приказов */
export const MILITARY_RANKS = [
  "Рядовой",
  "Ефрейтор",
  "Младший сержант",
  "Сержант",
  "Старший сержант",
  "Старшина",
  "Прапорщик",
  "Старший прапорщик",
  "Мичман",
  "Младший лейтенант",
  "Лейтенант",
  "Старший лейтенант",
  "Капитан",
  "Майор",
  "Подполковник",
  "Полковник",
  "Генерал-майор",
  "Генерал-лейтенант",
  "Генерал-полковник",
];

export function capFirst(text) {
  const t = String(text ?? "").trim();
  if (!t) return "";
  return t.charAt(0).toLocaleUpperCase("ru") + t.slice(1);
}

export function stripOrder(text) {
  return String(text ?? "")
    .replace(/\(.*?\)/gs, " ")
    .replace(/приказ\b[\s\S]*/i, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectDuty(position) {
  const raw = stripOrder(position);
  if (!raw) return "Курсант";
  for (const duty of DUTIES) {
    if (duty.re.test(raw)) return duty.title;
  }
  return "Курсант";
}

/** Учебный год: с сентября. */
export function academicYear(now = new Date()) {
  return now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
}

/**
 * Код курса из группы: факультет + номер курса.
 * 641 при наборе 2024 в учебном 2026/27 → «63».
 */
export function courseCodeFromGroup(groupName, now = new Date()) {
  const m = String(groupName ?? "").match(/^(\d)(\d)/);
  if (!m) return "";
  const faculty = m[1];
  const admissionYear = 2020 + Number(m[2]);
  const course = academicYear(now) - admissionYear + 1;
  if (course < 1 || course > 6) return `${faculty}${m[2]}`;
  return `${faculty}${course}`;
}

export function formatDuty(person, now) {
  if (person?.category === "officer" || person?.category === "civilian") {
    const raw = stripOrder(person?.position);
    return raw ? capFirst(raw) : "";
  }
  const code = courseCodeFromGroup(person?.group_name, now);
  const duty = detectDuty(person?.position);
  if (code) return `${duty} ${code} курса`;
  return duty;
}

export function normalizeMilitaryRank(text) {
  const raw = stripOrder(text);
  if (!raw) return "";
  const lower = raw.toLowerCase();
  const hit = RANKS.find((rank) => lower.startsWith(rank) || lower.includes(rank));
  return capFirst(hit || raw.split(/[.,;]/)[0].trim());
}

export function formatRank(person) {
  return normalizeMilitaryRank(person?.military_rank);
}
