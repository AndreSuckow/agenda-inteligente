import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { BarChart3, CalendarDays, ChevronDown, ChevronUp, Gift, List, LogOut, MicOff, Moon, Plus, Search, Sun, Trash2, X } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import type { Priority, Recurrence, Subtask, Task, TaskStatus } from '../server/business-rules'
import MonthCalendar from './components/MonthCalendar'
import BirthdayManager from './components/BirthdayManager'
import GoogleLoginScreen from './components/GoogleLoginScreen'
import { toast, Toaster } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { apiRequest } from './lib/api'
import { isSupabaseConfigured, supabase, supabaseConfigError } from './lib/supabase'
import { isCompletedAfterDueDate } from './dashboard-utils'
import { MAX_TASK_TAG_LENGTH, MAX_TASK_TAGS, normalizeTaskTags } from '../shared/task-tag-rules'

const Dashboard = lazy(() => import('./components/Dashboard'))
type TaskFilter = 'all' | 'active' | 'overdue' | 'overdue-completed' | TaskStatus | 'deleted'

const emptyForm = {
  title: '',
  description: '',
  tags: [] as string[],
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

function dateInputValueFromToday(offsetDays: number) {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
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

function readInitialPreferences() {
  if (isSupabaseConfigured) return { theme: 'dark' as const, error: '' }
  try {
    return {
      theme: window.localStorage.getItem('agenda-inteligente-theme') === 'light' ? 'light' as const : 'dark' as const,
      error: '',
    }
  } catch (storageError) {
    return {
      theme: 'dark' as const,
      error: `Não foi possível carregar a preferência de tema: ${storageError instanceof Error ? storageError.message : 'Erro inesperado.'}`,
    }
  }
}

function ProfileAvatar({ picture, name }: { picture: string; name: string }) {
  const [pictureFailed, setPictureFailed] = useState(false)
  if (picture && !pictureFailed) {
    return <img src={picture} alt="" onError={() => setPictureFailed(true)} className="size-9 rounded-full object-cover" />
  }
  return (
    <span className="grid size-9 place-items-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

function App() {
  const [initialPreferences] = useState(readInitialPreferences)
  const [tasks, setTasks] = useState<Task[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured)
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState('')
  const [theme, setTheme] = useState<'dark' | 'light'>(initialPreferences.theme)
  const [form, setForm] = useState(emptyForm)
  const [tagInput, setTagInput] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<TaskFilter>('active')
  const [selectedTag, setSelectedTag] = useState('')
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<number>>(() => new Set())
  const [createdAfter, setCreatedAfter] = useState('')
  const [createdBefore, setCreatedBefore] = useState('')
  const [appliedCreatedAfter, setAppliedCreatedAfter] = useState('')
  const [appliedCreatedBefore, setAppliedCreatedBefore] = useState('')
  const [view, setView] = useState<'list' | 'calendar' | 'birthdays' | 'dashboard'>('list')
  const profileMenuRef = useRef<HTMLDetailsElement>(null)
  const [calendarAddOpen, setCalendarAddOpen] = useState(false)
  const [mobileTaskFormOpen, setMobileTaskFormOpen] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(() => new Date())
  const [todayKey] = useState(() => {
    const today = new Date()
    return [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-')
  })
  const [error, setError] = useState(initialPreferences.error)
  const [voiceMessage, setVoiceMessage] = useState('Comandos de voz desativados temporariamente para melhorias.')

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#282a36' : '#f8fafc')
  }, [theme])

  useEffect(() => {
    const closeProfileMenuOnOutsideClick = (event: PointerEvent) => {
      const menu = profileMenuRef.current
      if (menu && event.target instanceof Node && !menu.contains(event.target)) menu.open = false
    }
    const closeProfileMenuOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && profileMenuRef.current) profileMenuRef.current.open = false
    }
    document.addEventListener('pointerdown', closeProfileMenuOnOutsideClick)
    document.addEventListener('keydown', closeProfileMenuOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeProfileMenuOnOutsideClick)
      document.removeEventListener('keydown', closeProfileMenuOnEscape)
    }
  }, [])

  useEffect(() => {
    if (!mobileTaskFormOpen) return
    const closeTaskFormOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileTaskFormOpen(false)
        setForm(emptyForm)
        setEditingId(null)
      }
    }
    document.addEventListener('keydown', closeTaskFormOnEscape)
    return () => document.removeEventListener('keydown', closeTaskFormOnEscape)
  }, [mobileTaskFormOpen])

  useEffect(() => {
    if (!supabase) return
    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') setTasks([])
      setSession(nextSession)
      const savedTheme = nextSession?.user.user_metadata.theme
      setTheme(savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'dark')
      setAuthLoading(false)
      setAuthError('')
    })
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return
      if (sessionError) setAuthError(sessionError.message)
      setSession(data.session)
      const savedTheme = data.session?.user.user_metadata.theme
      setTheme(savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'dark')
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

  const availableTags = useMemo(() => {
    const tagsByKey = new Map<string, string>()
    for (const task of tasks) {
      for (const tag of task.tags) {
        if (!tagsByKey.has(tag.toLowerCase())) tagsByKey.set(tag.toLowerCase(), tag)
      }
    }
    return [...tagsByKey.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [tasks])

  const filteredTasks = useMemo(() => {
    const query = search.toLowerCase()
    const createdAfterTimestamp = appliedCreatedAfter ? new Date(`${appliedCreatedAfter}T00:00:00`).getTime() : null
    const createdBeforeTimestamp = appliedCreatedBefore ? new Date(`${appliedCreatedBefore}T23:59:59.999`).getTime() : null
    return tasks.filter((task) =>
      (filter === 'all'
        ? true
        : filter === 'active'
          ? !task.deletedAt
          : filter === 'deleted'
            ? Boolean(task.deletedAt)
            : filter === 'overdue'
              ? !task.deletedAt && isOverdue(task)
              : filter === 'overdue-completed'
                ? !task.deletedAt && isCompletedAfterDueDate(task.dueDate, task.completedAt)
                : task.status === filter && !task.deletedAt) &&
      (!selectedTag || task.tags.some((tag) => tag.toLowerCase() === selectedTag.toLowerCase())) &&
      (createdAfterTimestamp === null || new Date(task.createdAt).getTime() >= createdAfterTimestamp) &&
      (createdBeforeTimestamp === null || new Date(task.createdAt).getTime() <= createdBeforeTimestamp) &&
      (`${task.title} ${task.description ?? ''} ${task.tags.join(' ')} ${task.id}`.toLowerCase().includes(query)),
    )
  }, [tasks, search, filter, selectedTag, appliedCreatedAfter, appliedCreatedBefore])

  const addTaskTag = () => {
    const tag = tagInput.trim()
    if (!tag) return
    if (tag.length > MAX_TASK_TAG_LENGTH) {
      setError(`Cada tag pode ter no máximo ${MAX_TASK_TAG_LENGTH} caracteres.`)
      return
    }
    if (form.tags.some((savedTag) => savedTag.toLowerCase() === tag.toLowerCase())) {
      setTagInput('')
      return
    }
    if (form.tags.length >= MAX_TASK_TAGS) {
      setError(`A atividade pode ter no máximo ${MAX_TASK_TAGS} tags.`)
      return
    }
    setForm({ ...form, tags: normalizeTaskTags([...form.tags, tag]) })
    setTagInput('')
    setError('')
  }

  const toggleTaskCollapsed = (taskId: number) => {
    setExpandedTaskIds((current) => {
      const next = new Set(current)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  const resetForm = () => {
    setForm(emptyForm)
    setTagInput('')
    setEditingId(null)
    setCalendarAddOpen(false)
    setMobileTaskFormOpen(false)
  }

  const openCalendarView = () => {
    setSearch('')
    setFilter('active')
    setSelectedTag('')
    setCreatedAfter('')
    setCreatedBefore('')
    setAppliedCreatedAfter('')
    setAppliedCreatedBefore('')
    setMobileTaskFormOpen(false)
    setView('calendar')
  }

  const navigateTo = (nextView: 'list' | 'calendar' | 'birthdays' | 'dashboard') => {
    setMobileTaskFormOpen(false)
    if (nextView === 'calendar') openCalendarView()
    else setView(nextView)
  }

  const openNewTaskFromToolbar = () => {
    setView('list')
    setForm(emptyForm)
    setTagInput('')
    setEditingId(null)
    setCalendarAddOpen(false)
    setMobileTaskFormOpen(true)
    setError('')
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.getElementById('task-title')?.focus()
      })
    })
  }

  const changeTheme = async () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    try {
      if (isSupabaseConfigured && session && supabase) {
        const { error: updateError } = await supabase.auth.updateUser({ data: { theme: nextTheme } })
        if (updateError) throw updateError
      } else {
        window.localStorage.setItem('agenda-inteligente-theme', nextTheme)
      }
      setTheme(nextTheme)
      setError('')
      toast.success(`Tema ${nextTheme === 'dark' ? 'escuro' : 'claro'} ativado.`, { duration: 2000 })
    } catch (themeError) {
      const message = themeError instanceof Error ? themeError.message : 'Erro inesperado.'
      setError(`Não foi possível salvar a preferência de tema: ${message}`)
      toast.error('Não foi possível salvar a preferência de tema.')
    }
  }

  const openCalendarForm = () => {
    setForm(emptyForm)
    setTagInput('')
    setEditingId(null)
    setMobileTaskFormOpen(false)
    setError('')
    setCalendarAddOpen(true)
  }

  const openNewTaskFromDashboard = () => {
    setView('list')
    setForm(emptyForm)
    setTagInput('')
    setEditingId(null)
    setCalendarAddOpen(false)
    setMobileTaskFormOpen(!window.matchMedia('(min-width: 1024px)').matches)
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
        tags: form.tags,
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
    setTagInput('')
    setForm({
      title: task.title,
      description: descriptionForForm(task),
      tags: task.tags,
      dueDate: task.dueDate ?? '',
      priority: task.priority,
      recurrence: task.recurrence,
      status: task.status,
    })
    if (view === 'calendar') setCalendarAddOpen(true)
    else if (!window.matchMedia('(min-width: 1024px)').matches) setMobileTaskFormOpen(true)
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
          tags: task.tags,
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

  const profileName = session
    ? String(session.user.user_metadata.full_name ?? session.user.user_metadata.name ?? session.user.email ?? 'Sua conta')
    : 'Sua conta'
  const profilePicture = session
    ? String(session.user.user_metadata.picture ?? session.user.user_metadata.avatar_url ?? '')
    : ''

  const mobileTaskDialogOpen = view === 'list' && mobileTaskFormOpen
  const taskFormIsDialog = mobileTaskDialogOpen || (view === 'calendar' && calendarAddOpen)

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
    <main className={`theme-${theme} min-h-screen bg-background pb-[calc(8.5rem+env(safe-area-inset-bottom))] text-foreground lg:pb-0`}>
      <Toaster position="top-right" theme={theme} richColors />
      <header className="relative z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-3 sm:px-6 sm:py-4">
          <button
            type="button"
            onClick={() => navigateTo('list')}
            aria-label="Voltar para a tela inicial"
            className="flex items-center gap-3 rounded-lg text-left transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-indigo-600 text-white sm:size-10">
              <CalendarDays size={22} />
            </div>
            <div className="min-w-0">
              <h1 className="whitespace-nowrap text-base font-bold text-indigo-700 sm:text-lg">Agenda Inteligente</h1>
              <p className="hidden text-xs text-indigo-700 sm:block">Organize suas atividades</p>
            </div>
          </button>
          <nav aria-label="Navegação principal" className="hidden items-center gap-1 lg:flex">
            <button type="button" onClick={() => navigateTo('list')} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${view === 'list' ? 'bg-pink-50 text-pink-700' : 'text-slate-600 hover:bg-pink-50 hover:text-pink-700'}`} aria-current={view === 'list' ? 'page' : undefined}><List size={16} /> Lista</button>
            <button type="button" onClick={() => navigateTo('calendar')} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${view === 'calendar' ? 'bg-pink-50 text-pink-700' : 'text-slate-600 hover:bg-pink-50 hover:text-pink-700'}`} aria-current={view === 'calendar' ? 'page' : undefined}><CalendarDays size={16} /> Calendário</button>
            <button type="button" onClick={() => navigateTo('birthdays')} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${view === 'birthdays' ? 'bg-pink-50 text-pink-700' : 'text-slate-600 hover:bg-pink-50 hover:text-pink-700'}`} aria-current={view === 'birthdays' ? 'page' : undefined}><Gift size={16} /> Aniversários</button>
            <button type="button" onClick={() => navigateTo('dashboard')} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${view === 'dashboard' ? 'bg-pink-50 text-pink-700' : 'text-slate-600 hover:bg-pink-50 hover:text-pink-700'}`} aria-current={view === 'dashboard' ? 'page' : undefined}><BarChart3 size={16} /> Dashboard</button>
          </nav>
          <details ref={profileMenuRef} className="group relative shrink-0">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg p-1.5 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
              <ProfileAvatar key={profilePicture} picture={profilePicture} name={profileName} />
              <span className="hidden max-w-32 truncate text-left text-sm font-medium sm:block">{profileName}</span>
              <ChevronDown size={16} className="hidden text-slate-500 sm:block" />
            </summary>
            <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
              <div className="mb-3 border-b border-slate-100 px-2 pb-3">
                <p className="truncate text-sm font-semibold">{profileName}</p>
                {session?.user.email && <p className="truncate text-xs text-slate-500">{session.user.email}</p>}
              </div>
              <button type="button" onClick={() => void changeTheme()} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                Usar tema {theme === 'dark' ? 'claro' : 'escuro'}
              </button>
              {session && (
                <button type="button" onClick={() => void signOut()} className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                  <LogOut size={16} /> Sair da conta
                </button>
              )}
            </div>
          </details>
        </div>
      </header>

      <div className={view === 'calendar'
        ? 'mx-auto w-full max-w-[1920px] px-2 py-2 sm:px-4'
        : view === 'birthdays' || view === 'dashboard'
          ? 'mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8'
          : 'mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:grid-cols-[360px_1fr]'}>
        {view === 'calendar' && calendarAddOpen && (
          <button
            type="button"
            aria-label="Fechar formulário"
            onClick={() => setCalendarAddOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-slate-950/30"
          />
        )}
        {mobileTaskDialogOpen && (
          <button
            type="button"
            aria-label="Fechar formulário de atividade"
            onClick={resetForm}
            className="fixed inset-0 z-40 cursor-default bg-slate-950/40 lg:hidden"
          />
        )}
        {view !== 'birthdays' && view !== 'dashboard' && (
        <aside
          id="task-form"
          role={taskFormIsDialog ? 'dialog' : undefined}
          aria-modal={taskFormIsDialog || undefined}
          aria-labelledby="task-form-title"
          className={view === 'calendar'
          ? calendarAddOpen
            ? 'fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl'
            : 'hidden'
          : mobileTaskFormOpen
            ? 'fixed inset-2 z-50 max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl lg:static lg:inset-auto lg:z-auto lg:max-h-none lg:h-fit lg:overflow-visible lg:shadow-sm'
            : 'hidden h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:block'}>
          <div className="mb-4 flex items-center justify-between">
            <h2 id="task-form-title" className="text-base font-bold">{editingId ? `Editar atividade #${editingId}` : 'Nova atividade'}</h2>
            {(view === 'calendar' || mobileTaskDialogOpen) && (
              <button
                type="button"
                onClick={view === 'calendar' ? () => setCalendarAddOpen(false) : resetForm}
                aria-label="Fechar formulário"
                className={`rounded-lg p-2 text-slate-500 hover:bg-slate-100 ${mobileTaskDialogOpen ? 'lg:hidden' : ''}`}
              >
                <X size={18} />
              </button>
            )}
          </div>
          {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <form onSubmit={saveTask} className="space-y-4">
            <label className="block text-sm font-medium">
              Título
              <input id="task-title" required maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })}
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
            <div>
              <label htmlFor="task-tag-input" className="block text-sm font-medium">Tags</label>
              <div className="mt-1.5 flex gap-2">
                <input
                  id="task-tag-input"
                  value={tagInput}
                  maxLength={MAX_TASK_TAG_LENGTH}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ',') {
                      event.preventDefault()
                      addTaskTag()
                    }
                  }}
                  placeholder="Digite uma tag e pressione Enter"
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
                <button
                  type="button"
                  onClick={addTaskTag}
                  className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"
                >
                  Adicionar
                </button>
              </div>
              {form.tags.length > 0 && (
                <div aria-label="Tags adicionadas" className="mt-2 flex flex-wrap gap-2">
                  {form.tags.map((tag) => (
                    <span key={tag.toLowerCase()} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                      {tag}
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, tags: form.tags.filter((savedTag) => savedTag !== tag) })}
                        aria-label={`Remover tag ${tag}`}
                        className="rounded-full p-0.5 hover:bg-pink-100 hover:text-pink-700"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
              <div>
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1">
                  <label htmlFor="task-due-date" className="text-sm font-medium">Prazo</label>
                  <div role="group" aria-label="Atalhos rápidos de prazo" className="flex items-center gap-0.5">
                    {[
                      { label: 'Ontem', offset: -1 },
                      { label: 'Hoje', offset: 0 },
                      { label: 'Amanhã', offset: 1 },
                    ].map(({ label, offset }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setForm({ ...form, dueDate: dateInputValueFromToday(offset) })}
                        className="rounded-md px-1.5 py-1 text-xs font-medium text-slate-600 hover:bg-pink-50 hover:text-pink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <input id="task-due-date" type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" />
              </div>
              <label className="block text-sm font-medium">
                Prioridade
                <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as Priority })}
                  className="mt-1.5 block w-24 rounded-lg border border-slate-300 px-2 py-2 text-sm">
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
              <button type="submit" className="add-activity-button flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold hover:opacity-90">
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
            <select value={filter} onChange={(event) => setFilter(event.target.value as TaskFilter)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm">
              <option value="all">Todas</option>
              <option value="active">Ativas</option>
              <option value="pending">Pendentes</option>
              <option value="completed">Concluídas</option>
              <option value="overdue">Atrasadas</option>
              <option value="overdue-completed">Atrasadas concluídas</option>
              <option value="deleted">Excluídas</option>
            </select>
            <select
              aria-label="Filtrar por tag"
              value={selectedTag}
              onChange={(event) => setSelectedTag(event.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">Todas as tags</option>
              {selectedTag && !availableTags.some((tag) => tag.toLowerCase() === selectedTag.toLowerCase()) && (
                <option value={selectedTag}>{selectedTag} (sem atividades)</option>
              )}
              {availableTags.map((tag) => <option key={tag.toLowerCase()} value={tag}>{tag}</option>)}
            </select>
          </div>
          <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="block text-xs font-medium text-slate-600">
              Criada a partir de
              <input
                type="date"
                value={createdAfter}
                onChange={(event) => setCreatedAfter(event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-900"
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Criada até
              <input
                type="date"
                value={createdBefore}
                onChange={(event) => setCreatedBefore(event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-900"
              />
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  setAppliedCreatedAfter(createdAfter)
                  setAppliedCreatedBefore(createdBefore)
                }}
                className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
              >
                <Search size={16} />
                Buscar
              </button>
              {(createdAfter || createdBefore || appliedCreatedAfter || appliedCreatedBefore) && (
                <button
                  type="button"
                  onClick={() => {
                    setCreatedAfter('')
                    setCreatedBefore('')
                    setAppliedCreatedAfter('')
                    setAppliedCreatedBefore('')
                  }}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
                >
                  Limpar período
                </button>
              )}
            </div>
          </div>
          <div className="space-y-3">
            {filteredTasks.map((task) => {
              const isCollapsed = !expandedTaskIds.has(task.id)
              const completedSubtasks = task.subtasks.filter((subtask) => subtask.completed).length
              return (
                <article key={task.id} className={`rounded-xl border bg-white p-4 shadow-sm ${task.status === 'completed' ? 'border-slate-200 opacity-70' : 'border-slate-200'}`}>
                  <div className={`flex gap-3 ${isCollapsed ? 'items-center' : 'items-start'}`}>
                    {!task.deletedAt && (
                      <button type="button" onClick={() => void toggleStatus(task)} aria-label={task.status === 'completed' ? 'Reabrir atividade' : 'Concluir atividade'}
                        aria-pressed={task.status === 'completed'}
                        className={`task-completion-toggle size-5 shrink-0 rounded-full border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${isCollapsed ? '' : 'mt-0.5'} ${task.status === 'completed' ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'}`} />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => editTask(task)} disabled={Boolean(task.deletedAt)}
                          className="block min-w-0 flex-1 text-left disabled:cursor-default">
                          <div className="flex min-w-0 items-center gap-2">
                            {!isCollapsed && <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-bold text-slate-500">#{task.id}</span>}
                            <h3 className={`min-w-0 font-semibold ${isCollapsed ? 'truncate' : ''} ${task.status === 'completed' ? 'line-through text-slate-500' : ''}`}>{task.title}</h3>
                            {isCollapsed && task.subtasks.length > 0 && (
                              <span aria-label={`${completedSubtasks} de ${task.subtasks.length} subtarefas concluídas`} className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                {completedSubtasks}/{task.subtasks.length}
                              </span>
                            )}
                          </div>
                          {!isCollapsed && (
                            <>
                              {task.description && <p className="mt-1 text-sm text-slate-500">{task.description}</p>}
                              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                <span className={`rounded-full px-2 py-1 ${task.priority === 'high' ? 'bg-red-50 text-red-700' : task.priority === 'medium' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                                  Prioridade {priorityLabel(task.priority)}
                                </span>
                                <span className={`rounded-full px-2 py-1 ${isOverdue(task) || isCompletedAfterDueDate(task.dueDate, task.completedAt) ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                                  {isOverdue(task) ? 'Atrasada · ' : isCompletedAfterDueDate(task.dueDate, task.completedAt) ? 'Concluída com atraso · ' : ''}{formatDate(task.dueDate)}
                                </span>
                                {task.tags.map((tag) => (
                                  <span key={tag.toLowerCase()} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">#{tag}</span>
                                ))}
                                {task.recurrence !== 'none' && <span className="rounded-full bg-indigo-50 px-2 py-1 text-indigo-700">Recorrente</span>}
                                {task.subtasks.length > 0 && (
                                  <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
                                    {completedSubtasks}/{task.subtasks.length} subtarefas
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
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleTaskCollapsed(task.id)}
                          aria-label={isCollapsed ? 'Expandir atividade' : 'Minimizar atividade'}
                          aria-expanded={!isCollapsed}
                          title={isCollapsed ? 'Expandir atividade' : 'Minimizar atividade'}
                          className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
                        >
                          {isCollapsed ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
                        </button>
                        {!task.deletedAt && (
                          <button type="button" onClick={() => void deleteTask(task.id)} aria-label={`Excluir atividade ${task.id}`}
                            className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600">
                            <Trash2 size={17} />
                          </button>
                        )}
                      </div>
                      {!isCollapsed && task.subtasks.length > 0 && (
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
                  </div>
                </article>
              )
            })}
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
                  className="add-activity-button flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium hover:opacity-90"
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
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 pb-[env(safe-area-inset-bottom)] pt-3 backdrop-blur lg:hidden">
        <div className="mx-auto max-w-lg space-y-2">
          <div className="flex items-center gap-3">
            <button id="mobile-task-create-button" type="button" onClick={openNewTaskFromToolbar} aria-haspopup="dialog" aria-expanded={mobileTaskDialogOpen} className="add-activity-button flex h-12 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold shadow-sm hover:opacity-90">
              <Plus size={19} /> Cadastrar tarefa
            </button>
            <button type="button" disabled aria-label="Comandos de voz desativados" title="Comandos de voz temporariamente desativados para melhorias." className="grid size-12 shrink-0 cursor-not-allowed place-items-center rounded-xl border border-slate-200 bg-slate-100 text-slate-500">
              <MicOff size={19} />
            </button>
          </div>
          <nav aria-label="Navegação principal" className="grid grid-cols-4 gap-1">
            <button type="button" onClick={() => navigateTo('list')} aria-current={view === 'list' ? 'page' : undefined} className={`flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${view === 'list' ? 'bg-pink-50 text-pink-700' : 'text-slate-600 hover:bg-pink-50 hover:text-pink-700'}`}><List size={17} />Lista</button>
            <button type="button" onClick={() => navigateTo('calendar')} aria-current={view === 'calendar' ? 'page' : undefined} className={`flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${view === 'calendar' ? 'bg-pink-50 text-pink-700' : 'text-slate-600 hover:bg-pink-50 hover:text-pink-700'}`}><CalendarDays size={17} />Calendário</button>
            <button type="button" onClick={() => navigateTo('birthdays')} aria-current={view === 'birthdays' ? 'page' : undefined} className={`flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${view === 'birthdays' ? 'bg-pink-50 text-pink-700' : 'text-slate-600 hover:bg-pink-50 hover:text-pink-700'}`}><Gift size={17} />Aniversários</button>
            <button type="button" onClick={() => navigateTo('dashboard')} aria-current={view === 'dashboard' ? 'page' : undefined} className={`flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${view === 'dashboard' ? 'bg-pink-50 text-pink-700' : 'text-slate-600 hover:bg-pink-50 hover:text-pink-700'}`}><BarChart3 size={17} />Dashboard</button>
          </nav>
        </div>
      </div>
    </main>
  )
}

export default App
