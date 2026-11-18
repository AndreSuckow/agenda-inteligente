# Regras de negócio

## Status e conclusão

Uma atividade nasce como `pending`. Pode ser concluída ou reaberta pela interface. Ao concluir, `completed_at` recebe o instante atual.

Linhas da descrição iniciadas por `- ` são subtarefas; as demais linhas permanecem como descrição. Cada atividade aceita até 50 subtarefas, com até 120 caracteres por item. Marcar todas as subtarefas conclui a atividade; desmarcar uma subtarefa de uma atividade concluída a reabre. A conclusão manual da atividade marca todas as subtarefas como concluídas, e reabri-la marca todas como pendentes.

## Prioridade

Os valores são `low`, `medium` e `high`, com rótulos Baixa, Média e Alta. A listagem coloca pendentes primeiro e depois ordena por prioridade, prazo e ID.

## Tags

Cada atividade pode ter até 10 tags livres, com até 30 caracteres cada. Tags são aparadas, não diferenciam maiúsculas de minúsculas para detectar duplicatas, aparecem na lista e também podem ser encontradas pela busca geral. Novas ocorrências recorrentes recebem as mesmas tags.

## Atraso

Uma atividade está atrasada quando possui prazo, está pendente e o instante atual excede o fim do dia informado. O campo de prazo não contém horário.

## Calendário

A visualização mensal posiciona atividades no dia do prazo (`due_date`), usa semanas iniciadas na segunda-feira e permite navegar entre meses. Títulos longos são divididos em linhas de até 20 caracteres e podem avançar sobre dias seguintes vazios da mesma semana; uma atividade no dia seguinte bloqueia essa expansão. Sábados e domingos têm destaque leve. Feriados nacionais fixos e datas móveis brasileiras comuns (Carnaval, Sexta-feira Santa e Corpus Christi) recebem destaque próprio. Feriados estaduais e municipais não são calculados. Atividades sem prazo aparecem em uma seção separada. Ao entrar no calendário, filtros da lista são limpos e a visualização mostra atividades não excluídas.

## Filtros por data de criação

O SQLite grava `created_at` em UTC. A API entrega esse instante em formato ISO 8601 com fuso explícito; a interface exibe no fuso local do navegador. Os filtros “Criada a partir de” e “Criada até” usam datas locais e incluem o dia inteiro em ambos os limites. As alterações só são aplicadas ao pressionar “Buscar”.

## Dashboard e indicadores

O dashboard apresenta períodos agrupados por dia (últimos 30 dias), mês (últimos 12 meses) ou ano (últimos 5 anos). Novas tarefas são agrupadas pela data local de `created_at`; conclusões, pela data local de `completed_at`. Tarefas excluídas não entram nos indicadores.

A pontualidade considera somente tarefas concluídas com prazo definido: uma conclusão é no prazo quando ocorre até o fim do dia do prazo, e atrasada quando ocorre depois. O percentual de cada categoria usa como denominador todas as conclusões com prazo no período. Tarefas pendentes vencidas são exibidas separadamente como um total atual. Ao reabrir uma atividade, `completed_at` é apagado; portanto, ela deixa de contar como concluída. O sistema ainda não mantém histórico de reaberturas.

## Recorrência

As opções são nenhuma, diária, semanal e mensal. Ao concluir uma ocorrência pendente que possua prazo, uma nova atividade é criada no próximo prazo calculado. Concluir manualmente uma ocorrência já concluída não cria outra.

As subtarefas fazem parte de cada ocorrência: uma nova ocorrência recebe os mesmos títulos e posições, mas todas começam pendentes. Alterar a lista de subtarefas antes de concluir a ocorrência afeta a próxima ocorrência criada. Ocorrências anteriores ou futuras já criadas não são sincronizadas em conjunto.

## Exclusão e histórico

Excluir uma atividade grava `deleted_at` em vez de remover a linha. As atividades excluídas aparecem no filtro “Excluídas”, com o horário no fuso local e o deslocamento GMT explícito. Elas não aparecem entre as atividades ativas e não podem ser editadas ou concluídas. A restauração ainda não está disponível.

## Comandos de voz

Os comandos de voz estão temporariamente desativados na interface enquanto a interação é aperfeiçoada. O botão permanece visível e informa que está desativado.

## Limitações conhecidas

- O reconhecimento depende do suporte e da autorização do navegador.
- Comandos ambíguos ou texto reconhecido incorretamente podem exigir revisão manual.
- Não há autenticação nem dados separados por usuário.
- Recorrências sem prazo não geram ocorrências futuras.
- A edição da descrição interpreta qualquer linha iniciada por `- ` como subtarefa; não há suporte a escapar esse formato para manter uma linha literal com esse prefixo.
