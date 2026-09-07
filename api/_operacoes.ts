import { createHash } from 'node:crypto';
import { listRecords, updateRecordById, type Sql } from './_db.js';
import { acoesRisco, iniciativas, pessoas, ENTIDADES, validarEntidade, type NomeEntidade } from './_portfolioDb.js';
import { registrarAlteracao, registrarCriacao, registrarExclusao } from './_auditoria.js';
import { diffPlano, salvarPlano, type LinhaPlano } from '../src/lib/planoDeAcao.js';
import type { RiskRecord } from '../src/types.js';

export class ErroOperacao extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export async function ensureOperacoes(sql: Sql) {
  await sql(`create table if not exists operacoes_app (
    chave text primary key, assinatura text not null, resultado jsonb not null,
    em timestamptz not null default now()
  )`);
}

/** A resposta fica na mesma transação que a escrita: repetir após perda de rede é seguro. */
async function executarUmaVez<T>(sql: Sql, chave: string, pedido: unknown, run: (tx: Sql) => Promise<T>): Promise<T> {
  if (!chave || chave.length > 150) throw new ErroOperacao('Identificador da operação inválido.');
  if (!sql.transaction) throw new Error('Executor sem suporte a transação.');
  const assinatura = createHash('sha256').update(JSON.stringify(pedido)).digest('hex');
  return sql.transaction(async tx => {
    await tx('select pg_advisory_xact_lock(hashtext($1))', [chave]);
    const anterior = (await tx('select * from operacoes_app where chave = $1', [chave]))[0];
    if (anterior) {
      if (anterior.assinatura !== assinatura) throw new ErroOperacao('Esta operação já foi usada com outros dados.', 409);
      return anterior.resultado as T;
    }
    const result = await run(tx);
    await tx('insert into operacoes_app (chave, assinatura, resultado) values ($1, $2, $3::jsonb)',
      [chave, assinatura, JSON.stringify(result)]);
    return result;
  });
}

export interface SalvarRiscoPedido {
  chave: string; riscoId: string; expectedVersion: number;
  patch: Partial<RiskRecord>; base: LinhaPlano[]; atual: LinhaPlano[];
}

export async function criarEntidadeUmaVez(sql: Sql, nome: NomeEntidade, dados: Record<string, unknown>, chave: string, autor: string) {
  return executarUmaVez(sql, chave, { tipo: nome, dados }, async tx => {
    const erro = await validarEntidade(tx, nome, dados, null);
    if (erro) throw new ErroOperacao(erro);
    const tabela = ENTIDADES[nome];
    const result = await tabela.create(tx, dados);
    await registrarCriacao(tx, tabela.nome, result, autor);
    return result;
  });
}

export async function salvarRiscoCompleto(sql: Sql, pedido: SalvarRiscoPedido, autor: string) {
  if (!pedido.riscoId || !Number.isInteger(pedido.expectedVersion)
    || !Array.isArray(pedido.base) || !Array.isArray(pedido.atual) || !pedido.patch) {
    throw new ErroOperacao('Informe o risco, a versão e o plano de ação.');
  }
  return executarUmaVez(sql, pedido.chave, { tipo: 'risco', ...pedido }, async tx => {
    await tx('select id from risk_records where id = $1 for update', [pedido.riscoId]);
    const antes = (await listRecords(tx)).find(r => r.id === pedido.riscoId);
    if (!antes) throw new ErroOperacao('Risco não encontrado.', 404);
    if (antes.version !== pedido.expectedVersion) throw new ErroOperacao('Este risco mudou enquanto você editava. Revise a versão atual antes de salvar.', 409);
    const { acoes: _resumo, acoes_itens: _legado, ...patch } = pedido.patch;
    // Mesmo quando só o plano muda, avança a versão do risco para proteger reenvios.
    const atualizado = await updateRecordById(tx, antes.id, { obs: antes.obs, ...patch }, antes.version);
    if (atualizado.status !== 'ok') throw new ErroOperacao('O risco foi alterado por outra pessoa.', 409);
    await registrarAlteracao(tx, 'risk_records', antes, patch, autor);
    const diff = diffPlano(pedido.base, pedido.atual);
    for (const linha of [...diff.atualizar, ...diff.remover].sort((a, b) => a.id.localeCompare(b.id))) {
      await tx('select id from tasks where id = $1 for update', [linha.id]);
      const acao = await acoesRisco.byId(tx, linha.id);
      if (!acao || acao.risco_id !== antes.id || acao.version !== linha.version) {
        throw new ErroOperacao('Uma ação deste plano mudou enquanto você editava. Revise a versão atual antes de salvar.', 409);
      }
    }
    const plano = await salvarPlano({
      riscoId: antes.id, base: pedido.base, atual: pedido.atual, pessoas: await pessoas.list(tx),
      api: {
        criarPessoa: async nome => {
          const p = await pessoas.create(tx, { nome, ativo: true });
          await registrarCriacao(tx, 'pessoas', p, autor);
          return p;
        },
        criarAcao: async dados => {
          const erro = await validarEntidade(tx, 'acoes-risco', dados, null);
          if (erro) throw new ErroOperacao(erro);
          const a = await acoesRisco.create(tx, dados);
          await registrarCriacao(tx, 'acoes_risco', a, autor);
          return a;
        },
        atualizarAcao: async (id, dados, version) => {
          const a = await acoesRisco.byId(tx, id);
          const erro = await validarEntidade(tx, 'acoes-risco', dados, a);
          if (erro) throw new ErroOperacao(erro);
          const r = await acoesRisco.update(tx, id, dados, version);
          if (r.status !== 'ok') throw new ErroOperacao('A ação foi alterada por outra pessoa.', 409);
          if (a) await registrarAlteracao(tx, 'acoes_risco', a, dados, autor);
          return r.item;
        },
        removerAcao: async id => {
          const a = await acoesRisco.byId(tx, id);
          if (!(await acoesRisco.remove(tx, id))) throw new ErroOperacao('Ação não encontrada.', 404);
          if (a) await registrarExclusao(tx, 'acoes_risco', a, autor);
        },
      },
    });
    if (plano.erros.length) throw new ErroOperacao(`${plano.erros.join(' ')} Nenhuma alteração foi salva.`);
    const record = (await listRecords(tx)).find(r => r.id === antes.id)!;
    return { record, plano, acoes: (await acoesRisco.list(tx)).filter(a => a.risco_id === antes.id) };
  });
}

export interface CriarIniciativaPedido {
  chave: string; acaoId: string; expectedVersion: number; dados: Record<string, unknown>;
}

export async function criarIniciativaDaAcao(sql: Sql, pedido: CriarIniciativaPedido, autor: string) {
  if (!pedido.acaoId || !Number.isInteger(pedido.expectedVersion) || !pedido.dados) throw new ErroOperacao('Informe a ação e sua versão.');
  return executarUmaVez(sql, pedido.chave, { tipo: 'iniciativa', ...pedido }, async tx => {
    await tx('select id from tasks where id = $1 for update', [pedido.acaoId]);
    const acao = await acoesRisco.byId(tx, pedido.acaoId);
    if (!acao) throw new ErroOperacao('Ação não encontrada.', 404);
    if (acao.version !== pedido.expectedVersion || acao.iniciativa_id) throw new ErroOperacao('A ação mudou ou já foi vinculada. Atualize os dados antes de continuar.', 409);
    if (acao.status === 'cancelada') throw new ErroOperacao('Reative a ação antes de vinculá-la.');
    const dados = { ...pedido.dados, fonte: 'risco', status: 'backlog' };
    if (!String(pedido.dados.nome ?? '').trim()) throw new ErroOperacao('Informe o nome da iniciativa.');
    const erro = await validarEntidade(tx, 'iniciativas', dados, null);
    if (erro) throw new ErroOperacao(erro);
    const iniciativa = await iniciativas.create(tx, dados);
    const patch = { iniciativa_id: iniciativa.id, triagem: 'iniciativa' };
    const result = await acoesRisco.update(tx, acao.id, patch, acao.version);
    if (result.status !== 'ok') throw new ErroOperacao('Não foi possível vincular a ação.', 409);
    await registrarCriacao(tx, 'iniciativas', iniciativa, autor);
    await registrarAlteracao(tx, 'acoes_risco', acao, patch, autor);
    return iniciativa;
  });
}
