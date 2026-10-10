import { listCatalogRegionNames } from "./regions.js";

export const PLACE_KINDS = [
  "birth_place",
  "registration_address",
  "residence_address",
];

const KIND_SET = new Set(PLACE_KINDS);

export function normalizePlaceLabel(text) {
  return String(text ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizedPlaceKey(text) {
  return normalizePlaceLabel(text).toLowerCase().replace(/ё/g, "е");
}

async function upsertPlace(client, kind, label, sortRank = 0) {
  const clean = normalizePlaceLabel(label);
  const key = normalizedPlaceKey(clean);
  if (!key || key.length < 2) return;
  await client.query(
    `INSERT INTO place_catalog (kind, label, normalized, sort_rank)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (kind, normalized) DO NOTHING`,
    [kind, clean, key, sortRank]
  );
}

/** Субъекты РФ и страны из справочника географии + значения из карточек */
export async function maintainPlaceCatalog(client) {
  for (const name of listCatalogRegionNames()) {
    for (const kind of PLACE_KINDS) {
      await upsertPlace(client, kind, name, 10);
    }
  }
  for (const kind of PLACE_KINDS) {
    const { rows } = await client.query(
      `SELECT DISTINCT TRIM(${kind}) AS label
       FROM student
       WHERE ${kind} IS NOT NULL AND TRIM(${kind}) <> ''`
    );
    for (const row of rows) {
      await upsertPlace(client, kind, row.label, 0);
    }
  }
}

export async function registerProfilePlaces(body, client) {
  if (!client) return;
  if (!body || typeof body !== "object") return;
  for (const kind of PLACE_KINDS) {
    if (kind in body && body[kind]) {
      await upsertPlace(client, kind, body[kind], 0);
    }
  }
}

export async function listPlaceCatalogHandler(client, req, res) {
  const kind = String(req.query.kind ?? "").trim();
  const q = normalizedPlaceKey(req.query.q ?? "");

  if (kind && !KIND_SET.has(kind)) {
    res.status(400).json({ error: "Некорректный тип места" });
    return;
  }

  const params = [];
  const where = [];
  if (kind) {
    params.push(kind);
    where.push(`kind = $${params.length}`);
  }
  if (q) {
    params.push(`%${q.replace(/[%_\\]/g, "")}%`);
    where.push(`normalized LIKE $${params.length}`);
  }

  let sql = `SELECT kind, label FROM place_catalog`;
  if (where.length) sql += ` WHERE ${where.join(" AND ")}`;
  sql += ` ORDER BY sort_rank DESC, label`;

  const { rows } = await client.query(sql, params);

  if (kind) {
    res.json(rows.map((r) => r.label));
    return;
  }

  const grouped = Object.fromEntries(PLACE_KINDS.map((k) => [k, []]));
  for (const row of rows) {
    grouped[row.kind].push(row.label);
  }
  res.json(grouped);
}
