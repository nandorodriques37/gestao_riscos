# Validação das quatro etapas de fluidez

Data: 07/09/2026. Base de implementação: `main` em
`6e2479e4e94a382a91848dabd56b6cbfece064be`.

## Escopo implementado

| Etapa | Mudança | Resultado esperado |
| --- | --- | --- |
| 1. Consistência | Transações para risco/plano e iniciativa/vínculo; idempotência; versões congeladas ao abrir o formulário; filas de escrita por registro e invalidação entre telas. | Uma falha não confirma metade da operação. Nova tentativa do mesmo pedido não duplica o cadastro. Conflito preserva o rascunho para decisão do usuário. |
| 2. Vínculos e navegação | Busca de iniciativa existente, criação contextual, vínculo pelo detalhe da iniciativa, seleção na URL, filtros de sessão e recortes do Painel. | Tratar um risco sem duplicar trabalho e retornar ao contexto de origem com o navegador. |
| 3. Formulários | Resumo/Tratamento/Histórico no risco, prioridade/retorno recolhíveis na iniciativa, confirmação de saída e estados de salvamento/erro. | Reduzir a densidade inicial e deixar explícito quando a gravação terminou ou falhou. |
| 4. Hospedagem e carregamento | Uma entrada de API e roteador compartilhado com desenvolvimento; carregamento das telas sob demanda. | Liberar margem de funções serverless e reduzir o JavaScript do carregamento inicial. |

As fórmulas, IDs, dados legados congelados, medições, marcos, anexos e a relação
`objetivo ← iniciativa ← ação ← risco` foram preservados. A ação vinculada a
um risco continua sendo uma linha em `tasks`, com projeção para `acoes_risco`.
O vínculo é feito pela ação, sem novo campo de objetivo no risco. Cancelar uma
ação retira sua contribuição da cobertura ativa, preservando a linha e o histórico.

## Verificações executadas

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | Passou para front-end e API com resolução ESM NodeNext. |
| `npm run lint` | Passou. |
| `npm run test` | 484 testes passaram em 27 arquivos. |
| `npm run build` | Passou. JavaScript principal de aproximadamente 295 KB, cerca de 89 KB gzip. |
| Empacotamento isolado com `@vercel/node` | Gerou uma Lambda `nodejs24.x`, handler `api/index.js`, com 82 arquivos rastreados, incluindo as operações transacionais e `ws`. |
| Entradas da API | Teste exige somente `api/index.ts` como entrada de função; auxiliares usam prefixo `_`. |

A verificação de empacotamento usou uma pasta temporária diferente da origem,
o entrypoint real e as dependências de execução e de tipos. O builder usou
seu TypeScript 5.9.3; a checagem normal do projeto usa o TypeScript 6 do lockfile.
Isso comprova o pacote da função, mas não a resolução dos rewrites na borda
da Vercel nem a conexão com um banco Neon publicado.

O arquivo JavaScript principal da base tinha aproximadamente 527 KB
(151 KB gzip). A divisão por telas reduz esse arquivo para cerca de 295 KB
(89 KB gzip), uma redução aproximada de 44% no arquivo minificado inicial.
Os módulos adiados ainda serão transferidos ao abrir seus destinos: esse
número não é redução do JavaScript total nem uma medição de tempo de abertura.

### Casos cobertos pelos testes novos

- Risco, plano, responsáveis criados e auditoria confirmados na mesma transação;
  falha em uma parte desfaz inclusões, alterações e exclusões da operação.
- Repetição idempotente, conflito de versão do risco/ação, iniciativa criada
  junto do vínculo e bloqueio de vínculos inválidos.
- Edição e cancelamento de mitigação pelo quadro refletidos na projeção,
  resumo do risco e histórico.
- Endereços públicos e endereço interno após rewrite, métodos HTTP, 404/405,
  caminho malformado, anexos binários, backup e guarda de restauração.
- Edições rápidas serializadas, leitura atrasada, versões antigas, falha de
  salvamento explícito, cliques duplicados e sincronização entre coleções.
- Rascunho do risco preservado após erro, mesma chave na nova tentativa,
  confirmação de descarte, vínculo existente e identificação da nova ação
  salva antes da criação de iniciativa.

## Revisão visual e de ambiente pendente

A navegação no navegador disponível para a validação local foi bloqueada
(`net::ERR_BLOCKED_BY_CLIENT`). Portanto, não há evidência visual de desktop ou
celular na validação local. A revisão de preview deve conferir a publicação
na borda da Vercel e, com uma base própria de teste, a gravação em Neon.
Os resultados remotos e a decisão de merge serão registrados no PR.

| Cenário de revisão | Critério de aceite |
| --- | --- |
| Desktop e celular, temas claro/escuro | Cabeçalho, campos, seções, seletor de iniciativa e rodapé de salvar legíveis e alcançáveis, sem sobreposição. |
| Editar risco e plano juntos | Salvar confirma ambos; cancelar descarta o rascunho; falha mantém os campos e permite tentar novamente. |
| Vincular iniciativa existente | Busca por nome/objetivo, mudança e remoção do vínculo aparecem no risco e na iniciativa. |
| Criar iniciativa a partir de uma nova ação | A ação é salva primeiro; a iniciativa nasce vinculada ao objetivo escolhido; repetição após perda da resposta não duplica a operação. |
| Vincular pelo detalhe da iniciativa | Permite aproveitar uma ação livre ou criar uma ação; a mitigação também aparece em Tarefas. |
| Voltar/Avançar e atalhos do Painel | Volta ao destino e seleção anteriores; mantém filtros de sessão; limpa o recorte com ação explícita. Não há garantia de restaurar a posição de rolagem. |
| Duas abas editando a mesma linha | Segunda gravação com versão antiga retorna conflito, sem apagar silenciosamente o rascunho. |
| Preview Vercel | GET/POST/PATCH/DELETE das entidades e rotas profundas de anexos chegam ao roteador; bytes de imagem e parâmetros de backup são preservados. |

## Esquema e reversão de código

A mudança de esquema acrescenta `operacoes_app`, sem apagar colunas ou tabelas
existentes. Antes de promover para produção, use o backup completo já existente
em `/api/portfolio/backup?anexos=1` e revise o preview. A tabela de operações é
um registro de deduplicação e não substitui o backup de negócio.

A versão anterior ignora `operacoes_app`, então reverter o código não exige
apagar a tabela nem desfazer as alterações de negócio já confirmadas. O endpoint
`/api/restore` repõe dados iniciais; não deve ser usado como rollback desta mudança.

## Recomendação sobre o Hobby

O limite documentado é de 12 funções serverless por publicação no Hobby.
As 12 entradas anteriores viram uma função; novas operações de negócio podem
ser adicionadas ao roteador sem criar outra entrada. A recomendação é manter
essa estrutura e acompanhar uso real de invocações, execução e banco. Juntar
rotas não reduz automaticamente esses consumos.

O Hobby é destinado a uso pessoal e não comercial. Para uso corporativo, a
escolha deve ser um plano/hospedagem compatível; a redução de funções resolve
um limite técnico, mas não altera as condições do plano. Não houve compra,
mudança de assinatura ou publicação em produção nesta implementação.

Fontes oficiais consultadas em 07/09/2026:

- [Vercel — runtimes e limite de funções](https://vercel.com/docs/functions/runtimes).
- [Vercel — plano Hobby e condições de uso](https://vercel.com/docs/plans/hobby).
- [Vercel — rewrites](https://vercel.com/docs/routing/rewrites).
- [Neon — driver serverless e transações](https://neon.com/docs/serverless/serverless-driver).
