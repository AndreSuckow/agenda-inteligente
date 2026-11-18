import assert from 'node:assert/strict'
import test from 'node:test'
import { getAvailableCalendarSpan, getBirthdayDateKey, splitTitleIntoLines } from '../src/calendar-utils.js'

test('wraps calendar titles at 20 characters without splitting ordinary words', () => {
  const lines = splitTitleIntoLines('Corrigir portfolio Andre-suckow-portfolio')

  assert.deepEqual(lines, ['Corrigir portfolio', 'Andre-suckow-', 'portfolio'])
  assert.equal(lines.every((line) => line.length <= 20), true)
})

test('does not let a calendar task span over the next occupied day', () => {
  const week = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']
  const datesWithTasks = new Set(['2026-11-17', '2026-11-19'])

  assert.equal(getAvailableCalendarSpan(week, 1, datesWithTasks), 2)
})

test('allows calendar tasks to span through empty days in the same week', () => {
  const week = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']

  assert.equal(getAvailableCalendarSpan(week, 1, new Set(['2026-11-17'])), 6)
})

test('places birthdays on the same calendar date in future years', () => {
  assert.equal(getBirthdayDateKey('1996-05-27', 2027), '2027-05-27')
})

test('places leap-day birthdays on February 28 in non-leap years', () => {
  assert.equal(getBirthdayDateKey('2000-02-29', 2027), '2027-02-28')
  assert.equal(getBirthdayDateKey('2000-02-29', 2028), '2028-02-29')
})
