import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'agenda-repository-test-'))
process.env.DATA_DIR = dataDirectory

const { db } = await import('../server/db.js')
const {
  createTask,
  deleteTask,
  listTasks,
  updateSubtaskCompletion,
  updateTask,
} = await import('../server/task-repository.js')

test('soft-deleted tasks remain available with a deletion timestamp', () => {
  const task = createTask({
    title: 'Temporary repository test',
    priority: 'medium',
    recurrence: 'none',
  })
  assert.ok(task)

  const deletedTask = deleteTask(task.id)

  assert.ok(deletedTask)
  assert.match(deletedTask.deletedAt ?? '', /^\d{4}-\d{2}-\d{2}T.*Z$/)
  assert.equal(listTasks().some((listedTask) => listedTask.id === task.id), true)
})

test('completing every subtask completes the parent and creates a fresh recurring occurrence', () => {
  const task = createTask({
    title: 'Recurring parent completion test',
    description: 'Notes\n- First step\n- Second step',
    tags: ['Work', 'Planning'],
    dueDate: '2031-02-03',
    priority: 'high',
    recurrence: 'weekly',
  })
  assert.ok(task)
  assert.equal(task.description, 'Notes')
  assert.deepEqual(task.subtasks.map((subtask) => subtask.completed), [false, false])

  const afterFirst = updateSubtaskCompletion(task.id, 0, true)
  assert.ok(afterFirst)
  assert.equal(afterFirst.status, 'pending')

  const afterSecond = updateSubtaskCompletion(task.id, 1, true)
  assert.ok(afterSecond)
  assert.equal(afterSecond.status, 'completed')
  assert.deepEqual(afterSecond.subtasks.map((subtask) => subtask.completed), [true, true])

  const nextOccurrence = listTasks().find((listedTask) =>
    listedTask.title === task.title && listedTask.id !== task.id,
  )
  assert.ok(nextOccurrence)
  assert.equal(nextOccurrence.dueDate, '2031-02-10')
  assert.deepEqual(nextOccurrence.tags, ['Work', 'Planning'])
  assert.deepEqual(nextOccurrence.subtasks.map((subtask) => subtask.title), ['First step', 'Second step'])
  assert.deepEqual(nextOccurrence.subtasks.map((subtask) => subtask.completed), [false, false])
})

test('task tags are normalized, persisted and replaced when the task is edited', () => {
  const task = createTask({
    title: 'Tagged task test',
    tags: ['  Work ', 'Personal', 'work'],
    priority: 'medium',
    recurrence: 'none',
  })
  assert.ok(task)
  assert.deepEqual(task.tags, ['Work', 'Personal'])

  const updated = updateTask(task.id, {
    title: task.title,
    tags: ['Planning'],
    priority: task.priority,
    status: task.status,
    recurrence: task.recurrence,
  })
  assert.ok(updated)
  assert.deepEqual(updated.tags, ['Planning'])
})

test('adding recurrence to a task with subtasks carries them into its next occurrence', () => {
  const task = createTask({
    title: 'Recurrence enabled after creation test',
    description: '- Existing step',
    dueDate: '2032-04-05',
    priority: 'medium',
    recurrence: 'none',
  })
  assert.ok(task)

  const recurringTask = updateTask(task.id, {
    title: task.title,
    description: '- Existing step',
    dueDate: task.dueDate ?? undefined,
    priority: task.priority,
    status: 'pending',
    recurrence: 'weekly',
  })
  assert.ok(recurringTask)

  const completed = updateSubtaskCompletion(task.id, 0, true)
  assert.ok(completed)
  assert.equal(completed.status, 'completed')

  const nextOccurrence = listTasks().find((listedTask) =>
    listedTask.title === task.title && listedTask.id !== task.id,
  )
  assert.ok(nextOccurrence)
  assert.deepEqual(nextOccurrence.subtasks.map((subtask) => subtask.title), ['Existing step'])
  assert.equal(nextOccurrence.subtasks[0].completed, false)
})

test('manually completing a parent synchronizes its subtasks and reopening resets them', () => {
  const task = createTask({
    title: 'Manual parent completion test',
    description: '- First step\n- Second step',
    priority: 'low',
    recurrence: 'none',
  })
  assert.ok(task)

  const completed = updateTask(task.id, {
    title: task.title,
    description: '- First step\n- Second step',
    priority: task.priority,
    status: 'completed',
    recurrence: task.recurrence,
  })
  assert.ok(completed)
  assert.deepEqual(completed.subtasks.map((subtask) => subtask.completed), [true, true])

  const reopened = updateTask(task.id, {
    title: task.title,
    description: '- First step\n- Second step',
    priority: task.priority,
    status: 'pending',
    recurrence: task.recurrence,
  })
  assert.ok(reopened)
  assert.deepEqual(reopened.subtasks.map((subtask) => subtask.completed), [false, false])
})

after(() => {
  db.close()
  delete process.env.DATA_DIR
  fs.rmSync(dataDirectory, { recursive: true, force: true })
})
