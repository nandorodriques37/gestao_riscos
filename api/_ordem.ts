// Ordem manual dos objetivos.
//
// A ordem é a coluna `position` que a fábrica já cria em tabela `ordenavel`
// (`list()` ordena por ela). Não existe campo novo nem `position` no tipo
// `Objetivo`: a ordem da lista É a ordem.
//
// Reordenar não é editar. Por isso `version` e `updated_at` ficam intactos:
// alguém com o modal do objetivo aberto não pode tomar 409 porque outra pessoa
// arrastou a linha, e `updated_at` alimenta "parado há N dias", que mentiria.
// Pela mesma razão não há registro de auditoria — a trilha guarda o que alguém
// pode ser cobrado depois, e posição na lista não é isso.
import type { Sql } from './_db.js';
import { ErroOperacao } from './_operacoes.js';
import { objetivos } from './_portfolioDb.js';
import type { Objetivo } from '../src/types.js';

/** Aceita só uma lista de ids não vazios e sem repetição. */
function lerOrdem(ordem: unknown): string[] {
  if (!Array.isArray(ordem) || !ordem.every(id => typeof id === 'string' && id.trim() !== '')) {
    throw new ErroOperacao('Informe a ordem como uma lista de objetivos.', 400);
  }
  const ids = ordem as string[];
  if (new Set(ids).size !== ids.length) {
    throw new ErroOperacao('A ordem repete um objetivo.', 400);
  }
  return ids;
}

/**
 * Grava a ordem manual inteira de uma vez e devolve a lista já ordenada.
 *
 * Exige o CONJUNTO completo dos objetivos atuais. Uma ordem parcial deixaria
 * os ausentes com a posição antiga, empatados com quem acabou de ser movido —
 * e o empate cai em `created_at`, que ninguém escolheu. Se alguém criou ou
 * excluiu um objetivo no meio, a tela está desatualizada: 409, e ela relê.
 */
export async function reordenarObjetivos(sql: Sql, ordem: unknown): Promise<Objetivo[]> {
  const ids = lerOrdem(ordem);
  const run = async (tx: Sql, emTransacao: boolean): Promise<Objetivo[]> => {
    // Trava a TABELA, não as linhas. `for update` só alcança linha que já
    // existe: um objetivo criado entre a leitura e o commit escapava da
    // checagem de conjunto e a ordem gravava sem ele, com 200 em vez de 409.
    // SHARE ROW EXCLUSIVE barra insert/update/delete e outra reordenação até
    // o commit; quem estava inserindo antes termina primeiro e cai no conjunto.
    // Fora de transação o LOCK nem é aceito — e não haveria o que proteger.
    if (emTransacao) await tx('lock table objetivos in share row exclusive mode');
    const atuais = (await tx('select id from objetivos')).map(r => String(r.id));
    const pedido = new Set(ids);
    if (atuais.length !== ids.length || atuais.some(id => !pedido.has(id))) {
      throw new ErroOperacao('A lista de objetivos mudou enquanto você reordenava. A tela foi atualizada; tente de novo.', 409);
    }
    // Uma instrução só, e sem tocar em `version` nem em `updated_at`.
    await tx(
      `update objetivos o set position = x.ord - 1
         from jsonb_array_elements_text($1::jsonb) with ordinality as x(id, ord)
        where o.id = x.id::uuid and o.position is distinct from x.ord - 1`,
      [JSON.stringify(ids)],
    );
    return objetivos.list(tx);
  };
  return sql.transaction ? sql.transaction(tx => run(tx, true)) : run(sql, false);
}
