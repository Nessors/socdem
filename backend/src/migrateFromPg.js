import pg from "pg";

const TABLES = [
  "faculty",
  "academic_stream",
  "student_group",
  "student",
  "student_photo",
  "student_relative",
  "student_commander",
  "student_career",
  "student_mourning_event",
  "student_discipline",
  "nav_section",
];

pg.types.setTypeParser(1082, (value) => value);

function pgUrl() {
  return (
    process.env.DATABASE_URL ||
    "postgresql://socdem:socdem@localhost:5433/socdem"
  );
}

async function tableExists(client, name) {
  const { rows } = await client.query(`SELECT to_regclass($1) AS t`, [
    `public.${name}`,
  ]);
  return Boolean(rows[0]?.t);
}

async function columnNames(client, table) {
  const { rows } = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table]
  );
  return rows.map((row) => row.column_name);
}

async function copyTable(source, dest, table) {
  if (!(await tableExists(source, table))) return 0;
  const srcCols = await columnNames(source, table);
  const destCols = await columnNames(dest, table);
  const destSet = new Set(destCols);
  const cols = srcCols.filter((name) => destSet.has(name));
  if (!cols.length) return 0;

  const orderCol = cols.includes("id") ? "id" : cols[0];
  const { rows } = await source.query(
    `SELECT * FROM ${table} ORDER BY ${orderCol}`
  );
  if (!rows.length) return 0;

  const colSql = cols.map((name) => `"${name}"`).join(", ");
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  for (const row of rows) {
    const values = cols.map((name) => {
      const value = row[name];
      if (value == null) return null;
      if (Buffer.isBuffer(value)) return value;
      if (value instanceof Uint8Array) return Buffer.from(value);
      return value;
    });
    await dest.query(
      `INSERT INTO ${table} (${colSql}) VALUES (${placeholders})`,
      values
    );
  }

  if (cols.includes("id")) {
    await dest.query(
      `SELECT setval(
         pg_get_serial_sequence($1, 'id'),
         COALESCE((SELECT MAX(id) FROM ${table}), 1),
         true
       )`,
      [table]
    );
  }
  return rows.length;
}

export async function maybeMigrateFromPostgres(dest) {
  const { rows: local } = await dest.query(
    "SELECT COUNT(*)::int AS n FROM student"
  );
  if (local[0].n > 0) return { copied: false, reason: "already-filled" };

  const source = new pg.Pool({
    connectionString: pgUrl(),
    connectionTimeoutMillis: 2500,
    max: 1,
  });

  try {
    const { rows: remote } = await source.query(
      "SELECT COUNT(*)::int AS n FROM student"
    );
    if (remote[0].n === 0) {
      return { copied: false, reason: "source-empty" };
    }

    console.log(
      `Перенос ${remote[0].n} карточек из PostgreSQL в локальную базу…`
    );
    await dest.query(
      `TRUNCATE student, student_group, academic_stream, faculty, nav_section
       RESTART IDENTITY CASCADE`
    );

    const counts = {};
    for (const table of TABLES) {
      counts[table] = await copyTable(source, dest, table);
    }
    console.log("Перенос завершён:", counts);
    return { copied: true, counts };
  } catch (err) {
    const msg = err?.message || String(err);
    console.log(`Локальная база пустая, Docker Postgres недоступен (${msg}).`);
    return { copied: false, reason: "unreachable", error: msg };
  } finally {
    await source.end().catch(() => {});
  }
}
