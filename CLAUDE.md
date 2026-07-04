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
- **React + TypeScript** (a lógica do protótipo mapeia quase 1:1). Componentes: `TopBar`, `RegistroTab`, `GraficosTab`, `PriorizacaoTab`, `EditModal`.
- **Backend:** dados centralizados em Postgres (Neon) via funções serverless em `api/`. Toda a lógica SQL fica em `api/_db.ts` (executor `Sql` injetável). O front consome a API (`src/lib/api.ts` + hook `src/hooks/useRecords.ts`) com atualização otimista, *debounce* de escrita e polling. `localStorage` (`riskMatrix.cache.v1`) é só cache/fallback.
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
- Limite alto/baixo na matriz de quadrantes = 2.5 (esforço e impacto).

## Convenções visuais
- Navy primária `#1E3A5F` (hover `#28486F`); fundo app `#F3F5F8`; cartões brancos borda `#E4E9EF`.
- Coluna "Riscos" tem tratamento vermelho (header `#9C3F3A`, célula `#FBEEED`).
- Tipografia: system stack, `tabular-nums`. Raios 8–16px; pills 20px. Preservar as sombras suaves.
- Sem ícones externos: glifos Unicode (↺ ↓ + × ▲ ▼). Sem emojis.

## Idioma
Toda a UI e cópia em **português (Brasil)**.

## Ao fazer alterações
- Mudanças pequenas: alterar só o que foi pedido; não redesenhar o que não foi solicitado.
- Manter os cálculos de `score`/`prioriz` e as faixas de cor idênticos, salvo instrução explícita.
