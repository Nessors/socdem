/**
 * Проверка комплекта на КОПИИ папки (socdem-kit-test).
 * Не печатает пароли, ФИО из базы и содержимое карточек.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const folder = root.split(/[/\\]/).filter(Boolean).at(-1);
const BASE = "http://127.0.0.1:3001";
const MARK = "СамопроверкаКит";
const phase = process.argv[2] || "live";

if (folder !== "socdem-kit-test") {
  console.error("Самопроверка только в папке socdem-kit-test, не в рабочей.");
  process.exit(1);
}

const jar = { cookie: "" };

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

function ok(msg) {
  console.log("ok:", msg);
}

async function call(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (jar.cookie) headers.cookie = jar.cookie;
  if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(BASE + path, { ...options, headers });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const line of setCookie) {
    const part = line.split(";")[0];
    if (part) jar.cookie = part;
  }
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { res, data, text };
}

function oldPassword() {
  const fromEnv = process.env.KIT_OLD_PASSWORD;
  if (fromEnv) return fromEnv;
  const raw = readFileSync(join(root, "data", "credentials.txt"), "utf8");
  const m = raw.match(/пароль:\s*(\S+)/i);
  if (!m) fail("нет заводского пароля в credentials.txt");
  return m[1];
}

async function login(password) {
  const { res, data } = await call("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: "admin", password }),
  });
  if (!res.ok) fail(`вход ${res.status}`);
  return data.user;
}

async function phaseLive() {
  const health = await call("/api/health");
  if (!health.data.ok || health.data.app !== "socdem-fsit") fail("health");
  ok("health");

  const allowed = await fetch(BASE + "/api/health", {
    headers: { Origin: "http://127.0.0.1:5173" },
  });
  const allowLocal = allowed.headers.get("access-control-allow-origin");
  const denied = await fetch(BASE + "/api/health", {
    headers: { Origin: "http://evil.example" },
  });
  const allowEvil = denied.headers.get("access-control-allow-origin");
  if (allowLocal && allowLocal !== "http://127.0.0.1:5173") {
    fail(`cors allowlist: ${allowLocal}`);
  }
  if (allowEvil === "http://evil.example") fail("cors");
  ok("cors");

  const user = await login(oldPassword());
  if (!user?.must_change) fail("должен требовать смену пароля");
  ok("вход с требованием смены пароля");

  const blocked = await call("/api/students");
  if (blocked.res.status !== 403 || !blocked.data.must_change) {
    fail("карточки должны быть закрыты до смены пароля");
  }
  ok("api закрыт до смены пароля");

  const next = process.env.KIT_NEW_PASSWORD;
  if (!next || next.length < 8) fail("KIT_NEW_PASSWORD");

  const changed = await call("/api/auth/password", {
    method: "POST",
    body: JSON.stringify({
      current_password: oldPassword(),
      new_password: next,
      confirm_password: next,
    }),
  });
  if (!changed.res.ok || changed.data.user?.must_change) fail("смена пароля");
  ok("пароль сменён");

  const listed = await call("/api/students");
  if (!listed.res.ok || !Array.isArray(listed.data)) fail("список");
  ok(`поиск/список (${listed.data.length})`);

  const groups = await call("/api/groups");
  const gid = groups.data?.[0]?.id;
  if (!gid) fail("нет групп");

  const created = await call("/api/students", {
    method: "POST",
    body: JSON.stringify({
      group_id: gid,
      last_name: MARK,
      first_name: "Тест",
      phone: "0000000000",
      birth_date: "2000-01-01",
    }),
  });
  if (created.res.status !== 201 || !created.data?.id) fail("добавление");
  const id = created.data.id;
  writeFileSync(join(root, "data", "kit-selfcheck-id.txt"), String(id), "utf8");
  ok("человек добавлен");

  const edited = await call(`/api/students/${id}`, {
    method: "PUT",
    body: JSON.stringify({ first_name: "Проверка" }),
  });
  if (!edited.res.ok) fail("правка");
  ok("правка карточки");

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const form = new FormData();
  form.append("photo", new Blob([png], { type: "image/png" }), "p.png");
  const photo = await call(`/api/students/${id}/photos/1`, {
    method: "POST",
    body: form,
  });
  if (photo.res.status !== 201) fail("фото");
  ok("фото");

  const docx = await fetch(BASE + `/api/students/${id}/export.docx`, {
    headers: jar.cookie ? { cookie: jar.cookie } : {},
  });
  if (!docx.ok) fail("выгрузка Word");
  const bytes = Buffer.from(await docx.arrayBuffer());
  if (bytes.length < 1000) fail("пустой Word");
  ok("выгрузка Word");

  const back = new FormData();
  back.append(
    "docx",
    new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    "card.docx"
  );
  const imported = await call(`/api/students/${id}/import.docx`, {
    method: "POST",
    body: back,
  });
  if (!imported.res.ok) fail("импорт Word");
  ok("импорт Word");
}

async function phasePersist() {
  const user = await login(process.env.KIT_NEW_PASSWORD);
  if (user?.must_change) fail("после перезапуска снова просит сменить пароль");
  const listed = await call("/api/students");
  const idFile = join(root, "data", "kit-selfcheck-id.txt");
  const expectId = existsSync(idFile) ? Number(readFileSync(idFile, "utf8").trim()) : NaN;
  const rows = listed.data || [];
  const found = rows.some(
    (s) =>
      s.id === expectId ||
      s.last_name === MARK ||
      s.phone === "0000000000"
  );
  if (!found) fail(`запись не сохранилась (список ${rows.length}, id ${expectId || "?"})`);
  ok("данные на месте после выключения");
}

async function phaseRestore() {
  await phasePersist();
  ok("восстановление: карточка на месте");
}

const required = [
  "runtime/node/node.exe",
  "backend/src/index.js",
  "backend/node_modules/@electric-sql/pglite/package.json",
  "frontend/dist/index.html",
  "data/pgdata/PG_VERSION",
  "ИНСТРУКЦИЯ.txt",
];
if (phase === "live") {
  for (const rel of required) {
    if (!existsSync(join(root, rel))) fail(`нет файла ${rel}`);
  }
  ok("комплект полный");
}

if (phase === "live") await phaseLive();
else if (phase === "persist") await phasePersist();
else if (phase === "restore") await phaseRestore();
else fail(`неизвестная фаза ${phase}`);
