import assert from 'node:assert/strict'
import test from 'node:test'
import { isOverdue, parseVoiceCommand } from '../server/business-rules.js'

test('recognizes create voice commands', () => {
  assert.deepEqual(
    parseVoiceCommand('criar nova atividade estudar inglês'),
    { type: 'create', title: 'Estudar inglês' },
  )
})

test('recognizes delete voice commands by activity ID', () => {
  assert.deepEqual(
    parseVoiceCommand('excluir atividade número 12'),
    { type: 'delete', id: 12 },
  )
})

test('recognizes a simple create phrase', () => {
  assert.deepEqual(
    parseVoiceCommand('lavar louça'),
    { type: 'create', title: 'Lavar louça' },
  )
})

test('marks pending tasks after the end of the due day as overdue', () => {
  assert.equal(isOverdue({ dueDate: '2026-11-16', dueTime: null, status: 'pending' }, new Date('2026-11-17T12:00:00')), true)
  assert.equal(isOverdue({ dueDate: '2026-11-17', dueTime: null, status: 'pending' }, new Date('2026-11-17T12:00:00')), false)
  assert.equal(isOverdue({ dueDate: '2026-11-16', dueTime: null, status: 'completed' }, new Date('2026-11-17T12:00:00')), false)
})

test('marks a task overdue only after its optional due time', () => {
  const task = { dueDate: '2026-11-17', dueTime: '15:30', status: 'pending' as const }

  assert.equal(isOverdue(task, new Date('2026-11-17T15:29:59')), false)
  assert.equal(isOverdue(task, new Date('2026-11-17T15:30:00')), false)
  assert.equal(isOverdue(task, new Date('2026-11-17T15:30:01')), true)
})
