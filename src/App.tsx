import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { BarChart3, CalendarDays, Gift, List, LogOut, MicOff, Plus, Search, Trash2, X } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import type { Priority, Recurrence, Subtask, Task, TaskStatus } from '../server/business-rules'
import MonthCalendar from './components/MonthCalendar'
import BirthdayManager from './components/BirthdayManager'
import GoogleLoginScreen from './components/GoogleLoginScreen'
import { toast, Toaster } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { apiRequest } from './lib/api'
import { isSupabaseConfigured, supabase, supabaseConfigError } from './lib/supabase'

const Dashboard = lazy(() => import('./components/Dashboard'))

const emptyForm = {
  title: '',
  description: '',
  dueDate: '',
  priority: 'medium' as Priority,
  recurrence: 'none' as Recurrence,
  status: 'pending' as TaskStatus,
}

function priorityLabel(priority: Priority) {
  return { low: 'Baixa', medium: 'Média', high: 'Alta' }[priority]
}

function formatDate(date: string | null) {
  if (!date) return 'Sem prazo'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(`${date}T12:00:00`))
}

function formatTimestamp(timestamp: string) {
  const createdAt = new Date(timestamp)
  const dateLabel = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(createdAt)
  const timeLabel = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(createdAt)
  const offsetMinutes = -createdAt.getTimezoneOffset()
  const offsetSign = offsetMinutes >= 0 ? '+' : '-'
  const offsetHours = String(Math.floor(Math.abs(offsetMinutes) / 60)).padStart(2, '0')
  const offsetRemainder = String(Math.abs(offsetMinutes) % 60).padStart(2, '0')

  return `${timeLabel} (GMT${offsetSign}${offsetHours}:${offsetRemainder}) · ${dateLabel}`
}

function descriptionForForm(task: Task) {
  const subtaskLines = task.subtasks.map((subtask) => `- ${subtask.title}`)
  return [task.description?.trim(), ...subtaskLines].filter(Boolean).join('\n')
}

function isOverdue(task: Task) {
  if (!task.dueDate || task.status === 'completed') return false
  return new Date(`${task.dueDate}T23:59:59`).getTime() < Date.now()
}

function App() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured)
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | TaskStatus | 'deleted'>('active')
  const [createdAfter, setCreatedAfter] = useState('')
  const [createdBefore, setCreatedBefore] = useState('')
  const [view, setView] = useState<'list' | 'calendar' | 'birthdays' | 'dashboard'>('list')
  const [calendarAddOpen, setCalendarAddOpen] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(() => new Date())
  const [todayKey] = useState(() => {
    const today = new Date()
    return [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-')
  })
  const [error, setError] = useState('')
  const [voiceMessage, setVoiceMessage] = useState('Comandos de voz desativados temporariamente para melhorias.')

  useEffect(() => {
    if (!supabase) return
    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') setTasks([])
      setSession(nextSession)
      setAuthLoading(false)
      setAuthError('')
    })
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return
      if (sessionError) setAuthError(sessionError.message)
      setSession(data.session)
      setAuthLoading(false)
    }).catch((sessionError: unknown) => {
      if (!active) return
      setAuthError(sessionError instanceof Error ? sessionError.message : 'Não foi possível verificar a sessão.')
      setAuthLoading(false)
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const loadTasks = async () => {
    try {
      setTasks(await apiRequest<Task[]>('/api/tasks'))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar as atividades.')
    }
  }

  useEffect(() => {
    if (isSupabaseConfigured && authLoading) return
    if (isSupabaseConfigured && !session) return
    if (import.meta.env.PROD && !isSupabaseConfigured) return
    let active = true
    void apiRequest<Task[]>('/api/tasks')
      .then((loadedTasks) => {
        if (active) setTasks(loadedTasks)
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar as atividades.')
        }
      })
    return () => {
      active = false
    }
  }, [session, authLoading])

  const signInWithGoogle = async () => {
    if (!supabase) return
    setAuthBusy(true)
    setAuthError('')
    try {
      const redirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).toString()
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      })
      if (signInError) setAuthError(signInError.message)
    } catch (signInError) {
      setAuthError(signInError instanceof Error ? signInError.message : 'Não foi possível iniciar o login Google.')
    } finally {
      setAuthBusy(false)
    }
  }

  const signOut = async () => {
    if (!supabase) return
    try {
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) throw signOutError
      setTasks([])
      setView('list')
    } catch (signOutError) {
      setError(`Não foi possível encerrar a sessão: ${signOutError instanceof Error ? signOutError.message : 'Erro inesperado.'}`)
    }
  }

  const filteredTasks = useMemo(() => {
    const query = search.toLowerCase()
    const createdAfterTimestamp = createdAfter ? new Date(createdAfter).getTime() : null
    const createdBeforeTimestamp = createdBefore ? new Date(createdBefore).getTime() + 59_999 : null
    return tasks.filter((task) =>
      (filter === 'all'
        ? true
        : filter === 'active'
          ? !task.deletedAt
          : filter === 'deleted'
            ? Boolean(task.deletedAt)
            : task.status === filter && !task.deletedAt) &&
      (createdAfterTimestamp === null || new Date(task.createdAt).getTime() >= createdAfterTimestamp) &&
      (createdBeforeTimestamp === null || new Date(task.createdAt).getTime() <= createdBeforeTimestamp) &&
      (`${task.title} ${task.description ?? ''} ${task.id}`.toLowerCase().includes(query)),
    )
  }, [tasks, search, filter, createdAfter, createdBefore])

  const resetForm = () => {
    setForm(emptyForm)
    setEditingId(null)
    setCalendarAddOpen(false)
  }

  const openCalendarView = () => {
    setSearch('')
    setFilter('active')
    setCreatedAfter('')
    setCreatedBefore('')
    setView('calendar')
  }

  const openCalendarForm = () => {
    setForm(emptyForm)
    setEditingId(null)
    setError('')
    setCalendarAddOpen(true)
  }

  const openNewTaskFromDashboard = () => {
    setView('list')
    setForm(emptyForm)
    setEditingId(null)
    setCalendarAddOpen(false)
    setError('')
    toast.success('Formulário de nova tarefa aberto.')
  }

  const saveTask = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      const payload = {
        title: form.title,
        description: form.description || undefined,
        dueDate: form.dueDate || undefined,
        priority: form.priority,
        recurrence: form.recurrence,
        status: form.status,
      }
      if (editingId) {
        await apiRequest<Task>(`/api/tasks/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) })
      } else {
        await apiRequest<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(payload) })
      }
      resetForm()
      await loadTasks()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível salvar a atividade.')
    }
  }

  const editTask = (task: Task) => {
    setEditingId(task.id)
    setForm({
      title: task.title,
      description: descriptionForForm(task),
      dueDate: task.dueDate ?? '',
      priority: task.priority,
      recurrence: task.recurrence,
      status: task.status,
    })
    if (view === 'calendar') setCalendarAddOpen(true)
  }

  const deleteTask = async (id: number) => {
    setError('')
    try {
      const deletedTask = await apiRequest<Task>(`/api/tasks/${id}`, { method: 'DELETE' })
      if (!deletedTask.deletedAt) throw new Error('A atividade foi excluída, mas o horário não foi retornado.')
      if (editingId === id) resetForm()
      await loadTasks()
      setVoiceMessage(`Atividade #${id} excluída às ${formatTimestamp(deletedTask.deletedAt)}.`)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível excluir a atividade.')
    }
  }

  const toggleStatus = async (task: Task) => {
    setError('')
    try {
      await apiRequest<Task>(`/api/tasks/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: task.title,
          description: descriptionForForm(task) || undefined,
          dueDate: task.dueDate ?? undefined,
          priority: task.priority,
          recurrence: task.recurrence,
          status: task.status === 'completed' ? 'pending' : 'completed',
        }),
      })
      await loadTasks()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível atualizar a atividade.')
    }
  }

  const toggleSubtask = async (task: Task, subtask: Subtask, completed: boolean) => {
    setError('')
    try {
      await apiRequest<Task>(`/api/tasks/${task.id}/subtasks/${subtask.position}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed }),
      })
      await loadTasks()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível atualizar a subtarefa.')
    }
  }

  if (supabaseConfigError || (import.meta.env.PROD && !isSupabaseConfigured)) {
    return (
      <main className="theme-dark grid min-h-screen place-items-center bg-background px-4 text-foreground">
        <section className="max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 text-center">
          <h1 className="text-lg font-semibold">Configuração online incompleta</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para publicar o Agenda Inteligente.
          </p>
        </section>
      </main>
    )
  }

  if (isSupabaseConfigured && authLoading) {
    return (
      <main className="theme-dark grid min-h-screen place-items-center bg-background text-foreground" role="status">
        <p className="text-sm text-zinc-400">Verificando sua sessão...</p>
      </main>
    )
  }

  if (isSupabaseConfigured && !session) {
    return <GoogleLoginScreen busy={authBusy} error={authError} onSignIn={() => void signInWithGoogle()} />
  }

  return (
    <main className="theme-dark min-h-screen bg-background text-foreground">
      <Toaster position="top-right" theme="dark" richColors />
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 sm:py-5">
          <button
            type="button"
            onClick={() => setView('list')}
            aria-label="Voltar para a tela inicial"
            className="flex items-center gap-3 rounded-lg text-left transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-indigo-600 text-white sm:size-10">
              <CalendarDays size={22} />
            </div>
            <div className="min-w-0">
              <h1 className="whitespace-nowrap text-lg font-bold">Agenda Inteligente</h1>
              <p className="text-xs text-slate-500">Organize suas atividades</p>
            </div>
          </button>
          {view !== 'dashboard' && (
            <button
              type="button"
              disabled
              aria-label="Comandos de voz desativados"
              title="Comandos de voz temporariamente desativados para melhorias."
              className="hidden cursor-not-allowed items-center gap-2 rounded-full bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-500 sm:flex"
            >
              <MicOff size={17} />
              Voz desativada para melhorias
            </button>
          )}
          {view !== 'list' && (
            <button
              type="button"
              onClick={() => setView('list')}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Lista
            </button>
          )}
          {isSupabaseConfigured && session && (
            <div className="flex items-center gap-2">
              <span className="hidden max-w-48 truncate text-xs text-slate-500 md:block">{session.user.email}</span>
              <button
                type="button"
                onClick={() => void signOut()}
                aria-label="Sair da conta"
                title="Sair da conta"
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                <LogOut size={16} />
                <span className="hidden sm:inline">Sair</span>
              </button>
            </div>
          )}
        </div>
      </header>

      <div className={view === 'calendar'
        ? 'mx-auto w-full max-w-[1920px] px-2 py-2 sm:px-4'
        : view === 'birthdays' || view === 'dashboard'
          ? 'mx-auto max-w-7xl px-6 py-8'
          : 'mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[360px_1fr]'}>
        {view === 'calendar' && calendarAddOpen && (
          <button
            type="button"
            aria-label="Fechar formulário"
            onClick={() => setCalendarAddOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-slate-950/30"
          />
        )}
        {view !== 'birthdays' && view !== 'dashboard' && (
        <aside className={view === 'calendar'
          ? calendarAddOpen
            ? 'fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl'
            : 'hidden'
          : 'h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold">{editingId ? `Editar atividade #${editingId}` : 'Nova atividade'}</h2>
            {view === 'calendar' && (
              <button
                type="button"
                onClick={() => setCalendarAddOpen(false)}
                aria-label="Fechar formulário"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            )}
          </div>
          {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <form onSubmit={saveTask} className="space-y-4">
            <label className="block text-sm font-medium">
              Título
              <input required maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <label className="block text-sm font-medium">
              Descrição
              <textarea
                maxLength={1000}
                rows={4}
                placeholder={'Use "-" no começo da linha para criar uma subtarefa:\n- Fazer a\n- Fazer b'}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                className="mt-1.5 w-full resize-none rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-medium">
                Prazo
                <input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" />
              </label>
              <label className="text-sm font-medium">
                Prioridade
                <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as Priority })}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm">
                  <option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option>
                </select>
              </label>
            </div>
            <label className="block text-sm font-medium">
              Recorrência
              <select value={form.recurrence} onChange={(event) => setForm({ ...form, recurrence: event.target.value as Recurrence })}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2">
                <option value="none">Não repetir</option><option value="daily">Diária</option><option value="weekly">Semanal</option><option value="monthly">Mensal</option>
              </select>
            </label>
            {editingId && (
              <label className="block text-sm font-medium">
                Status
                <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as TaskStatus })}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2">
                  <option value="pending">Pendente</option><option value="completed">Concluída</option>
                </select>
              </label>
            )}
            <div className="flex gap-2">
              <button type="submit" className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">
                <Plus size={16} /> {editingId ? 'Salvar alterações' : 'Adicionar'}
              </button>
              <button
                type="button"
                disabled
                aria-label="Comandos de voz desativados"
                title="Comandos de voz temporariamente desativados para melhorias."
                className="grid size-10 shrink-0 cursor-not-allowed place-items-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 sm:hidden"
              >
                <MicOff size={16} />
              </button>
              {editingId && <button type="button" onClick={resetForm} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Cancelar</button>}
            </div>
          </form>
          <div className="mt-5 rounded-lg bg-slate-100 px-3 py-2.5 text-xs leading-5 text-slate-600">
            <strong className="text-slate-800">Aviso:</strong> {voiceMessage}
          </div>
        </aside>
        )}

        <section>
          {view === 'birthdays' ? (
            <BirthdayManager />
          ) : view === 'dashboard' ? (
            <Suspense fallback={
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }, (_, index) => (
                  <div key={index} className="space-y-3 rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4">
                    <Skeleton className="h-4 w-28 bg-zinc-800" />
                    <Skeleton className="h-8 w-20 bg-zinc-800" />
                    <Skeleton className="h-4 w-36 bg-zinc-800" />
                  </div>
                ))}
                <div className="space-y-3 rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4 sm:col-span-2 xl:col-span-4">
                  <Skeleton className="h-5 w-56 bg-zinc-800" />
                  <Skeleton className="h-64 w-full bg-zinc-800" />
                </div>
              </div>
            }>
              <Dashboard tasks={tasks} onCreateTask={openNewTaskFromDashboard} />
            </Suspense>
          ) : view === 'list' ? (
            <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por título, descrição ou ID"
                className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-indigo-400" />
            </div>
            <select value={filter} onChange={(event) => setFilter(event.target.value as 'all' | 'active' | TaskStatus | 'deleted')}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm">
              <option value="all">Todas</option>
              <option value="active">Ativas</option>
              <option value="pending">Pendentes</option>
              <option value="completed">Concluídas</option>
              <option value="deleted">Excluídas</option>
            </select>
            <div className="flex flex-wrap rounded-lg border border-slate-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setView('list')}
                aria-pressed
                className="flex items-center gap-1.5 rounded-md bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700"
              >
                <List size={16} /> Lista
              </button>
              <button
                type="button"
                onClick={openCalendarView}
                aria-pressed={false}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                <CalendarDays size={16} /> Calendário
              </button>
              <button
                type="button"
                onClick={() => setView('birthdays')}
                aria-pressed={false}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-pink-50 hover:text-pink-700"
              >
                <Gift size={16} /> Aniversários
              </button>
              <button
                type="button"
                onClick={() => setView('dashboard')}
                aria-pressed={false}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
              >
                <BarChart3 size={16} /> Dashboard
              </button>
            </div>
          </div>
          <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="block text-xs font-medium text-slate-600">
              Criada a partir de
              <input
                type="datetime-local"
                value={createdAfter}
                onChange={(event) => setCreatedAfter(event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-900"
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Criada até
              <input
                type="datetime-local"
                value={createdBefore}
                onChange={(event) => setCreatedBefore(event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-900"
              />
            </label>
            {(createdAfter || createdBefore) && (
              <button
                type="button"
                onClick={() => {
                  setCreatedAfter('')
                  setCreatedBefore('')
                }}
                className="rounded-lg px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
              >
                Limpar período
              </button>
            )}
          </div>
          <div className="space-y-3">
            {filteredTasks.map((task) => (
              <article key={task.id} className={`rounded-xl border bg-white p-4 shadow-sm ${task.status === 'completed' ? 'border-slate-200 opacity-70' : 'border-slate-200'}`}>
                <div className="flex items-start gap-3">
                  {!task.deletedAt && (
                    <button type="button" onClick={() => void toggleStatus(task)} aria-label={task.status === 'completed' ? 'Reabrir atividade' : 'Concluir atividade'}
                      className={`mt-0.5 size-5 shrink-0 rounded-full border-2 ${task.status === 'completed' ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'}`} />
                  )}
                  <div className="min-w-0 flex-1">
                    <button type="button" onClick={() => editTask(task)} disabled={Boolean(task.deletedAt)}
                      className="block w-full text-left disabled:cursor-default">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-bold text-slate-500">#{task.id}</span>
                        <h3 className={`font-semibold ${task.status === 'completed' ? 'line-through text-slate-500' : ''}`}>{task.title}</h3>
                      </div>
                      {task.description && <p className="mt-1 text-sm text-slate-500">{task.description}</p>}
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className={`rounded-full px-2 py-1 ${task.priority === 'high' ? 'bg-red-50 text-red-700' : task.priority === 'medium' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                          Prioridade {priorityLabel(task.priority)}
                        </span>
                        <span className={`rounded-full px-2 py-1 ${isOverdue(task) ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                          {isOverdue(task) ? 'Atrasada · ' : ''}{formatDate(task.dueDate)}
                        </span>
                        {task.recurrence !== 'none' && <span className="rounded-full bg-indigo-50 px-2 py-1 text-indigo-700">Recorrente</span>}
                        {task.subtasks.length > 0 && (
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
                            {task.subtasks.filter((subtask) => subtask.completed).length}/{task.subtasks.length} subtarefas
                          </span>
                        )}
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
                          Criada às {formatTimestamp(task.createdAt)}
                        </span>
                        {task.deletedAt && (
                          <span className="rounded-full bg-red-50 px-2 py-1 text-red-700">
                            Excluída às {formatTimestamp(task.deletedAt)}
                          </span>
                        )}
                      </div>
                    </button>
                    {task.subtasks.length > 0 && (
                      <div className="mt-3 space-y-1.5 border-l-2 border-slate-200 pl-3">
                        {task.subtasks.map((subtask) => (
                          <label key={`${task.id}-${subtask.position}`} className="flex items-start gap-2 text-sm text-slate-600">
                            <input
                              type="checkbox"
                              checked={subtask.completed}
                              disabled={Boolean(task.deletedAt)}
                              onChange={(event) => void toggleSubtask(task, subtask, event.target.checked)}
                              className="mt-0.5 size-4 rounded border-slate-300 accent-indigo-600"
                            />
                            <span className={subtask.completed ? 'text-slate-400 line-through' : ''}>{subtask.title}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  {!task.deletedAt && (
                    <button type="button" onClick={() => void deleteTask(task.id)} aria-label={`Excluir atividade ${task.id}`}
                      className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600">
                      <Trash2 size={17} />
                    </button>
                  )}
                </div>
              </article>
            ))}
            {filteredTasks.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center text-sm text-slate-500">
                Nenhuma atividade encontrada.
              </div>
            )}
          </div>
            </>
          ) : (
            <>
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  onClick={openCalendarForm}
                  className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
                >
                  <Plus size={15} /> Adicionar atividade
                </button>
              </div>
              <MonthCalendar
                tasks={tasks.filter((task) => !task.deletedAt)}
                month={calendarMonth}
                todayKey={todayKey}
                onMonthChange={setCalendarMonth}
                onTaskSelect={editTask}
              />
            </>
          )}
        </section>
      </div>
    </main>
  )
}

export default App
