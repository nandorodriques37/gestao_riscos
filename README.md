# Gestão da Matriz de Risco

Aplicação para acompanhar objetivos, iniciativas, riscos e execução do time.
O risco inerente é `Probabilidade × Impacto`; a priorização do risco permanece
`Impacto / Esforço + Gravidade`. Os vínculos com objetivos são derivados das
ações: `objetivo ← iniciativa ← ação ← risco`.

## Funcionalidades

| Destino | O que permite fazer |
| --- | --- |
| Painel | Acompanhar saúde da cadeia, lacunas, atrasos e capacidade; abrir a lista dos itens que precisam de atenção e baixar backup. |
| Objetivos | Cadastrar indicador, baseline e meta; registrar medições ao longo do tempo; acompanhar progresso e iniciativas relacionadas. |
| Iniciativas | Organizar o portfólio por objetivo, responsável e situação; acompanhar marcos, prazos, replanejamentos, benefícios e riscos cobertos. |
| Priorização | Comparar iniciativas e riscos por esforço, impacto, gravidade e retorno, conforme o modo selecionado. |
| Riscos | Cadastrar, filtrar e exportar registros; avaliar criticidade; editar o plano de tratamento; consultar histórico e indicadores no modo Análise. |
| Tarefas | Gerir tarefas livres e mitigações na mesma lista ou quadro; acompanhar situação, responsável, prazo, GUT e anexos de imagem. |
| Pessoas | Gerir responsáveis, capacidade e situação ativa/inativa; mesclar cadastros duplicados. |
| Triagem | Converter e classificar planos legados durante a migração; aparece enquanto há itens pendentes. |

A navegação se adapta a desktop, tablet e celular. O tema claro/escuro e a
identificação de autor já fazem parte do app. O autor identifica a auditoria;
não é autenticação.

## Edição e vínculos

- Os formulários mantêm um rascunho até **Salvar** ou **Salvar e fechar**.
  Uma falha mantém o conteúdo para correção ou nova tentativa. Sair com
  alterações pede confirmação.
- Risco e plano de tratamento são gravados juntos em uma transação. A versão
  lida ao abrir o formulário impede sobrescrever alterações concorrentes.
- No plano de tratamento é possível buscar e vincular uma iniciativa existente
  ou criar uma iniciativa já ligada à ação e a um objetivo. Na iniciativa,
  **Vincular risco** permite selecionar uma ação existente ou criar uma ação.
- Uma mitigação é a mesma linha de `tasks` exibida no quadro. A ligação com
  uma iniciativa não cria uma segunda tarefa. Ações canceladas não contam
  como cobertura ativa.
- Links mantêm o item selecionado na URL. Busca, filtros e ordenação das listas
  principais permanecem na sessão; os atalhos do Painel abrem o recorte da
  lacuna correspondente.
- Edições rápidas das tabelas continuam usando debounce, com fila por registro.
  Leituras atrasadas não substituem versões mais novas. O app sincroniza as
  diferentes telas após gravações e ao voltar à aba.

## Stack e API

React, TypeScript e Vite no front-end; Postgres (Neon) em produção e PGlite no
ambiente local. As telas são carregadas sob demanda. O cache local serve para
exibição e recuperação de leituras; não confirma que uma gravação chegou ao
servidor.

A Vercel empacota **uma função**, `api/index.ts`. O rewrite em `vercel.json`
encaminha os caminhos públicos para `api/_router.ts`, também usado pelo
servidor de desenvolvimento. Os módulos `api/_*.ts` são auxiliares.

| Caminho | Uso |
| --- | --- |
| `/api/records` e `/api/records/:id` | Listar, criar, atualizar e excluir riscos. |
| `/api/tasks` e `/api/tasks/:id` | Listar, criar, atualizar e excluir trabalho. |
| `/api/tasks/:id/anexos` e `/api/tasks/:id/anexos/:anexoId` | Incluir, obter e excluir imagens; a listagem de tarefas traz somente metadados. |
| `/api/portfolio` | Ler pessoas, objetivos, medições, iniciativas, marcos e ações. |
| `/api/portfolio/:entidade` e `/api/portfolio/:entidade/:id` | CRUD das entidades, com validação e controle de versão. |
| `POST /api/portfolio/salvar-risco` | Salvar risco e plano de ação em uma transação idempotente. |
| `POST /api/portfolio/criar-iniciativa` | Criar iniciativa e vincular a ação na mesma transação. |
| `/api/portfolio/auditoria` e `/api/portfolio/backup?anexos=1` | Consultar auditoria e exportar backup com anexos. |
| `/api/portfolio/migrar-acoes`, `/promover-triagem` e `/mesclar-pessoas` | Operações de migração e organização de responsáveis, todas sob `/api/portfolio`. |
| `GET /api/health` | Verificar a disponibilidade da API e do banco. |
| `POST /api/restore` | Repor a matriz inicial; exige confirmação adicional quando existem mitigações. Não é importação de backup. |

A sequência de esquema está em `api/_schema.ts`. A tabela `operacoes_app`
guarda a chave, assinatura e resultado das operações idempotentes, dentro da
mesma transação das alterações. Em Neon, essas transações usam uma conexão
WebSocket com `Pool`; as consultas simples continuam pelo executor HTTP.

**Acesso:** a API atual não tem autenticação. A identificação de autor e o
controle de versão não restringem quem pode consultar ou editar os dados.

## Rodando e verificando localmente

```bash
npm ci
npm run dev
```

O desenvolvimento usa PGlite em `.pglite-dev/`, com dados de exemplo, sem
precisar configurar um banco externo. Essa pasta é ignorada pelo Git.

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

O front-end compilado fica em `dist/`. A API é empacotada separadamente pela
Vercel. A CI executa os quatro comandos de verificação.

## Publicação e plano Hobby

Configure `DATABASE_URL` para a base Neon do ambiente correspondente. O
esquema é criado de forma aditiva nas chamadas à API. Em produção os dados
iniciais só são inseridos se `SEED_ON_EMPTY=1`; deixe a variável vazia no uso
normal. Veja `.env.example`.

A consolidação da API reduz as 12 entradas anteriores para uma e libera
margem no [limite de funções do Hobby](https://vercel.com/docs/functions/runtimes).
Esse limite é de funções serverless por publicação, não de funcionalidades do
produto. Uma função pode atender vários caminhos e métodos.

O [Hobby é destinado a uso pessoal e não comercial](https://vercel.com/docs/plans/hobby).
Para operação corporativa, avalie um plano compatível, como o Pro, ou outra
hospedagem adequada. Consolidar rotas não altera essa condição nem elimina
cotas de execução, tráfego ou consumo do banco. Nenhum plano é alterado pelo código.

## Referências do projeto

- [Validação das quatro etapas e roteiro de revisão](docs/validacao-fluidez.md).
- `CLAUDE.md`: regras de negócio, arquitetura e convenções de design.
- `design_handoff_matriz_risco/`: referência visual e de domínio.
- `HISTORICO.md`: evolução do projeto e motivos das decisões.
