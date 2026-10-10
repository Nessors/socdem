/** Распознавание «мать/отец» в поле relation родственников и печальных событий. */
export function isMotherRelation(text) {
  const s = String(text ?? "").toLowerCase();
  return /\b(мать|мама)\b/.test(s) || s.includes("мать") || s.includes("мама");
}

export function isFatherRelation(text) {
  const s = String(text ?? "").toLowerCase();
  return /\b(отец|папа)\b/.test(s) || s.includes("отец") || s.includes("папа");
}
