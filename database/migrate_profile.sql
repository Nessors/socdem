-- Карточка соцдема: расширение таблицы student + связанные таблицы.
-- Безопасно запускать повторно (IF NOT EXISTS).

ALTER TABLE student ADD COLUMN IF NOT EXISTS birth_place TEXT;
ALTER TABLE student ADD COLUMN IF NOT EXISTS passport TEXT;
ALTER TABLE student ADD COLUMN IF NOT EXISTS nationality TEXT;
ALTER TABLE student ADD COLUMN IF NOT EXISTS military_commissariat TEXT;
ALTER TABLE student ADD COLUMN IF NOT EXISTS education TEXT;
ALTER TABLE student ADD COLUMN IF NOT EXISTS graduated TEXT;
ALTER TABLE student ADD COLUMN IF NOT EXISTS specialty TEXT;
ALTER TABLE student ADD COLUMN IF NOT EXISTS specialization TEXT;
ALTER TABLE student ADD COLUMN IF NOT EXISTS foreign_languages TEXT;
ALTER TABLE student ADD COLUMN IF NOT EXISTS been_abroad TEXT;
ALTER TABLE student ADD COLUMN IF NOT EXISTS state_awards TEXT;
ALTER TABLE student ADD COLUMN IF NOT EXISTS military_rank TEXT;
ALTER TABLE student ADD COLUMN IF NOT EXISTS academic_degree TEXT;
ALTER TABLE student ADD COLUMN IF NOT EXISTS position TEXT;
ALTER TABLE student ADD COLUMN IF NOT EXISTS is_deputy TEXT;
ALTER TABLE student ADD COLUMN IF NOT EXISTS contract_status TEXT;
ALTER TABLE student ADD COLUMN IF NOT EXISTS marital_status TEXT;
ALTER TABLE student ADD COLUMN IF NOT EXISTS registration_address TEXT;
ALTER TABLE student ADD COLUMN IF NOT EXISTS residence_address TEXT;
ALTER TABLE student ADD COLUMN IF NOT EXISTS driver_license TEXT;
ALTER TABLE student ADD COLUMN IF NOT EXISTS car TEXT;

-- Отец, мать, брат, сестра и т.д.
CREATE TABLE IF NOT EXISTS student_relative (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
    relation VARCHAR(64) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    birth_date DATE,
    details TEXT,
    phone VARCHAR(64)
);

-- Данные на командиров (начальник курса, факультета, академии)
CREATE TABLE IF NOT EXISTS student_commander (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
    position VARCHAR(255) NOT NULL,
    rank VARCHAR(128),
    full_name VARCHAR(255) NOT NULL,
    birth_date DATE,
    in_position_since TEXT,
    education TEXT,
    contract TEXT,
    marital_status VARCHAR(128)
);

-- Работа в прошлом (период — описание)
CREATE TABLE IF NOT EXISTS student_career (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
    date_from DATE NOT NULL,
    date_to DATE,
    description TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_relative_student ON student_relative(student_id);
CREATE INDEX IF NOT EXISTS idx_commander_student ON student_commander(student_id);
CREATE INDEX IF NOT EXISTS idx_career_student ON student_career(student_id);
