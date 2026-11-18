import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Bell, CalendarDays, Gift, Pencil, Trash2, X } from 'lucide-react'
import { apiRequest, type Birthday, type DueReminder } from '../lib/api'

const monthNames = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function formatBirthDate(value: string) {
  const [, month, day] = value.split('-')
  return `${day}/${month}`
}

export default function BirthdayManager() {
  const [birthdays, setBirthdays] = useState<Birthday[]>([])
  const [form, setForm] = useState({ name: '', birthDate: '', relationship: '' })
  const [editingId, setEditingId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(
    'Notification' in window ? Notification.permission : 'unsupported',
  )
  const [birthdayModal, setBirthdayModal] = useState<Birthday | null>(null)

  const loadBirthdays = async () => {
    try {
      setBirthdays(await apiRequest<Birthday[]>('/api/birthdays'))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar os aniversariantes.')
    }
  }

  const processReminders = async () => {
    try {
      const due = await apiRequest<DueReminder[]>('/api/birthdays/reminders/due')
      for (const reminder of due) {
        if (reminder.kind === 0) {
          const modalKey = `birthday-modal-${reminder.birthday.id}-${reminder.year}`
          if (!sessionStorage.getItem(modalKey)) {
            setBirthdayModal(reminder.birthday)
            sessionStorage.setItem(modalKey, 'shown')
          }
        } else if (notificationPermission === 'granted') {
          new Notification(`Aniversário em ${reminder.kind} dias`, {
            body: `${reminder.birthday.name} faz aniversário em ${formatBirthDate(reminder.birthday.birthDate)}.`,
          })
        }
        await apiRequest(`/api/birthdays/${reminder.birthday.id}/reminders/${reminder.year}/${reminder.kind}`, {
          method: 'POST',
        })
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível verificar os lembretes.')
    }
  }

  useEffect(() => {
    void loadBirthdays()
  }, [])

  useEffect(() => {
    void processReminders()
    const interval = window.setInterval(() => void processReminders(), 60 * 60 * 1000)
    return () => window.clearInterval(interval)
  }, [notificationPermission])

  const groupedBirthdays = useMemo(() => monthNames.map((monthName, index) => ({
    monthName,
    birthdays: birthdays.filter((birthday) => Number(birthday.birthDate.slice(5, 7)) === index + 1),
  })).filter((group) => group.birthdays.length > 0), [birthdays])

  const requestNotifications = async () => {
    if (!('Notification' in window)) {
      setNotificationPermission('unsupported')
      return
    }
    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)
  }

  const resetForm = () => {
    setEditingId(null)
    setForm({ name: '', birthDate: '', relationship: '' })
  }

  const saveBirthday = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      const payload = {
        name: form.name,
        birthDate: form.birthDate,
        relationship: form.relationship || undefined,
      }
      if (editingId) {
        await apiRequest<Birthday>(`/api/birthdays/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
      } else {
        await apiRequest<Birthday>('/api/birthdays', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
      }
      resetForm()
      await loadBirthdays()
      await processReminders()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível salvar o aniversariante.')
    }
  }

  const editBirthday = (birthday: Birthday) => {
    setEditingId(birthday.id)
    setForm({
      name: birthday.name,
      birthDate: birthday.birthDate,
      relationship: birthday.relationship ?? '',
    })
  }

  const deleteBirthday = async (id: number) => {
    setError('')
    try {
      await apiRequest<Birthday>(`/api/birthdays/${id}`, { method: 'DELETE' })
      if (editingId === id) resetForm()
      await loadBirthdays()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível excluir o aniversariante.')
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-bold">
          {editingId ? 'Editar aniversariante' : 'Novo aniversariante'}
        </h2>
        {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <form onSubmit={saveBirthday} className="space-y-4">
          <label className="block text-sm font-medium">
            Nome
            <input
              required
              maxLength={120}
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-100"
            />
          </label>
          <label className="block text-sm font-medium">
            Data de nascimento
            <input
              required
              type="date"
              value={form.birthDate}
              onChange={(event) => setForm({ ...form, birthDate: event.target.value })}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm font-medium">
            Relação <span className="font-normal text-slate-400">(opcional)</span>
            <input
              maxLength={80}
              placeholder="Ex.: amigo, mãe, colega"
              value={form.relationship}
              onChange={(event) => setForm({ ...form, relationship: event.target.value })}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-100"
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-pink-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-pink-700">
              <Gift size={16} /> {editingId ? 'Salvar alterações' : 'Adicionar'}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                Cancelar
              </button>
            )}
          </div>
        </form>
        <div className="mt-5 rounded-xl border border-pink-100 bg-pink-50 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-pink-800">
            <Bell size={16} /> Notificações
          </div>
          {notificationPermission === 'unsupported' ? (
            <p className="mt-2 text-xs text-pink-700">Este navegador não oferece notificações do sistema.</p>
          ) : notificationPermission === 'granted' ? (
            <p className="mt-2 text-xs text-pink-700">Ativadas para avisos de 30, 15 e 7 dias.</p>
          ) : (
            <button type="button" onClick={() => void requestNotifications()} className="mt-3 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-pink-700 ring-1 ring-pink-200">
              Permitir notificações
            </button>
          )}
        </div>
      </aside>

      <section className="space-y-5">
        {groupedBirthdays.map((group) => (
          <div key={group.monthName} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 bg-gradient-to-r from-pink-50 to-white px-5 py-3">
              <CalendarDays size={18} className="text-pink-600" />
              <h3 className="font-bold text-slate-800">{group.monthName}</h3>
              <span className="ml-auto rounded-full bg-pink-100 px-2 py-0.5 text-xs font-bold text-pink-700">
                {group.birthdays.length}
              </span>
            </div>
            <div className="divide-y divide-slate-100">
              {group.birthdays.map((birthday) => (
                <article key={birthday.id} className="flex items-center gap-3 px-5 py-4">
                  <div className="grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-pink-500 to-amber-400 text-lg font-bold text-white shadow-sm">
                    {birthday.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-semibold text-slate-900">{birthday.name}</h4>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {formatBirthDate(birthday.birthDate)}
                      {birthday.relationship ? ` · ${birthday.relationship}` : ''}
                      {birthday.ageOnNextBirthday !== null ? ` · completa ${birthday.ageOnNextBirthday}` : ''}
                    </p>
                  </div>
                  {birthday.daysUntil <= 30 && (
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${birthday.daysUntil === 0 ? 'bg-pink-600 text-white' : 'bg-amber-100 text-amber-800'}`}>
                      {birthday.daysUntil === 0 ? 'Hoje!' : `Falta${birthday.daysUntil === 1 ? '' : 'm'} ${birthday.daysUntil} dias`}
                    </span>
                  )}
                  <button type="button" onClick={() => editBirthday(birthday)} aria-label={`Editar ${birthday.name}`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-indigo-600">
                    <Pencil size={16} />
                  </button>
                  <button type="button" onClick={() => void deleteBirthday(birthday.id)} aria-label={`Excluir ${birthday.name}`} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 size={16} />
                  </button>
                </article>
              ))}
            </div>
          </div>
        ))}
        {birthdays.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
            <Gift className="mx-auto text-pink-300" size={38} />
            <p className="mt-3 text-sm font-medium text-slate-600">Nenhum aniversariante cadastrado.</p>
          </div>
        )}
      </section>

      {birthdayModal && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
          <div className="birthday-confetti relative w-full max-w-md overflow-hidden rounded-[28px] border-4 border-white bg-gradient-to-br from-pink-500 via-fuchsia-500 to-amber-400 p-8 text-center text-white shadow-2xl">
            <button type="button" onClick={() => setBirthdayModal(null)} aria-label="Fechar" className="absolute right-4 top-4 rounded-full bg-white/20 p-2 hover:bg-white/30">
              <X size={18} />
            </button>
            <div className="text-6xl" aria-hidden="true">🎈🎉🎈</div>
            <h2 className="mt-5 text-3xl font-black">Hoje é aniversário!</h2>
            <p className="mt-3 text-xl font-bold">{birthdayModal.name}</p>
            {birthdayModal.ageOnNextBirthday !== null && (
              <p className="mt-2 text-sm text-white/90">Chegou o dia de completar {birthdayModal.ageOnNextBirthday} anos!</p>
            )}
            <button type="button" onClick={() => setBirthdayModal(null)} className="mt-6 rounded-full bg-white px-6 py-3 font-bold text-pink-600 shadow-lg">
              Dar os parabéns!
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
