/** Общие проверки полей соцдема (фронт и бэкенд). */

const HAS_DIGIT = /\d/;
const NAME_CHARS = /^[\p{L}'\-]+$/u;

function trim(value) {
  return String(value ?? "").trim();
}

export function validatePersonName(value, label, { required = true } = {}) {
  const s = trim(value);
  if (!s) {
    return required ? `${label}: укажите значение` : null;
  }
  if (HAS_DIGIT.test(s)) {
    return `${label}: не используйте цифры`;
  }
  if (!NAME_CHARS.test(s)) {
    return `${label}: только буквы, дефис или апостроф`;
  }
  const letters = s.match(/\p{L}/gu);
  if (!letters || letters.length < 2) {
    return `${label}: слишком короткое значение`;
  }
  return null;
}

export function validatePhone(value, { required = true } = {}) {
  const s = trim(value);
  if (!s) {
    return required ? "Укажите телефон" : null;
  }
  if (/[a-zA-Zа-яА-ЯёЁ]/.test(s)) {
    return "Телефон: не должно быть букв";
  }
  const digits = s.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 11) {
    return "Телефон: укажите 10–11 цифр (как в номере для связи)";
  }
  return null;
}

export function validateBirthDate(value, { required = true } = {}) {
  if (value == null || value === "") {
    return required ? "Укажите дату рождения" : null;
  }
  const s = String(value).slice(0, 10);
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) {
    return "Некорректная дата рождения";
  }
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  if (d > today) {
    return "Дата рождения не может быть в будущем";
  }
  const ageYears = (today - d) / (365.25 * 86400000);
  if (ageYears > 100) {
    return "Проверьте дату рождения (возраст более 100 лет)";
  }
  if (ageYears < 15) {
    return "Проверьте дату рождения (возраст менее 15 лет)";
  }
  return null;
}

export function validateOptionalDate(value, label) {
  if (value == null || value === "") return null;
  const s = String(value).slice(0, 10);
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) {
    return `${label}: некорректная дата`;
  }
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (d > today) {
    return `${label}: дата не может быть в будущем`;
  }
  return null;
}

/** Текстовое поле соцдема: не «111» и не «!!!». */
export function validateProfileText(value, label) {
  const s = trim(value);
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    return `${label}: не может состоять только из цифр`;
  }
  if (!/\p{L}/u.test(s)) {
    return `${label}: укажите осмысленный текст (нужны буквы)`;
  }
  return null;
}

const PROFILE_TEXT_KEYS = {
  birth_place: "Место рождения",
  passport: "Паспортные данные",
  nationality: "Национальность",
  military_commissariat: "Военкомат",
  education: "Образование",
  graduated: "Окончил",
  specialty: "Специальность",
  specialization: "Специализация",
  foreign_languages: "Иностранные языки",
  been_abroad: "Был ли за границей",
  state_awards: "Государственные награды",
  military_rank: "Воинское звание",
  academic_degree: "Ученая степень",
  position: "Должность",
  is_deputy: "Депутат",
  contract_status: "Контракт",
  marital_status: "Семейное положение",
  registration_address: "Адрес регистрации",
  residence_address: "Адрес проживания",
  driver_license: "Водительское удостоверение",
  car: "Автомобиль",
};

/**
 * @returns {string|null} первая ошибка
 */
export function validateStudentPayload(body, { partial = false } = {}) {
  const need = (key) => !partial || Object.prototype.hasOwnProperty.call(body, key);

  if (need("last_name")) {
    const err = validatePersonName(body.last_name, "Фамилия");
    if (err) return err;
  }
  if (need("first_name")) {
    const err = validatePersonName(body.first_name, "Имя");
    if (err) return err;
  }
  if (need("patronymic") && trim(body.patronymic)) {
    const err = validatePersonName(body.patronymic, "Отчество", { required: false });
    if (err) return err;
  }
  if (need("phone")) {
    const err = validatePhone(body.phone, { required: !partial || trim(body.phone) !== "" });
    if (err) return err;
  }
  if (need("birth_date")) {
    const err = validateBirthDate(body.birth_date, {
      required: !partial || body.birth_date != null,
    });
    if (err) return err;
  }

  for (const [key, label] of Object.entries(PROFILE_TEXT_KEYS)) {
    if (!need(key)) continue;
    const err = validateProfileText(body[key], label);
    if (err) return err;
  }

  return null;
}

/**
 * @param {"relatives"|"commanders"|"career"|"mourning"} kind
 */
export function validateRecordPayload(kind, body) {
  const b = body ?? {};

  if (kind === "relatives" || kind === "commanders" || kind === "mourning") {
    const errName = validatePersonName(b.full_name, "ФИО");
    if (errName) return errName;
  }

  if (b.relation != null && trim(b.relation)) {
    const err = validateProfileText(b.relation, "Степень родства");
    if (err) return err;
  }

  if (b.phone != null && trim(b.phone)) {
    const err = validatePhone(b.phone, { required: false });
    if (err) return err;
  }

  if (b.birth_date) {
    const err = validateOptionalDate(b.birth_date, "Дата рождения");
    if (err) return err;
  }

  if (kind === "mourning" && b.death_date) {
    const err = validateOptionalDate(b.death_date, "Дата смерти");
    if (err) return err;
  }

  if (kind === "career") {
    if (b.date_from) {
      const err = validateOptionalDate(b.date_from, "Дата начала");
      if (err) return err;
    }
    if (b.date_to) {
      const err = validateOptionalDate(b.date_to, "Дата окончания");
      if (err) return err;
    }
    if (trim(b.description)) {
      const err = validateProfileText(b.description, "Описание работы");
      if (err) return err;
    }
  }

  if (kind === "commanders") {
    if (trim(b.position)) {
      const err = validateProfileText(b.position, "Должность");
      if (err) return err;
    }
    if (trim(b.rank)) {
      const err = validateProfileText(b.rank, "Звание");
      if (err) return err;
    }
  }

  if (kind === "mourning" && trim(b.cause_of_death)) {
    const err = validateProfileText(b.cause_of_death, "Причина смерти");
    if (err) return err;
  }

  return null;
}
