import { closeDatabase, initDatabase, pool } from "../src/db.js";

await initDatabase();
const cols = await pool.query(`
  SELECT column_name
  FROM information_schema.columns
  WHERE table_name = 'student_discipline'
  ORDER BY 1
`);
console.log(
  "columns:",
  cols.rows.map((r) => r.column_name).join(", ")
);
const sample = await pool.query(`
  SELECT id, kind, imposed_by, issued_at
  FROM student_discipline
  ORDER BY id DESC
  LIMIT 8
`);
console.log("recent rows:", JSON.stringify(sample.rows, null, 2));
await closeDatabase({ backup: false });
process.exit(0);
