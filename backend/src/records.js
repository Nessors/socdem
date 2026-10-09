import { pool } from "./db.js";
import { splitRelativeDeath } from "./deathFromSocdem.js";

/**
 * Универсальный CRUD для списков внутри карточки:
 * родственники, командиры, работа в прошлом.
 */
const KINDS = {
  relatives: {
    table: "student_relative",
    columns: ["relation", "full_name", "birth_date", "details", "phone"],
    required: ["relation", "full_name"],
    orderBy: "id",
  },
  commanders: {
    table: "student_commander",
    columns: [
      "position",
      "rank",
      "full_name",
      "birth_date",
      "in_position_since",
      "education",
      "contract",
      "marital_status",
    ],
    required: ["position", "full_name"],
    orderBy: "id",
  },
  career: {
    table: "student_career",
    columns: ["date_from", "date_to", "description"],
    required: ["date_from", "description"],
    orderBy: "date_from, id",
  },
  mourning: {
    table: "student_mourning_event",
    columns: ["relation", "full_name", "death_date", "cause_of_death", "notes"],
    required: ["full_name", "death_date", "cause_of_death"],
    orderBy: "death_date DESC, id",
  },
};

function getKind(req, res) {
  const kind = KINDS[req.params.kind];
  if (!kind) {
    res.status(404).json({ error: "Неизвестный раздел" });
    return null;
  }
  return kind;
}

function clean(body, kind) {
  const values = {};
  for (const col of kind.columns) {
    const raw = body[col];
    values[col] =
      typeof raw === "string" ? (raw.trim() === "" ? null : raw.trim()) : raw ?? null;
  }
  return values;
}

function missingRequired(values, kind) {
  return kind.required.find((col) => values[col] == null);
}

const LABELS = {
  relation: "степень родства",
  full_name: "ФИО",
  position: "должность",
  date_from: "дата начала",
  description: "описание",
  death_date: "дата смерти",
  cause_of_death: "причина смерти",
};

async function studentExists(id) {
  const { rowCount } = await pool.query("SELECT 1 FROM student WHERE id = $1", [id]);
  return rowCount > 0;
}

export async function upsertMourningFromRelative(db, studentId, relative) {
  const { relative: cleaned, mourning } = splitRelativeDeath(relative);
  if (!mourning) return cleaned;
  const { rows } = await db.query(
    `SELECT id, cause_of_death FROM student_mourning_event
     WHERE student_id = $1
       AND lower(full_name) = lower($2)
       AND death_date = $3::date`,
    [studentId, mourning.full_name, mourning.death_date]
  );
  if (!rows[0]) {
    await db.query(
      `INSERT INTO student_mourning_event
         (student_id, relation, full_name, death_date, cause_of_death, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        studentId,
        mourning.relation,
        mourning.full_name,
        mourning.death_date,
        mourning.cause_of_death,
        mourning.notes,
      ]
    );
  } else if (
    rows[0].cause_of_death === "не указана" &&
    mourning.cause_of_death &&
    mourning.cause_of_death !== "не указана"
  ) {
    await db.query(
      `UPDATE student_mourning_event
       SET cause_of_death = $1, notes = COALESCE($2, notes), relation = COALESCE($3, relation)
       WHERE id = $4`,
      [mourning.cause_of_death, mourning.notes, mourning.relation, rows[0].id]
    );
  }
  return cleaned;
}

export async function createRecord(req, res) {
  const kind = getKind(req, res);
  if (!kind) return;
  const studentId = Number(req.params.id);
  if (!Number.isInteger(studentId) || !(await studentExists(studentId))) {
    res.status(404).json({ error: "Студент не найден" });
    return;
  }
  let values = clean(req.body, kind);
  if (req.params.kind === "relatives") {
    values = await upsertMourningFromRelative(pool, studentId, values);
  }
  const miss = missingRequired(values, kind);
  if (miss) {
    res.status(400).json({ error: `Заполните поле: ${LABELS[miss] ?? miss}` });
    return;
  }
  const cols = ["student_id", ...kind.columns];
  const params = [studentId, ...kind.columns.map((c) => values[c])];
  const placeholders = params.map((_, i) => `$${i + 1}`).join(", ");
  const { rows } = await pool.query(
    `INSERT INTO ${kind.table} (${cols.join(", ")}) VALUES (${placeholders}) RETURNING *`,
    params
  );
  res.status(201).json(rows[0]);
}

export async function updateRecord(req, res) {
  const kind = getKind(req, res);
  if (!kind) return;
  const studentId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  if (!Number.isInteger(studentId) || !Number.isInteger(itemId)) {
    res.status(400).json({ error: "Некорректный id" });
    return;
  }
  let values = clean(req.body, kind);
  if (req.params.kind === "relatives") {
    values = await upsertMourningFromRelative(pool, studentId, values);
  }
  const miss = missingRequired(values, kind);
  if (miss) {
    res.status(400).json({ error: `Заполните поле: ${LABELS[miss] ?? miss}` });
    return;
  }
  const sets = kind.columns.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const params = [...kind.columns.map((c) => values[c]), itemId, studentId];
  const { rows } = await pool.query(
    `UPDATE ${kind.table} SET ${sets}
     WHERE id = $${kind.columns.length + 1} AND student_id = $${kind.columns.length + 2}
     RETURNING *`,
    params
  );
  if (!rows[0]) {
    res.status(404).json({ error: "Запись не найдена" });
    return;
  }
  res.json(rows[0]);
}

export async function deleteRecord(req, res) {
  const kind = getKind(req, res);
  if (!kind) return;
  const studentId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  if (!Number.isInteger(studentId) || !Number.isInteger(itemId)) {
    res.status(400).json({ error: "Некорректный id" });
    return;
  }
  const { rowCount } = await pool.query(
    `DELETE FROM ${kind.table} WHERE id = $1 AND student_id = $2`,
    [itemId, studentId]
  );
  if (rowCount === 0) {
    res.status(404).json({ error: "Запись не найдена" });
    return;
  }
  res.status(204).end();
}
