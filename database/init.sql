-- Схема для проектной деятельности: информация о потоке и студентах факультета

CREATE TABLE faculty (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT
);

CREATE TABLE academic_stream (
    id SERIAL PRIMARY KEY,
    faculty_id INTEGER NOT NULL REFERENCES faculty(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    admission_year INTEGER NOT NULL,
    specialty VARCHAR(255),
    curator_name VARCHAR(255)
);

CREATE TABLE student_group (
    id SERIAL PRIMARY KEY,
    stream_id INTEGER NOT NULL REFERENCES academic_stream(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE student (
    id SERIAL PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES student_group(id) ON DELETE CASCADE,
    last_name VARCHAR(100) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    patronymic VARCHAR(100),
    phone VARCHAR(32) NOT NULL,
    birth_date DATE NOT NULL
);

-- До 2 фотографий на одного человека (файл хранится в BYTEA)
CREATE TABLE student_photo (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
    slot SMALLINT NOT NULL CHECK (slot IN (1, 2)),
    mime_type VARCHAR(64) NOT NULL,
    data BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (student_id, slot)
);

-- Карточка соцдема: доп. поля человека + родственники, командиры, работа в прошлом
-- (то же самое лежит в migrate_profile.sql для уже созданных баз)
ALTER TABLE student ADD COLUMN birth_place TEXT;
ALTER TABLE student ADD COLUMN passport TEXT;
ALTER TABLE student ADD COLUMN nationality TEXT;
ALTER TABLE student ADD COLUMN military_commissariat TEXT;
ALTER TABLE student ADD COLUMN education TEXT;
ALTER TABLE student ADD COLUMN graduated TEXT;
ALTER TABLE student ADD COLUMN specialty TEXT;
ALTER TABLE student ADD COLUMN specialization TEXT;
ALTER TABLE student ADD COLUMN foreign_languages TEXT;
ALTER TABLE student ADD COLUMN been_abroad TEXT;
ALTER TABLE student ADD COLUMN state_awards TEXT;
ALTER TABLE student ADD COLUMN military_rank TEXT;
ALTER TABLE student ADD COLUMN academic_degree TEXT;
ALTER TABLE student ADD COLUMN position TEXT;
ALTER TABLE student ADD COLUMN is_deputy TEXT;
ALTER TABLE student ADD COLUMN contract_status TEXT;
ALTER TABLE student ADD COLUMN marital_status TEXT;
ALTER TABLE student ADD COLUMN registration_address TEXT;
ALTER TABLE student ADD COLUMN residence_address TEXT;
ALTER TABLE student ADD COLUMN driver_license TEXT;
ALTER TABLE student ADD COLUMN car TEXT;

CREATE TABLE student_relative (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
    relation VARCHAR(64) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    birth_date DATE,
    details TEXT,
    phone VARCHAR(64)
);

CREATE TABLE student_commander (
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

CREATE TABLE student_career (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
    date_from DATE NOT NULL,
    date_to DATE,
    description TEXT NOT NULL
);

CREATE INDEX idx_relative_student ON student_relative(student_id);
CREATE INDEX idx_commander_student ON student_commander(student_id);
CREATE INDEX idx_career_student ON student_career(student_id);

CREATE TABLE student_mourning_event (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
    relation VARCHAR(128),
    full_name VARCHAR(255) NOT NULL,
    death_date DATE NOT NULL,
    cause_of_death TEXT NOT NULL,
    notes TEXT
);

CREATE INDEX idx_mourning_student ON student_mourning_event(student_id);

CREATE TABLE student_discipline (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('commendation', 'reprimand', 'severe_reprimand')),
    issued_at DATE NOT NULL DEFAULT CURRENT_DATE,
    reason TEXT,
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

CREATE INDEX idx_discipline_student_issued
    ON student_discipline (student_id, issued_at DESC, id DESC);

CREATE INDEX idx_discipline_open_penalty
    ON student_discipline (student_id)
    WHERE kind IN ('reprimand', 'severe_reprimand') AND closed_at IS NULL;

CREATE UNIQUE INDEX idx_discipline_closes_unique
    ON student_discipline (closes_id)
    WHERE closes_id IS NOT NULL;

CREATE TABLE nav_section (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(64) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO faculty (name, description) VALUES
(
    'Факультет специальных информационных технологий',
    'Подготовка специалистов в области защиты информации, криптографии, безопасности компьютерных систем и прикладных информационных технологий.'
);

INSERT INTO academic_stream (faculty_id, title, admission_year, specialty, curator_name) VALUES
(
    1,
    'Учебные группы ФСИТ',
    2021,
    'Специалитет — направления 621, 631, 641, 651, 661',
    NULL
);

INSERT INTO student_group (stream_id, name) VALUES
(1, '621/11'),
(1, '621/12'),
(1, '621/2'),
(1, '622'),
(1, '625'),
(1, '631/11'),
(1, '631/12'),
(1, '631/2'),
(1, '632'),
(1, '635'),
(1, '641/11'),
(1, '641/12'),
(1, '641/2'),
(1, '642'),
(1, '645'),
(1, '651/11'),
(1, '651/12'),
(1, '651/13'),
(1, '651/2'),
(1, '652'),
(1, '655/11'),
(1, '655/12'),
(1, '661/11'),
(1, '661/12'),
(1, '661/13'),
(1, '661/2'),
(1, '662'),
(1, '665/11'),
(1, '665/12');

-- Примеры (замените на реальный список студентов)
INSERT INTO student (group_id, last_name, first_name, patronymic, phone, birth_date) VALUES
(1, 'Смирнов', 'Алексей', 'Дмитриевич', '+7 (900) 111-22-33', '2006-03-15'),
(1, 'Кузнецова', 'Елена', 'Игоревна', '+7 (900) 222-33-44', '2006-07-22'),
(16, 'Попов', 'Никита', 'Андреевич', '+7 (900) 333-44-55', '2005-11-08'),
(16, 'Волкова', 'Анна', 'Сергеевна', '+7 (900) 444-55-66', '2006-01-30');

INSERT INTO nav_section (slug, title, sort_order) VALUES
('overview', 'О потоке', 1),
('faculty', 'Факультет', 2),
('groups', 'Группы', 3),
('students', 'ФИО студентов', 4);
