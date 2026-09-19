# CLAUDE.md — Gestão da Matriz de Risco

Instruções persistentes para implementar e evoluir este projeto.

## O que é
App web de página única para **direção e execução**, organizado pela cadeia
**objetivo → iniciativa → risco → tarefa**. Oito destinos no trilho, em três
grupos: Direção (Painel, Objetivos, Iniciativas, Priorização), Risco (Riscos) e
Execução (Tarefas, Pessoas), mais a Triagem temporária da migração.

O **Painel** abre com uma faixa de cinco números sob o título (valor em jogo,
marcos no prazo, quem está mais carregado, iniciativas paradas, exposição ainda
aberta), depois mostra **onde a cadeia quebra** — todo elo solto (objetivo sem
iniciativa, iniciativa sem marco, risco sem tratamento, risco que não sustenta
objetivo, trabalho sem dono ou atrasado) numa lista só, com o botão que leva a
quem resolve — e só então **a cadeia, de ponta a ponta**, como um fluxo
(`SankeyCadeia`): quatro colunas, faixas entre vizinhas e, em coral, o toco de
cada ponta solta, com o mesmo número da lista de atenção. A atenção vem antes
dos contadores de propósito: contador é contexto, elo partido é decisão.

## Fonte da verdade do design
- `design_handoff_matriz_risco/README.md` — especificação completa (modelo de dados, fórmulas, telas, tokens, interações, estado). **Leia antes de implementar qualquer coisa.**
- `design_handoff_matriz_risco/Matriz de Risco.dc.html` — protótipo hifi de referência (UI + lógica).
- `design_handoff_matriz_risco/RiskData.js` — dados iniciais e listas.
- `design_handoff_matriz_risco/screenshots/` — capturas das três abas.

Os `.dc.html` são **referência de design, não código de produção**. Recrie no framework do codebase.

## Stack
- **React + TypeScript** (a lógica do protótipo mapeia quase 1:1). Componentes: `TopBar`, `RegistroTab`, `GraficosTab`, `PriorizacaoTab`, `TarefasTab`, `EditModal`.
- **Backend:** dados centralizados em Postgres (Neon), com executor `Sql` injetável em `api/_db.ts`. A entrada serverless única é `api/index.ts`; `vercel.json` encaminha `/api/:path*` a ela e `api/_router.ts` despacha pelos caminhos públicos. O servidor local usa o mesmo roteador. Os módulos auxiliares começam com `_` para não gerar funções avulsas. Consultas simples usam HTTP; operações compostas usam `Sql.transaction` com `Pool` e WebSocket, com commit ou rollback na mesma conexão.
- **Salvamento e sincronização:** os formulários usam rascunho e confirmação explícita, preservam a versão da abertura e mantêm o texto em caso de erro. `useStoredCollection` concentra cache, leituras protegidas contra respostas antigas e a fila de debounce por registro das edições rápidas. `usePortfolio` confirma cada alteração antes de atualizar a coleção. `dataSync` invalida riscos, tarefas e portfólio entre si. Cache local nunca equivale a confirmação do servidor.
- **Operações compostas:** `api/_operacoes.ts` salva risco + plano e cria iniciativa + vínculo em transações idempotentes, com chave e assinatura em `operacoes_app`. A mesma chave só pode repetir o mesmo pedido; a resposta confirmada é reutilizada. A validação das versões e a auditoria fazem parte da transação. Uma falha não pode confirmar só metade do formulário.
- **Anexos de imagem (tarefas):** tabela própria `task_attachments` (`api/_attachmentsDb.ts`), nunca coluna em `tasks` — a aba faz polling e os bytes não podem viajar no `GET /api/tasks`, que carrega só o metadado (`anexos`). Os bytes saem por `GET /api/tasks/:id/anexos/:anexoId`, com cache imutável, e vão direto no `src` de um `<img>`. O cliente reduz a imagem antes de subir (`src/lib/imageAttachments.ts`: teto de 1600px e 3 MB, re-encode em WebP); o servidor revalida formato e tamanho. Anexo **não** é campo de `Task`: entra e sai por endpoint próprio, fora do PATCH com debounce.
- **Portfólio (objetivo → iniciativa → marco):** seis entidades (`pessoas`, `objetivos`, `medicoes`, `iniciativas`, `marcos`, `acoes_risco`) sobre a fábrica genérica `api/_table.ts`, atendidas por `api/_portfolioRoute.ts` através do roteador único. Não recriar uma entrada de função por profundidade: os antigos PATCH/DELETE que falhavam na borda agora mantêm a URL pública via rewrite, sem catch-all de arquivos. O front lê o pacote por `GET /api/portfolio` e `usePortfolio`; as métricas são funções puras em `src/lib/portfolioMetrics.ts`. Regra de integridade nova entra em **`validarEntidade`** (`api/_portfolioDb.ts`), compartilhada pelos dois ambientes.
- **Marco tem três campos de texto, e eles não se substituem:**
  `criterio_aceite` (como se verifica a entrega), `motivo_replanejamento` (por
  que a data mudou — o servidor **exige** ao mover `data_plano_atual` de uma
  data já gravada) e `obs`, nota livre para o contexto que não cabe nos dois.
  `obs` fica fora de `CAMPOS_AUDITADOS` de propósito: a trilha guarda o que
  alguém pode ser cobrado depois, não observação que só um humano lê.
- **Medição de objetivo:** `medicoes` é uma linha por leitura do indicador, nunca um campo `valor_atual` — sobrescrever o valor apaga a tendência, que é o que interessa. `progressoObjetivo` deriva atual, % do caminho e tendência; a direção da melhora sai dos próprios números (meta menor que baseline = descer é melhorar), sem campo de "quanto menor melhor".
- **Pessoas:** tem tela própria (`PessoasTab`), com capacidade (`dias_projeto_mes`, que a carga do Painel usa como régua), ativo/inativo e mesclagem de fichas duplicadas. **Dono é `dono_id` em toda linha** — objetivo, iniciativa e tarefa (livre ou mitigação). `tasks.responsavel` está **congelado** com o texto de antes da conversão; quem lê prefere a pessoa. A mesclagem vive no servidor (`POST /api/portfolio/mesclar-pessoas`, `api/_donos.ts`), porque quem sabe quais tabelas apontam para `pessoas` é o esquema: a versão anterior morava no componente, repontava três listas do pacote e não enxergava as tarefas livres. FK esquecida não falha — é `set null`, e o dono some calado. Repor as FKs vem **antes** de excluir a ficha, nunca depois. A duplicata nascia da semeadura comparando grafia crua (`DERYLSON` e `Derylson` passavam juntas na mesma rodada); agora tudo casa por `chaveDoNome` (`src/lib/nomes.ts`, sem acento e sem caixa), inclusive o campo de responsável do quadro.
- **Plano de ação:** uma linha por mitigação, editável pelo `AcoesEditor` dentro do `EditModal`. `risk_records.acoes` continua sendo gravado, mas como **resumo derivado** (é o que tabela, busca, Gráficos, CSV e KPI de completude leem). Quem regrava é o SERVIDOR, em `sincronizarResumoDoPlano` (`api/_trabalhoDb.ts`), chamado de dentro de toda escrita de mitigação — pelo plano de ação e pelo quadro, que editam a mesma linha. A regra de montar o texto é única (`src/lib/resumoAcoes.ts`) e roda sempre sobre o que persistiu, nunca sobre o que a tela pretendia salvar. Derivar só na tela funcionou enquanto havia uma tela: quando o quadro passou a renomear e excluir mitigação, o registro do risco começou a anunciar ação que não existia mais. `acoes_itens` está **congelado**: ninguém escreve mais nele, e `src/lib/acoes.ts` só o lê para converter o legado. Não apagar a coluna.
- **Tarefa e mitigação são a mesma tabela:** `tasks`, distinguidas por `risco_id` — preenchido = mitigação de risco, nulo = tarefa livre. Eram duas tabelas e a mesma entrega era cadastrada nas duas. `tasks` é a sobrevivente porque os anexos referenciam `tasks(id)`; `acoes_risco` está **congelada** como `acoes_itens`, e a cópia (`unificarTrabalho`, marcada em `migracoes`) preservou o `id` de cada linha — é o que mantém a trilha de auditoria válida. Quem serve a entidade é `acoesRiscoSobreTasks` (`api/_trabalhoDb.ts`), que implementa a **mesma** interface `Tabela<AcaoRisco>`: a rota, a auditoria, o backup e as telas que leem ação não sabem da mudança. A coluna `status` guarda o vocabulário do quadro ('A fazer'…) e a projeção traduz para o da ação ('aberta'…) nos dois sentidos — as 68 tarefas existentes não foram reescritas. `tasks.risco_id` é `set null`, não `cascade`: apagar um risco desvincula a mitigação em vez de apagá-la (com anexos junto). A aba Tarefas mostra as duas coisas numa lista só, com recorte por origem (Todas / De risco / Livres) e o chip do risco em cada linha vinculada. Vínculo é **só leitura** no quadro (fica fora de `TASK_FIELDS`) — quem cria e desfaz é o plano de ação dentro do risco. Mitigação sem nota GUT **herda a faixa da criticidade do risco**, senão as 50 caem em "Sem nota" e o Kanban por prioridade fica inútil para metade das linhas; a faixa herdada é marcada com `*`. Rotina não tem prazo e nunca atrasa. "Risco excluído" só aparece quando a lista de riscos já carregou — sem essa distinção toda linha vinculada mente durante o carregamento.
- **Risco ↔ objetivo é DERIVADO, nunca declarado:** o caminho é
  `objetivo ← iniciativa ← ação ← risco`, e é o que `riscosPorObjetivo` percorre.
  Não existe `risk_records.objetivo_id` — um segundo caminho para o mesmo fato
  discordaria do primeiro e ninguém saberia qual vale. O buraco que a derivação
  deixa (mitigação autônoma não sustenta objetivo nenhum) é mostrado como
  lacuna, em `riscosSemObjetivo`, e não tapado com um campo.
- **Saúde da cadeia:** `saudeObjetivos`, `saudeIniciativas`, `saudeRiscos`,
  `saudeTrabalho`, `cadeiaQuebrada` e `fluxoDaCadeia` (`src/lib/portfolioMetrics.ts`),
  funções puras como o resto do arquivo. Elas NÃO conhecem rótulo, cor nem aba:
  `cadeiaQuebrada` devolve `{ chave, n, ids }` e quem traduz para texto e
  destino é `LACUNAS` (`src/lib/portfolioUi.ts`). `fluxoDaCadeia` é o que o
  Sankey desenha e **reusa** `cadeiaQuebrada` para as pontas soltas — um elo
  partido no desenho é a mesma lacuna da lista, com o mesmo número; o
  componente `SankeyCadeia` não calcula nada. Régua de status e de faixa vem
  de `normTaskStatus`/`scoreTier` — nunca reimplementada.
- **Uma régua por pergunta:** "quantos riscos eu mapeei" conta linhas COM
  descrição, no Painel, no Registro, na Análise e nas lacunas de risco de
  `cadeiaQuebrada`. Linha em branco é como se adiciona uma, não é risco — e
  a lista de atenção não cobra tratamento dela. O nome das faixas sai de `ROTULO_TIER`
  (`calculations.ts`) — havia quatro cópias de "Crítico/Alto/Médio/Baixo".
- **`useTasks` mora no `App`**, como `usePortfolio`: o Painel precisa contar
  tarefa e a aba Tarefas não está montada quando ele está. O quadro recebe o
  hook por prop e continua dono do próprio polling; o `App` só sincroniza as
  tarefas quando está FORA da aba Tarefas, senão são dois relógios sobre a
  mesma lista.
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
`src/styles/tokens.css`. Os demais arquivos de `src/styles/` são importados por `App.css`; `fluidez.css` complementa os formulários e
vínculos após as regras existentes.

### Identidade "Registro" (redesign de 09/2026)
A tese: o app é um **registro de governança** — guarda decisões, cobra donos e
mede promessa contra entrega — e deve parecer um documento técnico vivo, não um
painel de telemetria. Consequências, todas em `tokens.css`:

- **Papel, não tela preta.** O tema **claro é o padrão**, e é decisão medida:
  a cor oficial da marca, `#0000BE`, rende 12,0:1 sobre o papel quente
  `#FBFAF8` e 1,6:1 sobre um canvas navy. O padrão é declarado no CSS
  (`:root { color-scheme: light }`), não no JS, para o primeiro frame já pintar
  claro. Os **três** estados do tema são marcados no `<html>`
  (`data-theme="light|dark|system"`), 'system' inclusive — regra presa a
  `[data-theme='dark']` fica muda para quem segue um sistema escuro, então
  refinamento de tema vira token `light-dark()`, nunca seletor de atributo.
  Neutros são **quentes** (pedra), no claro e no escuro; o escuro é grafite
  neutro, nunca navy.
- **Cor é semáforo, nunca decoração.** Azul da marca (`--brand`) é estrutura:
  navegação, link, foco, estado ativo, marcador do item ativo e barra do título.
  **Coral (`--brand-red`) só onde significa ameaça, atraso ou perda** — o nó de
  risco do glifo, o elo "Riscos", `.rastro-risco`, a série "evitar perda", o
  toco de elo partido no Sankey. Nunca como destaque. Texto corrido de ameaça
  em fundo claro usa `--coral-texto` (`#D3102C`, 5,2:1); `#FF2342` reprova AA
  abaixo de 18px e fica para preenchimento, ícone e cifra grande. Verde só onde
  algo foi concluído ou está dentro do limite.
- **Etiqueta tem quatro papéis, não sete cores:** `BadgeKind = 'neutro' |
  'atencao' | 'ok' | 'risco'`. Só três recebem croma; `neutro` é texto sobre
  hairline. Categoria (origem, vetor, resposta padrão, status inicial, situação
  do risco) é neutra; croma é para estado. Os três com cor reaproveitam os
  degraus de criticidade de propósito (atenção = médio, ok = baixo, risco =
  crítico): um segundo verde a poucos ΔE do primeiro seria o problema que o
  redesign veio desfazer. "Mitigar" nem vira etiqueta — repetia o mesmo pill
  tela abaixo; só a exceção (evitar, aceitar, transferir) é etiqueta
  (`RegistroTab/Resposta.tsx`). As quatro camadas da cadeia têm família
  própria, `--camada-objetivo/-iniciativa/-risco/-trabalho`, usada pela lista
  de lacunas e pelo Sankey.
- **Raio diz o papel:** `--r-control` (4px) em botão, campo e chip;
  `--r-card` (8px) em cartão e envelope; `--r-row` (0) em linha de tabela;
  `--r-float` (12px) no que flutua — modal, gaveta, popover, folha, snackbar.
  Quando tudo tinha o mesmo arredondamento médio, tudo virava cartão.
- **Toda cifra sai em Plex Mono** por uma regra só em `base.css` (score, GUT,
  prazo, percentual, valor, contagem, o número grande do KPI e o do centro do
  donut). A lista é de CLASSE DE CIFRA, não de tudo que tem dígito:
  `.lista-nota` às vezes é prosa, `.acao-prazo` é o contêiner de um campo de
  data, `.marco-num` são glifos. Isso substituiu a doutrina de "número grande
  em figuras proporcionais": mono já é tabular por construção.
- **Anel de foco sólido**, 2px com vão de 2px (`--focus-w`, `--focus-offset`),
  em todo interativo. O anterior era alpha de 24–32%, invisível sobre papel.
- **Texto ≤13px nunca abaixo de `--ink-3`** (5,5:1 no claro, 6,8–7,6:1 no
  escuro). `--ink-4` é o degrau reservado a ≥14px e ao que é decorativo.
- **Vocabulário de vazio, duas formas só** (`.nao-preenchido` em
  `primitives.css`): travessão para o campo que não se aplica; "Não preenchido"
  — itálico, sempre clicável, leva ao campo — para o que se aplica e falta
  preencher. Se preencher muda uma decisão, é link; se não muda, é travessão.
  Nunca `R$ 0` nem `0%` onde a causa é campo em branco: o tile mostra estado
  vazio com o botão de quem preenche (`<Kpi vazio>`), e o objetivo sem meta ou
  sem medição mostra trilha tracejada, não barra em 0%.
- **Estado vazio** é "o que é + por que está vazio + o que fazer", com o glifo
  da rede de decisão (`EmptyState` não aceita ícone — a prop existia e ninguém
  renderizava). Famílias de verbo: **Abrir …** navega e recorta; **Declarar …**
  é quando o sistema já provou o fato e falta a pessoa assumi-lo.
- **Confirmação destrutiva nunca é `window.confirm`.** `useConfirmacao()`
  (`common/Confirmacao.tsx`, sobre o `ModalShell` compacto) diz a consequência
  em números ("Os 5 marcos vão junto") e nomeia os dois botões — o verbo, e
  "Manter". Vale para excluir risco, iniciativa, objetivo, pessoa, tarefa,
  mitigação e medição, e para juntar fichas e declarar atingido.
- **Paleta de comando** (`common/PaletaComando.tsx`, Ctrl/⌘+K): o listener mora
  no `App`, indexa os destinos de `NavRail/secoes.tsx` e os registros das
  camadas, e **não abre enquanto há outro `[role="dialog"]`** — o foco preso do
  modal brigaria com ela. `/` foca a busca da aba Iniciativas.
- **`redesign.css` é a última folha e vai sumindo por etapas.** Ela vence
  qualquer camada anterior pela ordem, e 33 classes dela também existem em
  `portfolio.css` ou `responsive.css`; mover um bloco para a folha "dona" de
  uma vez inverteria quem ganha, às vezes só numa largura de tela. Cada mudança
  que toca um componente leva o bloco dele para a folha canônica e funde as
  propriedades na regra que já existe (foi assim com `.card`, `.kpi-*`, a
  faixa de KPI e a cifra). **Nunca nasce uma segunda camada final sobre ela.**

- **Nenhum hex literal fora de `tokens.css`.** Nenhum espaçamento fora da escala
  `--sp-*`; nenhum tamanho de fonte fora de `--fs-*`. Altura de controle vem de
  `--control-h`, alvo de toque de `--tap-min`, corpo de campo de `--fs-field` —
  nunca um `height: 32px` novo.
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
- Marca no azul oficial `--brand` (`#0000BE` no claro; no escuro a rampa desce
  para `#7280FF` porque o núcleo não sustenta fundo escuro); header claro com
  abas sublinhadas; conteúdo limitado a `--container` (1600px). O glifo da marca
  é a rede de decisão própria do produto, com o nó de risco em coral — não o
  logo da Pague Menos, e o wordmark nunca é recriado em fonte.
- Coluna "Riscos": acento no rótulo do header e faixa vertical de 2px — não mais
  fundo rosa em toda célula.
- Tipografia: **IBM Plex Sans Variable** (eixo de peso, `@fontsource-variable/ibm-plex-sans/wght.css`)
  para interface e prosa, **IBM Plex Mono** para cifra, auto-hospedadas. Sem
  serif e sem eixo óptico — pedir `opsz` numa fonte carregada só com `wght` era
  descrever uma fonte que não está aqui. A família fica no `<html>`, não só no
  `<body>`: sem isso o elemento-raiz caía em serif de sistema. As `font-feature-settings`
  ficam numa declaração só no `body` (a propriedade não acumula; um `:root`
  pedindo `ss01` e um `body` pedindo `cv05` deixavam só o `cv05` valendo).
  `font-synthesis: none`, porque peso sintético suja o traço ao lado do real.
  Nenhum tamanho de fonte fora de `--fs-*`; o degrau `--fs-3xs` (10px) existe
  só para micro-rótulo em caixa alta com tracking aberto, nunca para prosa.
- **Um primitivo por papel**: `common/Kpi.tsx` (`<Kpi>` / `<KpiRow>`) é o ÚNICO
  tile de indicador, e `common/Composicao.tsx` a única barra empilhada. Havia
  três componentes de KPI quase idênticos e dois seletores CSS com as mesmas
  regras (`.kpi-card` e `.kpi-tile`) — o resultado eram tamanhos de número
  diferentes para o mesmo papel, dependendo da aba. O Painel também usa o
  `<Kpi>` (tinha cinco tiles à mão). A faixa é `<KpiRow colunas={3|4|5}>` ou
  auto-ajuste; a camada final forçava quatro colunas em toda faixa e empurrava
  o quinto KPI para uma segunda linha com um buraco ao lado. A barra empilhada
  tem 28px (`--viz-bar-h`) e escreve o valor dentro do segmento que tem
  largura para ele; a legenda continua, porque é ela que identifica. Cabeçalho
  é sempre `.page-bar` + `.page-title`, e toda aba tem um.
- Sem ícones externos: glifos Unicode (↓ + × ▲ ▼ ‹ ›) ou desenho em CSS/SVG inline
  (ver `AnexosBadge`). Sem emojis. Cuidado: o Inter **não** tem ☀ ☾ ◐ — glifos
  assim caem em fallback torto.
- **`flex-basis` é base, não teto.** A coluna do Kanban é
  `flex: 0 0 var(--kanban-col-w)` **mais `min-width: 0`**. Sem o piso zerado, o
  `min-width: auto` do flex eleva a largura usada ao min-content do conteúdo, e
  qualquer texto `nowrap` do usuário — o chip de tipo, o nome da iniciativa no
  chip de vínculo — esticava a coluna de 288px para 600px, empurrando as outras
  quatro para fora da tela. Com o piso zerado quem cede é o texto, com
  reticências. Vale para todo item de flex-row que contém texto livre.
- A largura da coluna é **um token só** (`--kanban-col-w`), porque três lugares
  precisam da mesma medida: a coluna, a cópia levantada no arraste e a
  redefinição de 82vw do celular. Eram dois literais (288px e 272px) e já
  divergiam.
- **A coluna do quadro tem piso de quatro cards** (`--kanban-col-h`, derivado de
  `--kanban-card-h`), e cresce além disso quando a viewport permite. O piso
  anterior, 260px, era herança de quando a aba tinha menos cromo acima: com sete
  KPIs e a barra de filtros, `100dvh - --kanban-offset` sobra ~160px numa janela
  baixa, e a coluna mostrava um card e meio. Quatro cards passam da altura da
  tela nessas janelas — quem rola é a página, como já acontecia no celular.
  `--kanban-card-h` é o card REPRESENTATIVO (medido: 136px a 212px, conforme
  linhas de título e chip de vínculo); não travar a altura do card com ele.
- **Camada fixa não tolera `transform` em contêiner de página.** `transform`,
  `filter`, `contain` ou `will-change` num ancestral — mesmo identidade, mesmo
  residual de `animation-fill-mode: both` — tornam o elemento o bloco recipiente
  de todo descendente `position: fixed`. Modal, lightbox, guia GUT em folha e
  menu do Kanban param de medir a viewport e passam a medir a aba: o diálogo
  nasce deslocado (largura do rail + altura do header) e o rodapé com "Salvar"
  cai fora da tela. Foi o que a animação de entrada de `.tab-page` fazia; hoje
  ela anima só opacidade. Os três modais (`ModalShell`, `TarefaEditModal`,
  `EditModal`) saem por `createPortal` no `<body>` como segunda linha de defesa.
  Altura de modal é `dvh`, nunca `vh` — com a barra de endereço aberta `vh` mede
  a tela inteira e empurra o rodapé para fora.
- O visualizador de imagem em tela cheia é escuro nos dois temas (`--scrim`,
  `--scrim-ink`): scrim claro lava as cores da imagem.

### Navegação e formulários
- `navigation.ts` e `useAppNavigation` mantêm destino e seleção na URL, com
  Voltar/Avançar do navegador. `useDraftGuard` protege rascunhos ao fechar,
  trocar de destino ou sair da página. Não salvar implicitamente ao fechar.
- `useSessionState` preserva busca, filtros e ordenação das listas principais
  na sessão. Os atalhos do Painel levam os IDs da lacuna ao destino e oferecem
  limpeza explícita do recorte.
- Vínculo risco–iniciativa sempre passa pela ação. O seletor busca nome e
  objetivo, exclui novos vínculos com iniciativas encerradas e permite ler
  vínculos históricos. Ações canceladas não contam como cobertura ativa.
- O modal do risco separa Resumo, Tratamento e Histórico. Prioridade e retorno
  da iniciativa ficam em seção recolhível. Os campos e fórmulas continuam os mesmos.

### Mobile
- **Três formas de navegação, uma lista de destinos.** `NavRail/secoes.tsx` é a
  fonte única (ícones, grupos, ordem); `NavRail` (≥1101px), as abas do `TopBar`
  (761–1100) e `NavBottom` (≤760) leem de lá. As três regras de visibilidade
  ficam juntas no fim de `styles/rail.css` — separadas, duas formas aparecem ao
  mesmo tempo numa faixa que ninguém olhou. A barra inferior tem 4 destinos
  fixos (um por camada da cadeia) + "Mais", que abre a folha com os grupos
  inteiros, o chip de autor e o botão de tema. Tema e autor moram no `App`,
  como `useTasks`: dois `useState` dariam duas verdades sobre o mesmo tema.
- **A adaptação a toque é um bloco só** — `@media (pointer: coarse) and
  (max-width: 1100px)` em `tokens.css`, que troca três valores. Todo controle já
  lê o token, então não existe (e não deve nascer) regra de toque por
  componente. `--tap-min` é PISO, não tamanho: botão de ícone declara
  `max(<repouso>, var(--tap-min))`, e no desktop o piso é zero.
- **16px em campo não é gosto:** abaixo disso o Safari do iOS amplia a viewport
  ao focar e não volta. É o que `--fs-field` resolve.
- **Tabela de riscos: o nome vem primeiro e é a coluna congelada**, em até duas
  linhas (`.risco-nome`), com a taxonomia (área, rotina, categoria) em largura
  mínima e ajustável. A completude é uma régua sob o título (`.qualidade-bar`)
  com os campos mais vazios e o botão que recorta a lista só ao que falta
  preencher — não um quinto KPI. Iniciativas não virou tabela (a tela tem
  teste próprio): as linhas adensaram, quatro **visões salvas** (Minhas, Em
  risco, Sem dono, Este trimestre), `/` foca a busca, os selects dobram atrás
  de "Filtros", cada linha tem o stepper de marcos e a prioridade é `6,5 /10`
  sem pill — prioridade não é severidade. Tarefas tem quatro KPIs. Em Pessoas
  a linha inteira abre a ficha.
- **Tabela vira cartão a ≤760px, nas duas abas** (`RiskCardList`,
  `TarefaCardList`, ambas em `.risk-card`). Os dois ficam no DOM e o `@media`
  decide — montar por largura em JS quebraria o modo salvo. O `EmptyState` fica
  FORA do envelope da tabela, senão some junto com ela.
- **Tabela leve (`.tabela-simples`, `.marcos-tabela`) empilha** com
  `data-rotulo` + `::before`, o mesmo idioma de `.rastro-linha`. Não inventar um
  segundo padrão de tabela empilhada.
- **Chrome acima do conteúdo é o inimigo:** faixa de KPI deita (rótulo e número
  na mesma linha, via `:has()` — só o tile sem barra/subtítulo), filtros
  secundários se dobram atrás de "Filtros" (`common/FiltrosDobraveis`, com selo
  de quantos recortes estão ativos), subtítulo de página corta em 2 linhas. Sem
  isso o primeiro cartão da aba Tarefas nascia a 850px.
- **Iniciativas é lista → detalhe** a ≤760px. A escolha automática da primeira
  iniciativa é gated por `matchMedia`: sem isso o botão "‹ Todas" vira no-op,
  porque zerar a seleção redispara o efeito.
- `viewport-fit=cover` no `index.html` e `env(safe-area-inset-*)` em tudo que é
  fixo na base (barra, rodapé de modal, folhas, snackbar).

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
- O **Sankey da cadeia** (`PainelTab/SankeyCadeia.tsx`) é SVG inline sem lib.
  A altura de cada coluna cresce com a **raiz quadrada** do total — três
  objetivos e sessenta tarefas na mesma tela é a forma normal do domínio, e em
  escala linear os objetivos viravam um fio de 10px; as partes dentro de uma
  coluna continuam proporcionais e todo número está escrito. Abaixo de 760px
  o desenho some e a fileira de elos (`.cadeia`) volta, por CSS — os dois ficam
  no DOM. Na Priorização, as seis primeiras bolhas levam o nome escrito
  embaixo (com supressão da que cairia sobre outro rótulo), hover cruzado com
  a lista, rótulos de quadrante no canto em `--ink-3`, eixos com 1 e 5.

## Idioma
Toda a UI e cópia em **português (Brasil)**.

## Ao fazer alterações
- Mudanças pequenas: alterar só o que foi pedido; não redesenhar o que não foi solicitado.
- Manter os cálculos de `score`/`prioriz` e as faixas de cor idênticos, salvo instrução explícita.

