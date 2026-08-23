// Dono do trabalho: uma pessoa de verdade, em toda linha.
//
// Havia duas representações. A mitigação, vinda do plano de ação, guardava
// `dono_id` — FK para `pessoas`, que é quem tem capacidade, carga e ficha. A
// tarefa livre guardava `responsavel`, texto solto. Enquanto foram duas, metade
// do trabalho ficava invisível na carga do Painel e na aba Pessoas, e o mesmo
// nome escrito de dois jeitos virava duas pessoas.
//
// Aqui moram as três coisas que consertam isso:
//
//   - `mesclarPessoas`  — junta duas fichas, repontando TODAS as FKs.
//   - `mesclarDuplicadas` — acha e junta as fichas do mesmo nome.
//   - `converterResponsaveis` — o texto livre das tarefas vira pessoa.
//
// A ordem importa: converter antes de mesclar criaria vínculo para a ficha
// errada e multiplicaria o problema em vez de resolvê-lo.
import type { Sql } from './_db.js';
import { pessoas } from './_portfolioDb.js';
import { chaveDoNome } from '../src/lib/nomes.js';
import type { Pessoa } from '../src/types.js';

const MARCA = 'donos_unificados_v1';

/** Tabelas que apontam para `pessoas`. Esquecer uma deixa órfão silencioso:
 *  as FKs são `set null`, então a exclusão não falha — o dono só some. */
const REFERENCIAM_PESSOA = ['objetivos', 'iniciativas', 'tasks'] as const;

export interface ResultadoMesclagem {
  /** Linhas que trocaram de dono, somando todas as tabelas. */
  movidas: number;
}

/**
 * Junta `origem` em `destino`: tudo que era de um passa a ser do outro, e a
 * ficha duplicada é excluída.
 *
 * Repõe as FKs ANTES de excluir. A ordem inversa não falharia — `set null`
 * aceita — e é justamente por isso que ela é perigosa: o dono sumiria em
 * silêncio de tudo que a pessoa carregava.
 *
 * Campo vazio no destino é preenchido pelo da origem: mesclar não pode perder
 * a capacidade que alguém cadastrou de um lado só.
 */
export async function mesclarPessoas(
  sql: Sql, destinoId: string, origemId: string,
): Promise<ResultadoMesclagem> {
  if (destinoId === origemId) return { movidas: 0 };

  const destino = await pessoas.byId(sql, destinoId);
  const origem = await pessoas.byId(sql, origemId);
  if (!destino || !origem) return { movidas: 0 };

  let movidas = 0;
  for (const tabela of REFERENCIAM_PESSOA) {
    const linhas = await sql(
      `update ${tabela} set dono_id = $1, updated_at = now() where dono_id = $2 returning id`,
      [destinoId, origemId],
    );
    movidas += linhas.length;
  }

  const herdado: Record<string, unknown> = {};
  if (!destino.papel && origem.papel) herdado.papel = origem.papel;
  if (!destino.area && origem.area) herdado.area = origem.area;
  if (destino.dias_projeto_mes == null && origem.dias_projeto_mes != null) {
    herdado.dias_projeto_mes = origem.dias_projeto_mes;
  }
  if (Object.keys(herdado).length > 0) {
    await pessoas.update(sql, destinoId, herdado);
  }

  await pessoas.remove(sql, origemId);
  return { movidas };
}

/**
 * Qual ficha fica. A ordem é: a que alguém curou (tem papel, área ou
 * capacidade), depois a que não está toda em maiúscula — "João Fernando" lê
 * melhor que "JOÃO FERNANDO" numa lista —, depois a mais antiga.
 */
function escolherDestino(grupo: Pessoa[]): Pessoa {
  const preenchidos = (p: Pessoa) =>
    (p.papel ? 1 : 0) + (p.area ? 1 : 0) + (p.dias_projeto_mes != null ? 1 : 0);
  const gritada = (p: Pessoa) => (p.nome === p.nome.toUpperCase() ? 1 : 0);

  return [...grupo].sort((a, b) =>
    preenchidos(b) - preenchidos(a)
    || gritada(a) - gritada(b)
    || a.updated_at.localeCompare(b.updated_at),
  )[0];
}

export interface ResultadoDuplicadas {
  gruposMesclados: number;
  fichasRemovidas: number;
  movidas: number;
  /** Nome que ficou em cada grupo — o resumo diz o que aconteceu com quem. */
  nomes: string[];
}

/**
 * Junta as fichas cujo nome é o mesmo ignorando acento e caixa.
 *
 * A regra é a mesma que o app já usava para casar responsável com pessoa
 * (`chaveDoNome`) — e é o critério que criou as duplicatas, então é o critério
 * honesto para desfazê-las. Nomes diferentes de verdade ("Hugo Braga" e "Hugo
 * Diógenes") têm chaves diferentes e não se tocam.
 */
export async function mesclarDuplicadas(sql: Sql): Promise<ResultadoDuplicadas> {
  const lista = await pessoas.list(sql);
  const grupos = new Map<string, Pessoa[]>();
  for (const p of lista) {
    const k = chaveDoNome(p.nome);
    if (!k) continue;
    grupos.set(k, [...(grupos.get(k) ?? []), p]);
  }

  const resultado: ResultadoDuplicadas = {
    gruposMesclados: 0, fichasRemovidas: 0, movidas: 0, nomes: [],
  };

  for (const grupo of grupos.values()) {
    if (grupo.length < 2) continue;
    const destino = escolherDestino(grupo);
    for (const origem of grupo) {
      if (origem.id === destino.id) continue;
      const r = await mesclarPessoas(sql, destino.id, origem.id);
      resultado.movidas += r.movidas;
      resultado.fichasRemovidas++;
    }
    resultado.gruposMesclados++;
    resultado.nomes.push(destino.nome);
  }
  return resultado;
}

export interface ResultadoConversao {
  vinculadas: number;
  pessoasCriadas: number;
  nomesCriados: string[];
}

/**
 * `tasks.responsavel` (texto) vira `tasks.dono_id` (pessoa).
 *
 * `responsavel` NÃO é apagado: fica como o registro do que estava escrito ali,
 * congelado, do mesmo jeito que `acoes_itens`. Quem lê passa a preferir o
 * `dono_id`; o texto só sobrevive como histórico.
 *
 * Só toca em linha sem dono. Uma tarefa que já aponta para uma pessoa tem
 * decisão tomada, e o texto pode ser mais velho que ela.
 */
export async function converterResponsaveis(sql: Sql): Promise<ResultadoConversao> {
  const linhas = await sql(
    "select id, responsavel from tasks where dono_id is null and trim(responsavel) <> ''",
  );
  if (linhas.length === 0) return { vinculadas: 0, pessoasCriadas: 0, nomesCriados: [] };

  const porChave = new Map(
    (await pessoas.list(sql)).map(p => [chaveDoNome(p.nome), p.id]),
  );

  const criados: string[] = [];
  let vinculadas = 0;

  for (const linha of linhas) {
    const nome = String(linha.responsavel ?? '').trim();
    const chave = chaveDoNome(nome);
    if (!chave) continue;

    let id = porChave.get(chave);
    if (!id) {
      const nova = await pessoas.create(sql, { nome, ativo: true });
      id = nova.id;
      porChave.set(chave, id);
      criados.push(nome);
    }
    await sql('update tasks set dono_id = $1 where id = $2', [id, linha.id]);
    vinculadas++;
  }

  return { vinculadas, pessoasCriadas: criados.length, nomesCriados: criados };
}

export interface ResultadoUnificacaoDonos {
  jaExecutada: boolean;
  duplicadas: ResultadoDuplicadas;
  conversao: ResultadoConversao;
}

/**
 * Mescla as fichas repetidas e converte os responsáveis em texto, uma vez só.
 *
 * Roda sob marca em `migracoes` pelo mesmo motivo da unificação do trabalho:
 * sem ela, uma ficha que o gestor separou de propósito seria mesclada de novo
 * na requisição seguinte, e um responsável que ele apagou voltaria.
 */
export async function unificarDonos(sql: Sql): Promise<ResultadoUnificacaoDonos> {
  const vazio: ResultadoUnificacaoDonos = {
    jaExecutada: true,
    duplicadas: { gruposMesclados: 0, fichasRemovidas: 0, movidas: 0, nomes: [] },
    conversao: { vinculadas: 0, pessoasCriadas: 0, nomesCriados: [] },
  };
  const marca = await sql('select 1 from migracoes where nome = $1', [MARCA]);
  if (marca.length > 0) return vazio;

  // Mesclar ANTES de converter: o contrário criaria vínculo para a ficha errada.
  const duplicadas = await mesclarDuplicadas(sql);
  const conversao = await converterResponsaveis(sql);

  await sql(
    'insert into migracoes (nome) values ($1) on conflict (nome) do nothing',
    [MARCA],
  );
  return { jaExecutada: false, duplicadas, conversao };
}
