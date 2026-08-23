# CLAUDE.md — Gestão da Matriz de Risco

Instruções persistentes para implementar e evoluir este projeto.

## O que é
App web de página única para **registro, análise e priorização de riscos corporativos**, com três abas: Registro (tabela editável), Gráficos (indicadores com cross-filter) e Resumo de Priorização (matriz esforço × impacto + ranking).

## Fonte da verdade do design
- `design_handoff_matriz_risco/README.md` — especificação completa (modelo de dados, fórmulas, telas, tokens, interações, estado). **Leia antes de implementar qualquer coisa.**
- `design_handoff_matriz_risco/Matriz de Risco.dc.html` — protótipo hifi de referência (UI + lógica).
- `design_handoff_matriz_risco/RiskData.js` — dados iniciais e listas.
- `design_handoff_matriz_risco/screenshots/` — capturas das três abas.

Os `.dc.html` são **referência de design, não código de produção**. Recrie no framework do codebase.

## Stack
- **React + TypeScript** (a lógica do protótipo mapeia quase 1:1). Componentes: `TopBar`, `RegistroTab`, `GraficosTab`, `PriorizacaoTab`, `TarefasTab`, `EditModal`.
- **Backend:** dados centralizados em Postgres (Neon) via funções serverless em `api/`. Toda a lógica SQL fica em `api/_db.ts` (executor `Sql` injetável). O front consome a API (`src/lib/api.ts` + hook `src/hooks/useRecords.ts`) com atualização otimista, *debounce* de escrita e polling. `localStorage` (`riskMatrix.cache.v1`) é só cache/fallback.
- **Anexos de imagem (tarefas):** tabela própria `task_attachments` (`api/_attachmentsDb.ts`), nunca coluna em `tasks` — a aba faz polling e os bytes não podem viajar no `GET /api/tasks`, que carrega só o metadado (`anexos`). Os bytes saem por `GET /api/tasks/:id/anexos/:anexoId`, com cache imutável, e vão direto no `src` de um `<img>`. O cliente reduz a imagem antes de subir (`src/lib/imageAttachments.ts`: teto de 1600px e 3 MB, re-encode em WebP); o servidor revalida formato e tamanho. Anexo **não** é campo de `Task`: entra e sai por endpoint próprio, fora do PATCH com debounce.
- **Portfólio (objetivo → iniciativa → marco):** seis entidades (`pessoas`, `objetivos`, `medicoes`, `iniciativas`, `marcos`, `acoes_risco`) sobre a fábrica genérica `api/_table.ts`, atendidas por um handler único (`api/_portfolioRoute.ts`) e **um arquivo de rota por profundidade de caminho** — `index.ts`, `[entidade].ts`, `[entidade]/[id].ts` — porque catch-all (`[...path]`, `[[...path]]`) **não casa dois segmentos** nas funções avulsas da Vercel: todo PATCH e DELETE do portfólio morria em 404 na borda, sem invocar função e sem log. O plano Hobby limita a 12 funções, e o projeto está nas 12. O front carrega todas de uma vez (`GET /api/portfolio`) pelo hook `src/hooks/usePortfolio.ts`; as métricas são funções puras em `src/lib/portfolioMetrics.ts`. Regra de integridade nova entra em **`validarEntidade`** (`api/_portfolioDb.ts`) — é o despacho único que a rota de produção e `vite-plugin-dev-api.ts` chamam; cadeia de `if` própria em cada lado já fez uma regra valer só em metade dos ambientes.
- **Medição de objetivo:** `medicoes` é uma linha por leitura do indicador, nunca um campo `valor_atual` — sobrescrever o valor apaga a tendência, que é o que interessa. `progressoObjetivo` deriva atual, % do caminho e tendência; a direção da melhora sai dos próprios números (meta menor que baseline = descer é melhorar), sem campo de "quanto menor melhor".
- **Pessoas:** tem tela própria (`PessoasTab`), com capacidade (`dias_projeto_mes`, que a carga do Painel usa como régua), ativo/inativo e mesclagem de fichas duplicadas. Duplicata acontece porque o editor de plano de ação cadastra quem não existe: a mesclagem repõe as três FKs `dono_id` **antes** de excluir a ficha, nunca depois.
- **Plano de ação:** uma linha por mitigação, editável pelo `AcoesEditor` dentro do `EditModal`. `risk_records.acoes` continua sendo gravado, mas como **resumo derivado** (é o que tabela, busca, Gráficos, CSV e KPI de completude leem); quem deriva é `src/lib/planoDeAcao.ts`, sempre a partir do que persistiu, nunca do que a tela pretendia salvar. `acoes_itens` está **congelado**: ninguém escreve mais nele, e `src/lib/acoes.ts` só o lê para converter o legado. Não apagar a coluna.
- **Tarefa e mitigação são a mesma tabela:** `tasks`, distinguidas por `risco_id` — preenchido = mitigação de risco, nulo = tarefa livre. Eram duas tabelas e a mesma entrega era cadastrada nas duas. `tasks` é a sobrevivente porque os anexos referenciam `tasks(id)`; `acoes_risco` está **congelada** como `acoes_itens`, e a cópia (`unificarTrabalho`, marcada em `migracoes`) preservou o `id` de cada linha — é o que mantém a trilha de auditoria válida. Quem serve a entidade é `acoesRiscoSobreTasks` (`api/_trabalhoDb.ts`), que implementa a **mesma** interface `Tabela<AcaoRisco>`: a rota, a auditoria, o backup e as telas que leem ação não sabem da mudança. A coluna `status` guarda o vocabulário do quadro ('A fazer'…) e a projeção traduz para o da ação ('aberta'…) nos dois sentidos — as 68 tarefas existentes não foram reescritas. `tasks.risco_id` é `set null`, não `cascade`: apagar um risco desvincula a mitigação em vez de apagá-la (com anexos junto).
- **Sequência de esquema:** só existe em `api/_schema.ts` (`ensureTudo`). A ordem é dependência, não gosto — `risk_records` antes das FKs de `tasks`, `acoes_risco` congelada antes da cópia. Produção, `vite-plugin-dev-api.ts` e os testes chamam a mesma função; uma segunda versão da sequência faz o teste passar sobre um esquema que a produção não tem.
- **Dev:** `npm run dev` sobe a mesma API com Postgres embarcado (pglite) via `vite-plugin-dev-api.ts` — sem precisar de banco. Produção usa Neon (`DATABASE_URL`).
- Sem lib de charts obrigatória — heatmap/donuts/barras são CSS (grid, conic-gradient, larguras %).

## Regras de negócio (não alterar sem pedido)
```
score  = probab × impact                 // null se faltar algum
prioriz = impacto2 / esforco + gravidade // null se esforco ausente/0 ou faltar impacto2/gravidade
```
- score arredonda a 1 casa; prioriz a 2 casas.
- normStatus: vazio→"Não iniciado"; "ANDAMENTO"→"Em andamento"; "CONCLU"→"Concluído".
- Cor por criticidade (score): ≤4 `#15803D` · 5–9 `#B8901F` · 10–14 `#D97706` · >14 `#DC2626` · null `#94A3B8`.
- Cor por priorização: ≥6 `#DC2626` · ≥4.5 `#D97706` · ≥3 `#B8901F` · <3 `#15803D` · null `#94A3B8`.
- Esses hex valem para o **tema claro** e vivem em `--tier-*` (`src/styles/tokens.css`). O tema escuro usa degraus próprios das mesmas matizes, porque `#15803D` sobre superfície escura é ilegível; as **faixas** são idênticas nos dois temas.
- Limite alto/baixo na matriz de quadrantes = 2.5 (esforço e impacto).

## Convenções visuais
O visual é governado por **tokens**, não por hex soltos. Fonte da verdade:
`src/styles/tokens.css`. Os demais arquivos de `src/styles/` (`base`, `primitives`,
`layout`, `table`, `charts`, `modal`, `responsive`) são importados por `App.css`
nessa ordem.

- **Nenhum hex literal fora de `tokens.css`.** Nenhum espaçamento fora da escala
  `--sp-*`; nenhum tamanho de fonte fora de `--fs-*`.
- **Cor semântica viaja por atributo, não por `style={{}}`**: `data-tier`
  (criticidade/priorização/GUT), `data-badge` (resposta/status), `data-accent`
  (KPI). As funções `scoreTier`/`priorizTier`/`gutTier`/`barTier` devolvem a
  faixa; o CSS resolve a cor. É o que permite o tema escuro sem tocar em
  componente.
- **Tema**: cada token declara claro e escuro numa linha via `light-dark()`. O
  `color-scheme` do `:root` decide; `[data-theme]` no `<html>` força um lado
  (botão no header, persistido em `riskMatrix.theme.v1`).
- **Elevação significa "flutua acima"**: cartão em repouso é hairline puro, sem
  sombra. `--elev-1` sticky/hover · `--elev-2` popover · `--elev-3` modal.
- Marca navy `--brand`; header claro com abas sublinhadas; conteúdo limitado a
  `--container` (1600px).
- Coluna "Riscos": acento no rótulo do header e faixa vertical de 2px — não mais
  fundo rosa em toda célula.
- Tipografia: **Inter Variable** auto-hospedada (`@fontsource-variable/inter`,
  sem CDN). `tabular-nums` só em coluna de tabela e eixo; número grande (KPI,
  centro do donut) usa figuras proporcionais.
- Sem ícones externos: glifos Unicode (↓ + × ▲ ▼ ‹ ›) ou desenho em CSS/SVG inline
  (ver `AnexosBadge`). Sem emojis. Cuidado: o Inter **não** tem ☀ ☾ ◐ — glifos
  assim caem em fallback torto.
- O visualizador de imagem em tela cheia é escuro nos dois temas (`--scrim`,
  `--scrim-ink`): scrim claro lava as cores da imagem.

### Data viz (regras do skill `dataviz`)
- Vão de 2px de superfície (`--viz-gap`) entre preenchimentos adjacentes: células
  do heatmap, segmentos empilhados, arcos do donut (`src/lib/donut.ts`).
- Marcas finas (barra de 8px, anel de donut de 14px); eixos e grade recessivos.
- Anel de superfície de 2px em marca que se sobrepõe (bolhas da matriz).
- Legenda sempre presente; **identidade nunca por cor sozinha** — toda cor de
  tier aparece junto do número ou do rótulo. Isso não é decoração: a escada
  semáforo verde→amarelo→laranja→vermelho não passa nos limites de daltonismo
  por matiz (médio `#B8901F` × alto `#D97706` medem ΔE 1.1 em deuteranopia).
- Célula vazia do heatmap mostra o `0`, não texto transparente.

## Idioma
Toda a UI e cópia em **português (Brasil)**.

## Ao fazer alterações
- Mudanças pequenas: alterar só o que foi pedido; não redesenhar o que não foi solicitado.
- Manter os cálculos de `score`/`prioriz` e as faixas de cor idênticos, salvo instrução explícita.
