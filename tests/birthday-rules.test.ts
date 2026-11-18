import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateBirthdayDetails } from '../shared/birthday-rules.js'

test('keeps birthdays recurring on their calendar date each year', () => {
  assert.deepEqual(
    calculateBirthdayDetails('1996-05-27', new Date(2026, 4, 27)),
    { nextBirthday: '2026-05-27', daysUntil: 0, ageOnNextBirthday: 30 },
  )
})

test('places leap-day birthdays on February 28 in non-leap years', () => {
  assert.deepEqual(
    calculateBirthdayDetails('2000-02-29', new Date(2025, 1, 27)),
    { nextBirthday: '2025-02-28', daysUntil: 1, ageOnNextBirthday: 25 },
  )
})
