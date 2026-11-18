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
  assert.equal(isOverdue('2026-11-16', 'pending', new Date('2026-11-17T12:00:00')), true)
  assert.equal(isOverdue('2026-11-17', 'pending', new Date('2026-11-17T12:00:00')), false)
  assert.equal(isOverdue('2026-11-16', 'completed', new Date('2026-11-17T12:00:00')), false)
})
