-- Attendance / timesheet entries
CREATE TABLE IF NOT EXISTS attendance (
    id         TEXT PRIMARY KEY,
    employee   TEXT NOT NULL,
    date       TEXT NOT NULL,
    check_in   TEXT,
    check_out  TEXT,
    status     TEXT NOT NULL CHECK (status IN ('present', 'leave', 'absent')) DEFAULT 'present',
    note       TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance(employee);
