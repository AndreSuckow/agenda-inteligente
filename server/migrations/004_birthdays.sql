CREATE TABLE birthdays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  birth_date TEXT NOT NULL,
  relationship TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE birthday_reminders (
  birthday_id INTEGER NOT NULL REFERENCES birthdays(id) ON DELETE CASCADE,
  birthday_year INTEGER NOT NULL,
  kind INTEGER NOT NULL CHECK (kind IN (30, 15, 7, 0)),
  notified_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (birthday_id, birthday_year, kind)
);

CREATE INDEX idx_birthdays_birth_date ON birthdays(birth_date);
