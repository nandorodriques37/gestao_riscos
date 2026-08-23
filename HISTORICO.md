# Histórico do projeto

Mapa do que já foi construído, na ordem em que aconteceu. Serve para responder
"por que isso está assim?" sem ter que reler 60 commits — as decisões que
viraram regra permanente estão no [`CLAUDE.md`](CLAUDE.md); aqui fica o
caminho que levou até elas.

Reconstruído a partir do histórico do git e dos PRs do repositório.

## Linha do tempo

### 1. Fundação — 04/07 (PR #1)

App React + TypeScript + Vite recriado a partir do handoff de design
(`design_handoff_matriz_risco/`: README de especificação, protótipo
`Matriz de Risco.dc.html` e `RiskData.js`). Três abas — Registro, Gráficos e
Priorização. As regras de negócio foram fixadas aqui e não mudaram desde então:
`score = probab × impact`, `prioriz = impacto2 / esforco + gravidade`, e as
faixas de cor por criticidade e por priorização.

Ainda no mesmo dia o app saiu do `localStorage` puro para **Postgres (Neon)**,
com funções serverless em `api/` e deploy no Vercel. Dois hotfixes de deploy
logo em seguida: seed vazio em produção e `ERR_MODULE_NOT_FOUND` por falta da
extensão `.js` nos imports ESM.

### 2. Robustez e acessibilidade — 04–05/07 (PR #2)

Seis frentes, uma por commit: testes das regras de negócio e da navegação por
teclado; retry com backoff para gravações que falham; estados vazios para
filtros sem resultado; feedback de status de salvamento no modal; undo de
exclusão de registro; alternativas textuais dos gráficos para leitor de tela;
detecção de conflito de concorrência multi-usuário; e layout responsivo para
celular e tablet retrato.

### 3. Primeiro redesign — 06/07 (PR #3)

Repaginada visual de Registro, Gráficos, Priorização e TopBar.

### 4. Aba Tarefas — 06/07 (PRs #4, #5)

Nova aba de Gestão de Tarefas, com priorização pela **Matriz GUT** (Gravidade,
Urgência, Tendência). O botão de restaurar saiu da aba Registro.

### 5. Ajustes de uso — 07/07 (PRs #6–#12)

Filtro de status com seleção múltipla persistente e largura de coluna salva. E
a mudança que precisou ser feita em dois lugares: **salvar por botão, não a
cada tecla** — primeiro no modal de edição, depois na aba Tarefas. O autosave
por keystroke estava pesando na digitação.

### 6. Polimento da tabela de Tarefas — 09/07 (PR #13)

Hierarquia visual das linhas, quebra de texto e avatares de responsável.

### 7. Sistema de tokens e tema escuro — 28/07 (PR #14)

O redesign estrutural. O CSS foi quebrado em módulos (`tokens`, `base`,
`primitives`, `layout`, `table`, `charts`, `modal`, `responsive`) e nasceram as
regras que hoje governam o visual: **nenhum hex literal fora de `tokens.css`**,
cor semântica viajando por atributo (`data-tier`, `data-badge`, `data-accent`)
em vez de `style={{}}`, e cada token declarando claro e escuro numa linha com
`light-dark()`. É o que permitiu o tema escuro sem tocar em componente.

### 8. Micro-ajustes de Tarefas — 28–29/07 (PRs #15, #16, #17)

Concluir tarefa direto na linha, sem abrir os detalhes. Coluna "Observações"
fora da tabela (passou para o modal). E o **modo Kanban**, com colunas por
prioridade.

### 9. Plano de ação estruturado — 29/07 (PR #18)

A ação virou linha com responsável e prazo dentro do modal de risco. Em
seguida, cada ação virou **cartão**: em linha o texto da ação não cabia.

### 10. Anexos de imagem nas tarefas — 18/08 (PR #19)

Tabela própria `task_attachments`, nunca uma coluna em `tasks`: a aba faz
polling e os bytes não podem viajar no `GET /api/tasks`. O cliente reduz a
imagem antes de subir (teto de 1600px e 3 MB, re-encode em WebP) e o servidor
revalida formato e tamanho. O visualizador em tela cheia é escuro nos dois
temas — scrim claro lava as cores da imagem.

### 11. Reestruturação para objetivo → iniciativa → marco — 21–22/08 (PR #20)

O maior bloco do projeto: 99 arquivos, +16.305 linhas. O modelo saiu de
"risco → ação" para **objetivo → iniciativa → marco**, em passos reversíveis:

1. Canvas de design da reestruturação (`design_handoff_matriz_risco/canvas/`),
   incluindo a cobertura risco × iniciativa.
2. Camada de dados vazia e reversível — seis entidades sobre a fábrica genérica
   `api/_table.ts`, com `migracao/rollback.sql`.
3. Extração dos planos de ação legados e tela de **Triagem**, depois com aceite
   de todas as sugestões de uma vez.
4. Promoção das ações triadas a iniciativas.
5. Métricas do portfólio como funções puras e testadas
   (`src/lib/portfolioMetrics.ts`).
6. Fundação visual: escada de superfícies e **nav rail** — as abas viraram
   trilho lateral.
7. Telas do portfólio: **Painel, Objetivos, Iniciativas e Rastro**; depois
   **Pessoas**, com capacidade em dias de projeto por mês, ativo/inativo e
   mesclagem de fichas duplicadas.
8. Plano de ação em um lugar só: `acoes_risco` virou a fonte, `risk_records.acoes`
   virou resumo derivado e `acoes_itens` ficou **congelado** (só leitura, para
   converter o legado).
9. Endurecimento para produção: CI no GitHub Actions, seed sob variável de
   ambiente e trilha de auditoria.

Duas decisões de modelagem desta fase valem por si: `medicoes` é **uma linha por
leitura** do indicador, nunca um campo `valor_atual` — sobrescrever o valor
apagaria a tendência, que é o que interessa; e regra de integridade nova entra
em `validarEntidade`, porque cadeia de `if` própria em cada lado já fez uma
regra valer só em metade dos ambientes.

### 12. Hotfixes de produção — 22/08 (PRs #21, #22)

Import ESM sem extensão e caminho base do portfólio; depois a rota do portfólio
passou a ler o caminho da **URL**, não do parâmetro de rota. O portfólio inteiro
é servido por uma rota catch-all só (`api/portfolio/[[...path]].ts`) porque o
plano Hobby do Vercel limita a 12 funções.

## Estado atual

- ~19.800 linhas de TS/TSX entre `src/` e `api/`, com 20 arquivos de teste.
- 13 pastas de componentes, 3 hooks (`useRecords`, `useTasks`, `usePortfolio`)
  e 12 arquivos de estilo.
- CI roda typecheck, lint, testes e build antes de qualquer merge — o Vercel
  publica o que chega na `main`.

## Padrões que se repetem

Três decisões voltaram em momentos diferentes e hoje estão no `CLAUDE.md`:

- **Cor nunca por `style` inline** — sempre token mais atributo semântico. Foi
  o que tornou o tema escuro uma mudança de CSS, não de componente.
- **Nada que faz polling carrega bytes** — anexos entram e saem por endpoint
  próprio, fora do PATCH com debounce.
- **Nada que é série temporal vira campo único** — medição é linha, não valor
  sobrescrito.
