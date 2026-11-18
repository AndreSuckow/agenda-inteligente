CREATE TABLE task_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag TEXT NOT NULL CHECK (length(trim(tag)) BETWEEN 1 AND 30),
  position INTEGER NOT NULL CHECK (position >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (task_id, position)
);

CREATE UNIQUE INDEX idx_task_tags_task_normalized_tag
  ON task_tags (task_id, lower(tag));

CREATE INDEX idx_task_tags_task_id
  ON task_tags (task_id, position);
