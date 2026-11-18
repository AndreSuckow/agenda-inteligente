import { db } from './db.js'
import type { Priority, Recurrence, Subtask, Task, TaskStatus } from './business-rules.js'
import { parseDescription } from './subtask-rules.js'
import { normalizeTaskTags } from '../shared/task-tag-rules.js'

type TaskRow = {
  id: number
  title: string
  description: string | null
  due_date: string | null
  due_time: string | null
  priority: Priority
  status: TaskStatus
  recurrence: Recurrence
  completed_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

type SubtaskRow = {
  id: number
  task_id: number
  title: string
  position: number
  completed: number
}

function toSubtask(row: SubtaskRow): Subtask {
  return {
    id: row.id,
    title: row.title,
    position: row.position,
    completed: row.completed === 1,
  }
}

function toTask(row: TaskRow, savedSubtasks: Subtask[] = [], tags: string[] = []): Task {
  const legacyDescription = parseDescription(row.description ?? undefined)
  const usesLegacyDescription = savedSubtasks.length === 0 && legacyDescription.subtaskTitles.length > 0
  const subtasks = usesLegacyDescription
    ? legacyDescription.subtaskTitles.map((title, position) => ({
      id: -(position + 1),
      title,
      position,
      completed: false,
    }))
    : savedSubtasks

  return {
    id: row.id,
    title: row.title,
    description: usesLegacyDescription ? legacyDescription.description ?? null : row.description,
    tags,
    dueDate: row.due_date,
    dueTime: row.due_time,
    priority: row.priority,
    status: row.status,
    recurrence: row.recurrence,
    completedAt: toIsoTimestamp(row.completed_at),
    createdAt: toIsoTimestamp(row.created_at)!,
    updatedAt: toIsoTimestamp(row.updated_at)!,
    deletedAt: toIsoTimestamp(row.deleted_at),
    subtasks,
  }
}

function toIsoTimestamp(timestamp: string | null): string | null {
  if (!timestamp) return null
  const isoTimestamp = timestamp.includes('T')
    ? timestamp
    : `${timestamp.replace(' ', 'T')}Z`
  return new Date(isoTimestamp).toISOString()
}

function getSavedSubtasks(taskId: number) {
  const rows = db.prepare(`
    SELECT id, task_id, title, position, completed
    FROM task_subtasks
    WHERE task_id = ?
    ORDER BY position
  `).all(taskId) as SubtaskRow[]
  return rows.map(toSubtask)
}

function getSavedSubtasksByTask() {
  const rows = db.prepare(`
    SELECT id, task_id, title, position, completed
    FROM task_subtasks
    ORDER BY task_id, position
  `).all() as SubtaskRow[]
  const subtasksByTask = new Map<number, Subtask[]>()

  for (const row of rows) {
    const taskSubtasks = subtasksByTask.get(row.task_id) ?? []
    taskSubtasks.push(toSubtask(row))
    subtasksByTask.set(row.task_id, taskSubtasks)
  }

  return subtasksByTask
}

function insertSubtasks(taskId: number, titles: string[], completed = false) {
  const insert = db.prepare(`
    INSERT INTO task_subtasks (task_id, title, position, completed)
    VALUES (?, ?, ?, ?)
  `)
  titles.forEach((title, position) => {
    insert.run(taskId, title, position, completed ? 1 : 0)
  })
}

function getSavedTags(taskId: number) {
  const rows = db.prepare(`
    SELECT tag
    FROM task_tags
    WHERE task_id = ?
    ORDER BY position
  `).all(taskId) as Array<{ tag: string }>
  return rows.map((row) => row.tag)
}

function getSavedTagsByTask() {
  const rows = db.prepare(`
    SELECT task_id, tag
    FROM task_tags
    ORDER BY task_id, position
  `).all() as Array<{ task_id: number; tag: string }>
  const tagsByTask = new Map<number, string[]>()
  for (const row of rows) {
    const taskTags = tagsByTask.get(row.task_id) ?? []
    taskTags.push(row.tag)
    tagsByTask.set(row.task_id, taskTags)
  }
  return tagsByTask
}

function replaceTags(taskId: number, tags: string[]) {
  db.prepare('DELETE FROM task_tags WHERE task_id = ?').run(taskId)
  const insert = db.prepare(`
    INSERT INTO task_tags (task_id, tag, position)
    VALUES (?, ?, ?)
  `)
  normalizeTaskTags(tags).forEach((tag, position) => insert.run(taskId, tag, position))
}

function replaceSubtasks(
  taskId: number,
  titles: string[],
  markAllCompleted: boolean,
  resetAll: boolean,
) {
  const previousSubtasks = getSavedSubtasks(taskId)
  const completionByTitle = new Map<string, boolean[]>()
  for (const subtask of previousSubtasks) {
    const completionStates = completionByTitle.get(subtask.title) ?? []
    completionStates.push(subtask.completed)
    completionByTitle.set(subtask.title, completionStates)
  }

  db.prepare('DELETE FROM task_subtasks WHERE task_id = ?').run(taskId)
  const insert = db.prepare(`
    INSERT INTO task_subtasks (task_id, title, position, completed)
    VALUES (?, ?, ?, ?)
  `)

  titles.forEach((title, position) => {
    const matchingStates = completionByTitle.get(title) ?? []
    const previousCompleted = matchingStates.shift() ?? false
    const completed = markAllCompleted || (!resetAll && previousCompleted)
    insert.run(taskId, title, position, completed ? 1 : 0)
  })
}

export function listTasks(): Task[] {
  const rows = db.prepare(`
    SELECT * FROM tasks
    ORDER BY
      deleted_at IS NOT NULL,
      CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
      CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
      due_date IS NULL,
      due_date,
      due_time IS NULL,
      due_time,
      id DESC
  `).all() as TaskRow[]
  const subtasksByTask = getSavedSubtasksByTask()
  const tagsByTask = getSavedTagsByTask()
  return rows.map((row) => toTask(row, subtasksByTask.get(row.id), tagsByTask.get(row.id)))
}

export function findTask(id: number) {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined
  return row ? toTask(row, getSavedSubtasks(id), getSavedTags(id)) : null
}

export function createTask(input: {
  title: string
  description?: string
  tags?: string[]
  dueDate?: string
  dueTime?: string
  priority: Priority
  recurrence: Recurrence
}) {
  const parsedDescription = parseDescription(input.description)
  const create = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO tasks (title, description, due_date, due_time, priority, recurrence)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      input.title,
      parsedDescription.description ?? null,
      input.dueDate ?? null,
      input.dueTime ?? null,
      input.priority,
      input.recurrence,
    )
    const taskId = Number(result.lastInsertRowid)
    insertSubtasks(taskId, parsedDescription.subtaskTitles)
    replaceTags(taskId, input.tags ?? [])
    return taskId
  })
  return findTask(create())
}

export function updateTask(id: number, input: {
  title: string
  description?: string
  tags?: string[]
  dueDate?: string
  dueTime?: string
  priority: Priority
  status: TaskStatus
  recurrence: Recurrence
}) {
  const previous = findTask(id)
  if (!previous || previous.deletedAt) return null

  const parsedDescription = parseDescription(input.description)
  const shouldCreateNextOccurrence =
    previous.status === 'pending' && input.status === 'completed' && input.recurrence !== 'none'
  const shouldResetSubtasks = previous.status === 'completed' && input.status === 'pending'

  const update = db.transaction(() => {
    db.prepare(`
      UPDATE tasks
      SET title = ?, description = ?, due_date = ?, due_time = ?, priority = ?, status = ?,
          recurrence = ?, completed_at = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      input.title,
      parsedDescription.description ?? null,
      input.dueDate ?? null,
      input.dueTime ?? null,
      input.priority,
      input.status,
      input.recurrence,
      input.status === 'completed' ? new Date().toISOString() : null,
      id,
    )
    replaceSubtasks(
      id,
      parsedDescription.subtaskTitles,
      input.status === 'completed',
      shouldResetSubtasks,
    )
    if (input.tags !== undefined) replaceTags(id, input.tags)
    if (shouldCreateNextOccurrence) createNextOccurrence(id)
  })
  update()
  return findTask(id)
}

export function updateSubtaskCompletion(taskId: number, position: number, completed: boolean) {
  const update = db.transaction(() => {
    const task = findTask(taskId)
    if (!task || task.deletedAt || position < 0 || position >= task.subtasks.length) return false

    let savedSubtasks = getSavedSubtasks(taskId)
    if (savedSubtasks.length === 0) {
      db.prepare('UPDATE tasks SET description = ? WHERE id = ?')
        .run(task.description, taskId)
      insertSubtasks(taskId, task.subtasks.map((subtask) => subtask.title))
      savedSubtasks = getSavedSubtasks(taskId)
    }

    const subtask = savedSubtasks.find((item) => item.position === position)
    if (!subtask) return false

    db.prepare(`
      UPDATE task_subtasks
      SET completed = ?, updated_at = datetime('now')
      WHERE task_id = ? AND position = ?
    `).run(completed ? 1 : 0, taskId, position)

    const updatedSubtasks = getSavedSubtasks(taskId)
    const nextStatus: TaskStatus = updatedSubtasks.every((item) => item.completed)
      ? 'completed'
      : 'pending'
    const shouldCreateNextOccurrence = task.status === 'pending' && nextStatus === 'completed'

    if (task.status !== nextStatus) {
      db.prepare(`
        UPDATE tasks
        SET status = ?, completed_at = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        nextStatus,
        nextStatus === 'completed' ? new Date().toISOString() : null,
        taskId,
      )
      if (shouldCreateNextOccurrence) createNextOccurrence(taskId)
    }

    return true
  })

  return update() ? findTask(taskId) : null
}

function createNextOccurrence(taskId: number) {
  const task = findTask(taskId)
  if (!task?.dueDate) return

  const date = new Date(`${task.dueDate}T12:00:00`)
  if (Number.isNaN(date.getTime())) return
  if (task.recurrence === 'daily') date.setDate(date.getDate() + 1)
  if (task.recurrence === 'weekly') date.setDate(date.getDate() + 7)
  if (task.recurrence === 'monthly') date.setMonth(date.getMonth() + 1)
  const nextDueDate = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')

  const result = db.prepare(`
    INSERT INTO tasks (title, description, due_date, due_time, priority, recurrence)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(task.title, task.description, nextDueDate, task.dueTime, task.priority, task.recurrence)
  const nextTaskId = Number(result.lastInsertRowid)
  insertSubtasks(nextTaskId, task.subtasks.map((subtask) => subtask.title))
  replaceTags(nextTaskId, task.tags)
}

export function deleteTask(id: number) {
  const result = db.prepare(`
    UPDATE tasks
    SET deleted_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ? AND deleted_at IS NULL
  `).run(id)
  return result.changes > 0 ? findTask(id) : null
}
