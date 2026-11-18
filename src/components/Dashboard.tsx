import { useId, useState } from 'react'
import { BarChart3, CalendarDays, CircleAlert, Clock3, ListTodo, Minus, Plus, Target, TrendingDown, TrendingUp } from 'lucide-react'
import NumberFlow from '@number-flow/react'
import type { LucideIcon } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import type { Task } from '../../server/business-rules'
import { getDashboardSummary, type DashboardBucket, type DashboardGranularity } from '../dashboard-utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface DashboardProps {
  tasks: Task[]
  onCreateTask: () => void
}

const periodLabels: Record<DashboardGranularity, string> = {
  day: 'Últimos 30 dias',
  month: 'Últimos 12 meses',
  year: 'Últimos 5 anos',
}

const activityChartConfig = {
  created: { label: 'Cadastradas', color: 'var(--chart-1)' },
  completed: { label: 'Concluídas', color: 'var(--chart-2)' },
} satisfies ChartConfig

const punctualityChartConfig = {
  onTimeRate: { label: 'No prazo', color: 'var(--chart-2)' },
  lateRate: { label: 'Atrasadas', color: 'var(--chart-4)' },
} satisfies ChartConfig

type Trend = {
  label: string
  description: string
  sentiment: 'positive' | 'negative' | 'neutral'
  direction: 'up' | 'down' | 'flat'
}

function getTrend(current: number | null, previous: number | null, higherIsPositive = true, percentagePoints = false): Trend {
  if (current === null || previous === null) {
    return { label: 'Sem base', description: 'Sem comparação disponível', sentiment: 'neutral', direction: 'flat' }
  }
  if (current === 0 && previous === 0) {
    return { label: '0%', description: 'Sem variação no período anterior', sentiment: 'neutral', direction: 'flat' }
  }
  if (previous === 0) {
    return {
      label: 'Novo',
      description: 'Sem volume no período anterior',
      sentiment: higherIsPositive ? 'positive' : 'negative',
      direction: 'up',
    }
  }

  const difference = percentagePoints ? (current - previous) * 100 : ((current - previous) / previous) * 100
  if (Math.abs(difference) < 0.05) {
    return { label: '0%', description: 'Sem variação no período anterior', sentiment: 'neutral', direction: 'flat' }
  }
  const direction = difference > 0 ? 'up' : 'down'
  const positive = (difference > 0) === higherIsPositive
  const unit = percentagePoints ? ' p.p.' : '%'
  return {
    label: `${difference > 0 ? '+' : ''}${difference.toFixed(percentagePoints ? 1 : 0)}${unit}`,
    description: 'em relação ao período anterior',
    sentiment: positive ? 'positive' : 'negative',
    direction,
  }
}

function getPreviousPeriodReference(granularity: DashboardGranularity, now: Date) {
  if (granularity === 'day') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30)
  }
  if (granularity === 'month') {
    return new Date(now.getFullYear(), now.getMonth() - 12, now.getDate())
  }
  return new Date(now.getFullYear() - 5, now.getMonth(), now.getDate())
}

function getRate(bucket: DashboardBucket, kind: 'onTime' | 'late') {
  if (!bucket.completedWithDueDate) return 0
  return kind === 'onTime'
    ? (bucket.onTimeCompleted / bucket.completedWithDueDate) * 100
    : (bucket.lateCompleted / bucket.completedWithDueDate) * 100
}

function percentage(value: number, total: number) {
  return total === 0 ? 0 : Math.round((value / total) * 100)
}

function Sparkline({ values, color, label }: { values: number[]; color: string; label: string }) {
  const gradientId = `spark-${useId().replace(/:/g, '')}`
  const maximum = Math.max(1, ...values)
  const minimum = Math.min(0, ...values)
  const points = values.map((value, index) => {
    const x = values.length < 2 ? 50 : (index / (values.length - 1)) * 100
    const y = 27 - ((value - minimum) / Math.max(1, maximum - minimum)) * 23
    return `${x},${y}`
  })
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point}`).join(' ')
  const area = `${line} L100,32 L0,32 Z`

  return (
    <svg viewBox="0 0 100 32" role="img" aria-label={label} className="h-8 w-24 overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {points.length > 0 && (
        <>
          <path d={area} fill={`url(#${gradientId})`} />
          <path d={line} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        </>
      )}
    </svg>
  )
}

function MetricCard({ label, value, previousValue, isRate = false, higherIsPositive = true, series, icon: Icon, color }: {
  label: string
  value: number | null
  previousValue: number | null
  isRate?: boolean
  higherIsPositive?: boolean
  series: number[]
  icon: LucideIcon
  color: string
}) {
  const trend = getTrend(value, previousValue, higherIsPositive, isRate)
  const TrendIcon = trend.direction === 'up' ? TrendingUp : trend.direction === 'down' ? TrendingDown : Minus
  const badgeClasses = {
    positive: 'border-emerald-900/80 bg-emerald-500/10 text-emerald-300',
    negative: 'border-red-900/80 bg-red-500/10 text-red-300',
    neutral: 'border-zinc-700 bg-zinc-800/80 text-zinc-400',
  }
  const previousLabel = previousValue === null
    ? 'Sem período anterior'
    : isRate
      ? `Anterior: ${percentage(previousValue * 100, 100)}%`
      : `Anterior: ${previousValue.toLocaleString('pt-BR')}`

  return (
    <Card size="sm" className="gap-0 rounded-xl border-zinc-800/80 bg-zinc-900/60 py-4 text-zinc-100 shadow-none ring-0">
      <CardHeader className="grid-cols-[1fr_auto] items-center gap-2 px-4 pb-0">
        <CardTitle className="text-sm font-medium text-zinc-400">{label}</CardTitle>
        <CardAction className="grid size-8 place-items-center rounded-lg border border-zinc-800 bg-zinc-950/60 text-zinc-400">
          <Icon size={16} strokeWidth={1.75} />
        </CardAction>
      </CardHeader>
      <CardContent className="px-4 pt-3">
        <div className="flex items-baseline gap-1">
          {value === null ? (
            <span className="text-3xl font-semibold tracking-tight tabular-nums text-zinc-100">—</span>
          ) : (
            <NumberFlow
              value={isRate ? value : Math.round(value)}
              locales="pt-BR"
              format={isRate ? { style: 'percent', maximumFractionDigits: 0 } : { maximumFractionDigits: 0 }}
              className="text-3xl font-semibold tracking-tight tabular-nums text-zinc-100"
            />
          )}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <Badge variant="outline" className={`gap-1 rounded-md px-1.5 py-1 font-medium ${badgeClasses[trend.sentiment]}`}>
            <TrendIcon size={13} strokeWidth={1.75} />
            {trend.label}
          </Badge>
          <span className="text-[11px] text-zinc-500">{previousLabel}</span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-zinc-800/80 pt-2">
          <span className="text-[11px] text-zinc-500">{trend.description}</span>
          <Sparkline values={series} color={color} label={`Tendência de ${label.toLowerCase()}`} />
        </div>
      </CardContent>
    </Card>
  )
}

function ActivityChart({ buckets, granularity, className }: {
  buckets: DashboardBucket[]
  granularity: DashboardGranularity
  className?: string
}) {
  const gradientId = `activity-${useId().replace(/:/g, '')}`

  return (
    <Card className={`rounded-xl border-zinc-800/80 bg-zinc-900/60 py-5 text-zinc-100 shadow-none ring-0 ${className ?? ''}`}>
      <CardHeader className="px-5 pb-0">
        <CardTitle className="text-base font-semibold tracking-tight">Tarefas cadastradas e concluídas</CardTitle>
        <p className="text-sm text-zinc-400">Volume por período selecionado</p>
      </CardHeader>
      <CardContent className="px-3 pt-4 sm:px-5">
        {buckets.every((bucket) => bucket.created === 0 && bucket.completed === 0) ? (
          <div className="grid h-[280px] place-items-center rounded-lg border border-dashed border-zinc-800 text-sm text-zinc-500">
            Não há atividades neste período.
          </div>
        ) : (
          <ChartContainer config={activityChartConfig} className="aspect-auto h-[280px] w-full">
            <BarChart accessibilityLayer data={buckets} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id={`${gradientId}-created`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-created)" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="var(--color-created)" stopOpacity={0.28} />
                </linearGradient>
                <linearGradient id={`${gradientId}-completed`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-completed)" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="var(--color-completed)" stopOpacity={0.28} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                interval={granularity === 'day' ? 4 : 'preserveStartEnd'}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              />
              <YAxis
                allowDecimals={false}
                width={32}
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              />
              <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="created" fill={`url(#${gradientId}-created)`} radius={[4, 4, 0, 0]} maxBarSize={38} />
              <Bar dataKey="completed" fill={`url(#${gradientId}-completed)`} radius={[4, 4, 0, 0]} maxBarSize={38} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

function PunctualityChart({ buckets, granularity, className }: {
  buckets: DashboardBucket[]
  granularity: DashboardGranularity
  className?: string
}) {
  const gradientId = `punctuality-${useId().replace(/:/g, '')}`
  const rateBuckets = buckets.map((bucket) => ({
    ...bucket,
    onTimeRate: getRate(bucket, 'onTime'),
    lateRate: getRate(bucket, 'late'),
  }))

  return (
    <Card className={`rounded-xl border-zinc-800/80 bg-zinc-900/60 py-5 text-zinc-100 shadow-none ring-0 ${className ?? ''}`}>
      <CardHeader className="px-5 pb-0">
        <CardTitle className="text-base font-semibold tracking-tight">Pontualidade</CardTitle>
        <p className="text-sm text-zinc-400">Conclusões com prazo definido</p>
      </CardHeader>
      <CardContent className="px-3 pt-4 sm:px-5">
        {buckets.every((bucket) => bucket.completedWithDueDate === 0) ? (
          <div className="grid h-[280px] place-items-center rounded-lg border border-dashed border-zinc-800 px-5 text-center text-sm text-zinc-500">
            Não há conclusões com prazo definido neste período.
          </div>
        ) : (
          <ChartContainer config={punctualityChartConfig} className="aspect-auto h-[280px] w-full">
            <BarChart accessibilityLayer data={rateBuckets} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id={`${gradientId}-ontime`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-onTimeRate)" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="var(--color-onTimeRate)" stopOpacity={0.28} />
                </linearGradient>
                <linearGradient id={`${gradientId}-late`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-lateRate)" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="var(--color-lateRate)" stopOpacity={0.28} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                interval={granularity === 'day' ? 4 : 'preserveStartEnd'}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tickFormatter={(value: number) => `${value}%`}
                width={42}
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              />
              <ChartTooltip
                cursor={false}
                content={(
                  <ChartTooltipContent
                    indicator="line"
                    formatter={(value, name) => {
                      const label = name === 'onTimeRate'
                        ? punctualityChartConfig.onTimeRate.label
                        : name === 'lateRate'
                          ? punctualityChartConfig.lateRate.label
                          : name

                      return (
                        <span className="flex items-center gap-2">
                          <span>{`${Number(value).toFixed(0)}%`}</span>
                          <span>{label}</span>
                        </span>
                      )
                    }}
                  />
                )}
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="onTimeRate" stackId="punctuality" fill={`url(#${gradientId}-ontime)`} />
              <Bar dataKey="lateRate" stackId="punctuality" fill={`url(#${gradientId}-late)`} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

function PeriodTable({ buckets }: { buckets: DashboardBucket[] }) {
  return (
    <Card className="rounded-xl border-zinc-800/80 bg-zinc-900/60 py-5 text-zinc-100 shadow-none ring-0">
      <CardHeader className="px-5 pb-0">
        <CardTitle className="text-base font-semibold tracking-tight">Detalhamento por período</CardTitle>
        <p className="text-sm text-zinc-400">Resumo das tarefas e da pontualidade</p>
      </CardHeader>
      <CardContent className="px-2 pt-3 sm:px-5">
        <div className="max-h-[360px] overflow-auto">
          <table className="w-full caption-bottom text-sm">
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="sticky top-0 z-10 bg-zinc-900 text-zinc-400">Período</TableHead>
                <TableHead className="sticky top-0 z-10 bg-zinc-900 text-right text-zinc-400">Cadastradas</TableHead>
                <TableHead className="sticky top-0 z-10 bg-zinc-900 text-right text-zinc-400">Concluídas</TableHead>
                <TableHead className="sticky top-0 z-10 bg-zinc-900 text-right text-zinc-400">No prazo</TableHead>
                <TableHead className="sticky top-0 z-10 bg-zinc-900 text-right text-zinc-400">Atrasadas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...buckets].reverse().map((bucket) => (
                <TableRow key={bucket.key} className="border-zinc-800/80 hover:bg-zinc-800/40">
                  <TableCell className="font-medium text-zinc-200">{bucket.label}</TableCell>
                  <TableCell className="text-right tabular-nums text-zinc-300">{bucket.created}</TableCell>
                  <TableCell className="text-right tabular-nums text-zinc-300">{bucket.completed}</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-300">
                    {bucket.completedWithDueDate ? `${percentage(bucket.onTimeCompleted, bucket.completedWithDueDate)}%` : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-red-300">
                    {bucket.completedWithDueDate ? `${percentage(bucket.lateCompleted, bucket.completedWithDueDate)}%` : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

export default function Dashboard({ tasks, onCreateTask }: DashboardProps) {
  const [granularity, setGranularity] = useState<DashboardGranularity>('month')
  const now = new Date()
  const summary = getDashboardSummary(tasks, granularity, now)
  const previousSummary = getDashboardSummary(tasks, granularity, getPreviousPeriodReference(granularity, now))
  const periodLabel = periodLabels[granularity]
  const lateRate = summary.completedWithDueDate ? summary.lateCompleted / summary.completedWithDueDate : null
  const onTimeRate = summary.completedWithDueDate ? summary.onTimeCompleted / summary.completedWithDueDate : null
  const previousLateRate = previousSummary.completedWithDueDate
    ? previousSummary.lateCompleted / previousSummary.completedWithDueDate
    : null
  const previousOnTimeRate = previousSummary.completedWithDueDate
    ? previousSummary.onTimeCompleted / previousSummary.completedWithDueDate
    : null
  const displayedTasks = tasks.filter((task) => !task.deletedAt)
  const lateSeries = summary.buckets.map((bucket) => getRate(bucket, 'late'))
  const onTimeSeries = summary.buckets.map((bucket) => getRate(bucket, 'onTime'))

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 size={18} strokeWidth={1.75} className="text-indigo-300" />
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">Visão geral</h2>
          </div>
          <p className="mt-1 text-sm text-zinc-400">Acompanhe seu ritmo, volume e pontualidade.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={granularity} onValueChange={(value) => setGranularity(value as DashboardGranularity)}>
            <SelectTrigger aria-label="Selecionar período" className="h-9 w-[190px] border-zinc-800 bg-zinc-900/60 text-zinc-200">
              <CalendarDays size={16} strokeWidth={1.75} className="mr-1 text-zinc-400" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(periodLabels) as DashboardGranularity[]).map((value) => (
                <SelectItem key={value} value={value}>{periodLabels[value]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="lg" onClick={onCreateTask} className="add-activity-button h-9 rounded-lg px-3 hover:opacity-90">
            <Plus size={16} strokeWidth={1.75} />
            Nova tarefa
          </Button>
        </div>
      </header>

      <section aria-label={`Indicadores · ${periodLabel}`} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Tarefas cadastradas"
          value={summary.created}
          previousValue={previousSummary.created}
          series={summary.buckets.map((bucket) => bucket.created)}
          icon={ListTodo}
          color="#818cf8"
        />
        <MetricCard
          label="Tarefas concluídas"
          value={summary.completed}
          previousValue={previousSummary.completed}
          series={summary.buckets.map((bucket) => bucket.completed)}
          icon={Clock3}
          color="#34d399"
        />
        <MetricCard
          label="Conclusões atrasadas"
          value={lateRate}
          previousValue={previousLateRate}
          isRate
          higherIsPositive={false}
          series={lateSeries}
          icon={CircleAlert}
          color="#f87171"
        />
        <MetricCard
          label="Conclusões no prazo"
          value={onTimeRate}
          previousValue={previousOnTimeRate}
          isRate
          series={onTimeSeries}
          icon={Target}
          color="#2dd4bf"
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-12">
        <ActivityChart buckets={summary.buckets} granularity={granularity} className="lg:col-span-8" />
        <PunctualityChart buckets={summary.buckets} granularity={granularity} className="lg:col-span-4" />
      </div>

      <section className="flex items-center gap-3 rounded-xl border border-amber-900/60 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
        <CircleAlert size={16} strokeWidth={1.75} className="shrink-0 text-amber-300" />
        <span>
          <strong className="tabular-nums">{summary.overdueOpen}</strong> {summary.overdueOpen === 1 ? 'tarefa pendente está atrasada agora.' : 'tarefas pendentes estão atrasadas agora.'}
          {' '}De {displayedTasks.length} tarefas não excluídas; pontualidade considera somente conclusões com prazo.
        </span>
      </section>

      <PeriodTable buckets={summary.buckets} />
      <p className="text-xs leading-relaxed text-zinc-500">
        As taxas comparam os períodos selecionados; tarefas excluídas são desconsideradas. Ao reabrir uma tarefa, o sistema apaga sua data de conclusão.
      </p>
    </div>
  )
}
