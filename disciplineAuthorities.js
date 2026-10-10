/** Кем наложена дисциплинарная мера (ключ хранится в БД). */
export const DISCIPLINE_AUTHORITIES = [
  { id: "course_chief", label: "Начальник курса" },
  { id: "faculty_chief", label: "Начальник факультета" },
  {
    id: "faculty_deputy_study",
    label: "Заместитель начальника факультета по учебной и научной работе",
  },
  {
    id: "faculty_deputy_vpr",
    label: "Заместитель начальника факультета по военно-политической работе",
  },
  {
    id: "academy_deputy_vpr",
    label: "Заместитель начальника академии по военно-политической работе",
  },
  { id: "academy_deputy", label: "Заместитель начальника академии" },
  {
    id: "academy_deputy_study",
    label: "Заместитель начальника академии по учебной и научной работе",
  },
  { id: "academy_chief", label: "Начальник академии" },
];

const BY_ID = Object.fromEntries(DISCIPLINE_AUTHORITIES.map((a) => [a.id, a.label]));

export function disciplineAuthorityLabel(id) {
  if (!id) return "";
  return BY_ID[id] ?? id;
}

export function isDisciplineAuthorityId(id) {
  return Boolean(id && BY_ID[id]);
}

const ACADEMY_DEPUTY_IDS = [
  "academy_deputy",
  "academy_deputy_vpr",
  "academy_deputy_study",
];

const ALL_AUTHORITY_IDS = DISCIPLINE_AUTHORITIES.map((a) => a.id);

const ACADEMY_TOP = [...ACADEMY_DEPUTY_IDS, "academy_chief"];

/**
 * Кто может объявить благодарность и снять взыскание, наложенное должностью penaltyImposedBy.
 * ЗНА: только тот же зам, что выдал, и начальник академии.
 * НФ: нач. факультета, все ЗНА и нач. академии.
 * ЗНФ: нач. факультета и выше. НК: любая должность из списка.
 */
export function authoritiesAllowedToLiftPenalty(penaltyImposedBy) {
  if (!penaltyImposedBy || !BY_ID[penaltyImposedBy]) {
    return [];
  }
  switch (penaltyImposedBy) {
    case "academy_chief":
      return ["academy_chief"];
    case "academy_deputy":
    case "academy_deputy_vpr":
    case "academy_deputy_study":
      return [penaltyImposedBy, "academy_chief"];
    case "faculty_chief":
      return ["faculty_chief", ...ACADEMY_TOP];
    case "faculty_deputy_study":
    case "faculty_deputy_vpr":
      return ["faculty_chief", ...ACADEMY_TOP];
    case "course_chief":
      return ALL_AUTHORITY_IDS;
    default:
      return [];
  }
}

export function canLiftPenaltyWithCommendation(commendationBy, penaltyImposedBy) {
  if (!commendationBy || !penaltyImposedBy || !BY_ID[penaltyImposedBy]) {
    return false;
  }
  return authoritiesAllowedToLiftPenalty(penaltyImposedBy).includes(commendationBy);
}

export function liftPenaltyRuleHint(penaltyImposedBy) {
  if (!penaltyImposedBy || !BY_ID[penaltyImposedBy]) {
    return "У этого взыскания не указано, кем наложено — снять благодарностью нельзя. Удалите запись и внесите взыскание заново с должностью.";
  }
  const who = disciplineAuthorityLabel(penaltyImposedBy);
  const allowed = authoritiesAllowedToLiftPenalty(penaltyImposedBy).map(disciplineAuthorityLabel);
  return `Взыскание от «${who}» снимает: ${allowed.join("; ")}.`;
}
