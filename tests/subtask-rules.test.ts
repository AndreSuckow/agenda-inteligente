import assert from 'node:assert/strict'
import test from 'node:test'
import { parseDescription } from '../server/subtask-rules.js'

test('parses dash-prefixed lines as subtasks and preserves other description text', () => {
  assert.deepEqual(parseDescription('Contexto da atividade\n- Fazer a\n  - Fazer b\nObservação'), {
    description: 'Contexto da atividade\nObservação',
    subtaskTitles: ['Fazer a', 'Fazer b'],
  })
})

test('returns no description for text containing only subtasks', () => {
  assert.deepEqual(parseDescription('- Primeiro item\n- Segundo item'), {
    description: undefined,
    subtaskTitles: ['Primeiro item', 'Segundo item'],
  })
})
