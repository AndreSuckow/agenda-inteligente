export type Priority = 'low' | 'medium' | 'high'
export type TaskStatus = 'pending' | 'completed'
export type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly'

export interface Subtask {
  id: number
  title: string
  position: number
  completed: boolean
}

export interface Task {
  id: number
  title: string
  description: string | null
  dueDate: string | null
  priority: Priority
  status: TaskStatus
  recurrence: Recurrence
  completedAt: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  subtasks: Subtask[]
}

export function isOverdue(dueDate: string | null, status: TaskStatus, now = new Date()) {
  if (!dueDate || status === 'completed') return false
  const endOfDueDay = new Date(`${dueDate}T23:59:59`)
  return Number.isNaN(endOfDueDay.getTime()) ? false : endOfDueDay.getTime() < now.getTime()
}

export function parseVoiceCommand(transcript: string) {
  const normalized = transcript.trim().toLowerCase()

  const deleteMatch =
    normalized.match(/(?:exclui|apaga|deleta).*(?:n(?:ú|u)mero|id)\s*(\d+)/) ??
    normalized.match(/(?:exclui|apaga|deleta).*(?:atividade|tarefa)\s+(?:#)?(\d+)/)
  if (deleteMatch) {
    return { type: 'delete' as const, id: Number(deleteMatch[1]) }
  }

  if (/^(nova|n(?:ó|o)va|adiciona|adicione|cria|criar|agende|adicionar)\b/.test(normalized)) {
    const title = normalized
      .replace(/^(?:nova|n(?:ó|o)va|adiciona|adicione|cria|criar|agende|adicionar)\b\s*/, '')
      .replace(/^(?:nova|n(?:ó|o)va)\b\s*/, '')
      .replace(/^(?:atividade|tarefa)\s*/, '')
      .replace(/^uma?\s*(?:atividade|tarefa)?\s*/, '')
      .replace(/^para\s*/, '')
      .trim()
    if (title) return { type: 'create' as const, title: createVoiceTitle(title) }
  }

  if (/^(lavar|estudar|comprar|pagar|ligar|enviar|fazer|preparar|buscar|reuni)/.test(normalized)) {
    return { type: 'create' as const, title: createVoiceTitle(normalized) }
  }

  return { type: 'unknown' as const }
}

function createVoiceTitle(text: string) {
  const title = text
    .replace(/^(?:atividade|tarefa)\s+/, '')
    .replace(/[.!]+$/, '')
    .trim()
  return title.charAt(0).toUpperCase() + title.slice(1)
}
