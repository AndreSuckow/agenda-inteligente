import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import {
  createTask,
  deleteTask,
  findTask,
  listTasks,
  updateSubtaskCompletion,
  updateTask,
} from './task-repository.js'
import { parseVoiceCommand } from './business-rules.js'
import { MAX_SUBTASKS, MAX_SUBTASK_TITLE_LENGTH, parseDescription } from './subtask-rules.js'
import { MAX_TASK_TAG_LENGTH, MAX_TASK_TAGS, normalizeTaskTags } from '../shared/task-tag-rules.js'
import {
  createBirthday,
  deleteBirthday,
  getDueBirthdayReminders,
  listBirthdays,
  markBirthdayReminder,
  updateBirthday,
} from './birthday-repository.js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '100kb' }))

const taskInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  tags: z.array(z.string().trim().min(1).max(MAX_TASK_TAG_LENGTH)).max(MAX_TASK_TAGS).optional()
    .transform((tags) => tags ? normalizeTaskTags(tags) : undefined),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
  priority: z.enum(['low', 'medium', 'high']),
  status: z.enum(['pending', 'completed']).optional(),
  recurrence: z.enum(['none', 'daily', 'weekly', 'monthly']),
}).superRefine((input, context) => {
  if (input.dueTime && !input.dueDate) {
    context.addIssue({ code: 'custom', path: ['dueTime'], message: 'Informe o prazo para definir um horário limite.' })
  }
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

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' })
})

app.get('/api/tasks', (_request, response) => {
  response.json(listTasks())
})

app.post('/api/tasks', (request, response, next) => {
  try {
    const input = taskInputSchema.parse(request.body)
    const task = createTask({
      title: input.title,
      description: input.description,
      tags: input.tags ?? [],
      dueDate: input.dueDate,
      dueTime: input.dueTime,
      priority: input.priority,
      recurrence: input.recurrence,
    })
    response.status(201).json(task)
  } catch (error) {
    next(error)
  }
})

app.put('/api/tasks/:id', (request, response, next) => {
  try {
    const id = Number(request.params.id)
    if (!Number.isInteger(id) || id < 1) {
      response.status(400).json({ error: 'Informe um ID válido.' })
      return
    }
    const existingTask = findTask(id)
    if (!existingTask || existingTask.deletedAt) {
      response.status(404).json({ error: 'Atividade não encontrada.' })
      return
    }
    const input = taskInputSchema.parse(request.body)
    const task = updateTask(id, {
      title: input.title,
      description: input.description,
      tags: input.tags,
      dueDate: input.dueDate,
      dueTime: input.dueTime,
      priority: input.priority,
      status: input.status ?? 'pending',
      recurrence: input.recurrence,
    })
    response.json(task)
  } catch (error) {
    next(error)
  }
})

app.patch('/api/tasks/:id/subtasks/:position', (request, response, next) => {
  try {
    const taskId = Number(request.params.id)
    const position = Number(request.params.position)
    if (!Number.isInteger(taskId) || taskId < 1 || !Number.isInteger(position) || position < 0) {
      response.status(400).json({ error: 'Informe um ID de atividade e uma posição de subtarefa válidos.' })
      return
    }

    const input = z.object({ completed: z.boolean() }).parse(request.body)
    const task = updateSubtaskCompletion(taskId, position, input.completed)
    if (!task) {
      response.status(404).json({ error: 'Atividade ou subtarefa não encontrada.' })
      return
    }
    response.json(task)
  } catch (error) {
    next(error)
  }
})

app.delete('/api/tasks/:id', (request, response) => {
  const id = Number(request.params.id)
  if (!Number.isInteger(id) || id < 1) {
    response.status(400).json({ error: 'Informe um ID válido.' })
    return
  }
  const deletedTask = deleteTask(id)
  if (!deletedTask) {
    response.status(404).json({ error: 'Atividade não encontrada.' })
    return
  }
  response.json(deletedTask)
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

app.get('/api/birthdays', (_request, response) => {
  response.json(listBirthdays())
})

app.get('/api/birthdays/reminders/due', (_request, response) => {
  response.json(getDueBirthdayReminders())
})

app.post('/api/birthdays', (request, response, next) => {
  const result = birthdayInputSchema.safeParse(request.body)
  if (!result.success) {
    response.status(400).json({ error: 'Dados do aniversariante inválidos.', details: result.error.issues })
    return
  }
  try {
    response.status(201).json(createBirthday(result.data))
  } catch (error) {
    next(error)
  }
})

app.put('/api/birthdays/:id', (request, response, next) => {
  const id = Number(request.params.id)
  if (!Number.isInteger(id) || id < 1) {
    response.status(400).json({ error: 'Informe um ID válido.' })
    return
  }
  const result = birthdayInputSchema.safeParse(request.body)
  if (!result.success) {
    response.status(400).json({ error: 'Dados do aniversariante inválidos.', details: result.error.issues })
    return
  }
  try {
    const birthday = updateBirthday(id, result.data)
    if (!birthday) {
      response.status(404).json({ error: 'Aniversariante não encontrado.' })
      return
    }
    response.json(birthday)
  } catch (error) {
    next(error)
  }
})

app.post('/api/birthdays/:id/reminders/:year/:kind', (request, response) => {
  const id = Number(request.params.id)
  const year = Number(request.params.year)
  const kind = Number(request.params.kind)
  if (!Number.isInteger(id) || !Number.isInteger(year) || !Number.isInteger(kind)) {
    response.status(400).json({ error: 'Dados do lembrete inválidos.' })
    return
  }
  response.json({ marked: markBirthdayReminder(id, year, kind) })
})

app.delete('/api/birthdays/:id', (request, response) => {
  const id = Number(request.params.id)
  if (!Number.isInteger(id) || id < 1) {
    response.status(400).json({ error: 'Informe um ID válido.' })
    return
  }
  const birthday = deleteBirthday(id)
  if (!birthday) {
    response.status(404).json({ error: 'Aniversariante não encontrado.' })
    return
  }
  response.json(birthday)
})

app.post('/api/voice-command', (request, response) => {
  const schema = z.object({ transcript: z.string().trim().min(1).max(500) })
  const result = schema.safeParse(request.body)
  if (!result.success) {
    response.status(400).json({ error: 'Não foi possível interpretar o comando.' })
    return
  }
  response.json(parseVoiceCommand(result.data.transcript))
})

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) {
    response.status(400).json({ error: 'Dados inválidos.', details: error.issues })
    return
  }
  console.error('Operation failed', { error: error instanceof Error ? error.message : 'Unknown error' })
  response.status(500).json({ error: 'Não foi possível concluir a operação.' })
})

const port = Number(process.env.PORT ?? 3001)
app.listen(port, () => {
  console.log(`Agenda API listening on port ${port}`)
})
