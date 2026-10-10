import {
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite, types } from "@electric-sql/pglite";
import dotenv from "dotenv";
import { maybeMigrateFromPostgres } from "./migrateFromPg.js";
import { seedAdminUser } from "./auth.js";
import { maintainPlaceCatalog } from "./placeCatalog.js";

const here = dirname(fileURLToPath(import.meta.url));
export const backendRoot = join(here, "..");
export const repoRoot = join(backendRoot, "..");

dotenv.config({ path: join(backendRoot, ".env") });

export const dataDir = join(repoRoot, "data", "pgdata");

const SCHEMA_SQL = readFileSync(join(here, "schema.sql"), "utf8");
const MIGRATIONS_SQL = readFileSync(join(here, "migrations.sql"), "utf8");

const SEED_GROUPS = [
  "621/11",
  "621/12",
  "621/2",
  "622",
  "625",
  "631/11",
  "631/12",
  "631/2",
  "632",
  "635",
  "641/11",
  "641/12",
  "641/2",
  "642",
  "645",
  "651/11",
  "651/12",
  "651/13",
  "651/2",
  "652",
  "655/11",
  "655/12",
  "661/11",
  "661/12",
  "661/13",
  "661/2",
  "662",
  "665/11",
  "665/12",
];

class Mutex {
  constructor() {
    this._tail = Promise.resolve();
  }

  async acquire() {
    let release;
    const prev = this._tail;
    this._tail = new Promise((resolve) => {
      release = resolve;
    });
    await prev;
    return release;
  }
}

function mapValue(value) {
  if (value instanceof Date) {
    const utc =
      value.getUTCHours() === 0 &&
      value.getUTCMinutes() === 0 &&
      value.getUTCSeconds() === 0 &&
      value.getUTCMilliseconds() === 0;
    if (utc) {
      const y = value.getUTCFullYear();
      const m = String(value.getUTCMonth() + 1).padStart(2, "0");
      const d = String(value.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    return value.toISOString();
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  return value;
}

function mapRow(row) {
  if (!row || typeof row !== "object") return row;
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = mapValue(value);
  }
  return out;
}

function mapParams(params) {
  if (!params) return [];
  return params.map((value) => (value === undefined ? null : value));
}

function isMutation(text) {
  return /^\s*(insert|update|delete|truncate)\b/i.test(String(text));
}

function wrapLite(lite) {
  const mutex = new Mutex();
  let txDepth = 0;
  let dirty = false;

  async function rawQuery(text, params) {
    if (isMutation(text)) dirty = true;
    const result = await lite.query(text, mapParams(params), {
      parsers: {
        [types.DATE]: (value) => value,
      },
    });
    const rows = (result.rows ?? []).map(mapRow);
    return {
      rows,
      rowCount: result.rowCount ?? result.affectedRows ?? rows.length,
      fields: result.fields,
    };
  }

  return {
    async query(text, params) {
      if (txDepth > 0) {
        return rawQuery(text, params);
      }
      const release = await mutex.acquire();
      try {
        return await rawQuery(text, params);
      } finally {
        release();
        if (dirty) {
          dirty = false;
          scheduleSave();
        }
      }
    },
    async connect() {
      const release = await mutex.acquire();
      txDepth += 1;
      let released = false;
      return {
        query: (text, params) => rawQuery(text, params),
        release() {
          if (released) return;
          released = true;
          txDepth -= 1;
          release();
          if (txDepth === 0 && dirty) {
            dirty = false;
            scheduleSave();
          }
        },
      };
    },
    async exec(sql) {
      const release = await mutex.acquire();
      try {
        return await lite.exec(sql);
      } finally {
        release();
      }
    },
    async close() {
      const release = await mutex.acquire();
      try {
        try {
          await lite.query("CHECKPOINT");
        } catch {
          /* закрываем в любом случае */
        }
        await lite.close();
      } finally {
        release();
      }
    },
  };
}

function removeStalePid() {
  const pidPath = join(dataDir, "postmaster.pid");
  if (existsSync(pidPath)) {
    unlinkSync(pidPath);
  }
}

const backupDir = join(repoRoot, "data", "backup");
const backupPrevDir = join(repoRoot, "data", "backup-prev");
const lockPath = join(repoRoot, "data", "server.lock");
const pgliteOptions = {
  relaxedDurability: false,
  initialMemory: 512 * 1024 * 1024,
};

function stripPid(dir) {
  const pidPath = join(dir, "postmaster.pid");
  if (existsSync(pidPath)) unlinkSync(pidPath);
}

async function verifyCluster(sourceDir) {
  if (!existsSync(join(sourceDir, "PG_VERSION"))) {
    return { ok: false };
  }
  const probe = join(repoRoot, "data", `probe-${process.pid}-${Date.now()}`);
  try {
    cpSync(sourceDir, probe, { recursive: true });
    stripPid(probe);
    const db = await PGlite.create({ ...pgliteOptions, dataDir: probe });
    const students = await db.query("SELECT COUNT(*)::int AS n FROM student");
    const photos = await db.query("SELECT COUNT(*)::int AS n FROM student_photo");
    await db.close();
    return {
      ok: true,
      students: students.rows[0].n,
      photos: photos.rows[0].n,
    };
  } catch {
    return { ok: false };
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
}

function writeBackupStatus(check) {
  writeFileSync(
    join(repoRoot, "data", "backup-status.json"),
    `${JSON.stringify({
      verified: true,
      students: check.students,
      photos: check.photos,
      at: new Date().toISOString(),
    })}\n`,
    "utf8"
  );
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === "EPERM";
  }
}

export function claimInstance() {
  mkdirSync(join(repoRoot, "data"), { recursive: true });
  if (existsSync(lockPath)) {
    const pid = Number(readFileSync(lockPath, "utf8").trim());
    if (pidAlive(pid) && pid !== process.pid) return { ok: false, pid };
    try {
      unlinkSync(lockPath);
    } catch {
      /* файл мог исчезнуть */
    }
  }
  try {
    const fd = openSync(lockPath, "wx");
    writeSync(fd, String(process.pid));
    closeSync(fd);
    return { ok: true };
  } catch (err) {
    if (err?.code !== "EEXIST") throw err;
    const pid = Number(readFileSync(lockPath, "utf8").trim());
    if (pidAlive(pid) && pid !== process.pid) return { ok: false, pid };
    return { ok: true };
  }
}

export function releaseInstance() {
  try {
    const pid = Number(readFileSync(lockPath, "utf8").trim());
    if (pid === process.pid) unlinkSync(lockPath);
  } catch {
    /* уже снято */
  }
}

async function restoreClusterFromDir(sourceDir) {
  const check = await verifyCluster(sourceDir);
  if (!check.ok) return null;

  const parked = join(repoRoot, "data", `pgdata-parked-${Date.now()}`);
  if (existsSync(dataDir)) {
    try {
      renameSync(dataDir, parked);
    } catch {
      return null;
    }
  }
  try {
    cpSync(sourceDir, dataDir, { recursive: true });
    removeStalePid();
    const confirm = await verifyCluster(dataDir);
    if (!confirm.ok) throw new Error("restored cluster failed verify");
    return check;
  } catch {
    rmSync(dataDir, { recursive: true, force: true });
    if (existsSync(parked)) {
      try {
        renameSync(parked, dataDir);
      } catch {
        /* копия остаётся в pgdata-parked-* */
      }
    }
    return null;
  }
}

async function tryRestoreBrokenCluster() {
  for (const dir of [backupDir, backupPrevDir]) {
    if (!existsSync(dir)) continue;
    const restored = await restoreClusterFromDir(dir);
    if (restored) return restored;
  }
  return null;
}

async function runRestoreCluster() {
  const restored = await restoreClusterFromDir(backupDir);
  if (!restored) {
    console.error("Резервная копия не прошла проверку или восстановление не удалось.");
    return false;
  }
  console.log(
    `Восстановлено из проверенной копии: карточек ${restored.students}, фото ${restored.photos}.`
  );
  return true;
}

async function openPglite() {
  mkdirSync(dataDir, { recursive: true });
  removeStalePid();
  const options = { ...pgliteOptions, dataDir };
  try {
    return await PGlite.create(options);
  } catch {
    console.log("Рабочая база не открылась. Нужна резервная копия.");
    releaseInstance();
    process.exit(76);
  }
}

async function seedReferenceData(pool) {
  const { rows: facultyRows } = await pool.query("SELECT COUNT(*)::int AS n FROM faculty");
  if (facultyRows[0].n > 0) return;

  await pool.query(
    `INSERT INTO faculty (name, description) VALUES ($1, $2)`,
    [
      "Факультет специальных информационных технологий",
      "Подготовка специалистов в области защиты информации, криптографии, безопасности компьютерных систем и прикладных информационных технологий.",
    ]
  );
  await pool.query(
    `INSERT INTO academic_stream (faculty_id, title, admission_year, specialty, curator_name)
     VALUES (1, $1, 2021, $2, NULL)`,
    [
      "Учебные группы ФСИТ",
      "Специалитет — направления 621, 631, 641, 651, 661",
    ]
  );
  for (const name of SEED_GROUPS) {
    await pool.query(
      `INSERT INTO student_group (stream_id, name) VALUES (1, $1)
       ON CONFLICT (name) DO NOTHING`,
      [name]
    );
  }

  const { rows: navRows } = await pool.query("SELECT COUNT(*)::int AS n FROM nav_section");
  if (navRows[0].n === 0) {
    await pool.query(
      `INSERT INTO nav_section (slug, title, sort_order) VALUES
        ('overview', 'О потоке', 1),
        ('faculty', 'Факультет', 2),
        ('groups', 'Группы', 3),
        ('students', 'ФИО студентов', 4)`
    );
  }
}

let impl = null;
let checkpointTimer = null;
let saveTimer = null;

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!impl) return;
    impl.query("CHECKPOINT").catch(() => {});
  }, 500);
  if (typeof saveTimer.unref === "function") saveTimer.unref();
}

export const pool = {
  query: (text, params) => impl.query(text, params),
  connect: () => impl.connect(),
};

async function clusterHasStudentTable(client) {
  try {
    const { rows } = await client.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'student'
      ) AS ok
    `);
    return Boolean(rows[0]?.ok);
  } catch {
    return false;
  }
}

/** PGlite: «тип student уже есть» без таблицы — после сбойного exec всей schema.sql */
async function repairOrphanStudentType(client) {
  try {
    const { rows } = await client.query(`
      SELECT
        EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'student'
        ) AS has_table,
        EXISTS (
          SELECT 1 FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = 'public' AND t.typname = 'student'
        ) AS has_type
    `);
    const { has_table: hasTable, has_type: hasType } = rows[0] ?? {};
    if (!hasTable && hasType) {
      await client.query("DROP TYPE IF EXISTS public.student CASCADE");
    }
  } catch (err) {
    console.warn(
      "Не удалось проверить тип student (база могла повредиться при прошлом запуске):",
      err?.message || err
    );
  }
}

async function ensureDisciplineImposedByColumn(client) {
  await client.query(`
    ALTER TABLE student_discipline ADD COLUMN IF NOT EXISTS imposed_by TEXT
  `);
}

async function applyDatabaseSchema(client) {
  await repairOrphanStudentType(client);
  if (await clusterHasStudentTable(client)) {
    await client.exec(MIGRATIONS_SQL);
    await ensureDisciplineImposedByColumn(client);
    return;
  }
  try {
    await client.exec(SCHEMA_SQL);
    await ensureDisciplineImposedByColumn(client);
  } catch (err) {
    const code = err?.code ?? err?.cause?.code;
    const msg = String(err?.message ?? err);
    if (code === "42710" || /type "student" already exists/i.test(msg)) {
      await repairOrphanStudentType(client);
      await client.exec(SCHEMA_SQL);
      await ensureDisciplineImposedByColumn(client);
      return;
    }
    throw err;
  }
}

export async function initDatabase() {
  let lite = await openPglite();
  impl = wrapLite(lite);

  if (!(await clusterHasStudentTable(impl))) {
    console.log("");
    console.log("Рабочая база повреждена (нет таблицы student).");
    console.log("Пробую восстановить из резервной копии…");
    console.log("");
    await impl.close();
    impl = null;
    const restored = await tryRestoreBrokenCluster();
    lite = await openPglite();
    impl = wrapLite(lite);
    if (restored) {
      console.log(
        `Восстановлено: карточек ${restored.students}, фото ${restored.photos}.`
      );
      console.log("");
    } else if (!(await clusterHasStudentTable(impl))) {
      console.warn(
        "Резервная копия недоступна. Пробую собрать схему заново (данные могли быть утеряны)."
      );
      console.warn("");
    }
  }

  await applyDatabaseSchema(impl);
  await maybeMigrateFromPostgres(impl);
  await seedReferenceData(impl);
  await maintainPlaceCatalog(impl);
  await seedAdminUser(impl);
  await impl.query("CHECKPOINT");
  checkpointTimer = setInterval(() => {
    impl.query("CHECKPOINT").catch(() => {});
  }, 20_000);
  checkpointTimer.unref();
  return impl;
}

async function saveBackup() {
  const staging = join(repoRoot, "data", "backup-staging");
  rmSync(staging, { recursive: true, force: true });
  cpSync(dataDir, staging, { recursive: true });
  const check = await verifyCluster(staging);
  if (!check.ok) {
    rmSync(staging, { recursive: true, force: true });
    throw new Error("Новая копия не открылась, прежняя копия оставлена.");
  }
  const rotated = join(repoRoot, "data", `backup-hold-${Date.now()}`);
  if (existsSync(backupDir)) {
    renameSync(backupDir, rotated);
  }
  try {
    renameSync(staging, backupDir);
  } catch (err) {
    if (existsSync(rotated) && !existsSync(backupDir)) {
      renameSync(rotated, backupDir);
    }
    rmSync(staging, { recursive: true, force: true });
    throw err;
  }
  if (existsSync(backupPrevDir)) {
    rmSync(backupPrevDir, { recursive: true, force: true });
  }
  if (existsSync(rotated)) {
    renameSync(rotated, backupPrevDir);
  }
  writeBackupStatus(check);
  console.log(
    `Резервная копия проверена: карточек ${check.students}, фото ${check.photos}.`
  );
}

export async function closeDatabase({ backup = true } = {}) {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (checkpointTimer) {
    clearInterval(checkpointTimer);
    checkpointTimer = null;
  }
  if (!impl) {
    releaseInstance();
    return;
  }
  const current = impl;
  impl = null;
  await current.close();
  if (backup) {
    try {
      await saveBackup();
    } catch (err) {
      console.error("Резервная копия не записалась:", err?.message || err);
    }
  }
  releaseInstance();
}

if (process.argv.includes("--restore-cluster")) {
  const ok = await runRestoreCluster();
  process.exit(ok ? 0 : 1);
}
