# CLAUDE.md — Gestão da Matriz de Risco

Instruções persistentes para implementar e evoluir este projeto.

## O que é
App web de página única para **direção e execução**, organizado pela cadeia
**objetivo → iniciativa → risco → tarefa**. Nove destinos no trilho: oito em
três grupos — Direção (Painel, Objetivos, Iniciativas, Priorização), Risco
(Riscos) e Execução (Tarefas, Pessoas, Anotações) — mais a Triagem temporária
da migração.

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
- **Anotações (páginas em blocos):** `notas` é entidade da fábrica, servida por
  `/api/portfolio/notas` com versão e 409, mas fica **fora** do
  `PortfolioBundle` — texto longo não vai no polling de 15s. Mora em
  `api/_notasDb.ts`; a regra entra em `validarNota`, chamada por
  `validarEntidade`. `conteudo` é o JSON do editor serializado; busca e trecho
  derivam dele, sem coluna paralela. Imagem colada é nó do documento com `src`
  **relativo à própria página** (`/api/notas/:id/imagens/:imagemId`, regra pura
  em `src/lib/notaImagens.ts`): nunca `data:`, `blob:`, URL de fora ou de outra
  página — o servidor recusa. Os bytes ficam em `nota_imagens` (cascade com a
  página), entram por `POST` e saem por `GET` com cache imutável e `nosniff`
  (`api/_notaImagensRoute.ts`), como os anexos. Não há DELETE: remover o bloco é
  edição desfazível, então a imagem só sai pela varredura (`varrerImagensOrfas`,
  a cada gravação com `conteudo`) depois de **24 h fora do documento** —
  contadas de quando saiu (`orfa_desde`), nunca do upload, senão a imagem
  colada anteontem morre na mesma gravação que a removeu e o Ctrl+Z volta vazio. Documento
  vazio ou ilegível nunca varre. A validação de formato e teto é uma só
  (`validarImagem`), com a lista de cada lado: notas sem AVIF. O cliente reduz
  com o mesmo `prepareAttachment` dos anexos, mas a 2400px e WebP 0,9 (letra
  miúda de print).
- **Aba Anotações:** `useNotas` mora no `App`, como `useTasks` (gravação
  pendente não morre quando a aba desmonta), e fica **fora** do relógio de
  15s: relê ao entrar na aba e quando a janela volta ao foco. O editor é
  documento, não formulário — **salvamento automático**: `onChange` no máximo a
  cada 300 ms, gravação ~600 ms depois, em série por página. O editor
  (`key={nota.id}`) lê `nota.conteudo` só ao montar e no "Carregar a dela";
  **nunca se recarrega sozinho** com a versão do servidor, senão um 409 apagaria
  o texto de quem digita. O 409 vira a faixa "Outra pessoa editou esta página"
  (Manter a minha / Carregar a dela). Texto recusado (409, 404, 400) sai da fila
  mas fica em `naoSalvas`, no `App` — inclusive o de página já fechada —, e o
  guard de saída e o `beforeunload` perguntam antes de perdê-lo. 4xx definitivo
  (fora 408/409/429) não é reenviado: a tela mostra a mensagem do servidor, e o
  404 oferece "Recriar com o meu texto". O cache das notas guarda **só o que o
  servidor confirmou** (`confirmedCache`). Link direto para página que a tela
  ainda não leu relê a lista uma vez antes de dizer "Esta página não existe
  mais". Lista e página lado a lado só a partir de 961px (`DUAS_COLUNAS`, o
  mesmo corte de `notas.css`): abaixo disso a coluna de texto ficava com ~33
  caracteres por linha, e vale lista → página com "‹ Páginas". O título é um
  `<textarea>` que cresce e nunca corta.
- **Página aberta é `PaginaNota`, e pode haver duas.** A aba decide QUAL
  página abre (URL, conferência do link, escolha automática); `PaginaNota`
  cuida do resto — texto local, conflito, texto retido, guards de saída,
  Fixar/Excluir/Recriar. Com as duas colunas (`DUAS_COLUNAS`), "Abrir abaixo"
  na lista divide a tela: `notaAbaixo` na URL, cada metade com meia altura e
  corpo que rola sozinho, o de baixo com o × de fechar. **Uma página nunca
  troca de metade nem aparece nas duas** — o texto local mora na instância, e
  dois editores na mesma página disputariam o texto; a escolha automática e a
  vizinha de quem foi excluída pulam a de baixo. Guards recebem o **destino**
  (`canNavigate(destino)`): a página que a navegação deixa na mesma metade
  não pergunta (`ficaNaTela`), inclusive o envio de imagem do editor; sem
  destino, todo guard pergunta como antes. Abaixo de 961px a tela mostra uma
  página só, mas a de baixo continua **montada e escondida pelo CSS**:
  estreitar a janela não passa pelos guards, e desmontar levaria junto um
  texto retido.
- **Zoom de leitura** (`lib/zoomNota.ts`): A− · 100% · A+ no cabeçalho, cinco
  degraus, preferência do navegador de quem lê (nunca da página). Só o texto
  do documento escala (`--nota-zoom` por `data-zoom`); margens, alça e barras
  ficam no tamanho da interface.
- **Editor das Anotações:** TipTap **3.31.4 exato em todo `@tiptap/*`** — um
  só `@tiptap/core` no `npm ls`; versão solta duplica o núcleo. A alça "+ ⋮⋮"
  é própria (`AlcaBloco`, `moverBloco.ts`) porque o drag-handle oficial puxa
  `yjs`. Os blocos do menu "/" são uma lista só, `src/lib/blocosNota.ts`, que a
  barra de formato do toque também lê. Quem formata é a bolha sobre a seleção
  (`BolhaFormato`) ou, na faixa de toque (`FAIXA_TOQUE`, a mesma do bloco de
  `tokens.css`), a barra acima do teclado (`BarraFormatoMovel`) — nunca as
  duas. A barra segue o `visualViewport` e, enquanto aparece, tira a
  `.nav-bottom` por `:has()`, empurra o snackbar para cima dela
  (`--nota-formato-topo`) e limita o menu "/" (`janelaVisivel`); é o único
  lugar que muda as margens de rolagem do ProseMirror. Sub-item de lista é o
  Tab/Shift+Tab do próprio TipTap; o teclado do celular não tem Tab, então a
  barra mostra "Transformar em sub-item" e "Voltar um nível" só com o cursor
  numa lista. O nível se lê pelo marcador (1 → a → i; • → ◦ → ▪), em
  `notas-editor.css`. O que vira `<a href>` é
  `src/lib/links.ts` (só http(s) e mailto), lido pelo editor e pela bolha.
  Imagens: o item acima. Remover o bloco de imagem **não** pede confirmação — é
  a exceção a `useConfirmacao`, porque o Ctrl+Z o traz de volta (é para isso
  que a varredura espera 24 h).
- **Portfólio (objetivo → iniciativa → marco):** seis entidades (`pessoas`, `objetivos`, `medicoes`, `iniciativas`, `marcos`, `acoes_risco`) sobre a fábrica genérica `api/_table.ts`, atendidas por `api/_portfolioRoute.ts` através do roteador único. Não recriar uma entrada de função por profundidade: os antigos PATCH/DELETE que falhavam na borda agora mantêm a URL pública via rewrite, sem catch-all de arquivos. O front lê o pacote por `GET /api/portfolio` e `usePortfolio`; as métricas são funções puras em `src/lib/portfolioMetrics.ts`. Regra de integridade nova entra em **`validarEntidade`** (`api/_portfolioDb.ts`), compartilhada pelos dois ambientes.
- **Marco tem três campos de texto, e eles não se substituem:**
  `criterio_aceite` (como se verifica a entrega), `motivo_replanejamento` (por
  que a data mudou — o servidor **exige** ao mover `data_plano_atual` de uma
  data já gravada) e `obs`, nota livre para o contexto que não cabe nos dois.
  `obs` fica fora de `CAMPOS_AUDITADOS` de propósito: a trilha guarda o que
  alguém pode ser cobrado depois, não observação que só um humano lê.
- **Medição de objetivo:** `medicoes` é uma linha por leitura do indicador, nunca um campo `valor_atual` — sobrescrever o valor apaga a tendência, que é o que interessa. `progressoObjetivo` deriva atual, % do caminho e tendência; a direção da melhora sai dos próprios números (meta menor que baseline = descer é melhorar), sem campo de "quanto menor melhor".
- **Aba Objetivos (reformulada 09/2026):** a lista É o gráfico — uma linha por
  objetivo com indicador (hoje → meta), impacto (entregue + em jogo, numa
  escala COMPARTILHADA entre as linhas), riscos neutralizados e tendência;
  abre recolhida e o detalhe (`ObjetivoDetalhe`) responde três perguntas: o
  número andou, quanto as entregas renderam, o que ainda ameaça. Linhas e
  totais saem de `objetivosUi.ts` sobre `impactoDoObjetivo`,
  `ameacasDoObjetivo` e `ameacasSomadas` (`portfolioMetrics.ts`) — o
  componente não recalcula régua. **Neutralizado = só mitigado confirmado**
  (`situacao = 'mitigado'`); tratamento concluído e não fechado ainda conta
  como em tratamento. "Sem tratamento" fica em zero por construção: o risco só
  chega ao objetivo por uma ação viva, que já é tratamento.
  **Ordem manual** é a coluna `position` que `objetivos` já tinha
  (`ordenavel`), gravada inteira por `POST /api/portfolio/reordenar-objetivos`
  (`api/_ordem.ts`): exige o conjunto completo (senão 409), roda numa transação
  e NÃO mexe em `version` nem `updated_at` — reordenar não é editar e não pode
  derrubar quem está com o modal aberto. Impacto, Progresso e Prazo só mudam a
  vista (`ordemObjetivos.ts`); reordenar só em Manual, pela alça (arraste com
  `@dnd-kit/core` ou setas) ou pelo modo Reordenar com ↑ ↓, que é o caminho no
  celular. A tela manda uma gravação por vez e só a última ordem pendente.
  Balde da migração sempre por último e fora da ordem. Abertos e critério
  moram em `useSessionState`.
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
  descrição, no Painel, no Registro, na Análise, no Rastro e nas lacunas de risco
  de `cadeiaQuebrada` (o Rastro listava as 62 linhas e dizia "38 sem tratamento"
  onde as outras diziam 20). "Criticidade crítica" é o score (P × I) acima de 14,
  na tabela e na Análise — a priorização é outra pergunta. Linha em branco é como se adiciona uma, não é risco — e
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

### Identidade Pague Menos (redesign de 10/2026)
A tese: o app é um **registro de governança** — guarda decisões, cobra donos e
mede promessa contra entrega — com a linguagem visual do sistema Pague Menos:
**azul é estrutura, coral é alerta**, Montserrat, cantos arredondados como o
símbolo da marca, cartão com sombra curta, composição plana e **títulos que
afirmam o achado** ("21 elos soltos travam a cadeia"). A fonte de design é o
canvas "Gestão de Riscos — redesenho" (Claude Design) e o design system
"Pague Menos"; o app **não usa o logo da Pague Menos** — o glifo é a rede de
decisão própria do produto. Consequências, todas em `tokens.css`:

- **Claro é o padrão** (`#0000BE` rende 12,0:1 sobre o papel e 1,6:1 sobre navy).
  O padrão é declarado no CSS (`:root { color-scheme: light }`), não no JS, para
  o primeiro frame já pintar claro. Os **três** estados do tema são marcados no
  `<html>` (`data-theme="light|dark|system"`), 'system' inclusive — regra presa
  a `[data-theme='dark']` fica muda para quem segue um sistema escuro, então
  refinamento de tema vira token `light-dark()`, nunca seletor de atributo.
  Neutros **azulados** (página `#F6F7FB`, cartão branco); o escuro é o **navy**
  do sistema (palco `#070A1F`, cartão `#10163A`). O chrome fixo — header, rail,
  barra inferior — é opaco, **sem vidro** (nada de `backdrop-filter`).
- **Dois azuis:** `--brand` preenche controle (botão, aba ativa, seleção;
  `#0000BE` no claro, `#5250F5` no escuro, texto branco por cima) e
  `--brand-text` é o azul COMO TEXTO (título, link, número neutro; `#0000BE` /
  `#A5A8FF`). `--brand-core` (`#0000BE` fixo) é o bloco de estrutura: rail,
  cabeçalho de tabela, faixa de insight. Nunca `--brand` como cor de texto no
  escuro.
- **Cor é semáforo, nunca decoração.** Azul é estrutura: navegação, link,
  foco, estado ativo, rail, cabeçalho de tabela. **Coral (`--brand-red`) só onde
  significa ameaça, atraso, perda ou elo partido** — o nó de risco do glifo,
  `.rastro-risco`, a série "evitar perda", o toco no Sankey. Nunca como
  destaque; se nada está em alerta, a tela não tem coral. A **camada de risco da
  cadeia é roxa** (`--camada-risco`), justamente para o toco coral do Sankey não
  se confundir com ela. Texto de ameaça usa `--coral-texto` (`#C80027`, ≥5:1);
  `#FF2342` reprova AA abaixo de 18px e fica para preenchimento, ícone e cifra
  grande. Verde só onde algo foi concluído ou está dentro do limite.
- **Etiqueta tem quatro papéis, não sete cores:** `BadgeKind = 'neutro' |
  'atencao' | 'ok' | 'risco'`. Só três recebem croma; `neutro` é texto sobre
  hairline. Categoria (origem, vetor, resposta padrão, status inicial, situação
  do risco) é neutra; croma é para estado. A tinta dos três com cor
  vem dos degraus `-texto` do sistema (`--badge-atencao/-ok/-risco`, ≥4,5:1
  sobre o próprio fundo tingido); os degraus de criticidade (`--tier-*`) passam
  3:1 e servem à marca gráfica, não ao texto. "Mitigar" nem vira etiqueta — repetia o mesmo pill
  tela abaixo; só a exceção (evitar, aceitar, transferir) é etiqueta
  (`RegistroTab/Resposta.tsx`). As quatro camadas da cadeia têm família
  própria, `--camada-objetivo/-iniciativa/-risco/-trabalho`, usada pela lista
  de lacunas e pelo Sankey.
- **Raio diz o papel:** `--r-control` e `--r-card` (14px) em botão, campo e
  cartão; `--r-row` (0) em linha de tabela; `--r-float` (22px) no que flutua —
  modal, gaveta, popover, folha, snackbar; chips e pílulas usam `--r-full`.
- **Toda cifra sai com algarismos tabulares** (`font-variant-numeric:
  tabular-nums`) por uma regra só em `base.css` (score, GUT, prazo, percentual,
  valor, contagem, o número grande do KPI e o do centro do donut), na mesma
  família do texto: não há mais fonte mono. A lista é de CLASSE DE CIFRA, não de
  tudo que tem dígito: `.lista-nota` às vezes é prosa, `.acao-prazo` é o
  contêiner de um campo de data, `.marco-num` são glifos. Texto de tabela é 14px.
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
  mitigação e medição, e para juntar fichas e declarar atingido. Também vale
  para descartar rascunho, recarregar a versão do servidor, remover anexo de
  imagem da tarefa, excluir marco e desvincular ação: `window.confirm` não
  existe mais no app (só o `beforeunload` do navegador, que não é
  substituível). Única exceção, sem diálogo nenhum: o bloco de imagem da nota,
  que o Ctrl+Z desfaz.
- **Shell:** o rail azul (`--rail-bg`) vai de ponta a ponta e leva a marca
  (`common/Marca.tsx`) no topo; o header é só da direita (migalha `Grupo ·
  Seção`, busca "Buscar ou ir para…", sync, tema, autor) e **não navega** — a
  fita de abas saiu: com nove destinos ela não cabia. A marca volta ao header
  só ≤760px, onde o rail sai. Entre 761 e 900px o chip de autor vira o círculo
  das iniciais (nome no `title` e no nome acessível): a folha "Mais", onde ele
  mora no celular, não existe nessa faixa. As regras de cor do rail são
  escopadas em `.nav-rail` porque a folha "Mais" reusa `.rail-item` e continua
  clara. **Tema é `SeletorTema`** — três segmentos escritos (Claro, Escuro,
  Sistema), nunca um botão que cicla.
- **Faixa de KPI = cartões separados**, barra lateral de 6px na cor do estado,
  valor → rótulo → apoio → `status`. `<Kpi status={{ rotulo, kind }}>` escreve
  o juízo em pílula ("Fora do prazo"): a barra colorida sozinha não diz nada.
- **Faixa de insight** (`common/Insight.tsx`, `.insight`): uma frase calculada
  que fecha o visual dominante da tela — o que fazer primeiro, com o número. No
  Painel fecha o Sankey; na Priorização, a matriz ("N iniciativas de alto
  impacto e baixo esforço lideram a fila. Comece por X, com prioridade 8,00").
  Uma por tela, no máximo; texto fixo nunca. O quadrante de alto impacto e
  baixo esforço continua se chamando **Ganho rápido** (não "Fazer agora") e é o
  único em azul na matriz.
- **Juízo do KPI é um só:** `julgar(kind, rotulo)` (`lib/portfolioUi.ts`) devolve
  acento + etiqueta escrita e vale para Painel, Objetivos e Iniciativas. O tile
  que carrega `status` não deita no celular (a pílula cortava).
- **Cabeçalho de tabela é azul** (`--brand-core` + `--ink-on-brand-core`) em
  TODA tabela: a base de `<table>` mora em `table.css` (vale para a tabela sem
  classe própria) e as tabelas com classe (`.risk-table`, `.desc-table`,
  `.tabela-simples`, `.marcos-tabela`) só ajustam o que lhes é próprio. Na tabela
  de riscos a coluna "Riscos" mantém o acento, em `--coral-claro` sobre o azul.
  Lista em grid de `div` (Objetivos, Rastro) leva o cabeçalho azul por regra
  própria; a lista de Iniciativas fica com cabeçalho claro por grupo (repetir
  faixa azul a cada grupo pesa mais que informa).
- **Título das seis telas do Lote D** (Riscos ×3, Tarefas, Pessoas, Triagem)
  afirma o achado: "20 riscos sem tratamento, 8 deles críticos", "4 tarefas
  atrasadas, 55 sem dono", "Paulo Mendes está 75% acima da capacidade", "5 itens
  do plano antigo esperam destino". Cada um sai de uma regra que já existe
  (`riscosSemTratamento`, `saudeTrabalho`, `cargaPorPessoa`, a fila da Triagem) —
  o título e o KPI nunca contam a mesma coisa por duas contas.
- **Triagem usa `.page-bar` e `<KpiRow>`** como as outras abas; os KPIs continuam
  clicando para filtrar (`.kpi-strip button.kpi-card`, em `triagem.css`).
- **Visões salvas de Iniciativas** mostram a contagem (`Em risco 5`); filtro e
  contagem usam a MESMA regra (`naVisao`).
- **Paleta de comando** (`common/PaletaComando.tsx`, Ctrl/⌘+K): o listener mora
  no `App`, indexa os destinos de `NavRail/secoes.tsx`, os registros das
  camadas e as páginas de Anotações (tipo "Página", para a nota "Triagem" não
  se confundir com a aba), e **não abre enquanto há outro `[role="dialog"]`** —
  o foco preso do modal brigaria com ela. `/` foca a busca da aba Iniciativas.
- **Modal é diálogo centralizado, não gaveta.** `modal.css` é a única dona:
  `.modal-card` 640px (`data-largo` 960px, `.modal-card--editor` 1040px para risco
  e tarefa, `data-compact` 440px na confirmação), `--r-float`, `--elev-3`, scrim de
  uma cor só nos dois temas (`--bg-overlay`, sem blur — sem vidro). Abaixo de
  760px vira folha inferior (`responsive.css`: 94dvh, raio só no topo, safe-area
  no rodapé). A animação de entrada usa `fill-mode: backwards`, nunca `both`: um
  `transform` residual no cartão o torna o bloco recipiente de todo `position:
  fixed` de dentro. Foi assim que o visualizador de imagem passou a cobrir só o
  modal; hoje ele sai por `createPortal` no `<body>`, como os três modais. As
  abas do risco (`.detail-tabs`) são sublinhado azul e seguem `aria-pressed`
  (o teste consulta `button`). O rodapé é `--bg-sunken` com `border-top`.
- **Paleta e folha "Mais":** a paleta (680px, centralizada) marca o item ativo com
  `--brand-soft` e barra inset azul, e leva o quadradinho da camada da cadeia
  (`data-camada`); o foco é o item destacado (`aria-activedescendant`), então o
  campo não repete o anel. A folha "Mais" é `role="dialog"` com alvos de 48px.
- **Estado vazio** é um cartão (`--elev-1`) com glifo, `contexto` opcional em caixa
  alta, título 18px/800 e a explicação; dentro de um `.card` ele é achatado, sem
  segundo cartão. O título é curto ("Nenhuma tarefa com esses filtros") e o "por
  quê + o que fazer" vai no `hint`.
- **Não existe mais `redesign.css`.** A identidade nova foi fundida nas folhas
  donas (tokens, base, primitives, layout, rail, table, kanban, charts, modal,
  portfolio, triagem, responsive); **não recriar uma camada final** sobre elas.
  Exceção conhecida de hex fora de `tokens.css`: a seta do `<select>`
  (`modal.css`) e a lupa do `.search-input` (`primitives.css`) são SVG em data-URI
  e não trocam com o tema.
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
- **Elevação:** cartão em repouso leva borda de hairline mais `--elev-1` (sombra
  curta do sistema); `--elev-2` popover e menu · `--elev-3` modal ·
  `--elev-insight` só na faixa de insight. Sem cartão dentro de cartão e sem
  degradê em tela de trabalho.
- Marca no azul oficial (`#0000BE` no claro); conteúdo limitado a `--container`
  (1600px). O glifo da marca é a rede de decisão própria do produto, com o nó
  de risco em coral — não o logo da Pague Menos, e o wordmark nunca é recriado
  em fonte.
- Coluna "Riscos": acento no rótulo do header e faixa vertical de 2px — não mais
  fundo rosa em toda célula.
- Tipografia: **Montserrat Variable** (eixo de peso, `@fontsource-variable/montserrat/wght.css`)
  para interface, prosa e cifra, auto-hospedada. Sem serif e sem eixo óptico.
  A família fica no `<html>`, não só no `<body>`: sem isso o elemento-raiz caía
  em serif de sistema. Título de página 800, rótulo em caixa alta 700 com
  tracking `--tracking-rotulo`. Montserrat é ~10% mais larga que a Plex que
  substituiu: confira tabela densa a 1280px antes de apertar coluna.
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
  é sempre `.page-bar` + `.page-title`, e toda aba tem um. O título **afirma o
  achado com número**, calculado dos dados (`cadeiaQuebrada`, `saudeObjetivos`…),
  com texto fixo de reserva no estado vazio.
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
  trocar de destino ou sair da página, e devolve `[fechar, dialogo]` — a tela
  renderiza o `dialogo`. O guard de navegação é **assíncrono**: `canNavigate()`
  devolve Promise e para no primeiro "não"; `useAppNavigation` restaura o hash
  na hora no Voltar e só o reaplica se o usuário confirmar e nada mais navegou
  no meio. `irPara` é `async`. Não salvar implicitamente ao fechar.
- **Enquanto uma navegação guardada espera, o destino pedido tem a vez.** Quem
  navega depois dos guards chama `perguntar()` (o `canNavigate` que conta como
  espera), nunca `canNavigate()` direto. Correção automática da URL é
  `navigate(..., true)` e é **descartada** durante a espera (devolve `false`);
  sem isso a escolha automática da primeira página trocava o hash no meio do
  diálogo e o Voltar sumia calado. Navegação explícita mais nova ainda ganha.
- `useSessionState` preserva busca, filtros e ordenação das listas principais
  na sessão. Os atalhos do Painel levam os IDs da lacuna ao destino e oferecem
  limpeza explícita do recorte.
- Vínculo risco–iniciativa sempre passa pela ação. O seletor busca nome e
  objetivo, exclui novos vínculos com iniciativas encerradas e permite ler
  vínculos históricos. Ações canceladas não contam como cobertura ativa.
- O modal do risco separa Resumo, Tratamento e Histórico. Prioridade e retorno
  da iniciativa ficam em seção recolhível. Os campos e fórmulas continuam os mesmos.

### Mobile
- **Três faixas de navegação, uma lista de destinos.** `NavRail/secoes.tsx` é a
  fonte única (ícones, grupos, ordem), lida pelo `NavRail`, pela `NavBottom` e
  pela paleta: rail pela preferência gravada (≥1101px), rail **recolhido à
  força** e sem o botão "Recolher" (761–1100, `FAIXA_RECOLHIDA`, nome no
  `title` e no `aria-label`) e barra inferior (≤760). As regras de visibilidade
  ficam juntas no fim de `styles/rail.css` — separadas, duas formas aparecem ao
  mesmo tempo numa faixa que ninguém olhou. A barra inferior tem 4 destinos
  fixos (um por camada da cadeia) + "Mais", que abre a folha com os grupos
  inteiros, o chip de autor e o botão de tema. Tema e autor moram no `App`,
  como `useTasks`: dois `useState` dariam duas verdades sobre o mesmo tema.
- **A adaptação a toque é um bloco só** — `@media (pointer: coarse) and
  (max-width: 1100px)` em `tokens.css`, que troca três valores. Todo controle já
  lê o token, então não existe (e não deve nascer) regra de toque por
  componente. A única coisa que muda de COMPORTAMENTO na mesma faixa é a
  bolha de formato das Anotações, que cede à barra acima do teclado
  (`FAIXA_TOQUE`, a mesma consulta). `--tap-min` é PISO, não tamanho: botão de
  ícone declara `max(<repouso>, var(--tap-min))`, e no desktop o piso é zero.
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
  porque zerar a seleção redispara o efeito. Anotações também ("‹ Páginas"),
  mas a ≤960px (`DUAS_COLUNAS`; o porquê está em "Aba Anotações").
- `viewport-fit=cover` no `index.html` e `env(safe-area-inset-*)` em tudo que é
  fixo na base (barra, barra de formato das Anotações, rodapé de modal, folhas,
  snackbar).

### Data viz (regras do skill `dataviz`)
- Vão de 2px de superfície (`--viz-gap`) entre preenchimentos adjacentes: células
  do heatmap, segmentos empilhados, arcos do donut (`src/lib/donut.ts`).
- Marcas finas (barra de 8px, anel de donut de 14px); eixos e grade recessivos.
- Anel de superfície de 2px em marca que se sobrepõe (bolhas da matriz).
- Legenda sempre presente; **identidade nunca por cor sozinha** — toda cor de
  tier aparece junto do número ou do rótulo. Isso não é decoração: a escada
  semáforo verde→amarelo→laranja→vermelho não passa nos limites de daltonismo
  por matiz (médio `#B8901F` × alto `#D97706` medem ΔE 1.1 em deuteranopia).
- Célula vazia do heatmap mostra o `0`, não texto transparente. A célula cheia é
  TINGIDA (24% da faixa) com contorno inset da faixa, o número a 18px e a
  pontuação P × I escrita embaixo: a faixa nunca viaja só por cor.
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

