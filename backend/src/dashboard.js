import { pool } from "./db.js";
import { originRegion, tallyOrigins } from "./regions.js";

export async function getDashboard(_req, res) {
  const { rows: students } = await pool.query(`
    SELECT st.id, st.birth_place, st.registration_address, st.residence_address,
           g.name AS group_name
    FROM student st
    JOIN student_group g ON g.id = st.group_id
  `);

  const { rows: [counts] } = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE housing = 'barracks')::int AS barracks,
      COUNT(*) FILTER (WHERE housing = 'off_barracks')::int AS off_barracks
    FROM student
  `);
  const total = counts.total;
  const barracks = counts.barracks;
  const offBarracks = counts.off_barracks;

  const { rows: relByType } = await pool.query(`
    SELECT
      CASE
        WHEN lower(relation) LIKE '%мать%' THEN 'Мать'
        WHEN lower(relation) LIKE '%отец%' THEN 'Отец'
        ELSE 'Другие'
      END AS bucket,
      COUNT(*)::int AS count
    FROM student_relative
    GROUP BY 1
  `);

  const geography = tallyOrigins(students);

  res.json({
    total,
    barracks,
    off_barracks: offBarracks,
    geography,
    relatives_by_type: relByType,
  });
}

export async function listAllRelatives(_req, res) {
  const { rows } = await pool.query(`
    SELECT
      r.id,
      r.relation,
      r.full_name,
      r.phone,
      r.birth_date,
      r.details,
      st.id AS student_id,
      st.last_name,
      st.first_name,
      st.patronymic,
      g.name AS group_name
    FROM student_relative r
    JOIN student st ON st.id = r.student_id
    JOIN student_group g ON g.id = st.group_id
    ORDER BY st.last_name, r.id
  `);
  res.json(rows);
}

export async function listAllMourning(_req, res) {
  const { rows } = await pool.query(`
    SELECT
      m.id,
      m.relation,
      m.full_name,
      m.death_date,
      m.cause_of_death,
      m.notes,
      st.id AS student_id,
      st.last_name,
      st.first_name,
      st.patronymic,
      g.name AS group_name
    FROM student_mourning_event m
    JOIN student st ON st.id = m.student_id
    JOIN student_group g ON g.id = st.group_id
    ORDER BY m.death_date DESC, st.last_name, m.id
  `);
  res.json(rows);
}

export async function listGeography(_req, res) {
  const { rows } = await pool.query(`
    SELECT
      st.id,
      st.group_id,
      st.last_name,
      st.first_name,
      st.patronymic,
      g.name AS group_name,
      st.birth_place,
      st.registration_address,
      st.residence_address,
      st.housing,
      st.position,
      st.military_rank
    FROM student st
    JOIN student_group g ON g.id = st.group_id
    ORDER BY st.last_name
  `);
  res.json(
    rows.map((s) => ({
      ...s,
      origin_region: originRegion(s.birth_place, s.registration_address),
    }))
  );
}
