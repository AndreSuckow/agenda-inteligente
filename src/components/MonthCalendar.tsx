import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Task } from '../../server/business-rules'
import { apiRequest, type Birthday } from '../lib/api'
import { getAvailableCalendarSpan, getBirthdayDateKey, splitTitleIntoLines } from '../calendar-utils'

interface MonthCalendarProps {
  tasks: Task[]
  month: Date
  todayKey: string
  onMonthChange: (month: Date) => void
  onTaskSelect: (task: Task) => void
}

const weekdays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

const fixedHolidays = [
  ['01-01', 'Confraternização Universal'],
  ['04-21', 'Tiradentes'],
  ['05-01', 'Dia do Trabalho'],
  ['09-07', 'Independência do Brasil'],
  ['10-12', 'Nossa Senhora Aparecida'],
  ['11-02', 'Finados'],
  ['11-15', 'Proclamação da República'],
  ['11-20', 'Dia da Consciência Negra'],
  ['12-25', 'Natal'],
] as const

function toDateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function formatMonth(month: Date) {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(month)
}

function addDays(date: Date, amount: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + amount)
  return result
}

function easterSunday(year: number) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

function holidaysForYear(year: number) {
  const holidays = new Map<string, string>()
  for (const [monthDay, name] of fixedHolidays) {
    holidays.set(`${year}-${monthDay}`, name)
  }

  const easter = easterSunday(year)
  holidays.set(toDateKey(addDays(easter, -48)), 'Carnaval')
  holidays.set(toDateKey(addDays(easter, -47)), 'Carnaval')
  holidays.set(toDateKey(addDays(easter, -2)), 'Sexta-feira Santa')
  holidays.set(toDateKey(addDays(easter, 60)), 'Corpus Christi')
  return holidays
}

function MonthCalendar({ tasks, month, todayKey, onMonthChange, onTaskSelect }: MonthCalendarProps) {
  const [birthdays, setBirthdays] = useState<Birthday[]>([])
  const [birthdayError, setBirthdayError] = useState('')
  const firstDayOfMonth = new Date(month.getFullYear(), month.getMonth(), 1)
  const mondayOffset = (firstDayOfMonth.getDay() + 6) % 7
  const gridStart = new Date(month.getFullYear(), month.getMonth(), 1 - mondayOffset)
  const calendarDays = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index))
  const weeks = Array.from({ length: 6 }, (_, index) => calendarDays.slice(index * 7, index * 7 + 7))
  const tasksByDueDate = new Map<string, Task[]>()
  const holidaysByDate = new Map<number, Map<string, string>>()

  useEffect(() => {
    let active = true
    const loadBirthdays = async () => {
      try {
        const savedBirthdays = await apiRequest<Birthday[]>('/api/birthdays')
        if (active) {
          setBirthdays(savedBirthdays)
          setBirthdayError('')
        }
      } catch (error) {
        if (active) {
          setBirthdayError(error instanceof Error ? error.message : 'Não foi possível carregar os aniversariantes.')
        }
      }
    }

    void loadBirthdays()
    return () => {
      active = false
    }
  }, [])

  for (const task of tasks) {
    if (!task.dueDate) continue
    const dateTasks = tasksByDueDate.get(task.dueDate) ?? []
    dateTasks.push(task)
    tasksByDueDate.set(task.dueDate, dateTasks)
  }

  for (const date of calendarDays) {
    if (!holidaysByDate.has(date.getFullYear())) {
      holidaysByDate.set(date.getFullYear(), holidaysForYear(date.getFullYear()))
    }
  }

  const birthdayDateKeys = new Set(
    calendarDays.flatMap((date) => birthdays
      .filter((birthday) => getBirthdayDateKey(birthday.birthDate, date.getFullYear()) === toDateKey(date))
      .map(() => toDateKey(date))),
  )
  const tasksWithoutDueDate = tasks.filter((task) => !task.dueDate)
  const currentMonth = month.getMonth()
  const datesWithTasks = new Set([...tasksByDueDate.keys(), ...birthdayDateKeys])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-2 py-1.5 sm:px-3">
        <button
          type="button"
          onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          aria-label="Mês anterior"
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
        >
          <ChevronLeft size={20} />
        </button>
        <h2 className="font-semibold capitalize text-slate-800">{formatMonth(month)}</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMonthChange(new Date())}
            className="rounded-lg px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            aria-label="Próximo mês"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {birthdayError && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{birthdayError}</p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="min-w-[700px]">
          <div className="grid grid-cols-7 border-b border-slate-200">
            {weekdays.map((weekday, index) => (
              <div
                key={weekday}
                className={`px-2 py-2 text-center text-xs font-semibold uppercase ${
                  index >= 5 ? 'bg-slate-100 text-slate-600' : 'bg-white text-slate-500'
                }`}
              >
                {weekday}
              </div>
            ))}
          </div>
          {weeks.map((week) => (
            <div key={toDateKey(week[0])} className="grid grid-cols-7">
              {week.map((date, dayIndex) => {
                const dateKey = toDateKey(date)
                const dateTasks = tasksByDueDate.get(dateKey) ?? []
                const dateBirthdays = birthdays.filter(
                  (birthday) => getBirthdayDateKey(birthday.birthDate, date.getFullYear()) === dateKey,
                )
                const holiday = holidaysByDate.get(date.getFullYear())?.get(dateKey)
                const isCurrentMonth = date.getMonth() === currentMonth
                const isWeekend = dayIndex >= 5
                const maximumSpan = getAvailableCalendarSpan(
                  week.map(toDateKey),
                  dayIndex,
                  datesWithTasks,
                )
                const hasSpanningTask = dateTasks.some((task) => Math.min(maximumSpan, Math.ceil(task.title.length / 20)) > 1)

                return (
                  <div
                    key={dateKey}
                    className={`relative min-h-24 overflow-visible border-b border-r border-slate-100 p-1.5 sm:p-2 ${
                      holiday ? 'bg-rose-50' : isWeekend ? 'bg-slate-50' : 'bg-white'
                    } ${isCurrentMonth ? '' : 'text-slate-400'}`}
                    style={{
                      minHeight: 'max(6rem, calc((100vh - 14rem) / 6))',
                      zIndex: hasSpanningTask ? 20 : 1,
                    }}
                  >
                    <div className="mb-1 flex min-h-7 items-start gap-1">
                      <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs ${
                        dateKey === todayKey ? 'bg-indigo-600 font-bold text-white' : ''
                      }`}>
                        {date.getDate()}
                      </span>
                      {holiday && (
                        <span className="pt-1 text-[10px] font-semibold leading-tight text-rose-700">
                          {holiday}
                        </span>
                      )}
                    </div>
                    <div className="relative space-y-1">
                      {dateBirthdays.map((birthday) => {
                        const age = date.getFullYear() - Number(birthday.birthDate.slice(0, 4))
                        return (
                          <div
                            key={`birthday-${birthday.id}`}
                            title={`${birthday.name} faz ${age} anos`}
                            className="relative z-10 rounded bg-pink-50 px-1.5 py-1 text-xs font-semibold leading-4 text-pink-700"
                          >
                            🎂 {birthday.name} · {age} anos
                          </div>
                        )
                      })}
                      {dateTasks.map((task) => {
                        const taskSpan = Math.min(maximumSpan, Math.max(1, Math.ceil(task.title.length / 20)))
                        const titleLines = splitTitleIntoLines(task.title)
                        const spanningWidth = `calc(${taskSpan} * 100% + ${(taskSpan - 1) * 16}px)`

                        return (
                          <button
                            key={task.id}
                            type="button"
                            disabled={Boolean(task.deletedAt)}
                            onClick={() => onTaskSelect(task)}
                            title={`#${task.id} ${task.title}${task.dueTime ? ` · Prazo ${task.dueTime}` : ''}`}
                            style={{ width: 'max-content', maxWidth: spanningWidth }}
                            className={`relative z-30 block break-words rounded px-1.5 py-1 text-left text-xs leading-4 shadow-sm ${
                              task.deletedAt
                                ? 'cursor-default bg-red-50 text-red-700 line-through'
                                : task.status === 'completed'
                                  ? 'bg-emerald-50 text-emerald-700 line-through'
                                  : 'bg-indigo-100 text-indigo-900 hover:bg-indigo-200'
                            }`}
                          >
                            <span className="block font-semibold">
                              #{task.id}{task.dueTime ? ` · ${task.dueTime}` : ''}
                            </span>
                            {titleLines.map((line, index) => (
                              <span key={`${task.id}-${index}`} className="block break-words">
                                {line}
                              </span>
                            ))}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {tasksWithoutDueDate.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-3">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Sem prazo</h3>
          <div className="flex flex-wrap gap-2">
            {tasksWithoutDueDate.map((task) => (
              <button
                key={task.id}
                type="button"
                disabled={Boolean(task.deletedAt)}
                onClick={() => onTaskSelect(task)}
                className={`rounded-lg px-3 py-2 text-left text-sm ${
                  task.deletedAt
                    ? 'cursor-default bg-red-50 text-red-700 line-through'
                    : task.status === 'completed'
                      ? 'bg-emerald-50 text-emerald-700 line-through'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span className="mr-1 text-xs font-bold">#{task.id}</span>
                {task.title}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

export default MonthCalendar
