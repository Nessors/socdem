import { pool } from "./db.js";
import { isFatherRelation, isMotherRelation } from "./familyRoles.js";
import { originRegion, tallyOrigins } from "./regions.js";

export async function getDashboard(_req, res) {
  const { rows: students } = await pool.query(`
    SELECT st.id, st.birth_place, st.registration_address, st.residence_address,
           g.name AS group_name
    FROM student st
    JOIN student_group g ON g.id = st.group_id
    WHERE st.category = 'cadet'
  `);

  const { rows: [counts] } = await pool.query(`
    SELECT COUNT(*)::int AS total
    FROM student
    WHERE category = 'cadet'
  `);
  const total = counts.total;

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
    LEFT JOIN student_group g ON g.id = st.group_id
    ORDER BY st.last_name, r.id
  `);
  res.json(rows);
}

export async function listAllMourning(_req, res) {
  const [eventsResult, cadetsResult, relsResult] = await Promise.all([
    pool.query(`
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
      LEFT JOIN student_group g ON g.id = st.group_id
    `),
    pool.query(`
      SELECT
        st.id AS student_id,
        st.last_name,
        st.first_name,
        st.patronymic,
        g.name AS group_name
      FROM student st
      LEFT JOIN student_group g ON g.id = st.group_id
      WHERE st.category = 'cadet'
    `),
    pool.query(`
      SELECT student_id, relation
      FROM student_relative
    `),
  ]);

  const events = eventsResult.rows.map((row) => ({
    ...row,
    is_missing_parent: false,
  }));

  const relsByStudent = new Map();
  for (const r of relsResult.rows) {
    if (!relsByStudent.has(r.student_id)) relsByStudent.set(r.student_id, []);
    relsByStudent.get(r.student_id).push(r.relation);
  }

  const eventsByStudent = new Map();
  for (const m of events) {
    if (!eventsByStudent.has(m.student_id)) eventsByStudent.set(m.student_id, []);
    eventsByStudent.get(m.student_id).push(m);
  }

  const gaps = [];
  for (const cadet of cadetsResult.rows) {
    const sid = cadet.student_id;
    const rels = relsByStudent.get(sid) ?? [];
    const evts = eventsByStudent.get(sid) ?? [];

    const hasMotherRel = rels.some((t) => isMotherRelation(t));
    const hasFatherRel = rels.some((t) => isFatherRelation(t));
    const hasMotherEvt = evts.some((m) => isMotherRelation(m.relation));
    const hasFatherEvt = evts.some((m) => isFatherRelation(m.relation));

    if (!hasMotherRel && !hasMotherEvt) {
      gaps.push({
        id: `gap-mother-${sid}`,
        relation: "Мать",
        full_name: "Не указано в родственниках",
        death_date: null,
        cause_of_death: "—",
        notes: "Добавьте сведения в карточке курсанта",
        student_id: sid,
        last_name: cadet.last_name,
        first_name: cadet.first_name,
        patronymic: cadet.patronymic,
        group_name: cadet.group_name,
        is_missing_parent: true,
        missing_parent: "mother",
      });
    }
    if (!hasFatherRel && !hasFatherEvt) {
      gaps.push({
        id: `gap-father-${sid}`,
        relation: "Отец",
        full_name: "Не указано в родственниках",
        death_date: null,
        cause_of_death: "—",
        notes: "Добавьте сведения в карточке курсанта",
        student_id: sid,
        last_name: cadet.last_name,
        first_name: cadet.first_name,
        patronymic: cadet.patronymic,
        group_name: cadet.group_name,
        is_missing_parent: true,
        missing_parent: "father",
      });
    }
  }

  const merged = [...events, ...gaps].sort((a, b) => {
    const da = a.death_date ? String(a.death_date) : "";
    const db = b.death_date ? String(b.death_date) : "";
    if (da !== db) return db.localeCompare(da);
    if (a.is_missing_parent !== b.is_missing_parent) {
      return a.is_missing_parent ? 1 : -1;
    }
    const na = `${a.last_name} ${a.first_name}`.localeCompare(
      `${b.last_name} ${b.first_name}`,
      "ru"
    );
    if (na !== 0) return na;
    return String(a.id).localeCompare(String(b.id));
  });

  res.json(merged);
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
    LEFT JOIN student_group g ON g.id = st.group_id
    ORDER BY st.last_name
  `);
  res.json(
    rows.map((s) => ({
      ...s,
      origin_region: originRegion(s.birth_place, s.registration_address),
    }))
  );
}
