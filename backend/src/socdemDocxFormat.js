/** Метки полей — должны совпадать с exportDocx.js */

export const PROFILE_LABEL_TO_KEY = {
  "Паспортные данные": "passport",
  Национальность: "nationality",
  "Призван в ВС РФ": "military_commissariat",
  Образование: "education",
  "Окончил (когда, что)": "graduated",
  Специальность: "specialty",
  Специализация: "specialization",
  "Иностранные языки": "foreign_languages",
  "Был ли за границей (когда, где)": "been_abroad",
  "Государственные награды": "state_awards",
  "Воинское звание": "military_rank",
  "Ученая степень, ученое звание": "academic_degree",
  Должность: "position",
  "Является ли депутатом": "is_deputy",
  "Контракт заключен": "contract_status",
  "Номер телефона": "phone",
  "Семейное положение": "marital_status",
  "Адрес по месту регистрации": "registration_address",
  "Адрес места жительства": "residence_address",
  "Водительское удостоверение": "driver_license",
  "Автомобиль (водитель)": "car",
};

export const SECTION_MARKERS = {
  commanders: "Данные на командиров:",
  career: "Работа в прошлом:",
  mourning: "Печальные события:",
  photos: "Цветное фото:",
};

export const MONTHS = {
  января: 1,
  февраля: 2,
  марта: 3,
  апреля: 4,
  мая: 5,
  июня: 6,
  июля: 7,
  августа: 8,
  сентября: 9,
  октября: 10,
  ноября: 11,
  декабря: 12,
};

export function parseLongDateRu(text) {
  if (!text) return null;
  const m = String(text).match(/(\d{1,2})\s+([а-яё]+)\s+(\d{4})/i);
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  const d = String(m[1]).padStart(2, "0");
  const mo = String(month).padStart(2, "0");
  return `${m[3]}-${mo}-${d}`;
}

export function parseShortDateDot(text) {
  const m = String(text).trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** 7.07.2011 / 07/07/11 → YYYY-MM-DD */
export function parseFlexibleDotDate(text) {
  const m = String(text)
    .trim()
    .match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (!m) return null;
  let year = m[3];
  if (year.length === 2) year = Number(year) > 30 ? `19${year}` : `20${year}`;
  const month = Number(m[2]);
  const day = Number(m[1]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalizeFieldValue(raw) {
  if (raw == null) return null;
  let v = String(raw).trim();
  if (!v || v === "—" || v === "-") return null;
  if (v.endsWith(";")) v = v.slice(0, -1).trim();
  return v || null;
}

export function parseFioLine(value) {
  const v = normalizeFieldValue(value);
  if (!v) return null;
  const parts = v.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  const last_name = parts[0];
  const first_name = parts[1];
  const patronymic = parts.length > 2 ? parts.slice(2).join(" ") : null;
  return { last_name, first_name, patronymic };
}

export function parseBirthLine(value) {
  const v = normalizeFieldValue(value);
  if (!v) return { birth_date: null, birth_place: null };

  // 24.11.2006 г.р., г. Москва / 24.11.2006, ...
  const dotM = v.match(
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})\s*(?:г\.?\s*р\.?)?(?:[;,]\s*(.*))?$/i
  );
  if (dotM) {
    const d = String(dotM[1]).padStart(2, "0");
    const mo = String(dotM[2]).padStart(2, "0");
    return {
      birth_date: `${dotM[3]}-${mo}-${d}`,
      birth_place: dotM[4]?.trim() || null,
    };
  }

  // 24 ноября 2006 года, место / без слова «года»
  const dateM = v.match(
    /^(\d{1,2}\s+[а-яёА-ЯЁ]+\s+\d{4})(?:\s+года?)?(?:[;,]\s*(.*))?$/i
  );
  if (dateM) {
    return {
      birth_date: parseLongDateRu(dateM[1]),
      birth_place: dateM[2]?.trim() || null,
    };
  }

  const iso = v.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) {
    const rest = v.slice(iso[0].length).replace(/^[,;\s]+/, "").trim();
    return { birth_date: iso[1], birth_place: rest || null };
  }

  // только дата где-то в строке + остальное место
  const inline = v.match(
    /(\d{1,2}\s+[а-яёА-ЯЁ]+\s+\d{4})(?:\s+года?)?(?:[;,]\s*(.*))?/i
  );
  if (inline) {
    return {
      birth_date: parseLongDateRu(inline[1]),
      birth_place: inline[2]?.trim() || v.replace(inline[0], "").replace(/^[,;\s]+/, "").trim() || null,
    };
  }
  const inlineDot = v.match(/(\d{1,2}\.\d{1,2}\.\d{4})/);
  if (inlineDot) {
    const iso2 = parseShortDateDot(inlineDot[1]);
    const place = v.replace(inlineDot[0], "").replace(/^[,;\sг.р.]+/i, "").trim();
    return { birth_date: iso2, birth_place: place || null };
  }

  return { birth_date: null, birth_place: v };
}

/** Метка «дата (и место) рождения» — варианты из разных шаблонов Word */
export function parseBirthFromParagraphs(paragraphs) {
  const isFieldStart = (line) =>
    /^[\p{L}\d][\p{L}\d\s().«»\-–—]{0,80}:\s*/u.test(line);

  for (let i = 0; i < paragraphs.length; i++) {
    const line = paragraphs[i];
    const m = line.match(
      /^Дата(?:\s+рождения)?(?:\s+и\s+место\s+рождения)?\s*:\s*(.*)$/iu
    );
    if (!m) continue;

    let value = m[1].trim();
    if (!value && i + 1 < paragraphs.length) {
      const next = paragraphs[i + 1].trim();
      if (next && !isFieldStart(next)) {
        value = next;
        i += 1;
      }
    }
    const b = parseBirthLine(value);
    if (b.birth_date || b.birth_place) return b;
  }

  // Иногда дата/место — отдельной строкой сразу после Ф.И.О. (без метки в том же абзаце)
  const fioIdx = paragraphs.findIndex((p) => /^Ф\.?\s*И\.?\s*О\.?\s*:/iu.test(p));
  if (fioIdx >= 0 && fioIdx + 1 < paragraphs.length) {
    const next = paragraphs[fioIdx + 1];
    if (next && !isFieldStart(next)) {
      const b = parseBirthLine(next);
      if (b.birth_date) return b;
    }
  }

  return { birth_date: null, birth_place: null };
}

/** Подписи поля телефона в разных шаблонах Word */
export const PHONE_FIELD_LABELS = [
  "Номер телефона",
  "Телефон",
  "Тел.",
  "Тел",
  "Мобильный телефон",
  "Номер мобильного телефона",
  "Сотовый телефон",
  "Контактный телефон",
];

export function isLikelyFieldLine(line) {
  return /^[\p{L}\d][\p{L}\d\s().«»\-–—]{0,80}:\s*/u.test(line);
}

export function lineFieldValue(line, label) {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = String(line).match(new RegExp(`^${esc}\\s*:\\s*(.*)$`, "iu"));
  return m ? m[1] : null;
}

/** Вытащить номер из произвольной строки (8…, +7…, (921) …) */
export function extractPhoneFromText(text) {
  if (text == null) return null;
  let t = String(text).trim();
  if (!t) return null;

  t = t
    .replace(/^тел\.?\s*/i, "")
    .replace(/^моб\.?\s*/i, "")
    .replace(/^номер\s*/i, "")
    .trim();

  const patterns = [
    /(?:\+7|8)[\s\-.(]*\d{3}[\s\-).]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}/,
    /(?:\+7|8)\d{10}/,
    /\+7\d{10}/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) return formatPhoneDigits(m[0]);
  }

  const tenMobile = t.match(/\b(9\d{9})\b/);
  if (tenMobile) return formatPhoneDigits(tenMobile[1]);

  const digits = t.replace(/\D/g, "");
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    return formatPhoneDigits(digits);
  }
  if (digits.length === 10 && digits.startsWith("9")) {
    return formatPhoneDigits("7" + digits);
  }

  return null;
}

/** Единый вид для базы: 8XXXXXXXXXX (как в большинстве соцдемов) */
function formatPhoneDigits(raw) {
  let d = String(raw).replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("8")) d = "7" + d.slice(1);
  if (d.length === 10 && d.startsWith("9")) d = "7" + d;
  if (d.length === 11 && d.startsWith("7")) {
    return "8" + d.slice(1);
  }
  return null;
}

export function normalizePhone(raw) {
  const v = normalizeFieldValue(raw);
  if (!v) return null;
  return extractPhoneFromText(v) ?? (/\d{10,}/.test(v) ? extractPhoneFromText(v) : null);
}

/** Телефон курсанта: метка поля, строка ниже, или явный номер в шапке карточки */
export function parsePhoneFromParagraphs(paragraphs) {
  for (const label of PHONE_FIELD_LABELS) {
    for (let i = 0; i < paragraphs.length; i++) {
      const direct = lineFieldValue(paragraphs[i], label);
      if (direct == null) continue;

      let value = direct;
      if (!normalizePhone(value) && i + 1 < paragraphs.length) {
        const next = paragraphs[i + 1].trim();
        if (next && !isLikelyFieldLine(next)) {
          value = next;
          i += 1;
        }
      }
      const ph = normalizePhone(value);
      if (ph) return ph;
    }
  }

  const stopRe =
    /^(Отец|Мать|Брат|Сестра|Данные на командиров|Адрес по месту|Работа в прошлом|Цветное фото)/i;

  for (const line of paragraphs) {
    if (stopRe.test(line)) break;

    if (/телефон/i.test(line)) {
      const afterLabel = line.replace(/^[^:]*:\s*/, "").trim();
      const ph = normalizePhone(afterLabel) ?? extractPhoneFromText(line);
      if (ph) return ph;
    }

    if (isLikelyFieldLine(line)) continue;
    if (/^\d{1,2}\s+[а-яёА-ЯЁ]+\s+\d{4}/.test(line)) continue;

    const ph = extractPhoneFromText(line);
    if (ph) return ph;
  }

  return null;
}
