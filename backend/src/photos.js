import multer from "multer";
import { pool } from "./db.js";

const MAX_BYTES = 5 * 1024 * 1024;

export const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype?.startsWith("image/")) {
      cb(null, true);
      return;
    }
    cb(new Error("Допустимы только файлы изображений (JPEG, PNG, WebP и т.д.)"));
  },
});

function parseSlot(raw) {
  const slot = Number(raw);
  if (slot !== 1 && slot !== 2) return null;
  return slot;
}

async function studentExists(id) {
  const { rowCount } = await pool.query("SELECT 1 FROM student WHERE id = $1", [
    id,
  ]);
  return rowCount > 0;
}

export async function uploadStudentPhoto(req, res) {
  const studentId = Number(req.params.id);
  const slot = parseSlot(req.params.slot);
  if (!Number.isInteger(studentId) || !slot) {
    res.status(400).json({ error: "Некорректный id или слот (1 или 2)" });
    return;
  }
  if (!(await studentExists(studentId))) {
    res.status(404).json({ error: "Студент не найден" });
    return;
  }
  if (!req.file?.buffer?.length) {
    res.status(400).json({ error: "Файл не передан" });
    return;
  }
  await pool.query(
    `INSERT INTO student_photo (student_id, slot, mime_type, data)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (student_id, slot)
     DO UPDATE SET mime_type = EXCLUDED.mime_type, data = EXCLUDED.data, created_at = NOW()`,
    [studentId, slot, req.file.mimetype, req.file.buffer]
  );
  res.status(201).json({ student_id: studentId, slot });
}

export async function getStudentPhoto(req, res) {
  const studentId = Number(req.params.id);
  const slot = parseSlot(req.params.slot);
  if (!Number.isInteger(studentId) || !slot) {
    res.status(400).json({ error: "Некорректный id или слот" });
    return;
  }
  const { rows } = await pool.query(
    `SELECT mime_type, data FROM student_photo WHERE student_id = $1 AND slot = $2`,
    [studentId, slot]
  );
  if (!rows[0]) {
    res.status(404).end();
    return;
  }
  res.set("Cache-Control", "private, max-age=60");
  res.type(rows[0].mime_type);
  const bytes = rows[0].data;
  res.send(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []));
}

export async function deleteStudentPhoto(req, res) {
  const studentId = Number(req.params.id);
  const slot = parseSlot(req.params.slot);
  if (!Number.isInteger(studentId) || !slot) {
    res.status(400).json({ error: "Некорректный id или слот" });
    return;
  }
  const { rowCount } = await pool.query(
    `DELETE FROM student_photo WHERE student_id = $1 AND slot = $2`,
    [studentId, slot]
  );
  if (rowCount === 0) {
    res.status(404).json({ error: "Фото не найдено" });
    return;
  }
  res.status(204).end();
}

export function photoUploadError(err, _req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ error: "Файл больше 5 МБ" });
      return;
    }
  }
  if (err?.message?.includes("изображений")) {
    res.status(400).json({ error: err.message });
    return;
  }
  next(err);
}
