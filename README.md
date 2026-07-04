# Gestão da Matriz de Risco

Aplicação web de página única para registro, análise e priorização de riscos
corporativos. Um gestor cadastra riscos por área/rotina/categoria, avalia o
risco inerente (Probabilidade × Impacto), define plano de ação, prioriza o
esforço (Impacto / Esforço + Gravidade) e acompanha o status de execução.

Três abas:

- **Registro de Riscos e Ações** — tabela editável com KPIs, filtros e busca.
- **Gráficos** — indicadores com cross-filter (mapa de calor, donuts, barras).
- **Resumo de Priorização** — matriz esforço × impacto e ranking por recurso.

## Stack

React + TypeScript + Vite. Estado local (`useState`/`useMemo`), persistência
em `localStorage` sob a chave `riskMatrix.records.v1`. Sem dependências de
gráficos — heatmap, donuts e barras são construídos com CSS puro (grid,
`conic-gradient`, larguras percentuais).

## Rodando localmente

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Referência de design

Este projeto foi implementado a partir do pacote de handoff em
`design_handoff_matriz_risco/` (modelo de dados, fórmulas de negócio, telas e
design tokens). Ver `CLAUDE.md` para as regras de negócio e convenções que
devem ser preservadas em alterações futuras.
