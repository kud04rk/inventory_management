-- Employee master list
CREATE TABLE IF NOT EXISTS employees (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Link attendance entries to an employee (nullable for legacy rows)
ALTER TABLE attendance ADD COLUMN employee_id TEXT;

CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance(employee_id, date);
