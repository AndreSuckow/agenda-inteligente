import { createClient } from '@supabase/supabase-js'
import type { Priority, Recurrence, TaskStatus } from '../server/business-rules.js'

type LocalTask = {
  id: number
  title: string
  description: string | null
  due_date: string | null
  priority: Priority
  status: TaskStatus
  recurrence: Recurrence
  completed_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

type LocalSubtask = {
  task_id: number
  title: string
  position: number
  completed: number
}

type LocalBirthday = {
  id: number
  name: string
  birth_date: string
  relationship: string | null
  created_at: string
  updated_at: string
}

type LocalReminder = {
  birthday_id: number
  birthday_year: number
  kind: number
  notified_at: string
}

function requiredEnvironmentValue(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Defina ${name} antes de executar a importação.`)
  return value
}

async function main() {
  const supabaseUrl = requiredEnvironmentValue('SUPABASE_URL')
  const serviceRoleKey = requiredEnvironmentValue('SUPABASE_SERVICE_ROLE_KEY')
  const targetUserId = requiredEnvironmentValue('SUPABASE_USER_ID')
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { db } = await import('../server/db.js')

  const importedTaskIds: number[] = []
  const importedBirthdayIds: number[] = []

  try {
    const { data: userResult, error: userError } = await client.auth.admin.getUserById(targetUserId)
    if (userError) throw userError
    if (!userResult.user) throw new Error('A conta Supabase informada não foi encontrada.')

    const [existingTasks, existingBirthdays] = await Promise.all([
      client.from('tasks').select('id', { count: 'exact', head: true }).eq('user_id', targetUserId),
      client.from('birthdays').select('id', { count: 'exact', head: true }).eq('user_id', targetUserId),
    ])
    if (existingTasks.error) throw existingTasks.error
    if (existingBirthdays.error) throw existingBirthdays.error
    if ((existingTasks.count ?? 0) > 0 || (existingBirthdays.count ?? 0) > 0) {
      throw new Error('A conta Supabase já possui dados. A importação foi interrompida para evitar duplicações.')
    }

    const tasks = db.prepare(`
      SELECT id, title, description, due_date, priority, status, recurrence,
        completed_at, created_at, updated_at, deleted_at
      FROM tasks
      ORDER BY id
    `).all() as LocalTask[]
    const subtasks = db.prepare(`
      SELECT task_id, title, position, completed
      FROM task_subtasks
      ORDER BY task_id, position
    `).all() as LocalSubtask[]
    const birthdays = db.prepare(`
      SELECT id, name, birth_date, relationship, created_at, updated_at
      FROM birthdays
      ORDER BY id
    `).all() as LocalBirthday[]
    const reminders = db.prepare(`
      SELECT birthday_id, birthday_year, kind, notified_at
      FROM birthday_reminders
      ORDER BY birthday_id, birthday_year, kind
    `).all() as LocalReminder[]

    const taskIds = new Map<number, number>()
    for (const task of tasks) {
      const { data, error } = await client.from('tasks').insert({
        user_id: targetUserId,
        title: task.title,
        description: task.description,
        due_date: task.due_date,
        priority: task.priority,
        status: task.status,
        recurrence: task.recurrence,
        completed_at: task.completed_at,
        created_at: task.created_at,
        updated_at: task.updated_at,
        deleted_at: task.deleted_at,
      }).select('id').single()
      if (error) throw error
      taskIds.set(task.id, Number(data.id))
      importedTaskIds.push(Number(data.id))
    }

    const subtaskRows = subtasks.flatMap((subtask) => {
      const taskId = taskIds.get(subtask.task_id)
      return taskId === undefined ? [] : [{
        user_id: targetUserId,
        task_id: taskId,
        title: subtask.title,
        position: subtask.position,
        completed: subtask.completed === 1,
      }]
    })
    if (subtaskRows.length > 0) {
      const { error } = await client.from('task_subtasks').insert(subtaskRows)
      if (error) throw error
    }

    const birthdayIds = new Map<number, number>()
    for (const birthday of birthdays) {
      const { data, error } = await client.from('birthdays').insert({
        user_id: targetUserId,
        name: birthday.name,
        birth_date: birthday.birth_date,
        relationship: birthday.relationship,
        created_at: birthday.created_at,
        updated_at: birthday.updated_at,
      }).select('id').single()
      if (error) throw error
      birthdayIds.set(birthday.id, Number(data.id))
      importedBirthdayIds.push(Number(data.id))
    }

    const reminderRows = reminders.flatMap((reminder) => {
      const birthdayId = birthdayIds.get(reminder.birthday_id)
      return birthdayId === undefined ? [] : [{
        user_id: targetUserId,
        birthday_id: birthdayId,
        birthday_year: reminder.birthday_year,
        kind: reminder.kind,
        notified_at: reminder.notified_at,
      }]
    })
    if (reminderRows.length > 0) {
      const { error } = await client.from('birthday_reminders').insert(reminderRows)
      if (error) throw error
    }

    console.log(`Importados ${tasks.length} tarefas e ${birthdays.length} aniversariantes para a conta Supabase.`)
  } catch (error) {
    const cleanupErrors: string[] = []
    if (importedTaskIds.length > 0) {
      const { error: cleanupError } = await client.from('tasks').delete().in('id', importedTaskIds)
      if (cleanupError) cleanupErrors.push(cleanupError.message)
    }
    if (importedBirthdayIds.length > 0) {
      const { error: cleanupError } = await client.from('birthdays').delete().in('id', importedBirthdayIds)
      if (cleanupError) cleanupErrors.push(cleanupError.message)
    }
    const message = error instanceof Error ? error.message : 'Erro inesperado.'
    if (cleanupErrors.length > 0) {
      throw new Error(`${message} A limpeza dos dados parciais também falhou: ${cleanupErrors.join('; ')}`)
    }
    throw new Error(`Importação interrompida; os dados parciais foram removidos. ${message}`)
  } finally {
    db.close()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Erro inesperado durante a importação.')
  process.exitCode = 1
})
