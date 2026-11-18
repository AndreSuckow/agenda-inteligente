import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

const databaseDirectory = process.env.DATA_DIR ?? path.resolve(process.cwd(), 'data')
const databasePath = path.join(databaseDirectory, 'agenda.db')

fs.mkdirSync(databaseDirectory, { recursive: true })

export const db = new Database(databasePath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

const migrationFiles = fs.readdirSync(path.resolve(process.cwd(), 'server', 'migrations'))
  .filter((file) => /^\d+_.+\.sql$/.test(file))
  .sort()

const appliedVersions = new Set(
  (db.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>)
    .map((row) => row.version),
)

const applyMigration = db.transaction((version: number, sql: string) => {
  db.exec(sql)
  db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version)
})

for (const file of migrationFiles) {
  const version = Number(file.slice(0, file.indexOf('_')))
  if (!appliedVersions.has(version)) {
    applyMigration(version, fs.readFileSync(path.join(process.cwd(), 'server', 'migrations', file), 'utf8'))
  }
}
