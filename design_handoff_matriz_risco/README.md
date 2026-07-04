# Handoff: Gestão da Matriz de Risco

## Visão geral
Aplicação web de página única para **registro, análise e priorização de riscos corporativos**. Um gestor cadastra riscos por área/rotina/categoria, avalia o risco inerente (Probabilidade × Impacto), define plano de ação, prioriza o esforço (Impacto / Esforço + Gravidade) e acompanha o status de execução. Há três abas: **Registro de Riscos e Ações** (tabela editável), **Gráficos** (indicadores com cross-filter) e **Resumo de Priorização** (matriz esforço × impacto + ranking).

## Sobre os arquivos deste pacote
Os arquivos aqui são **referências de design feitas em HTML** — protótipos que mostram a aparência e o comportamento pretendidos, **não código de produção para copiar diretamente**. A tarefa é **recriar este design no ambiente do codebase-alvo** (React, Vue, Angular, etc.), usando os padrões e bibliotecas já estabelecidos ali. Se ainda não houver um ambiente, escolha o framework mais adequado (recomendação: **React + TypeScript**, pois a lógica atual já é em classe de estilo React) e implemente lá.

O protótipo foi construído como um "Design Component" (`.dc.html`): um runtime interno converte um template com `{{ }}` e uma classe `Component extends DCLogic` em React sob o capô. **Ignore esse runtime** — o valor está no template (a UI) e na classe de lógica (as regras de cálculo e estado), que se traduzem quase 1:1 para um componente React comum.

## Fidelidade
**Alta fidelidade (hifi).** Cores, tipografia, espaçamentos, badges e interações estão finalizados. Recrie a UI fielmente usando a biblioteca de componentes do codebase. Todos os valores hex e regras estão documentados abaixo.

## Stack e arquitetura recomendadas
- **React + TypeScript.** A lógica está numa classe única; comece portando-a para um componente React (hooks ou classe) e depois quebre em subcomponentes: `<TopBar>`, `<RegistroTab>`, `<GraficosTab>`, `<PriorizacaoTab>`, `<EditModal>`.
- **Estado:** local ao componente-raiz é suficiente (useState/useReducer). Não precisa de Redux. Persistência em `localStorage` (ver abaixo).
- **Dados:** `RiskData.js` traz os registros iniciais e as listas de sugestões. No app real, substituir por chamada à API / banco.
- **Estilos:** o protótipo usa estilos inline. No codebase, converta para o sistema de estilo vigente (CSS Modules, Tailwind, styled-components…). Os tokens estão listados em "Design Tokens".
- **Sem dependências de gráficos:** heatmap, donuts e barras são feitos com CSS puro (grid, `conic-gradient`, larguras percentuais). Pode manter assim ou trocar por uma lib de charts — mas os cálculos de agregação já estão prontos na lógica.

## Modelo de dados
Cada registro (linha) tem os campos:

- `area` (string) — área organizacional
- `rotina` (string) — rotina/processo
- `categoria` (string) — ex.: PESSOAS, PROCESSO…
- `risco` (string) — descrição do risco
- `resposta` (string) — uma de: `Mitigar`, `Aceitar`, `Transferir`, `Evitar`
- `probab` (number 0–5 | null) — probabilidade do risco inerente
- `impact` (number 0–5 | null) — impacto do risco inerente
- `acoes` (string) — plano de ação
- `resultado` (string) — resultado esperado
- `esforco` (number 0–5, passo 0.5 | null) — esforço da ação
- `impacto2` (number 0–5, passo 0.5 | null) — impacto da ação (distinto de `impact`)
- `gravidade` (number 0–5, passo 0.5 | null)
- `recurso` (string) — recurso/pessoa alocada
- `responsavel` (string)
- `status` (string) — bruto; normalizado para `Não iniciado` / `Em andamento` / `Concluído`
- `obs` (string)

`score` e `prioriz` NÃO são armazenados — são **derivados** (ver Fórmulas).

## Fórmulas (regras de negócio — implementar exatamente)
```
score (risco inerente) = probab × impact         // null se probab ou impact ausente
prioriz (priorização)  = impacto2 / esforco + gravidade
                         // null se esforco ausente/zero, ou impacto2/gravidade ausentes
```
`round1` = 1 casa decimal (score); `round2` = 2 casas (priorização).

**Normalização de status** (`normStatus`): vazio → `Não iniciado`; contém "ANDAMENTO" → `Em andamento`; contém "CONCLU" → `Concluído`; senão mantém o valor.

**Cor do score** (criticidade do risco inerente):
- `≤ 4` → Baixo `#15803D`
- `5–9` → Médio `#B8901F`
- `10–14` → Alto `#D97706`
- `> 14` → Crítico `#DC2626`
- `null` → `#94A3B8`

**Faixas de criticidade** (para donut/heatmap; note o limite estrito): `>14` Crítico · `>9 e ≤14` Alto · `>4 e ≤9` Médio · `≤4` Baixo.

**Cor da priorização:**
- `≥ 6` → Crítica `#DC2626`
- `≥ 4.5` → Alta `#D97706`
- `≥ 3` → Média `#B8901F`
- `< 3` → Baixa `#15803D`
- `null` → `#94A3B8`

**Completude** (KPI na aba Registro): sobre os campos `risco, probab, impact, acoes, esforco, impacto2, gravidade, recurso, responsavel, status` — `preenchidos / (nº registros × 10) × 100`, arredondado.

## Telas / Views

### Barra superior (todas as telas)
- Fundo gradiente `linear-gradient(135deg,#1E3A5F 0%,#152B47 100%)`, padding `20px 30px`, `box-shadow:0 4px 18px rgba(15,23,42,0.18)`.
- Logo: quadrado 42×42, `border-radius:11px`, gradiente `#5B8DEF→#3E6FD9`, texto "RM" branco bold 14px.
- Título "Gestão da Matriz de Risco" (branco, 19px, 700) + subtítulo "Registro de riscos, ações e priorização" (`#93A9C4`, 12.5px).
- Abas (pill group, fundo `rgba(255,255,255,0.07)`, `border-radius:11px`): "Registro de Riscos e Ações", "Gráficos", "Resumo de Priorização". Aba ativa: fundo branco, texto `#1E3A5F`; inativa: texto `#C6D5E5`, hover branco.

### 1. Registro de Riscos e Ações
- **Faixa de KPIs** (cartões brancos, `border-top:3px solid <cor>`, `border-radius:10px`, sombra suave): Riscos mapeados (`#1E3A5F`), Em andamento (`#D97706`/`#B45309`), Concluídas (`#15803D`), Priorização crítica (`#DC2626`), Completude (`#5B8DEF`, com barra de progresso `#5B8DEF→#3E6FD9`).
- **Ações à direita:** `↺ Restaurar` (restaura dados originais, confirm), `↓ Exportar CSV`, `+ Adicionar registro` (abre modal em linha nova).
- **Barra de filtros:** busca por texto (risco/ação/área/responsável), pills de status (Todos / Não iniciado / Em andamento / Concluído), selects de Área e Categoria. Contador "X de Y registros · clique em uma linha para editar".
- **Tabela** (`background:#fff`, `border-radius:12px`, `max-height:62vh`, scroll):
  - Cabeçalho fixo (sticky), fundo `#1E3A5F` (branco), **exceto a coluna "Riscos"** que é `#9C3F3A` (vermelho). Colunas redimensionáveis (arrastar borda direita do `th`; largura em px salva em estado). Colunas com sort: Probab., Impact., Score, Priorização (clique alterna asc/desc, mostra ▲/▼).
  - Colunas na ordem: Área(150), Rotina(160), Categoria(110), **Riscos**(270, célula com fundo `#FBEEED`), Resposta(100, badge), Probab.(64), Impact.(64), Score(64, badge colorido), Ações(250), Resultado Esperado(220), ESFORÇO(76), IMPACTO2(80), GRAVIDADE(84), PRIORIZAÇÃO(100, badge colorido), Recurso(160), Responsável(140), Status(118, badge), Observação(170), coluna de excluir(36, botão "×").
  - Linhas zebradas (`#fff` / `#F7FAFD`), hover `#EAF1FA`, clique abre o modal de edição.
  - Células truncam com reticências; `title` mostra o valor completo.

### 2. Gráficos
Todos os indicadores respeitam um **cross-filter**: clicar em qualquer barra/fatia/célula filtra TODA a aba por aquele recorte (categoria, área, rotina, recurso, status, criticidade ou célula do heatmap). Banner "Filtro ativo" com chip e botão "Limpar filtro ×".
- **Strip de 4 KPIs:** Riscos avaliados (X / total), Score médio (P×I), Riscos críticos, Ações concluídas (%).
- **Mapa de Calor 5×5** Probabilidade × Impacto (grid CSS; célula colorida pela cor do score `prob×imp`; número = contagem; célula vazia = cor com 24 de alpha, texto transparente). Eixo Y = Impacto (5→1, de cima p/ baixo), eixo X = Probabilidade (1→5).
- **Distribuição por Criticidade:** donut via `conic-gradient` + legenda clicável (Crítico/Alto/Médio/Baixo) com contagem e %.
- **Descrição dos Riscos:** tabela (Risco · Área/Categoria · Score · Status) ordenada por score desc; reflete o filtro.
- **Risco por Categoria / por Área / por Rotina:** barras horizontais; largura ∝ soma do score do grupo; cor por "tier" (razão sobre o maior: ≥0.75 crítico, ≥0.5 alto, ≥0.25 médio, senão baixo). Legenda de cores.
- **Status das Ações:** donut das ações que têm texto em `acoes`, por status normalizado (Não iniciado `#94A3B8` / Em andamento `#D97706` / Concluído `#15803D`).
- **Ações por Recurso · Andamento:** barra empilhada por recurso (segmentos ni/ea/cc), largura ∝ total do recurso.

### 3. Resumo de Priorização
- Filtro por status (pills). Contador "X de Y ações".
- **Matriz Esforço × Impacto** (quadrantes): plot com `aspect-ratio:1/0.85`. Eixo X = Esforço, Y = Impacto (`impacto2`). Quadrantes com tint próprio e pílula-legenda clicável:
  - Quick Wins (alto impacto, baixo esforço) `#15803D`, tint `#F0F9F1`
  - Grandes Apostas (alto impacto, alto esforço) `#5B7FB5`, tint `#F3F6FB`
  - Baixa Prioridade (baixo impacto, baixo esforço) `#94A3B8`, tint `#F8FAFC`
  - Reavaliar (baixo impacto, alto esforço) `#C2811C`, tint `#FDF6EC`
  - Limite entre alto/baixo = **2.5** para esforço e impacto.
  - Bolhas: número = ranking (por priorização desc), tamanho ∝ gravidade (`22 + gravidade×3.6`px), cor = cor da priorização. Bolhas sobrepostas (mesmo esforço/impacto) são espalhadas radialmente. Clique destaca a bolha e filtra a lista; clique numa pílula filtra pelo quadrante.
- **Lista ranqueada** sincronizada à direita (número, ação truncada em 2 linhas, "E · I · G", badge de priorização). Título muda conforme seleção ("Ranking de priorização" / "Ação selecionada" / "<Quadrante> · N ações").
- **Resumo por Recurso:** um bloco por recurso (cabeçalho navy com médias de Esforço/Impacto/Gravidade e "Priorização média"), tabela de ações ordenadas por priorização desc, badge de priorização colorido.

### Modal de edição
Abre ao clicar numa linha ou em "+ Adicionar registro". Overlay `rgba(15,23,42,0.52)` + `backdrop-filter:blur(2px)`. Card branco, `max-width:780px`, `max-height:88vh`, `border-radius:16px`. Fecha com ×, botão "Concluído" ou tecla **Escape**. **Salva automaticamente** a cada `onChange` (não há botão salvar). Seções: Identificação (Área/Rotina/Categoria com `datalist` de sugestões + Risco), Avaliação do Risco Inerente (Resposta select + Probab/Impacto number 0–5 + Score calculado), Plano de Ação (Ações + Resultado), Priorização do Esforço (Esforço/Impacto/Gravidade number 0–5 passo 0.5 + Priorização calculada), Gestão e Acompanhamento (Recurso/Responsável com datalist + Status select + Observação). Rodapé: "Excluir registro" (vermelho, confirm) e "Concluído".

## Interações & comportamento
- **Editar:** clique em linha → modal; edições refletem em tempo real na tabela e nos gráficos.
- **Cross-filter (Gráficos):** clicar num elemento seta `graphFilter`; clicar de novo no mesmo alterna/limpa. Toggle idêntico ao comparar por `JSON.stringify`.
- **Seleção na matriz:** `selectedRank` (bolha) e `selectedQuadrant` (pílula) são mutuamente exclusivos; clicar de novo desativa.
- **Sort de colunas:** clique no header alterna asc/desc; nulls vão para o fim.
- **Redimensionar colunas:** `mousedown` na alça direita do header → arrasta (mín. 44px), largura persistida no estado da sessão.
- **Exportar CSV:** separador `;`, BOM UTF-8, aspas escapadas, inclui `score` e `prioriz` calculados e status normalizado. Arquivo `matriz-de-risco.csv`.
- **Restaurar:** confirm → recarrega `INITIAL_RECORDS` e limpa a persistência.
- **Escape** fecha o modal.

## Gerenciamento de estado
Variáveis (raiz):
- `tab`: 'registro' | 'graficos' | 'priorizacao'
- `records`: array de registros
- `editingIndex`: number | null (índice em edição)
- `selectedRank`: number | null · `selectedQuadrant`: 'qw'|'ga'|'bp'|'rv' | null
- `prioStatusFilter`: 'Todos'|'Não iniciado'|'Em andamento'|'Concluído'
- `search`, `statusFilter`, `areaFilter`, `categoriaFilter`
- `sortKey` / `sortDir` ('asc'|'desc')
- `graphFilter`: `{type, value}` ou `{type:'heat', prob, imp}` | null
- `colWidths`: mapa colId→px
- listas de sugestão: `areaOptions, rotinaOptions, categoriaOptions, recursoOptions, responsavelOptions`

**Persistência:** `records` são salvos em `localStorage` sob a chave `riskMatrix.records.v1` a cada mudança; carregados no mount (fallback para `INITIAL_RECORDS`). No app de produção, trocar por API.

## Design Tokens
**Cores base**
- Fundo app: `#F3F5F8` · Cartões: `#FFFFFF` · Bordas: `#E4E9EF` / `#DCE3EA` / `#F1F5F9`
- Texto: `#0F172A` (forte), `#334155`, `#475569`, `#64748B`, `#8A97A6` / `#9AA7B4` (muted)
- Navy primária: `#1E3A5F` (hover `#28486F`), escuro `#152B47`
- Azul de destaque: `#5B8DEF` / `#3E6FD9`; fundo azul claro: `#EAF1FA`
- Vermelho coluna Riscos: header `#9C3F3A`, célula `#FBEEED`

**Escala de criticidade / priorização:** Baixo `#15803D` · Médio `#B8901F` · Alto `#D97706` · Crítico `#DC2626` · N/A `#94A3B8`

**Status:** Não iniciado `#94A3B8` (badge slate `#F1F5F9`/`#475569`) · Em andamento `#D97706` (badge amber `#FEF3C7`/`#B45309`) · Concluído `#15803D` (badge green `#DCFCE7`/`#15803D`)

**Resposta (badges):** Mitigar=blue(`#DBEAFE`/`#1D4ED8`) · Aceitar=slate · Transferir=purple(`#EDE9FE`/`#6D28D9`) · Evitar=red(`#FEE2E2`/`#B91C1C`)

**Tipografia:** stack `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`; `font-variant-numeric: tabular-nums` global. Tamanhos: título 19px/700, seção 15px/700, KPI número 24–28px/800, corpo 12.5–13px, labels/uppercase 10.5–11px/700–800 com `letter-spacing:0.5px`.

**Raios:** 8px (botões/inputs), 10–12px (cartões), 14–16px (painéis/modal), 20px (pills), 50% (donut/bolhas). **Sombras:** cartões `0 1px 2px rgba(15,23,42,0.04), 0 6px 16px rgba(15,23,42,0.05)`; painéis `…, 0 10px 24px rgba(15,23,42,0.05)`; modal `0 24px 60px rgba(15,23,42,0.35)`.

## Assets
Nenhum asset externo (imagens/ícones). Logo é CSS puro. "Ícones" são glifos Unicode (↺ ↓ + × ▲ ▼). Gráficos são CSS (grid, `conic-gradient`, larguras %).

## Arquivos deste pacote
- `CLAUDE.md` — instruções persistentes para o repositório (coloque na raiz do projeto ao importar).
- `screenshots/01-registro.png`, `02-graficos.png`, `03-priorizacao.png` — capturas hifi das três abas.
- `Matriz de Risco.dc.html` — protótipo hifi completo (template + lógica). Referência principal.
- `RiskData.js` — registros iniciais (`INITIAL_RECORDS`) e listas derivadas (`AREAS`, `ROTINAS`, `CATEGORIAS`, `RECURSOS`, `RESPONSAVEIS`, `RESPOSTAS`, `STATUSES`) + `normStatus()`.

> Ao ler o `.dc.html`: o bloco `<x-dc>…</x-dc>` é o template (a UI) e o `<script data-dc-script>` é a classe de lógica com todos os cálculos. Traduza ambos para o framework do codebase; ignore `support.js`/o runtime `.dc`.
