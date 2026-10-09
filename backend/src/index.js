import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { spawn } from "node:child_process";
import cors from "cors";
import express from "express";
import {
  claimInstance,
  closeDatabase,
  initDatabase,
  pool,
  releaseInstance,
  repoRoot,
} from "./db.js";
import {
  changePasswordHandler,
  getUserFromRequest,
  loginHandler,
  logoutHandler,
  meHandler,
  requireAuth,
  requirePasswordOk,
} from "./auth.js";
import {
  bulkCreateStudents,
  createStudent,
  deleteStudent,
  getStudentProfile,
  listStudents,
  updateStudent,
} from "./students.js";
import { createRecord, deleteRecord, updateRecord } from "./records.js";
import { exportStudentDocx } from "./exportDocx.js";
import {
  docxUpload,
  docxUploadError,
  importNewStudentDocx,
  importStudentDocx,
} from "./importDocx.js";
import {
  getDashboard,
  listAllRelatives,
  listGeography,
  listAllMourning,
} from "./dashboard.js";
import {
  createDiscipline,
  deleteDiscipline,
  listDiscipline,
} from "./discipline.js";
import {
  deleteStudentPhoto,
  getStudentPhoto,
  photoUpload,
  photoUploadError,
  uploadStudentPhoto,
} from "./photos.js";

const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || "127.0.0.1";
const url = `http://${host}:${port}`;
const frontendDist = join(repoRoot, "frontend", "dist");

function openBrowser(target) {
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", target], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  spawn(process.platform === "darwin" ? "open" : "xdg-open", [target], {
    detached: true,
    stdio: "ignore",
  }).unref();
}

function isPortInUse() {
  return new Promise((resolve) => {
    const tester = createServer();
    tester.once("error", () => resolve(true));
    tester.once("listening", () => {
      tester.close(() => resolve(false));
    });
    tester.listen(port, host);
  });
}

async function probeOurApp() {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return "other";
    const data = await res.json().catch(() => ({}));
    if (data?.app === "socdem-fsit" && data.ok) return "ours";
    return "other";
  } catch {
    return "none";
  }
}

function showReady() {
  console.log("");
  console.log("База ФСИТ открыта.");
  console.log(url);
  console.log("Вход: имя admin. Если пароль ещё не меняли — он в файле data\\credentials.txt.");
  console.log("После первого входа сайт попросит задать свой пароль.");
  console.log("");
  console.log("Сайт в браузере можно закрыть — правки сохраняются сами.");
  console.log("Это окно лучше свернуть, а не закрывать в ту же секунду, когда что-то меняли.");
  console.log("Выключить базу: кнопка «Сохранить и выключить» на сайте");
  console.log("или файл «Выключить базу» в папке.");
  console.log("");
}

async function openExisting() {
  console.log("База уже открыта. Открываю сайт.");
  console.log(url);
  if (process.env.SOCDEM_OPEN_BROWSER === "1") openBrowser(url);
  process.exit(0);
}

async function waitUntilOurs(ms = 20000) {
  const started = Date.now();
  while (Date.now() - started < ms) {
    if ((await probeOurApp()) === "ours") return true;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

{
  const probe = await probeOurApp();
  if (probe === "ours") {
    await openExisting();
  }
  if (probe === "other" || (probe === "none" && (await isPortInUse()))) {
    console.error("Адрес сайта занят другой программой. Закройте её и откройте базу ещё раз.");
    process.exit(1);
  }
}

const claim = claimInstance();
if (!claim.ok) {
  if (await waitUntilOurs()) await openExisting();
  console.log("База ещё запускается. Подождите полминуты и откройте её ещё раз.");
  process.exit(0);
}

const controlToken = randomBytes(24).toString("hex");
writeFileSync(join(repoRoot, "data", "control.token"), controlToken, "utf8");

try {
  await initDatabase();
} catch (err) {
  releaseInstance();
  console.error(err);
  console.error("");
  console.error("Не удалось открыть базу. Закройте чёрное окно и запустите «Открыть базу» ещё раз.");
  process.exit(1);
}

function stopTokenOk(header) {
  if (!header) return false;
  const a = Buffer.from(String(header));
  const b = Buffer.from(controlToken);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function isLocal(req) {
  const address = req.socket?.remoteAddress || "";
  return address === "127.0.0.1" || address === "::1" || address.endsWith("127.0.0.1");
}

const app = express();

/** Express 4 не ловит ошибки async-обработчиков сам — передаём их в error middleware */
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const allowedOrigins = [
  "http://127.0.0.1:3001",
  "http://localhost:3001",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, app: "socdem-fsit", database: "connected" });
  } catch {
    res.status(503).json({ ok: false, database: "unavailable" });
  }
});

app.post("/api/auth/login", wrap((req, res) => loginHandler(pool, req, res)));
app.post("/api/auth/logout", wrap((req, res) => logoutHandler(pool, req, res)));
app.get("/api/auth/me", wrap((req, res) => meHandler(pool, req, res)));
app.post(
  "/api/auth/password",
  wrap((req, res) => changePasswordHandler(pool, req, res))
);

app.post(
  "/api/shutdown",
  wrap(async (req, res) => {
    if (!isLocal(req)) {
      res.status(403).json({ error: "Только с этого компьютера" });
      return;
    }
    const user = await getUserFromRequest(pool, req);
    if (!user && !stopTokenOk(req.get("x-socdem-stop"))) {
      res.status(401).json({ error: "Нужна авторизация" });
      return;
    }
    res.json({ ok: true });
    setTimeout(() => {
      void shutdown({ backup: true });
    }, 200);
  })
);

app.use("/api", requireAuth(pool));
app.use("/api", requirePasswordOk());

app.get(
  "/api/sections",
  wrap(async (_req, res) => {
    const { rows } = await pool.query(
      "SELECT slug, title FROM nav_section ORDER BY sort_order"
    );
    res.json(rows);
  })
);

app.get(
  "/api/stream",
  wrap(async (_req, res) => {
    const { rows } = await pool.query(`
      SELECT
        s.id,
        s.title,
        s.admission_year,
        s.specialty,
        s.curator_name,
        f.name AS faculty_name,
        f.description AS faculty_description
      FROM academic_stream s
      JOIN faculty f ON f.id = s.faculty_id
      ORDER BY s.id
      LIMIT 1
    `);
    res.json(rows[0] ?? null);
  })
);

app.get(
  "/api/faculty",
  wrap(async (_req, res) => {
    const { rows } = await pool.query(
      "SELECT id, name, description FROM faculty ORDER BY id"
    );
    res.json(rows);
  })
);

app.get("/api/dashboard", wrap(getDashboard));
app.get("/api/relatives", wrap(listAllRelatives));
app.get("/api/geography", wrap(listGeography));
app.get("/api/mourning", wrap(listAllMourning));
app.get("/api/discipline", wrap(listDiscipline));
app.post("/api/discipline", wrap(createDiscipline));
app.delete("/api/discipline/:id", wrap(deleteDiscipline));

app.get(
  "/api/groups",
  wrap(async (_req, res) => {
    const { rows } = await pool.query(`
      SELECT
        g.id,
        g.name,
        s.title AS stream_title,
        COUNT(st.id)::int AS student_count
      FROM student_group g
      JOIN academic_stream s ON s.id = g.stream_id
      LEFT JOIN student st ON st.group_id = g.id
      GROUP BY g.id, g.name, s.title
      ORDER BY g.name
    `);
    res.json(rows);
  })
);

app.get("/api/students", wrap(listStudents));
app.post("/api/students", wrap(createStudent));
app.post("/api/students/bulk", wrap(bulkCreateStudents));
app.post(
  "/api/students/import.docx",
  docxUpload.single("docx"),
  docxUploadError,
  wrap(importNewStudentDocx)
);
app.get("/api/students/:id", wrap(getStudentProfile));
app.put("/api/students/:id", wrap(updateStudent));
app.delete("/api/students/:id", wrap(deleteStudent));
app.get("/api/students/:id/export.docx", wrap(exportStudentDocx));
app.post(
  "/api/students/:id/import.docx",
  docxUpload.single("docx"),
  docxUploadError,
  wrap(importStudentDocx)
);

// Разделы карточки: relatives | commanders | career | mourning
const KIND = ":kind(relatives|commanders|career|mourning)";
app.post(`/api/students/:id/${KIND}`, wrap(createRecord));
app.put(`/api/students/:id/${KIND}/:itemId`, wrap(updateRecord));
app.delete(`/api/students/:id/${KIND}/:itemId`, wrap(deleteRecord));

app.post(
  "/api/students/:id/photos/:slot",
  photoUpload.single("photo"),
  photoUploadError,
  wrap(uploadStudentPhoto)
);
app.get("/api/students/:id/photos/:slot", wrap(getStudentPhoto));
app.delete("/api/students/:id/photos/:slot", wrap(deleteStudentPhoto));

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Не найдено" });
});

if (existsSync(join(frontendDist, "index.html"))) {
  app.use(express.static(frontendDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(join(frontendDist, "index.html"));
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const server = app.listen(port, host, () => {
  showReady();
  if (!existsSync(join(frontendDist, "index.html"))) {
    console.log("Сборка сайта не найдена. Для разработки откройте Vite: http://127.0.0.1:5173");
  }
  if (process.env.SOCDEM_OPEN_BROWSER === "1") {
    openBrowser(url);
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    void (async () => {
      const who = await probeOurApp();
      await closeDatabase({ backup: false });
      if (who === "ours") {
        console.log("База уже открыта. Откройте сайт в браузере.");
        if (process.env.SOCDEM_OPEN_BROWSER === "1") openBrowser(url);
        process.exit(0);
      }
      console.error("Адрес сайта занят другой программой. Закройте её и откройте базу ещё раз.");
      process.exit(1);
    })();
    return;
  }
  throw err;
});

let shuttingDown = false;
async function shutdown({ backup = true } = {}) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("Сохраняю базу и выключаюсь...");
  try {
    server.close();
    server.closeAllConnections?.();
  } catch {
    /* ignore */
  }
  try {
    await closeDatabase({ backup });
  } catch (err) {
    console.error(err);
  }
  try {
    unlinkSync(join(repoRoot, "data", "control.token"));
  } catch {
    /* already gone */
  }
  console.log("Готово. Это окно можно закрыть.");
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown({ backup: true });
});
process.on("SIGTERM", () => {
  void shutdown({ backup: false });
});
process.on("SIGBREAK", () => {
  void shutdown({ backup: false });
});
process.on("SIGHUP", () => {
  void shutdown({ backup: false });
});
