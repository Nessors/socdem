import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);
const COOKIE = "socdem_session";
const SESSION_DAYS = 14;

export const DEFAULT_USERNAME = process.env.AUTH_USERNAME || "admin";
export const DEFAULT_PASSWORD = process.env.AUTH_PASSWORD || "fsit2026";

async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt:${salt.toString("hex")}:${Buffer.from(key).toString("hex")}`;
}

async function verifyPassword(password, stored) {
  const [algo, saltHex, keyHex] = String(stored).split(":");
  if (algo !== "scrypt" || !saltHex || !keyHex) return false;
  const key = await scrypt(password, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(keyHex, "hex");
  const actual = Buffer.from(key);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

function cookieHeader(token, maxAgeSec) {
  const parts = [
    `${COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (maxAgeSec != null) parts.push(`Max-Age=${maxAgeSec}`);
  return parts.join("; ");
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name || row.username,
    must_change: Boolean(row.must_change),
  };
}

export async function seedAdminUser(pool) {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM app_user");
  if (rows[0].n === 0) {
    const hash = await hashPassword(DEFAULT_PASSWORD);
    await pool.query(
      `INSERT INTO app_user (username, password_hash, display_name, must_change)
       VALUES ($1, $2, $3, TRUE)`,
      [DEFAULT_USERNAME, hash, "Администратор"]
    );
    return;
  }

  const { rows: users } = await pool.query(
    `SELECT id, password_hash FROM app_user`
  );
  for (const user of users) {
    if (await verifyPassword(DEFAULT_PASSWORD, user.password_hash)) {
      await pool.query(`UPDATE app_user SET must_change = TRUE WHERE id = $1`, [
        user.id,
      ]);
    }
  }
}

async function userByToken(pool, token) {
  if (!token) return null;
  await pool.query(`DELETE FROM app_session WHERE expires_at < NOW()`);
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.display_name, u.must_change
     FROM app_session s
     JOIN app_user u ON u.id = s.user_id
     WHERE s.token = $1 AND s.expires_at > NOW()`,
    [token]
  );
  return rows[0] ?? null;
}

export async function getUserFromRequest(pool, req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  return userByToken(pool, token);
}

export function requireAuth(pool) {
  return async (req, res, next) => {
    try {
      const user = await getUserFromRequest(pool, req);
      if (!user) {
        res.status(401).json({ error: "Нужна авторизация" });
        return;
      }
      req.user = publicUser(user);
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requirePasswordOk() {
  return (req, res, next) => {
    if (req.user?.must_change) {
      res.status(403).json({
        error: "Сначала смените пароль",
        must_change: true,
      });
      return;
    }
    next();
  };
}

export async function loginHandler(pool, req, res) {
  const username = String(req.body?.username ?? "").trim();
  const password = String(req.body?.password ?? "");
  if (!username || !password) {
    res.status(400).json({ error: "Укажите имя пользователя и пароль" });
    return;
  }

  const { rows } = await pool.query(
    `SELECT id, username, password_hash, display_name, must_change FROM app_user WHERE username = $1`,
    [username]
  );
  const row = rows[0];
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    res.status(401).json({ error: "Неверное имя пользователя или пароль" });
    return;
  }

  if (password === DEFAULT_PASSWORD) {
    await pool.query(`UPDATE app_user SET must_change = TRUE WHERE id = $1`, [
      row.id,
    ]);
    row.must_change = true;
  }

  const token = randomBytes(32).toString("hex");
  await pool.query(
    `INSERT INTO app_session (token, user_id, expires_at)
     VALUES ($1, $2, NOW() + make_interval(days => $3))`,
    [token, row.id, SESSION_DAYS]
  );
  res.setHeader("Set-Cookie", cookieHeader(token, SESSION_DAYS * 24 * 3600));
  res.json({ user: publicUser(row) });
}

export async function logoutHandler(pool, req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) {
    await pool.query(`DELETE FROM app_session WHERE token = $1`, [token]);
  }
  res.setHeader("Set-Cookie", cookieHeader("", 0));
  res.json({ ok: true });
}

export async function meHandler(pool, req, res) {
  const user = await getUserFromRequest(pool, req);
  if (!user) {
    res.status(401).json({ error: "Нужна авторизация" });
    return;
  }
  res.json({ user: publicUser(user) });
}

export async function changePasswordHandler(pool, req, res) {
  const user = await getUserFromRequest(pool, req);
  if (!user) {
    res.status(401).json({ error: "Нужна авторизация" });
    return;
  }

  const current = String(req.body?.current_password ?? "");
  const next = String(req.body?.new_password ?? "");
  const again = String(req.body?.confirm_password ?? "");

  if (!current || !next) {
    res.status(400).json({ error: "Укажите текущий и новый пароль" });
    return;
  }
  if (next !== again) {
    res.status(400).json({ error: "Новый пароль и подтверждение не совпадают" });
    return;
  }
  if (next.length < 8) {
    res.status(400).json({ error: "Новый пароль — не короче 8 символов" });
    return;
  }
  if (next === DEFAULT_PASSWORD) {
    res.status(400).json({ error: "Задайте другой пароль, не заводской" });
    return;
  }
  if (next.toLowerCase() === String(user.username).toLowerCase()) {
    res.status(400).json({ error: "Пароль не должен совпадать с именем пользователя" });
    return;
  }
  if (next === current) {
    res.status(400).json({ error: "Новый пароль должен отличаться от текущего" });
    return;
  }

  const { rows } = await pool.query(
    `SELECT id, password_hash FROM app_user WHERE id = $1`,
    [user.id]
  );
  const row = rows[0];
  if (!row || !(await verifyPassword(current, row.password_hash))) {
    res.status(401).json({ error: "Текущий пароль неверный" });
    return;
  }

  const hash = await hashPassword(next);
  await pool.query(
    `UPDATE app_user SET password_hash = $1, must_change = FALSE WHERE id = $2`,
    [hash, user.id]
  );
  res.json({ user: { ...publicUser(user), must_change: false } });
}
