import multer from "multer";
import { pool } from "./db.js";
import { parseSocdemDocxBuffer } from "./parseSocdemDocx.js";
import { resolveGroup } from "./groupResolver.js";
import { registerProfilePlaces } from "./placeCatalog.js";
import { getStudentFull, PROFILE_TEXT_COLUMNS } from "./students.js";

const MAX_BYTES = 15 * 1024 * 1024;

export const docxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname?.toLowerCase() ?? "";
    const ok =
      name.endsWith(".docx") ||
      file.mimetype ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (ok) cb(null, true);
    else cb(new Error("Нужен файл Word в формате .docx"));
  },
});

export function docxUploadError(err, _req, res, next) {
  if (err instanceof multer.MulterError) {
    res.status(400).json({ error: "Файл слишком большой (макс. 15 МБ)" });
    return;
  }
  if (err) {
    res.status(400).json({ error: err.message || "Ошибка загрузки файла" });
    return;
  }
  next();
}

async function resolveGroupId(groupRef) {
  if (groupRef == null || groupRef === "") return null;
  const asNum = Number(groupRef);
  if (Number.isInteger(asNum) && asNum > 0) {
    const { rows } = await pool.query(
      "SELECT id FROM student_group WHERE id = $1",
      [asNum]
    );
    return rows[0]?.id ?? null;
  }
  const name = String(groupRef).trim();
  const { rows } = await pool.query(
    "SELECT id FROM student_group WHERE name = $1",
    [name]
  );
  return rows[0]?.id ?? null;
}

function buildStudentPatch(parsed, existing = null) {
  const cols = {};
  if (parsed.fio?.last_name) cols.last_name = parsed.fio.last_name;
  if (parsed.fio?.first_name) cols.first_name = parsed.fio.first_name;
  if (parsed.fio?.patronymic !== undefined) {
    cols.patronymic = parsed.fio.patronymic;
  }
  if (parsed.birth?.birth_date) cols.birth_date = parsed.birth.birth_date;
  if (parsed.birth?.birth_place) cols.birth_place = parsed.birth.birth_place;
  for (const key of PROFILE_TEXT_COLUMNS) {
    if (key === "patronymic") continue;
    const v = parsed.profile[key];
    if (v != null) cols[key] = v;
  }
  if (!cols.phone && existing?.phone) {
    /* keep */
  } else if (!cols.phone) {
    cols.phone = parsed.profile.phone ?? null;
  }
  if (!cols.birth_date && existing?.birth_date) {
    delete cols.birth_date;
  }
  return cols;
}

async function updateStudentFromParsed(client, studentId, parsed) {
  const existing = await getStudentFull(studentId);
  if (!existing) return null;

  const patch = buildStudentPatch(parsed, existing);
  const keys = Object.keys(patch);
  if (keys.length > 0) {
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
    await client.query(
      `UPDATE student SET ${sets} WHERE id = $${keys.length + 1}`,
      [...keys.map((k) => patch[k]), studentId]
    );
    await registerProfilePlaces(patch, client);
  }
  return existing;
}

async function replaceList(client, table, studentId, rows, columns) {
  if (!rows?.length) return 0;
  await client.query(`DELETE FROM ${table} WHERE student_id = $1`, [studentId]);
  for (const row of rows) {
    const cols = ["student_id", ...columns];
    const params = [studentId, ...columns.map((c) => row[c] ?? null)];
    const ph = params.map((_, i) => `$${i + 1}`).join(", ");
    await client.query(
      `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${ph})`,
      params
    );
  }
  return rows.length;
}

const MAX_PHOTO_BYTES = 12 * 1024 * 1024;

async function upsertPhotos(client, studentId, photos) {
  if (!photos?.length) return 0;
  let n = 0;
  for (let i = 0; i < photos.length; i++) {
    const slot = photos[i].slot ?? i + 1;
    if (slot !== 1 && slot !== 2) continue;
    let { mime, data } = photos[i];
    if (!data?.length) continue;
    if (data.length > MAX_PHOTO_BYTES) continue;
    if (!mime?.startsWith("image/")) continue;
    if (!Buffer.isBuffer(data)) data = Buffer.from(data);
    await client.query(
      `INSERT INTO student_photo (student_id, slot, mime_type, data)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (student_id, slot)
       DO UPDATE SET mime_type = EXCLUDED.mime_type, data = EXCLUDED.data, created_at = NOW()`,
      [studentId, slot, mime, data]
    );
    n++;
  }
  return n;
}

export async function applySocdemImport(client, studentId, parsed) {
  const stats = {
    profileFields: 0,
    relatives: 0,
    commanders: 0,
    career: 0,
    mourning: 0,
    photos: 0,
  };

  const before = await updateStudentFromParsed(client, studentId, parsed);
  if (!before) return null;
  stats.profileFields = Object.keys(buildStudentPatch(parsed, before)).length;

  stats.relatives = await replaceList(client, "student_relative", studentId, parsed.relatives, [
    "relation",
    "full_name",
    "birth_date",
    "details",
    "phone",
  ]);
  stats.commanders = await replaceList(
    client,
    "student_commander",
    studentId,
    parsed.commanders,
    [
      "position",
      "rank",
      "full_name",
      "birth_date",
      "in_position_since",
      "education",
      "contract",
      "marital_status",
    ]
  );
  stats.career = await replaceList(client, "student_career", studentId, parsed.career, [
    "date_from",
    "date_to",
    "description",
  ]);
  stats.mourning = await replaceList(
    client,
    "student_mourning_event",
    studentId,
    parsed.mourning,
    ["relation", "full_name", "death_date", "cause_of_death", "notes"]
  );
  stats.photos = await upsertPhotos(client, studentId, parsed.photos);

  return stats;
}

export async function importStudentDocx(req, res) {
  const studentId = Number(req.params.id);
  if (!Number.isInteger(studentId)) {
    res.status(400).json({ error: "Некорректный id" });
    return;
  }
  if (!req.file?.buffer) {
    res.status(400).json({ error: "Прикрепите файл .docx" });
    return;
  }

  let parsed;
  try {
    parsed = await parseSocdemDocxBuffer(req.file.buffer);
  } catch (e) {
    res.status(400).json({ error: e.message || "Не удалось разобрать документ" });
    return;
  }
  if (parsed.fio?.last_name) {
    parsed.fio.last_name = titleCaseIfUpper(parsed.fio.last_name);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const exists = await client.query("SELECT 1 FROM student WHERE id = $1", [
      studentId,
    ]);
    if (exists.rowCount === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Студент не найден" });
      return;
    }
    const stats = await applySocdemImport(client, studentId, parsed);
    await client.query("COMMIT");
    res.json({
      ok: true,
      student_id: studentId,
      stats,
      warnings: parsed.warnings,
    });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** «ШМАКОВ» → «Шмаков», «ИВАНОВ-ПЕТРОВ» → «Иванов-Петров»; смешанный регистр не трогаем */
function titleCaseIfUpper(s) {
  if (!s) return s;
  const str = String(s);
  if (str !== str.toUpperCase() || str === str.toLowerCase()) return str;
  return str
    .toLowerCase()
    .replace(/(^|[\s\-(])(\p{L})/gu, (_, pre, ch) => pre + ch.toUpperCase());
}

function importCategory(body) {
  const c = String(body?.category ?? "cadet").trim();
  if (c === "officer" || c === "civilian") return c;
  return "cadet";
}

async function findExistingStudent(parsed, category = "cadet") {
  const { rows } = await pool.query(
    `SELECT id, group_id, category FROM student
     WHERE lower(last_name) = lower($1)
       AND lower(first_name) = lower($2)
       AND coalesce(lower(patronymic), '') = coalesce(lower($3), '')
       AND birth_date = $4
       AND category = $5
     ORDER BY id
     LIMIT 1`,
    [
      parsed.fio.last_name,
      parsed.fio.first_name,
      parsed.fio.patronymic ?? null,
      parsed.birth.birth_date,
      category,
    ]
  );
  return rows[0] ?? null;
}

function resolutionPayload(resolution) {
  if (!resolution) return null;
  return {
    confidence: resolution.confidence,
    reason: resolution.reason ?? null,
    specialty: resolution.specialty ?? null,
    admission_year: resolution.admission_year ?? null,
    candidates: (resolution.candidates ?? []).map((g) => ({ id: g.id, name: g.name })),
  };
}

export async function importNewStudentDocx(req, res) {
  if (!req.file?.buffer) {
    res.status(400).json({ error: "Прикрепите файл .docx" });
    return;
  }

  let parsed;
  try {
    parsed = await parseSocdemDocxBuffer(req.file.buffer);
  } catch (e) {
    res.status(400).json({ error: e.message || "Не удалось разобрать документ" });
    return;
  }

  if (parsed.fio?.last_name) {
    parsed.fio.last_name = titleCaseIfUpper(parsed.fio.last_name);
  }

  if (!parsed.fio?.last_name || !parsed.fio?.first_name) {
    res.status(400).json({
      error: "В документе не найдено Ф.И.О. Добавьте человека вручную или исправьте файл.",
      warnings: parsed.warnings,
    });
    return;
  }
  if (!parsed.birth?.birth_date) {
    res.status(400).json({
      error: "В документе не найдена дата рождения. Укажите её в Word или создайте запись вручную.",
      warnings: parsed.warnings,
    });
    return;
  }
  const phone = parsed.profile.phone?.trim();
  if (!phone || phone.replace(/\D/g, "").length < 10) {
    res.status(400).json({
      error:
        "В документе не найден номер телефона (поле «Номер телефона» или формат 8XXXXXXXXXX / +7…).",
      warnings: parsed.warnings,
    });
    return;
  }

  const category = importCategory(req.body);
  const isCadet = category === "cadet";

  const { rows: groups } = await pool.query(
    "SELECT id, name FROM student_group ORDER BY name"
  );

  let groupId = null;
  let resolution = null;

  if (isCadet) {
    groupId = await resolveGroupId(req.body?.group_id ?? req.body?.group_name);
    if (groupId) {
      const g = groups.find((x) => x.id === groupId);
      resolution = {
        group: g,
        candidates: [g],
        confidence: "manual",
        reason: "группа выбрана вручную",
      };
    } else {
      resolution = resolveGroup(parsed, groups);
      groupId = resolution.group?.id ?? null;
    }
  }

  const existing = await findExistingStudent(parsed, category);

  if (isCadet && !groupId && !existing) {
    res.status(400).json({
      error: `Не удалось определить учебную группу: ${resolution.reason}. Выберите группу вручную.`,
      group_resolution: resolutionPayload(resolution),
      preview: {
        fio: [parsed.fio.last_name, parsed.fio.first_name, parsed.fio.patronymic]
          .filter(Boolean)
          .join(" "),
        specialty: parsed.profile.specialty ?? null,
      },
      warnings: parsed.warnings,
    });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let studentId;
    let action;

    if (existing) {
      studentId = existing.id;
      action = "updated";
      // Группу у уже существующей записи меняем только если она указана вручную
      if (
        isCadet &&
        resolution?.confidence === "manual" &&
        groupId &&
        groupId !== existing.group_id
      ) {
        await client.query("UPDATE student SET group_id = $1 WHERE id = $2", [
          groupId,
          studentId,
        ]);
      } else {
        groupId = existing.group_id;
      }
    } else {
      action = "created";
      const { rows } = await client.query(
        `INSERT INTO student (category, group_id, last_name, first_name, patronymic, phone, birth_date, birth_place)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          category,
          isCadet ? groupId : null,
          parsed.fio.last_name,
          parsed.fio.first_name,
          parsed.fio.patronymic ?? null,
          phone,
          parsed.birth.birth_date,
          parsed.birth.birth_place ?? null,
        ]
      );
      studentId = rows[0].id;

      const extra = buildStudentPatch(parsed);
      for (const k of ["last_name", "first_name", "patronymic", "phone", "birth_date", "birth_place"]) {
        delete extra[k];
      }
      const keys = Object.keys(extra).filter((k) => extra[k] != null);
      if (keys.length > 0) {
        const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
        await client.query(
          `UPDATE student SET ${sets} WHERE id = $${keys.length + 1}`,
          [...keys.map((k) => extra[k]), studentId]
        );
      }
    }

    const stats = await applySocdemImport(client, studentId, parsed);
    await client.query("COMMIT");

    const finalGroup = groups.find((g) => g.id === groupId) ?? null;
    res.status(action === "created" ? 201 : 200).json({
      ok: true,
      action,
      student_id: studentId,
      fio: [parsed.fio.last_name, parsed.fio.first_name, parsed.fio.patronymic]
        .filter(Boolean)
        .join(" "),
      group: finalGroup ? { id: finalGroup.id, name: finalGroup.name } : null,
      group_resolution: resolutionPayload(resolution),
      stats,
      warnings: parsed.warnings,
    });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
