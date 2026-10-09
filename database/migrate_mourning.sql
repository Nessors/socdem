-- Печальные события (привязаны к конкретному человеку в л/с)
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
