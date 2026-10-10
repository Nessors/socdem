import {
  canLiftPenaltyWithCommendation,
  isDisciplineAuthorityId,
} from "../../disciplineAuthorities.js";
import { pool } from "./db.js";

export const DISCIPLINE_KINDS = {
  commendation: "Благодарность",
  reprimand: "Выговор",
  severe_reprimand: "Строгий выговор",
};

const PENALTY_KINDS = new Set(["reprimand", "severe_reprimand"]);

const SELECT = `
  SELECT
    d.id,
    d.student_id,
    d.kind,
    d.issued_at,
    d.reason,
    d.imposed_by,
    d.closes_id,
    d.closed_at,
    d.created_at,
    st.last_name,
    st.first_name,
    st.patronymic,
    g.id AS group_id,
    g.name AS group_name,
    closer.id AS lifted_by_id,
    closer.issued_at AS lifted_at,
    closed.kind AS closed_kind,
    closed.issued_at AS closed_issued_at,
    closed.imposed_by AS closed_penalty_imposed_by
  FROM student_discipline d
  JOIN student st ON st.id = d.student_id
  JOIN student_group g ON g.id = st.group_id
  LEFT JOIN student_discipline closer ON closer.closes_id = d.id
  LEFT JOIN student_discipline closed ON closed.id = d.closes_id
`;

function parseId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseDate(value) {
  if (value == null || value === "") return null;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export async function listDiscipline(_req, res) {
  const { rows } = await pool.query(`${SELECT} ORDER BY d.issued_at DESC, d.id DESC`);
  res.json(rows);
}

export async function createDiscipline(req, res) {
  const studentId = parseId(req.body?.student_id);
  const kind = String(req.body?.kind ?? "").trim();
  const reason =
    typeof req.body?.reason === "string" && req.body.reason.trim()
      ? req.body.reason.trim()
      : null;
  const issuedAt = parseDate(req.body?.issued_at) ?? new Date().toISOString().slice(0, 10);

  if (!studentId) {
    res.status(400).json({ error: "Укажите курсанта" });
    return;
  }
  if (!DISCIPLINE_KINDS[kind]) {
    res.status(400).json({ error: "Укажите меру: благодарность, выговор или строгий выговор" });
    return;
  }

  const imposedByRaw = req.body?.imposed_by;
  const imposedBy =
    imposedByRaw == null || imposedByRaw === ""
      ? null
      : String(imposedByRaw).trim();

  if (!imposedBy) {
    res.status(400).json({
      error:
        kind === "commendation"
          ? "Укажите, кем объявлена благодарность"
          : "Укажите, кем наложено взыскание",
    });
    return;
  }
  if (!isDisciplineAuthorityId(imposedBy)) {
    res.status(400).json({ error: "Некорректная должность «кем наложено»" });
    return;
  }

  const { rows: students } = await pool.query("SELECT id FROM student WHERE id = $1", [
    studentId,
  ]);
  if (!students[0]) {
    res.status(404).json({ error: "Курсант не найден" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let closesId = null;
    let penaltyImposedBy = null;
    if (kind === "commendation") {
      const closeRaw = req.body?.close_penalty_id;
      if (closeRaw === "latest" || closeRaw === true) {
        const { rows: open } = await client.query(
          `SELECT id, imposed_by FROM student_discipline
           WHERE student_id = $1
             AND kind IN ('reprimand', 'severe_reprimand')
             AND closed_at IS NULL
           ORDER BY issued_at DESC, id DESC
           LIMIT 1`,
          [studentId]
        );
        closesId = open[0]?.id ?? null;
        penaltyImposedBy = open[0]?.imposed_by ?? null;
      } else if (closeRaw != null && closeRaw !== "" && closeRaw !== false) {
        closesId = parseId(closeRaw);
        if (!closesId) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "Некорректное взыскание для снятия" });
          return;
        }
        const { rows: penalty } = await client.query(
          `SELECT id, student_id, kind, closed_at, imposed_by FROM student_discipline WHERE id = $1`,
          [closesId]
        );
        const p = penalty[0];
        if (!p || p.student_id !== studentId || !PENALTY_KINDS.has(p.kind)) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "Взыскание не найдено у этого курсанта" });
          return;
        }
        if (p.closed_at) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "Это взыскание уже снято" });
          return;
        }
        penaltyImposedBy = p.imposed_by ?? null;
      }
    }

    if (closesId) {
      if (!penaltyImposedBy || !isDisciplineAuthorityId(penaltyImposedBy)) {
        await client.query("ROLLBACK");
        res.status(400).json({
          error:
            "У взыскания не указано, кем наложено. Снятие недоступно — удалите запись и внесите взыскание заново с должностью.",
        });
        return;
      }
      if (!canLiftPenaltyWithCommendation(imposedBy, penaltyImposedBy)) {
        await client.query("ROLLBACK");
        res.status(400).json({
          error:
            "Этой должностью нельзя снять выбранное взыскание. Выберите должность с более высоким полномочием.",
        });
        return;
      }
    }

    let created;
    try {
      ({ rows: created } = await client.query(
        `INSERT INTO student_discipline (student_id, kind, issued_at, reason, imposed_by, closes_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, imposed_by`,
        [studentId, kind, issuedAt, reason, imposedBy, closesId]
      ));
    } catch (insertErr) {
      const msg = String(insertErr?.message ?? insertErr);
      if (/imposed_by/i.test(msg) && /column|does not exist/i.test(msg)) {
        await client.query(
          `ALTER TABLE student_discipline ADD COLUMN IF NOT EXISTS imposed_by TEXT`
        );
        ({ rows: created } = await client.query(
          `INSERT INTO student_discipline (student_id, kind, issued_at, reason, imposed_by, closes_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, imposed_by`,
          [studentId, kind, issuedAt, reason, imposedBy, closesId]
        ));
      } else {
        throw insertErr;
      }
    }

    if (!created[0]?.imposed_by) {
      await client.query(
        `UPDATE student_discipline SET imposed_by = $1 WHERE id = $2`,
        [imposedBy, created[0].id]
      );
    }

    if (closesId) {
      await client.query(
        `UPDATE student_discipline SET closed_at = $1 WHERE id = $2 AND closed_at IS NULL`,
        [issuedAt, closesId]
      );
    }

    await client.query("COMMIT");
    const { rows } = await pool.query(`${SELECT} WHERE d.id = $1`, [created[0].id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteDiscipline(req, res) {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Некорректный id" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id, kind, closes_id FROM student_discipline WHERE id = $1`,
      [id]
    );
    const row = rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Запись не найдена" });
      return;
    }
    if (row.kind === "commendation" && row.closes_id) {
      await client.query(
        `UPDATE student_discipline SET closed_at = NULL WHERE id = $1`,
        [row.closes_id]
      );
    }
    await client.query(`DELETE FROM student_discipline WHERE id = $1`, [id]);
    await client.query("COMMIT");
    res.status(204).end();
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
