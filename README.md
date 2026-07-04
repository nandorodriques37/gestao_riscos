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

- **Front-end:** React + TypeScript + Vite. Estado local (`useState`/`useMemo`),
  sem dependências de gráficos — heatmap, donuts e barras são CSS puro (grid,
  `conic-gradient`, larguras percentuais).
- **Back-end:** funções serverless (Vercel Functions) em `api/`, com dados
  centralizados em **Postgres (Neon)**. Toda a equipe lê e grava na **mesma
  matriz** — os registros ficam no banco, não mais só no navegador.

## Dados compartilhados

A matriz é única e compartilhada pelo time. O front-end conversa com a API:

- `GET /api/records` — lista os registros.
- `POST /api/records` — cria um registro.
- `PATCH /api/records/:id` — atualiza campos de um registro.
- `DELETE /api/records/:id` — exclui um registro.
- `POST /api/restore` — restaura os dados originais.

A tabela é criada e populada automaticamente na primeira chamada. As edições no
modal salvam sozinhas (com pequeno *debounce*) e o `localStorage` é usado apenas
como cache/fallback offline. A tela se re-sincroniza com o servidor
periodicamente e ao focar a aba.

> **Acesso aberto:** a API não tem autenticação — qualquer pessoa com o link
> pode ver e editar. Se no futuro quiser restringir ao time, dá para adicionar
> um token/senha compartilhada ou login por usuário.

## Rodando localmente

```bash
npm install
npm run dev
```

Em desenvolvimento **não é preciso configurar banco**: a API roda com um
Postgres embarcado (pglite), gravado em `.pglite-dev/` (ignorado no git). Para
começar do zero, apague essa pasta.

## Build

```bash
npm run build
```

O resultado estático vai para `dist/`; as funções de `api/` são empacotadas
pelo Vercel separadamente.

## Deploy no Vercel

1. **Importe o repositório** no Vercel. As configurações são detectadas
   automaticamente via `vercel.json` (framework Vite, build `npm run build`,
   output `dist`, funções em `api/`, e rewrite de SPA que preserva `/api/*`).
2. **Adicione o banco Neon:** no projeto, vá em **Storage → Create Database →
   Neon** (ou Marketplace → Neon) e conecte. Isso cria automaticamente a
   variável de ambiente `DATABASE_URL`.
3. **Redeploy.** Na primeira requisição a tabela `risk_records` é criada e
   populada com os dados iniciais.

Pela CLI:

```bash
npm i -g vercel
vercel        # deploy de preview
vercel --prod # deploy de produção
```

Para rodar as funções localmente contra o Neon (em vez do pglite), use
`vercel dev` com um arquivo `.env` contendo `DATABASE_URL` (ver `.env.example`).

## Referência de design

Implementado a partir do pacote de handoff em `design_handoff_matriz_risco/`
(modelo de dados, fórmulas de negócio, telas e design tokens). Ver `CLAUDE.md`
para as regras de negócio e convenções que devem ser preservadas.
