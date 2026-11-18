import { CalendarDays, LogIn } from 'lucide-react'

interface GoogleLoginScreenProps {
  busy: boolean
  error: string
  onSignIn: () => void
}

export default function GoogleLoginScreen({ busy, error, onSignIn }: GoogleLoginScreenProps) {
  return (
    <main className="theme-dark grid min-h-screen place-items-center bg-background px-4 py-10 text-foreground">
      <section className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-xl sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-indigo-600 text-white">
            <CalendarDays size={23} />
          </div>
          <div>
            <h1 className="text-xl font-bold">Agenda Inteligente</h1>
            <p className="text-sm text-zinc-400">Sua organização, em qualquer dispositivo</p>
          </div>
        </div>

        <h2 className="text-lg font-semibold">Entre para continuar</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Use sua conta Google. Suas tarefas e seus aniversários ficam privados na sua conta.
        </p>

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={onSignIn}
          disabled={busy}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <LogIn size={17} />
          {busy ? 'Conectando...' : 'Continuar com Google'}
        </button>

        <p className="mt-4 text-center text-xs text-zinc-500">
          Cada conta Google acessa somente os próprios dados.
        </p>
      </section>
    </main>
  )
}
