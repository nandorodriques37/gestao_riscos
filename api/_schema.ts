// A sequência completa de criação do esquema, num lugar só.
//
// A ordem não é preferência, é dependência, e ela já se espalhou por três
// arquivos que precisavam concordar de cor: a rota de produção, o plugin de
// desenvolvimento e cada arquivo de teste. É o mesmo erro que o CLAUDE.md
// registra sobre `validarEntidade` — cadeia própria em cada lado faz uma regra
// valer só em metade dos ambientes. Aqui isso significaria um teste verde sobre
// um esquema que a produção não tem.
//
// Quem só precisa de parte (a rota de tarefas, por exemplo) continua chamando
// o `ensure` da sua própria camada; o que não pode existir é uma SEGUNDA versão
// da sequência inteira.
import { ensureSchema, type Sql, type OpcoesSchema } from './_db.js';
import { ensureAuditoriaSchema } from './_auditoria.js';
import { ensurePortfolioSchema } from './_portfolioDb.js';
import { ensureTasksSchema } from './_tasksDb.js';
import { ensureVinculosFK, unificarTrabalho } from './_trabalhoDb.js';
import { unificarDonos } from './_donos.js';

export async function ensureTudo(sql: Sql, opts: OpcoesSchema = {}): Promise<void> {
  // 1. `risk_records` primeiro: `acoes_risco.risco_id` e `tasks.risco_id` a referenciam.
  await ensureSchema(sql, opts);
  await ensureAuditoriaSchema(sql);
  // 2. `pessoas`, `objetivos`, `medicoes`, `iniciativas`, `marcos` e a
  //    `acoes_risco` congelada, que é a origem da cópia única.
  await ensurePortfolioSchema(sql);
  // 3. `tasks`, anexos e as colunas de vínculo (sem referência ainda).
  await ensureTasksSchema(sql, opts);
  // 4. Agora que os três alvos existem, as chaves estrangeiras de `tasks`.
  await ensureVinculosFK(sql);
  // 5. E a cópia única das mitigações para `tasks`, sob marca.
  await unificarTrabalho(sql);
  // 6. Com todo o trabalho na mesma tabela, o dono também vira um só: fichas
  //    repetidas juntadas e responsável em texto convertido em pessoa.
  await unificarDonos(sql);
}
