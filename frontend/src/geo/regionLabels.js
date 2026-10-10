import { CANONICAL_REGIONS } from "./matchRegion.js";

/** Субъекты РФ и страны из справочника географии — только офлайн */
export const REGION_LABELS = [...CANONICAL_REGIONS].sort((a, b) =>
  a.localeCompare(b, "ru")
);
