CREATE TABLE IF NOT EXISTS faculty (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS academic_stream (
    id SERIAL PRIMARY KEY,
    faculty_id INTEGER NOT NULL REFERENCES faculty(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    admission_year INTEGER NOT NULL,
    specialty VARCHAR(255),
    curator_name VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS student_group (
    id SERIAL PRIMARY KEY,
    stream_id INTEGER NOT NULL REFERENCES academic_stream(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS student (
    id SERIAL PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES student_group(id) ON DELETE CASCADE,
    last_name VARCHAR(100) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    patronymic VARCHAR(100),
    phone VARCHAR(32) NOT NULL,
    birth_date DATE NOT NULL
);

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
ALTER TABLE student ADD COLUMN IF NOT EXISTS housing TEXT;
ALTER TABLE student DROP CONSTRAINT IF EXISTS student_housing_check;
ALTER TABLE student ADD CONSTRAINT student_housing_check
  CHECK (housing IS NULL OR housing IN ('barracks', 'off_barracks'));

ALTER TABLE student ADD COLUMN IF NOT EXISTS category TEXT;
UPDATE student SET category = 'cadet' WHERE category IS NULL;
ALTER TABLE student ALTER COLUMN category SET DEFAULT 'cadet';
ALTER TABLE student ALTER COLUMN category SET NOT NULL;
ALTER TABLE student DROP CONSTRAINT IF EXISTS student_category_check;
ALTER TABLE student ADD CONSTRAINT student_category_check
  CHECK (category IN ('cadet', 'officer', 'civilian'));
ALTER TABLE student ALTER COLUMN group_id DROP NOT NULL;
ALTER TABLE student DROP CONSTRAINT IF EXISTS student_category_group_check;
ALTER TABLE student ADD CONSTRAINT student_category_group_check
  CHECK (
    (category = 'cadet' AND group_id IS NOT NULL)
    OR category IN ('officer', 'civilian')
  );

CREATE TABLE IF NOT EXISTS student_photo (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
    slot SMALLINT NOT NULL CHECK (slot IN (1, 2)),
    mime_type VARCHAR(64) NOT NULL,
    data BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (student_id, slot)
);

CREATE TABLE IF NOT EXISTS student_relative (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
    relation VARCHAR(64) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    birth_date DATE,
    details TEXT,
    phone VARCHAR(64)
);

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

CREATE TABLE IF NOT EXISTS student_mourning_event (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
    relation VARCHAR(128),
    full_name VARCHAR(255) NOT NULL,
    death_date DATE NOT NULL,
    cause_of_death TEXT NOT NULL,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_mourning_student ON student_mourning_event(student_id);

CREATE TABLE IF NOT EXISTS student_discipline (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('commendation', 'reprimand', 'severe_reprimand')),
    issued_at DATE NOT NULL DEFAULT CURRENT_DATE,
    reason TEXT,
    imposed_by TEXT,
    closes_id INTEGER REFERENCES student_discipline(id) ON DELETE SET NULL,
    closed_at DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT discipline_close_only_commendation CHECK (
        kind = 'commendation' OR closes_id IS NULL
    ),
    CONSTRAINT discipline_closed_only_penalty CHECK (
        closed_at IS NULL OR kind IN ('reprimand', 'severe_reprimand')
    )
);

CREATE INDEX IF NOT EXISTS idx_discipline_student_issued
    ON student_discipline (student_id, issued_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_discipline_open_penalty
    ON student_discipline (student_id)
    WHERE kind IN ('reprimand', 'severe_reprimand') AND closed_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_discipline_closes_unique
    ON student_discipline (closes_id)
    WHERE closes_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS nav_section (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(64) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS app_user (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app_user ADD COLUMN IF NOT EXISTS must_change BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS app_session (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_expires ON app_session (expires_at);

CREATE TABLE IF NOT EXISTS place_catalog (
    id SERIAL PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('birth_place', 'registration_address', 'residence_address')),
    label TEXT NOT NULL,
    normalized TEXT NOT NULL,
    sort_rank SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (kind, normalized)
);

CREATE INDEX IF NOT EXISTS idx_place_catalog_kind_norm
    ON place_catalog (kind, normalized);

CREATE TABLE IF NOT EXISTS address_entry (
    id SERIAL PRIMARY KEY,
    label TEXT NOT NULL,
    normalized TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL DEFAULT 'local',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_address_entry_normalized
    ON address_entry (normalized);
