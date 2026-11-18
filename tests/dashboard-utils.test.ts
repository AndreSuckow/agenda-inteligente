import assert from 'node:assert/strict'
import test from 'node:test'
import type { Task } from '../server/business-rules.js'
import { getDashboardSummary, isCompletedAfterDueDate } from '../src/dashboard-utils.js'

function makeTask(overrides: Partial<Task> & Pick<Task, 'id'>): Task {
  return {
    id: overrides.id,
    title: `Task ${overrides.id}`,
    description: null,
    tags: [],
    dueDate: null,
    priority: 'medium',
    status: 'pending',
    recurrence: 'none',
    completedAt: null,
    createdAt: '2026-11-01T12:00:00',
    updatedAt: '2026-11-01T12:00:00',
    deletedAt: null,
    subtasks: [],
    ...overrides,
  }
}

test('summarizes created, completed, overdue and on-time tasks in the selected month', () => {
  const tasks = [
    makeTask({
      id: 1,
      status: 'completed',
      dueDate: '2026-11-20',
      completedAt: '2026-11-19T12:00:00',
    }),
    makeTask({
      id: 2,
      status: 'completed',
      dueDate: '2026-11-18',
      completedAt: '2026-11-19T13:00:00',
    }),
    makeTask({ id: 3, dueDate: '2026-11-01' }),
    makeTask({
      id: 4,
      status: 'completed',
      dueDate: '2026-11-01',
      completedAt: '2026-11-19T14:00:00',
      deletedAt: '2026-11-19T15:00:00Z',
    }),
  ]

  const summary = getDashboardSummary(tasks, 'month', new Date('2026-11-20T12:00:00'))

  assert.equal(summary.created, 3)
  assert.equal(summary.completed, 2)
  assert.equal(summary.completedWithDueDate, 2)
  assert.equal(summary.onTimeCompleted, 1)
  assert.equal(summary.lateCompleted, 1)
  assert.equal(summary.overdueOpen, 1)
})

test('groups activity by the date it was created and the date it was completed', () => {
  const tasks = [
    makeTask({
      id: 1,
      createdAt: '2026-11-18T12:00:00',
      status: 'completed',
      completedAt: '2026-11-19T12:00:00',
    }),
  ]

  const summary = getDashboardSummary(tasks, 'day', new Date('2026-11-20T12:00:00'))
  const creationDay = summary.buckets.find((bucket) => bucket.key === '2026-11-18')
  const completionDay = summary.buckets.find((bucket) => bucket.key === '2026-11-19')

  assert.equal(creationDay?.created, 1)
  assert.equal(creationDay?.completed, 0)
  assert.equal(completionDay?.created, 0)
  assert.equal(completionDay?.completed, 1)
})

test('identifies completed tasks finished after their due date', () => {
  assert.equal(isCompletedAfterDueDate('2026-11-18', '2026-11-19T13:00:00'), true)
  assert.equal(isCompletedAfterDueDate('2026-11-19', '2026-11-19T23:59:00'), false)
  assert.equal(isCompletedAfterDueDate(null, '2026-11-19T13:00:00'), false)
  assert.equal(isCompletedAfterDueDate('2026-11-18', null), false)
})
