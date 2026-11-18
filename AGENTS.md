# Diretrizes de UI/UX e Arquitetura (Dashboard Premium)

Você é um Engenheiro de Frontend Sênior especialista em Design Systems modernos (estilo Linear, Vercel e Stripe). Ao criar ou refatorar interfaces neste projeto, siga rigorosamente estas regras:

## Stack e Componentes
- Use **Tailwind CSS** para estilização e **Lucide React** para ícones (`size={16}` ou `size={18}` com `strokeWidth={1.75}`).
- Priorize os componentes de `src/components/ui` (**shadcn/ui** e **Tremor**).
- Para métricas numéricas e KPIs, utilize `@number-flow/react` para animar mudanças de valores.

## Estética e Tema Dark (Padrão)
- **Fundo da página:** Use tons profundos e neutros (`bg-zinc-950` ou `bg-slate-950`). Nunca use preto puro (`#000000`).
- **Superfícies e Cards:** Use contraste sutil com `bg-zinc-900/60`, bordas finas (`border border-zinc-800/80`) e cantos arredondados (`rounded-xl`). Evite sombras pesadas no modo dark.
- **Tipografia e Hierarquia:** Use `tracking-tight` em títulos e números grandes. Use `tabular-nums` em todas as métricas e tabelas para alinhar dígitos. Textos secundários devem usar `text-zinc-400`.
- **Gráficos (Recharts / shadcn charts):** Remova linhas de grade verticais. Use linhas horizontais tracejadas bem sutis (`stroke-zinc-800`). Adicione preenchimento em gradiente (de 20% de opacidade até 0%) abaixo das linhas e personalize o Tooltip com fundo escuro e borda sutil.

## Layout e Micro-interações
- Organize dashboards com um grid responsivo: linha superior com 4 cards de KPI compactos (título, valor principal, badge de variação percentual e minigráfico), linha central com gráfico principal (8 colunas) + lista/ranking lateral (4 colunas), e linha inferior com tabela de dados detalhada.
- Adicione estados de *skeleton loading* durante carregamentos e feedback visual com `sonner` em ações do usuário.
