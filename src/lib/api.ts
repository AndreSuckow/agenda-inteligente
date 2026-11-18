import { z } from 'zod'
import type { Priority, Recurrence, Subtask, Task, TaskStatus } from '../../server/business-rules.js'
import { parseVoiceCommand } from '../../server/business-rules.js'
import { calculateBirthdayDetails } from '../../shared/birthday-rules.js'
import { MAX_SUBTASKS, MAX_SUBTASK_TITLE_LENGTH, parseDescription } from '../../shared/subtask-rules.js'
import { MAX_TASK_TAG_LENGTH, MAX_TASK_TAGS, normalizeTaskTags } from '../../shared/task-tag-rules.js'
import { isSupabaseConfigured, supabase } from './supabase'

type TaskRow = {
  id: number
  title: string
  description: string | null
  tags: string[]
  due_date: string | null
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
  title: string
  position: number
  completed: boolean
}

type BirthdayRow = {
  id: number
  name: string
  birth_date: string
  relationship: string | null
  created_at: string
  updated_at: string
}

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

export type DueReminder = {
  birthday: Birthday
  kind: number
  year: number
}

const taskInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  tags: z.array(z.string().trim().min(1).max(MAX_TASK_TAG_LENGTH)).max(MAX_TASK_TAGS).optional()
    .transform((tags) => tags ? normalizeTaskTags(tags) : undefined),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  priority: z.enum(['low', 'medium', 'high']),
  status: z.enum(['pending', 'completed']).optional(),
  recurrence: z.enum(['none', 'daily', 'weekly', 'monthly']),
}).superRefine((input, context) => {
  const { subtaskTitles } = parseDescription(input.description)
  if (subtaskTitles.length > MAX_SUBTASKS) {
    context.addIssue({
      code: 'custom',
      path: ['description'],
      message: `A atividade pode ter no máximo ${MAX_SUBTASKS} subtarefas.`,
    })
  }
  if (subtaskTitles.some((title) => title.length > MAX_SUBTASK_TITLE_LENGTH)) {
    context.addIssue({
      code: 'custom',
      path: ['description'],
      message: `Cada subtarefa pode ter no máximo ${MAX_SUBTASK_TITLE_LENGTH} caracteres.`,
    })
  }
})

const birthdayInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  relationship: z.string().trim().max(80).optional(),
}).superRefine((input, context) => {
  const date = new Date(`${input.birthDate}T12:00:00`)
  if (Number.isNaN(date.getTime()) || date.getFullYear().toString() !== input.birthDate.slice(0, 4)
    || date.getMonth() + 1 !== Number(input.birthDate.slice(5, 7))
    || date.getDate() !== Number(input.birthDate.slice(8, 10))) {
    context.addIssue({ code: 'custom', path: ['birthDate'], message: 'Informe uma data de nascimento válida.' })
  }
})

function getCloudClient() {
  if (!supabase) throw new Error('O armazenamento online não está configurado.')
  return supabase
}

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

function mapTask(row: TaskRow, subtasks: Subtask[] = []): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    tags: row.tags ?? [],
    dueDate: row.due_date,
    priority: row.priority,
    status: row.status,
    recurrence: row.recurrence,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    subtasks,
  }
}

function mapSubtask(row: SubtaskRow): Subtask {
  return {
    id: row.id,
    title: row.title,
    position: row.position,
    completed: row.completed,
  }
}

function taskSortOrder(a: Task, b: Task) {
  if (Boolean(a.deletedAt) !== Boolean(b.deletedAt)) return Number(Boolean(a.deletedAt)) - Number(Boolean(b.deletedAt))
  if (a.status !== b.status) return a.status === 'pending' ? -1 : 1
  const priorityOrder: Record<Priority, number> = { high: 0, medium: 1, low: 2 }
  if (a.priority !== b.priority) return priorityOrder[a.priority] - priorityOrder[b.priority]
  if (Boolean(a.dueDate) !== Boolean(b.dueDate)) return a.dueDate ? -1 : 1
  if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate)
  return b.id - a.id
}

async function getTask(id: number): Promise<Task | null> {
  const client = getCloudClient()
  const { data: row, error } = await client.from('tasks').select('*').eq('id', id).maybeSingle()
  throwIfError(error)
  if (!row) return null

  const { data: subtaskRows, error: subtasksError } = await client
    .from('task_subtasks')
    .select('id, title, position, completed')
    .eq('task_id', id)
    .order('position')
  throwIfError(subtasksError)

  return mapTask(row as TaskRow, ((subtaskRows ?? []) as SubtaskRow[]).map(mapSubtask))
}

async function listTasks(): Promise<Task[]> {
  const client = getCloudClient()
  const { data: taskRows, error } = await client.from('tasks').select('*')
  throwIfError(error)
  const rows = (taskRows ?? []) as TaskRow[]
  if (rows.length === 0) return []

  const { data: subtaskRows, error: subtasksError } = await client
    .from('task_subtasks')
    .select('id, task_id, title, position, completed')
    .in('task_id', rows.map((row) => row.id))
    .order('position')
  throwIfError(subtasksError)

  const subtasksByTask = new Map<number, Subtask[]>()
  for (const row of (subtaskRows ?? []) as Array<SubtaskRow & { task_id: number }>) {
    const saved = subtasksByTask.get(row.task_id) ?? []
    saved.push(mapSubtask(row))
    subtasksByTask.set(row.task_id, saved)
  }

  return rows.map((row) => mapTask(row, subtasksByTask.get(row.id))).sort(taskSortOrder)
}

async function saveTask(id: number | null, inputValue: unknown): Promise<Task | null> {
  const input = taskInputSchema.parse(inputValue)
  const { description, subtaskTitles } = parseDescription(input.description)
  const client = getCloudClient()
  const { data: taskId, error } = await client.rpc('save_task', {
    p_task_id: id,
    p_title: input.title,
    p_description: description ?? null,
    p_tags: input.tags ?? null,
    p_due_date: input.dueDate ?? null,
    p_priority: input.priority,
    p_status: id === null ? 'pending' : input.status ?? 'pending',
    p_recurrence: input.recurrence,
    p_subtask_titles: subtaskTitles,
  })
  throwIfError(error)
  return taskId === null ? null : getTask(Number(taskId))
}

async function updateSubtask(taskId: number, position: number, completed: boolean): Promise<Task | null> {
  const client = getCloudClient()
  const { data, error } = await client.rpc('toggle_task_subtask', {
    p_task_id: taskId,
    p_position: position,
    p_completed: completed,
  })
  throwIfError(error)
  return data === null ? null : getTask(Number(data))
}

async function deleteTask(id: number): Promise<Task | null> {
  const client = getCloudClient()
  const now = new Date().toISOString()
  const { data, error } = await client
    .from('tasks')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle()
  throwIfError(error)
  return data ? getTask(id) : null
}

function mapBirthday(row: BirthdayRow, now = new Date()): Birthday {
  return {
    id: row.id,
    name: row.name,
    birthDate: row.birth_date,
    relationship: row.relationship,
    ...calculateBirthdayDetails(row.birth_date, now),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function listBirthdays(): Promise<Birthday[]> {
  const client = getCloudClient()
  const { data, error } = await client
    .from('birthdays')
    .select('id, name, birth_date, relationship, created_at, updated_at')
    .order('name')
  throwIfError(error)
  return ((data ?? []) as BirthdayRow[]).map((row) => mapBirthday(row)).sort((a, b) => {
    const dateOrder = a.birthDate.slice(5).localeCompare(b.birthDate.slice(5))
    return dateOrder || a.name.localeCompare(b.name, 'pt-BR')
  })
}

async function saveBirthday(id: number | null, inputValue: unknown): Promise<Birthday | null> {
  const input = birthdayInputSchema.parse(inputValue)
  const client = getCloudClient()
  const values = {
    name: input.name,
    birth_date: input.birthDate,
    relationship: input.relationship || null,
    updated_at: new Date().toISOString(),
  }
  const query = id === null
    ? client.from('birthdays').insert(values).select('id, name, birth_date, relationship, created_at, updated_at')
    : client.from('birthdays').update(values).eq('id', id).select('id, name, birth_date, relationship, created_at, updated_at')
  const { data, error } = await query.maybeSingle()
  throwIfError(error)
  return data ? mapBirthday(data as BirthdayRow) : null
}

async function deleteBirthday(id: number): Promise<Birthday | null> {
  const client = getCloudClient()
  const existing = (await listBirthdays()).find((birthday) => birthday.id === id)
  if (!existing) return null
  const { error } = await client.from('birthdays').delete().eq('id', id)
  throwIfError(error)
  return existing
}

async function getDueBirthdayReminders(): Promise<DueReminder[]> {
  const client = getCloudClient()
  const due = (await listBirthdays()).filter((birthday) => [30, 15, 7, 0].includes(birthday.daysUntil))
  if (due.length === 0) return []
  const { data, error } = await client
    .from('birthday_reminders')
    .select('birthday_id, birthday_year, kind')
    .in('birthday_id', due.map((birthday) => birthday.id))
  throwIfError(error)
  const sent = new Set(((data ?? []) as Array<{ birthday_id: number; birthday_year: number; kind: number }>)
    .map((reminder) => `${reminder.birthday_id}:${reminder.birthday_year}:${reminder.kind}`))

  return due
    .map((birthday) => ({
      birthday,
      kind: birthday.daysUntil,
      year: Number(birthday.nextBirthday.slice(0, 4)),
    }))
    .filter((reminder) => !sent.has(`${reminder.birthday.id}:${reminder.year}:${reminder.kind}`))
}

async function markBirthdayReminder(birthdayId: number, year: number, kind: number) {
  if (![30, 15, 7, 0].includes(kind)) throw new Error('Dados do lembrete inválidos.')
  const { error } = await getCloudClient().from('birthday_reminders').insert({
    birthday_id: birthdayId,
    birthday_year: year,
    kind,
  })
  if (error?.code === '23505') return { marked: false }
  throwIfError(error)
  return { marked: true }
}

async function requestCloud<T>(path: string, options?: RequestInit): Promise<T> {
  const method = options?.method?.toUpperCase() ?? 'GET'
  const body = options?.body ? JSON.parse(String(options.body)) as unknown : undefined
  const taskSubtaskMatch = path.match(/^\/api\/tasks\/(\d+)\/subtasks\/(\d+)$/)
  const taskMatch = path.match(/^\/api\/tasks\/(\d+)$/)
  const birthdayReminderMatch = path.match(/^\/api\/birthdays\/(\d+)\/reminders\/(\d+)\/(\d+)$/)
  const birthdayMatch = path.match(/^\/api\/birthdays\/(\d+)$/)

  if (path === '/api/tasks' && method === 'GET') return await listTasks() as T
  if (path === '/api/tasks' && method === 'POST') return await saveTask(null, body) as T
  if (taskSubtaskMatch && method === 'PATCH') {
    const input = z.object({ completed: z.boolean() }).parse(body)
    const task = await updateSubtask(Number(taskSubtaskMatch[1]), Number(taskSubtaskMatch[2]), input.completed)
    if (!task) throw new Error('Atividade ou subtarefa não encontrada.')
    return task as T
  }
  if (taskMatch && method === 'PUT') {
    const task = await saveTask(Number(taskMatch[1]), body)
    if (!task) throw new Error('Atividade não encontrada.')
    return task as T
  }
  if (taskMatch && method === 'DELETE') {
    const task = await deleteTask(Number(taskMatch[1]))
    if (!task) throw new Error('Atividade não encontrada.')
    return task as T
  }
  if (path === '/api/birthdays' && method === 'GET') return await listBirthdays() as T
  if (path === '/api/birthdays/reminders/due' && method === 'GET') return await getDueBirthdayReminders() as T
  if (path === '/api/birthdays' && method === 'POST') {
    const birthday = await saveBirthday(null, body)
    if (!birthday) throw new Error('Não foi possível criar o aniversariante.')
    return birthday as T
  }
  if (birthdayReminderMatch && method === 'POST') {
    return await markBirthdayReminder(
      Number(birthdayReminderMatch[1]),
      Number(birthdayReminderMatch[2]),
      Number(birthdayReminderMatch[3]),
    ) as T
  }
  if (birthdayMatch && method === 'PUT') {
    const birthday = await saveBirthday(Number(birthdayMatch[1]), body)
    if (!birthday) throw new Error('Aniversariante não encontrado.')
    return birthday as T
  }
  if (birthdayMatch && method === 'DELETE') {
    const birthday = await deleteBirthday(Number(birthdayMatch[1]))
    if (!birthday) throw new Error('Aniversariante não encontrado.')
    return birthday as T
  }
  if (path === '/api/voice-command' && method === 'POST') {
    const input = z.object({ transcript: z.string().trim().min(1).max(500) }).parse(body)
    return parseVoiceCommand(input.transcript) as T
  }

  throw new Error(`Endpoint online não reconhecido: ${method} ${path}`)
}

async function requestLocal<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Erro inesperado.' }))
    throw new Error(body.error ?? 'Erro inesperado.')
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  return isSupabaseConfigured ? requestCloud<T>(path, options) : requestLocal<T>(path, options)
}
