import { validateStudentPayload } from "../../socdemValidation.js";
import { pool } from "./db.js";
import { registerProfilePlaces } from "./placeCatalog.js";
import { originRegion } from "./regions.js";

/** Текстовые поля карточки соцдема (whitelist для INSERT/UPDATE) */
export const PROFILE_TEXT_COLUMNS = [
  "patronymic",
  "birth_place",
  "passport",
  "nationality",
  "military_commissariat",
  "education",
  "graduated",
  "specialty",
  "specialization",
  "foreign_languages",
  "been_abroad",
  "state_awards",
  "military_rank",
  "academic_degree",
  "position",
  "is_deputy",
  "contract_status",
  "marital_status",
  "registration_address",
  "residence_address",
  "driver_license",
  "car",
  "housing",
  "category",
];

const BASE_COLUMNS = [
  "group_id",
  "last_name",
  "first_name",
  "phone",
  "birth_date",
];

const ALL_COLUMNS = [...BASE_COLUMNS, ...PROFILE_TEXT_COLUMNS];

export const STUDENT_SELECT = `
  SELECT
    st.*,
    g.name AS group_name,
    EXISTS(
      SELECT 1 FROM student_photo p WHERE p.student_id = st.id AND p.slot = 1
    ) AS has_photo_1,
    EXISTS(
      SELECT 1 FROM student_photo p WHERE p.student_id = st.id AND p.slot = 2
    ) AS has_photo_2
  FROM student st
  LEFT JOIN student_group g ON g.id = st.group_id
`;

function categoryOf(body) {
  if (!body || !("category" in body) || body.category == null || body.category === "") {
    return "cadet";
  }
  const value = String(body.category).trim();
  return CATEGORIES.has(value) ? value : "";
}

function validateStudentBody(body, { partial = false } = {}) {
  const need = (key) => !partial || key in body;

  if (need("last_name") && !body.last_name?.trim()) return "Укажите фамилию";
  if (need("first_name") && !body.first_name?.trim()) return "Укажите имя";
  if (need("phone") && !body.phone?.trim()) return "Укажите телефон";
  if (need("birth_date") && !body.birth_date) return "Укажите дату рождения";
  if ("category" in body && body.category != null && body.category !== "" && !categoryOf(body)) {
    return "Некорректная категория";
  }
  const category = categoryOf(body);
  if (category === "cadet" && need("group_id") && !body.group_id) return "Выберите группу";

  const formatError = validateStudentPayload(body, { partial });
  if (formatError) return formatError;

  return null;
}

async function resolveGroupId(groupRef) {
  if (groupRef == null || groupRef === "") {
    return null;
  }
  const asNum = Number(groupRef);
  if (Number.isInteger(asNum) && asNum > 0) {
    const { rows } = await pool.query(
      "SELECT id FROM student_group WHERE id = $1",
      [asNum]
    );
    return rows[0]?.id ?? null;
  }
  const name = String(groupRef).trim();
  const { rows } = await pool.query(
    "SELECT id FROM student_group WHERE name = $1",
    [name]
  );
  return rows[0]?.id ?? null;
}

function normalizeMilitaryRankStored(value) {
  const raw = String(value ?? "")
    .replace(/\(.*?\)/gs, " ")
    .replace(/приказ\b[\s\S]*/i, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const ranks = [
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
  const hit = ranks.find((rank) => lower.startsWith(rank) || lower.includes(rank));
  const word = hit || raw.split(/[.,;]/)[0].trim();
  if (!word) return null;
  return word.charAt(0).toLocaleUpperCase("ru") + word.slice(1);
}

const HOUSING_OK = new Set(["barracks", "off_barracks"]);
const CATEGORIES = new Set(["cadet", "officer", "civilian"]);

function cleanValue(key, value) {
  if (key === "group_id") return value;
  if (key === "housing") {
    const t = String(value ?? "").trim();
    if (!t) return null;
    return HOUSING_OK.has(t) ? t : undefined;
  }
  if (key === "category") {
    const t = String(value ?? "").trim();
    return CATEGORIES.has(t) ? t : undefined;
  }
  if (typeof value === "string") {
    let t = value.trim();
    if (key === "military_rank" && t) t = normalizeMilitaryRankStored(t) ?? "";
    return t === "" ? null : t;
  }
  return value ?? null;
}

/** Берём из body только известные колонки; group_id приводим к id */
async function pickColumns(body) {
  const cols = [];
  const values = [];
  for (const key of ALL_COLUMNS) {
    if (!(key in body)) continue;
    if (key === "group_id") {
      if (body.group_id == null || body.group_id === "") {
        cols.push(key);
        values.push(null);
        continue;
      }
      const gid = await resolveGroupId(body.group_id);
      if (!gid) return { error: "Группа не найдена" };
      cols.push(key);
      values.push(gid);
      continue;
    }
    const cleaned = cleanValue(key, body[key]);
    if (key === "housing" && cleaned === undefined) {
      return { error: "Укажите: в казарме или вне казармы" };
    }
    if (key === "category" && cleaned === undefined) {
      return { error: "Некорректная категория" };
    }
    cols.push(key);
    values.push(cleaned);
  }
  return { cols, values };
}

async function ensureCadetHasGroup(id, cols, values) {
  let category;
  let groupId;
  const categoryIndex = cols.indexOf("category");
  const groupIndex = cols.indexOf("group_id");
  if (categoryIndex >= 0) category = values[categoryIndex];
  if (groupIndex >= 0) groupId = values[groupIndex];
  if (id && (categoryIndex < 0 || groupIndex < 0)) {
    const { rows } = await pool.query(
      "SELECT category, group_id FROM student WHERE id = $1",
      [id]
    );
    if (!rows[0]) return "Человек не найден";
    if (categoryIndex < 0) category = rows[0].category || "cadet";
    if (groupIndex < 0) groupId = rows[0].group_id;
  }
  if (!category) category = "cadet";
  if (category === "cadet" && !groupId) return "Выберите группу";
  return null;
}

export async function getStudentFull(id) {
  const { rows } = await pool.query(`${STUDENT_SELECT} WHERE st.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function listStudents(_req, res) {
  const { rows } = await pool.query(
    `${STUDENT_SELECT} ORDER BY st.last_name, st.first_name`
  );
  res.json(
    rows.map((s) => ({
      ...s,
      origin_region: originRegion(s.birth_place, s.registration_address),
    }))
  );
}

/** Полная карточка: человек + родственники + командиры + карьера */
export async function getStudentProfile(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Некорректный id" });
    return;
  }
  const student = await getStudentFull(id);
  if (!student) {
    res.status(404).json({ error: "Студент не найден" });
    return;
  }
  const [relatives, commanders, career, mourning, discipline] = await Promise.all([
    pool.query("SELECT * FROM student_relative WHERE student_id = $1 ORDER BY id", [id]),
    pool.query("SELECT * FROM student_commander WHERE student_id = $1 ORDER BY id", [id]),
    pool.query(
      "SELECT * FROM student_career WHERE student_id = $1 ORDER BY date_from, id",
      [id]
    ),
    pool.query(
      "SELECT * FROM student_mourning_event WHERE student_id = $1 ORDER BY death_date DESC, id",
      [id]
    ),
    pool.query(
      `SELECT * FROM student_discipline WHERE student_id = $1
       ORDER BY issued_at DESC, id DESC`,
      [id]
    ),
  ]);
  res.json({
    ...student,
    relatives: relatives.rows,
    commanders: commanders.rows,
    career: career.rows,
    mourning: mourning.rows,
    discipline: discipline.rows,
  });
}

export async function createStudent(req, res) {
  const error = validateStudentBody(req.body);
  if (error) {
    res.status(400).json({ error });
    return;
  }
  const picked = await pickColumns(req.body);
  if (picked.error) {
    res.status(400).json({ error: picked.error });
    return;
  }
  const groupError = await ensureCadetHasGroup(null, picked.cols, picked.values);
  if (groupError) {
    res.status(400).json({ error: groupError });
    return;
  }
  const placeholders = picked.cols.map((_, i) => `$${i + 1}`).join(", ");
  const { rows } = await pool.query(
    `INSERT INTO student (${picked.cols.join(", ")})
     VALUES (${placeholders})
     RETURNING id`,
    picked.values
  );
  await registerProfilePlaces(req.body, pool);
  res.status(201).json(await getStudentFull(rows[0].id));
}

export async function updateStudent(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Некорректный id" });
    return;
  }
  const error = validateStudentBody(req.body, { partial: true });
  if (error) {
    res.status(400).json({ error });
    return;
  }
  const picked = await pickColumns(req.body);
  if (picked.error) {
    res.status(400).json({ error: picked.error });
    return;
  }
  const groupError = await ensureCadetHasGroup(id, picked.cols, picked.values);
  if (groupError) {
    res.status(400).json({ error: groupError });
    return;
  }
  if (picked.cols.length === 0) {
    res.status(400).json({ error: "Нет данных для обновления" });
    return;
  }
  const sets = picked.cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const { rowCount } = await pool.query(
    `UPDATE student SET ${sets} WHERE id = $${picked.cols.length + 1}`,
    [...picked.values, id]
  );
  if (rowCount === 0) {
    res.status(404).json({ error: "Студент не найден" });
    return;
  }
  await registerProfilePlaces(req.body, pool);
  res.json(await getStudentFull(id));
}

export async function deleteStudent(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Некорректный id" });
    return;
  }
  const { rowCount } = await pool.query("DELETE FROM student WHERE id = $1", [
    id,
  ]);
  if (rowCount === 0) {
    res.status(404).json({ error: "Студент не найден" });
    return;
  }
  res.status(204).end();
}

export async function bulkCreateStudents(req, res) {
  const items = req.body?.students;
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: "Передайте массив students" });
    return;
  }
  const client = await pool.connect();
  const created = [];
  const errors = [];
  try {
    await client.query("BEGIN");
    for (let i = 0; i < items.length; i++) {
      const row = items[i];
      const err = validateStudentBody({
        ...row,
        group_id: row.group_id ?? row.group_name,
      });
      if (err) {
        errors.push({ line: i + 1, error: err });
        continue;
      }
      const gid = await resolveGroupId(row.group_id ?? row.group_name);
      if (!gid) {
        errors.push({
          line: i + 1,
          error: `Группа не найдена: ${row.group_name ?? row.group_id}`,
        });
        continue;
      }
      const { rows } = await client.query(
        `INSERT INTO student (group_id, last_name, first_name, patronymic, phone, birth_date)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          gid,
          row.last_name.trim(),
          row.first_name.trim(),
          row.patronymic?.trim() || null,
          row.phone.trim(),
          row.birth_date,
        ]
      );
      created.push(rows[0].id);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  res.status(201).json({
    created: created.length,
    errors,
  });
}
