/**
 * Удаляет все данные о людях: student и связанные таблицы (фото, родственники,
 * дисциплина, печальные события и т.д.). Справочники групп/факультета и учётные
 * записи app_user не трогаем. Перед запуском остановите базу (stop.ps1 / закрыть сервер).
 */
import { closeDatabase, initDatabase, pool } from "../src/db.js";

async function count(table) {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
  return rows[0].n;
}

await initDatabase();

const beforeStudent = await count("student");
const beforePhoto = await count("student_photo");
const beforeRel = await count("student_relative");
const beforeDisc = await count("student_discipline");

console.log("До очистки:");
console.log(`  student: ${beforeStudent}`);
console.log(`  student_photo: ${beforePhoto}`);
console.log(`  student_relative: ${beforeRel}`);
console.log(`  student_discipline: ${beforeDisc}`);

if (beforeStudent === 0) {
  console.log("Таблица student уже пуста — нечего удалять.");
  await closeDatabase({ backup: false });
  process.exit(0);
}

await pool.query("BEGIN");
try {
  await pool.query("DELETE FROM student");
  await pool.query("DELETE FROM place_catalog");
  await pool.query("DELETE FROM address_entry");

  const seqTables = [
    "student",
    "student_photo",
    "student_relative",
    "student_commander",
    "student_career",
    "student_mourning_event",
    "student_discipline",
  ];
  for (const table of seqTables) {
    await pool.query(
      `SELECT setval(pg_get_serial_sequence('${table}', 'id'), 1, false)`
    ).catch(() => {});
  }

  await pool.query("COMMIT");
} catch (e) {
  await pool.query("ROLLBACK");
  throw e;
}

const afterStudent = await count("student");
console.log("\nГотово. student:", afterStudent);
console.log("Подсказки адресов (place_catalog, address_entry) тоже очищены.");

await closeDatabase({ backup: true });
console.log("Резервная копия data/pgdata обновлена при закрытии.");
process.exit(0);
