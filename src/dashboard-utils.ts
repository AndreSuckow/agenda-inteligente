import { isOverdue, type Task } from '../server/business-rules'

export type DashboardGranularity = 'day' | 'month' | 'year'

export type DashboardBucket = {
  key: string
  label: string
  created: number
  completed: number
  lateCompleted: number
  onTimeCompleted: number
  completedWithDueDate: number
}

export type DashboardSummary = {
  buckets: DashboardBucket[]
  created: number
  completed: number
  lateCompleted: number
  onTimeCompleted: number
  completedWithDueDate: number
  overdueOpen: number
}

function localDateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function dateKeyFromTimestamp(timestamp: string) {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? null : localDateKey(date)
}

export function isCompletedAfterDueDate(dueDate: string | null, completedAt: string | null, dueTime: string | null = null) {
  if (!dueDate || !completedAt) return false
  const completedTimestamp = new Date(completedAt).getTime()
  const deadlineTimestamp = new Date(`${dueDate}T${dueTime ?? '23:59:59'}`).getTime()
  return !Number.isNaN(completedTimestamp)
    && !Number.isNaN(deadlineTimestamp)
    && completedTimestamp > deadlineTimestamp
}

function bucketKey(dateKey: string, granularity: DashboardGranularity) {
  if (granularity === 'year') return dateKey.slice(0, 4)
  if (granularity === 'month') return dateKey.slice(0, 7)
  return dateKey
}

function createPeriods(granularity: DashboardGranularity, now: Date) {
  const count = granularity === 'day' ? 30 : granularity === 'month' ? 12 : 5
  const periods: Array<{ key: string; label: string }> = []
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = granularity === 'day'
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - index)
      : granularity === 'month'
        ? new Date(now.getFullYear(), now.getMonth() - index, 1)
        : new Date(now.getFullYear() - index, 0, 1)
    const key = granularity === 'year'
      ? String(date.getFullYear())
      : granularity === 'month'
        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        : localDateKey(date)
    const label = granularity === 'day'
      ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(date)
      : granularity === 'month'
        ? new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' }).format(date).replace('.', '')
        : key
    periods.push({ key, label })
  }
  return periods
}

export function getDashboardSummary(tasks: Task[], granularity: DashboardGranularity, now = new Date()): DashboardSummary {
  const buckets = createPeriods(granularity, now).map(({ key, label }) => ({
    key,
    label,
    created: 0,
    completed: 0,
    lateCompleted: 0,
    onTimeCompleted: 0,
    completedWithDueDate: 0,
  }))
  const bucketsByKey = new Map(buckets.map((bucket) => [bucket.key, bucket]))
  let overdueOpen = 0

  for (const task of tasks) {
    if (task.deletedAt) continue

    if (isOverdue(task, now)) overdueOpen += 1

    const createdDate = dateKeyFromTimestamp(task.createdAt)
    if (createdDate) {
      const createdBucket = bucketsByKey.get(bucketKey(createdDate, granularity))
      if (createdBucket) createdBucket.created += 1
    }

    if (task.status !== 'completed' || !task.completedAt) continue
    const completedDate = dateKeyFromTimestamp(task.completedAt)
    if (!completedDate) continue
    const completedBucket = bucketsByKey.get(bucketKey(completedDate, granularity))
    if (!completedBucket) continue

    completedBucket.completed += 1
    if (!task.dueDate) continue
    completedBucket.completedWithDueDate += 1
    if (isCompletedAfterDueDate(task.dueDate, task.completedAt, task.dueTime)) {
      completedBucket.lateCompleted += 1
    } else {
      completedBucket.onTimeCompleted += 1
    }
  }

  return buckets.reduce<DashboardSummary>((summary, bucket) => {
    summary.created += bucket.created
    summary.completed += bucket.completed
    summary.lateCompleted += bucket.lateCompleted
    summary.onTimeCompleted += bucket.onTimeCompleted
    summary.completedWithDueDate += bucket.completedWithDueDate
    summary.buckets.push(bucket)
    return summary
  }, {
    buckets: [],
    created: 0,
    completed: 0,
    lateCompleted: 0,
    onTimeCompleted: 0,
    completedWithDueDate: 0,
    overdueOpen,
  })
}
