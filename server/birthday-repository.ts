import { db } from './db.js'
import { calculateBirthdayDetails } from '../shared/birthday-rules.js'

export type Birthday = {
  id: number
  name: string
  birthDate: string
  relationship: string | null
  nextBirthday: string
  daysUntil: number
  ageOnNextBirthday: number | null
  createdAt: string
  updatedAt: string
}

type BirthdayRow = {
  id: number
  name: string
  birth_date: string
  relationship: string | null
  created_at: string
  updated_at: string
}

function toBirthday(row: BirthdayRow, now: Date): Birthday {
  const details = calculateBirthdayDetails(row.birth_date, now)
  return {
    id: row.id,
    name: row.name,
    birthDate: row.birth_date,
    relationship: row.relationship,
    ...details,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function listBirthdays(now = new Date()) {
  const rows = db.prepare(`
    SELECT id, name, birth_date, relationship, created_at, updated_at
    FROM birthdays
    ORDER BY substr(birth_date, 6, 2), substr(birth_date, 9, 2), name COLLATE NOCASE
  `).all() as BirthdayRow[]
  return rows.map((row) => toBirthday(row, now))
}

export function createBirthday(input: { name: string; birthDate: string; relationship?: string }) {
  const result = db.prepare(`
    INSERT INTO birthdays (name, birth_date, relationship)
    VALUES (?, ?, ?)
  `).run(input.name, input.birthDate, input.relationship ?? null)
  return listBirthdays().find((birthday) => birthday.id === Number(result.lastInsertRowid)) ?? null
}

export function updateBirthday(id: number, input: { name: string; birthDate: string; relationship?: string }) {
  db.prepare(`
    UPDATE birthdays
    SET name = ?, birth_date = ?, relationship = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(input.name, input.birthDate, input.relationship ?? null, id)
  return listBirthdays().find((birthday) => birthday.id === id) ?? null
}

export function deleteBirthday(id: number) {
  const existing = listBirthdays().find((birthday) => birthday.id === id)
  if (!existing) return null
  db.prepare('DELETE FROM birthdays WHERE id = ?').run(id)
  return existing
}

export function getDueBirthdayReminders(now = new Date()) {
  return listBirthdays(now).filter((birthday) => [30, 15, 7, 0].includes(birthday.daysUntil))
    .map((birthday) => ({
      birthday,
      kind: birthday.daysUntil,
    year: Number(birthday.nextBirthday.slice(0, 4)),
    }))
    .filter((reminder) => {
      const alreadySent = db.prepare(`
        SELECT 1 FROM birthday_reminders
        WHERE birthday_id = ? AND birthday_year = ? AND kind = ?
      `).get(reminder.birthday.id, reminder.year, reminder.kind)
      return !alreadySent
    })
}

export function markBirthdayReminder(birthdayId: number, year: number, kind: number) {
  if (![30, 15, 7, 0].includes(kind)) return false
  const result = db.prepare(`
    INSERT OR IGNORE INTO birthday_reminders (birthday_id, birthday_year, kind)
    VALUES (?, ?, ?)
  `).run(birthdayId, year, kind)
  return result.changes === 1
}
