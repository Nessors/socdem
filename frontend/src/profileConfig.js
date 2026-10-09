import { formatDate, formatShortDate } from "./utils";

/** Поля карточки соцдема (порядок как в образце документа) */
export const PROFILE_FIELDS = [
  { key: "birth_place", label: "Место рождения", wide: true },
  { key: "passport", label: "Паспортные данные" },
  { key: "nationality", label: "Национальность" },
  { key: "military_commissariat", label: "Призван в ВС РФ (военкомат)", wide: true },
  { key: "education", label: "Образование" },
  { key: "graduated", label: "Окончил (когда, что)", wide: true },
  { key: "specialty", label: "Специальность", wide: true },
  { key: "specialization", label: "Специализация", wide: true },
  { key: "foreign_languages", label: "Иностранные языки", wide: true },
  { key: "been_abroad", label: "Был ли за границей (когда, где)", wide: true },
  { key: "state_awards", label: "Государственные награды" },
  { key: "military_rank", label: "Воинское звание", wide: true },
  { key: "academic_degree", label: "Ученая степень, ученое звание" },
  { key: "position", label: "Должность", wide: true },
  { key: "is_deputy", label: "Является ли депутатом" },
  { key: "contract_status", label: "Контракт заключен" },
  { key: "marital_status", label: "Семейное положение" },
  { key: "registration_address", label: "Адрес по месту регистрации", wide: true },
  { key: "residence_address", label: "Адрес места жительства", wide: true },
  { key: "driver_license", label: "Водительское удостоверение" },
  { key: "car", label: "Автомобиль (водитель)" },
];

export const RELATIVE_FIELDS = [
  { key: "relation", label: "Кто (отец, мать, брат…)", required: true },
  { key: "full_name", label: "ФИО", required: true, wide: true },
  { key: "birth_date", label: "Дата рождения", type: "date" },
  { key: "phone", label: "Телефон для связи" },
  { key: "details", label: "Место, работа, должность", wide: true },
];

export const COMMANDER_FIELDS = [
  { key: "position", label: "Должность", required: true, wide: true },
  { key: "rank", label: "Звание" },
  { key: "full_name", label: "ФИО", required: true, wide: true },
  { key: "birth_date", label: "Дата рождения", type: "date" },
  { key: "in_position_since", label: "В должности с" },
  { key: "education", label: "Окончил (учебное заведение, год)", wide: true },
  { key: "contract", label: "Контракт", wide: true },
  { key: "marital_status", label: "Семейное положение" },
];

export const CAREER_FIELDS = [
  { key: "date_from", label: "С", type: "date", required: true },
  { key: "date_to", label: "По (пусто — настоящее время)", type: "date" },
  { key: "description", label: "Чем занимался", required: true, wide: true },
];

export const MOURNING_FIELDS = [
  { key: "relation", label: "Кто (отец, мать, брат…)" },
  { key: "full_name", label: "ФИО умершего", required: true, wide: true },
  { key: "death_date", label: "Дата смерти", type: "date", required: true },
  { key: "cause_of_death", label: "Причина смерти", required: true, wide: true },
  { key: "notes", label: "Дополнительно", wide: true },
];

export function relativeSummary(r) {
  const bits = [r.full_name];
  if (r.birth_date) bits.push(`${formatDate(r.birth_date)} г. р.`);
  if (r.details) bits.push(r.details);
  if (r.phone) bits.push(`тел. ${r.phone}`);
  return { title: r.relation, text: bits.join(", ") };
}

export function commanderSummary(c) {
  const bits = [[c.rank, c.full_name].filter(Boolean).join(" ")];
  if (c.birth_date) bits.push(`${formatDate(c.birth_date)} г. р.`);
  if (c.in_position_since) bits.push(`в должности с ${c.in_position_since}`);
  if (c.education) bits.push(`окончил ${c.education}`);
  if (c.contract) bits.push(`контракт ${c.contract}`);
  if (c.marital_status) bits.push(c.marital_status);
  return { title: c.position, text: bits.join(", ") };
}

export function careerSummary(c) {
  const to = c.date_to ? formatShortDate(c.date_to) : "настоящее время";
  return { title: `${formatShortDate(c.date_from)} – ${to}`, text: c.description };
}

export function mourningSummary(m) {
  const who = [m.relation, m.full_name].filter(Boolean).join(" — ");
  const bits = [`дата смерти ${formatDate(m.death_date)}`, `причина: ${m.cause_of_death}`];
  if (m.notes) bits.push(m.notes);
  return { title: who || m.full_name, text: bits.join("; ") };
}
