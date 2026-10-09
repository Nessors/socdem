-- Дисциплинарная практика: благодарность, выговор, строгий выговор
CREATE TABLE IF NOT EXISTS student_discipline (
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

CREATE INDEX IF NOT EXISTS idx_discipline_student_issued
    ON student_discipline (student_id, issued_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_discipline_open_penalty
    ON student_discipline (student_id)
    WHERE kind IN ('reprimand', 'severe_reprimand') AND closed_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_discipline_closes_unique
    ON student_discipline (closes_id)
    WHERE closes_id IS NOT NULL;
