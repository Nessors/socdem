import { parseFlexibleDotDate, parseLongDateRu, parseShortDateDot } from "./socdemDocxFormat.js";

export const DEFAULT_DEATH_CAUSE = "не указана";

const DEATH_VERB =
  /погиб(?:ла|ли)?|умер(?:ла|ли)?|скончал(?:ся|ась|ись)|гибел[иьёе]/i;

export function hasDeathMention(text) {
  return Boolean(text && DEATH_VERB.test(String(text)));
}

function parseDateLoose(chunk) {
  if (!chunk) return null;
  return (
    parseLongDateRu(chunk) ||
    parseShortDateDot(chunk) ||
    parseFlexibleDotDate(chunk)
  );
}

/**
 * Достаёт дату/причину гибели из свободной строки соцдема
 * («Умер 07 июля 2011 года», «погиб 24.02.2022 в ходе СВО»).
 */
export function parseDeathMention(text) {
  if (!hasDeathMention(text)) return null;
  const src = String(text).replace(/\s+/g, " ").trim();

  let death_date = null;
  let yearOnly = false;

  const longAfterVerb = src.match(
    /(погиб(?:ла|ли)?|умер(?:ла|ли)?|скончал(?:ся|ась))\s*[–—\-]?\s*(\d{1,2}\s+[а-яё]+\s+\d{4})(?:\s+года?)?/i
  );
  if (longAfterVerb) death_date = parseLongDateRu(longAfterVerb[2]);

  if (!death_date) {
    const dotAfterVerb = src.match(
      /(погиб(?:ла|ли)?|умер(?:ла|ли)?|скончал(?:ся|ась))\s*[–—\-]?\s*(\d{1,2}[./]\d{1,2}[./]\d{2,4})/i
    );
    if (dotAfterVerb) death_date = parseDateLoose(dotAfterVerb[2]);
  }

  if (!death_date) {
    const sentence =
      src.split(/(?<=[.!?])\s+/).find((s) => DEATH_VERB.test(s)) ?? src;
    const anyLong = sentence.match(/(\d{1,2}\s+[а-яё]+\s+\d{4})(?:\s+года?)?/i);
    if (anyLong) death_date = parseLongDateRu(anyLong[1]);
    if (!death_date) {
      const anyDot = sentence.match(/(\d{1,2}[./]\d{1,2}[./]\d{2,4})/);
      if (anyDot) death_date = parseDateLoose(anyDot[1]);
    }
  }

  if (!death_date) {
    const yearAfterVerb = src.match(
      /(погиб(?:ла|ли)?|умер(?:ла|ли)?|скончал(?:ся|ась))\s*[–—\-]?\s*(?:в\s+)?(\d{4})(?:\s+году?)?/i
    );
    if (yearAfterVerb) {
      death_date = `${yearAfterVerb[2]}-01-01`;
      yearOnly = true;
    }
  }

  let cause = null;
  const causeM =
    src.match(/причин[аые]\s+(?:смерти\s*)?[—\-:]\s*(.+)$/i) ||
    src.match(/(?:погиб(?:ла)?|умер(?:ла)?|скончал(?:ся|ась))\s+от\s+(.+)$/i) ||
    src.match(/(?:^|[\s,;])в ходе\s+(.+)$/i) ||
    src.match(/(?:^|[\s,;])при исполнении\s+(.+)$/i);
  if (causeM) {
    cause = causeM[1]
      .replace(/\s*\d{1,2}[./]\d{1,2}[./]\d{2,4}\s*/g, " ")
      .replace(/\s*\d{1,2}\s+[а-яё]+\s+\d{4}(?:\s+года?)?\s*/gi, " ")
      .replace(/[.;]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!cause || /^\d{1,2}(\s|[./])/.test(cause)) cause = null;
    else if (/(?:^|[\s,;])в ходе\s/i.test(src) && !/^в ходе\s/i.test(cause)) {
      cause = `в ходе ${cause}`;
    } else if (/(?:^|[\s,;])при исполнении\s/i.test(src) && !/^при исполнении\s/i.test(cause)) {
      cause = `при исполнении ${cause}`;
    } else if (/(?:погиб(?:ла)?|умер(?:ла)?|скончал(?:ся|ась))\s+от\s/i.test(src) && !/^от\s/i.test(cause)) {
      cause = `от ${cause}`;
    }
  }

  const leftover = src
    .replace(
      /[.,;]?\s*(погиб(?:ла|ли)?|умер(?:ла|ли)?|скончал(?:ся|ась))\s*[–—\-]?.*$/i,
      ""
    )
    .replace(/[.,;]+$/g, "")
    .trim();

  return {
    death_date,
    cause_of_death: cause || DEFAULT_DEATH_CAUSE,
    leftover: leftover || null,
    year_only: yearOnly,
  };
}

function stripDeathFromName(name) {
  if (!name || !hasDeathMention(name)) return name;
  const parsed = parseDeathMention(name);
  const cleaned = parsed?.leftover?.trim();
  return cleaned || name.replace(/[.,;]?\s*(погиб(?:ла|ли)?|умер(?:ла|ли)?|скончал(?:ся|ась))\s*[–—\-]?.*$/i, "").trim();
}

/**
 * Если в карточке родственника указана гибель/смерть — отделяем ФИО
 * и собираем запись для «Печальных событий».
 */
export function splitRelativeDeath(rel) {
  if (!rel) return { relative: rel, mourning: null };
  const blob = [rel.full_name, rel.details].filter(Boolean).join(". ");
  const death = parseDeathMention(blob);
  const full_name = stripDeathFromName(rel.full_name) || rel.full_name;
  const relative = { ...rel, full_name };

  if (!death?.death_date || !full_name) {
    return { relative, mourning: null };
  }

  return {
    relative,
    mourning: {
      relation: rel.relation ?? null,
      full_name,
      death_date: death.death_date,
      cause_of_death: death.cause_of_death,
      notes: death.year_only ? "в соцдеме указан только год" : null,
    },
  };
}

export function foldDeathsFromRelatives(relatives) {
  const out = [];
  const mourning = [];
  for (const rel of relatives ?? []) {
    const { relative, mourning: event } = splitRelativeDeath(rel);
    out.push(relative);
    if (event) mourning.push(event);
  }
  return { relatives: out, mourning };
}

function nameKey(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function mergeMourning(fromSection, fromFamily) {
  const map = new Map();
  const put = (m) => {
    if (!m?.full_name || !m.death_date) return;
    const key = `${nameKey(m.full_name)}|${m.death_date}`;
    const prev = map.get(key);
    const betterCause = (c) => c && c !== DEFAULT_DEATH_CAUSE;
    if (!prev) {
      map.set(key, {
        relation: m.relation ?? null,
        full_name: m.full_name,
        death_date: m.death_date,
        cause_of_death: m.cause_of_death || DEFAULT_DEATH_CAUSE,
        notes: m.notes ?? null,
      });
      return;
    }
    map.set(key, {
      relation: m.relation || prev.relation,
      full_name: prev.full_name,
      death_date: prev.death_date,
      cause_of_death: betterCause(m.cause_of_death)
        ? m.cause_of_death
        : prev.cause_of_death,
      notes: m.notes || prev.notes,
    });
  };
  for (const m of fromFamily ?? []) put(m);
  for (const m of fromSection ?? []) put(m);
  return [...map.values()];
}
