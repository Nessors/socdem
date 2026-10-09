/**
 * Автоопределение учебной группы по соцдему.
 *
 * Номер группы: <факультет><год набора><специальность>[/<подгруппа>]
 *   6 4 2        → 6 факультет, набор 2024, «Информационно-аналитические системы безопасности»
 *   6 4 1 / 11   → 6 факультет, набор 2024, «Разработка защищённого ПО», подгруппа 11
 *
 * Третья цифра:
 *   1 — Разработка защищённого программного обеспечения (подгруппы /11, /12, /13)
 *       Анализ безопасности компьютерных систем          (подгруппа /2)
 *   2 — Информационно-аналитические системы безопасности
 *   5 — Применение и эксплуатация автоматизированных систем специального назначения
 */

export const FACULTY_DIGIT = "6";

const SPECIALTY_RULES = [
  {
    key: "secure-dev",
    digit: "1",
    subgroups: ["11", "12", "13"],
    label: "Разработка защищённого программного обеспечения",
    test: (t) => /разработк[а-яё]*\s+защищ/i.test(t) || /защищ[а-яё]*\s+программн/i.test(t),
  },
  {
    key: "security-analysis",
    digit: "1",
    subgroups: ["2"],
    label: "Анализ безопасности компьютерных систем",
    test: (t) => /анализ[а-яё]*\s+безопасност/i.test(t),
  },
  {
    key: "info-analytics",
    digit: "2",
    subgroups: null,
    label: "Информационно-аналитические системы безопасности",
    test: (t) => /информационно[\s-]*аналитическ/i.test(t),
  },
  {
    key: "special-systems",
    digit: "5",
    subgroups: null,
    label: "Применение и эксплуатация автоматизированных систем специального назначения",
    test: (t) =>
      /применени[а-яё]*\s+и\s+эксплуатаци/i.test(t) ||
      /автоматизированн[а-яё]*\s+систем[а-яё]*\s+специальн/i.test(t),
  },
];

export function detectSpecialty(parsed) {
  const primary = parsed.profile?.specialty ?? "";
  for (const rule of SPECIALTY_RULES) {
    if (primary && rule.test(primary)) return rule;
  }
  const fallback = [parsed.profile?.specialization, parsed.profile?.position]
    .filter(Boolean)
    .join(" ");
  for (const rule of SPECIALTY_RULES) {
    if (fallback && rule.test(fallback)) return rule;
  }
  return null;
}

/** Год набора: «курсант …» в работе в прошлом → дата приказа о зачислении → год окончания школы */
export function detectAdmissionYear(parsed) {
  const fromCareer = (parsed.career ?? [])
    .filter((c) => c.date_from && /курсант|слушател/i.test(c.description ?? ""))
    .map((c) => Number(String(c.date_from).slice(0, 4)))
    .filter((y) => y >= 2000 && y <= 2100);
  if (fromCareer.length) return { year: Math.min(...fromCareer), source: "работа в прошлом" };

  const fromOrders = [];
  for (const field of [parsed.profile?.position, parsed.profile?.military_rank]) {
    for (const m of String(field ?? "").matchAll(/от\s+\d{1,2}\.\d{2}\.(\d{4})/g)) {
      const y = Number(m[1]);
      if (y >= 2000 && y <= 2100) fromOrders.push(y);
    }
  }
  if (fromOrders.length) return { year: Math.min(...fromOrders), source: "дата приказа" };

  const g = String(parsed.profile?.graduated ?? "").match(/\b(20\d{2})\b/);
  if (g) return { year: Number(g[1]), source: "год окончания учебного заведения" };

  return { year: null, source: null };
}

/** Явное упоминание группы в тексте («курсант 642 учебной группы», «группа 641/11») */
export function detectExplicitGroup(paragraphs) {
  const text = (paragraphs ?? []).join("\n");
  const num = String.raw`(6\d[125](?:\s*\/\s*(?:1[123]|2))?)`;
  const patterns = [
    new RegExp(`${num}\\s*(?:-?[йя]\\s*)?(?:уч(?:ебн[а-яё]*)?\\.?\\s*)?групп`, "i"),
    new RegExp(`групп[а-яё]*\\s*(?:№\\s*)?${num}`, "i"),
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1].replace(/\s*\/\s*/, "/");
  }
  return null;
}

function parseGroupName(name) {
  const m = String(name).match(/^(\d)(\d)(\d)(?:\/(\d+))?$/);
  if (!m) return null;
  return { faculty: m[1], yearDigit: m[2], specialtyDigit: m[3], subgroup: m[4] ?? null };
}

function byName(a, b) {
  return a.name.localeCompare(b.name, undefined, { numeric: true });
}

/**
 * @param parsed результат parseSocdemDocxBuffer
 * @param groups [{ id, name }]
 * @returns { group, candidates, confidence: "exact"|"ambiguous"|"none", reason, specialty, admission_year }
 */
export function resolveGroup(parsed, groups) {
  const specialtyRule = detectSpecialty(parsed);
  const { year, source: yearSource } = detectAdmissionYear(parsed);
  const base = {
    specialty: specialtyRule?.label ?? null,
    admission_year: year,
  };

  const explicit = detectExplicitGroup(parsed.paragraphs);
  if (explicit) {
    const g = groups.find((x) => x.name === explicit);
    if (g) {
      return {
        ...base,
        group: g,
        candidates: [g],
        confidence: "exact",
        reason: `в документе указана группа ${explicit}`,
      };
    }
  }

  if (!specialtyRule) {
    return {
      ...base,
      group: null,
      candidates: [],
      confidence: "none",
      reason: "в поле «Специальность» не распознано ни одно из известных направлений",
    };
  }

  const yearDigit = year != null ? String(year % 10) : null;
  const candidates = groups
    .filter((g) => {
      const p = parseGroupName(g.name);
      if (!p) return false;
      if (p.faculty !== FACULTY_DIGIT) return false;
      if (p.specialtyDigit !== specialtyRule.digit) return false;
      if (yearDigit != null && p.yearDigit !== yearDigit) return false;
      if (specialtyRule.subgroups) {
        return p.subgroup != null && specialtyRule.subgroups.includes(p.subgroup);
      }
      return true;
    })
    .sort(byName);

  const yearText =
    year != null ? `набор ${year} (${yearSource})` : "год набора не определён";

  if (candidates.length === 0) {
    return {
      ...base,
      group: null,
      candidates: [],
      confidence: "none",
      reason: `${specialtyRule.label}; ${yearText} — подходящей группы в базе нет`,
    };
  }
  if (candidates.length === 1) {
    return {
      ...base,
      group: candidates[0],
      candidates,
      confidence: "exact",
      reason: `${specialtyRule.label}; ${yearText}`,
    };
  }
  return {
    ...base,
    group: candidates[0],
    candidates,
    confidence: "ambiguous",
    reason: `${specialtyRule.label}; ${yearText} — несколько подгрупп: ${candidates
      .map((c) => c.name)
      .join(", ")}`,
  };
}
