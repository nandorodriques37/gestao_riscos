import type { VercelRequest, VercelResponse } from '@vercel/node';
import { salvarRiscoCompleto, criarIniciativaDaAcao, criarEntidadeUmaVez, ErroOperacao, type SalvarRiscoPedido, type CriarIniciativaPedido } from './_operacoes.js';
import { neonSql, type Sql } from './_db.js';
import {
  ENTIDADES, ehEntidade, listPortfolio, backup,
  validarEntidade,
} from './_portfolioDb.js';
import { ensureTudo } from './_schema.js';
import { migrarAcoes } from './_migracaoAcoes.js';
import { promoverTriagem } from './_promocaoTriagem.js';
import { mesclarPessoas } from './_donos.js';
import {
  autorDaRequisicao, listarAuditoria,
  registrarCriacao, registrarAlteracao, registrarExclusao,
} from './_auditoria.js';

// Handler compartilhado pelo roteador de produção e pelo Vite.
// api/index.ts publica a única função; as reescritas preservam os endereços.
//
//   GET    /api/portfolio                  → pacote das 5 listas
//   GET    /api/portfolio/backup           → dump completo (?anexos=1 inclui bytes)
//   GET    /api/portfolio/:entidade        → uma lista
//   POST   /api/portfolio/:entidade        → cria
//   PATCH  /api/portfolio/:entidade/:id    → atualiza (409 em conflito de versão)
//   DELETE /api/portfolio/:entidade/:id    → exclui

function parseBody(req: VercelRequest): Record<string, unknown> {
  const raw = req.body;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw || '{}') as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (raw as Record<string, unknown>) || {};
}

/** Violação de chave estrangeira vira mensagem, não 500. */
function mensagemFK(err: unknown): string | null {
  const code = (err as { code?: string })?.code;
  if (code !== '23503') return null;
  const detalhe = String((err as { detail?: string })?.detail ?? '');
  if (detalhe.includes('iniciativas')) {
    return 'Este objetivo ainda tem iniciativas ligadas. Mova ou exclua as iniciativas antes.';
  }
  return 'Registro referenciado por outro — remova o vínculo antes de excluir.';
}

/**
 * Segmentos depois de `/api/portfolio`, lidos da própria URL.
 *
 * Não dá para confiar em `req.query.path`: dependendo de qual arquivo a Vercel
 * escolhe para servir o pedido — o catch-all ou o `index.ts` vizinho — esse
 * parâmetro vem preenchido ou vem vazio. Quando veio vazio para
 * `/api/portfolio/backup`, o handler leu `partes = []` e devolveu o pacote no
 * lugar do backup, calado. Ler da URL dá a mesma resposta nos dois roteamentos.
 */
export function segmentosDaUrl(url: string | undefined): string[] {
  const semQuery = (url ?? '').split('?')[0];
  const i = semQuery.indexOf('/api/portfolio');
  const resto = i === -1 ? '' : semQuery.slice(i + '/api/portfolio'.length);
  return resto.split('/').filter(Boolean).map(s => decodeURIComponent(s));
}

export default async function handler(req: VercelRequest, res: VercelResponse, database?: Sql) {
  try {
    const sql = database ?? neonSql();
    const partes = segmentosDaUrl(req.url);
    const method = (req.method || 'GET').toUpperCase();

      // Sequência completa (inclusive a cópia única das mitigações para `tasks`).
    // Roda no caminho de leitura porque a projeção que serve `acoes-risco` lê
    // de lá — sem a cópia, a fila da Triagem e o Rastro apareceriam vazios em
    // vez de errados.
    await ensureTudo(sql);
    if (partes.length === 1 && ['salvar-risco', 'criar-iniciativa'].includes(partes[0])) {
      if (method !== 'POST') { res.setHeader('Allow', 'POST'); res.status(405).json({ error: 'Método não permitido' }); return; }
      const body = parseBody(req);
      const autor = autorDaRequisicao(req.headers as Record<string, unknown>);
      const result = partes[0] === 'salvar-risco'
        ? await salvarRiscoCompleto(sql, body as unknown as SalvarRiscoPedido, autor)
        : await criarIniciativaDaAcao(sql, body as unknown as CriarIniciativaPedido, autor);
      res.status(200).json(result); return;
    }

    // GET /api/portfolio
    if (partes.length === 0) {
      if (method !== 'GET') {
        res.setHeader('Allow', 'GET');
        res.status(405).json({ error: 'Método não permitido' });
        return;
      }
      res.status(200).json(await listPortfolio(sql));
      return;
    }

    // GET /api/portfolio/backup
    if (partes.length === 1 && partes[0] === 'backup') {
      if (method !== 'GET') {
        res.setHeader('Allow', 'GET');
        res.status(405).json({ error: 'Método não permitido' });
        return;
      }
      const incluirAnexos = String(req.query.anexos ?? '') === '1';
      res.status(200).json(await backup(sql, incluirAnexos));
      return;
    }

    // POST /api/portfolio/migrar-acoes — idempotente, só insere.
    // GET /api/portfolio/auditoria?tabela=&registro_id=&limite=
    if (partes.length === 1 && partes[0] === 'auditoria') {
      if (method !== 'GET') {
        res.setHeader('Allow', 'GET');
        res.status(405).json({ error: 'Método não permitido' });
        return;
      }
      const q = req.query as Record<string, string | string[] | undefined>;
      const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
      res.status(200).json(await listarAuditoria(sql, {
        tabela: um(q.tabela),
        registroId: um(q.registro_id),
        limite: Number(um(q.limite) ?? 50) || 50,
      }));
      return;
    }

    if (partes.length === 1 && partes[0] === 'migrar-acoes') {
      if (method !== 'POST') {
        res.setHeader('Allow', 'POST');
        res.status(405).json({ error: 'Método não permitido' });
        return;
      }
      res.status(200).json(await migrarAcoes(sql));
      return;
    }

    // POST /api/portfolio/mesclar-pessoas — junta duas fichas da mesma pessoa.
    //
    // Fica no servidor, e não na tela, porque quem sabe quais tabelas apontam
    // para `pessoas` é o esquema. A versão que vivia no componente repontava
    // três listas do pacote do portfólio e não conhecia as tarefas livres —
    // que passaram a ter dono. FK esquecida aqui não falha: `set null` aceita,
    // e o dono some em silêncio.
    if (partes.length === 1 && partes[0] === 'mesclar-pessoas') {
      if (method !== 'POST') {
        res.setHeader('Allow', 'POST');
        res.status(405).json({ error: 'Método não permitido' });
        return;
      }
      const body = parseBody(req);
      const destino = String(body.destino ?? '');
      const origem = String(body.origem ?? '');
      if (!destino || !origem) {
        res.status(400).json({ error: 'Informe as fichas de destino e de origem.' });
        return;
      }
      const antes = await ENTIDADES.pessoas.byId(sql, origem);
      const r = await mesclarPessoas(sql, destino, origem);
      if (antes) await registrarExclusao(sql, 'pessoas', antes, autorDaRequisicao(req.headers as Record<string, unknown>));
      res.status(200).json(r);
      return;
    }

    // POST /api/portfolio/promover-triagem — aplica a triagem confirmada.
    if (partes.length === 1 && partes[0] === 'promover-triagem') {
      if (method !== 'POST') {
        res.setHeader('Allow', 'POST');
        res.status(405).json({ error: 'Método não permitido' });
        return;
      }
      res.status(200).json(await promoverTriagem(sql));
      return;
    }

    const nome = partes[0];
    if (!ehEntidade(nome)) {
      res.status(404).json({ error: `Entidade "${nome}" não existe.` });
      return;
    }
    const tabela = ENTIDADES[nome];
    const autor = autorDaRequisicao(req.headers as Record<string, unknown>);

    // /api/portfolio/:entidade
    if (partes.length === 1) {
      if (method === 'GET') {
        res.status(200).json(await tabela.list(sql));
        return;
      }
      if (method === 'POST') {
        const body = parseBody(req);
        const erro = await validarEntidade(sql, nome, body, null);
        if (erro) {
          res.status(400).json({ error: erro });
          return;
        }
        const { __chave, ...campos } = body;
        if (typeof __chave === 'string') { res.status(201).json(await criarEntidadeUmaVez(sql, nome, campos, __chave, autor)); return; }
        const criado = await tabela.create(sql, campos);
        await registrarCriacao(sql, tabela.nome, criado, autor);
        res.status(201).json(criado);
        return;
      }
      res.setHeader('Allow', 'GET, POST');
      res.status(405).json({ error: 'Método não permitido' });
      return;
    }

    // /api/portfolio/:entidade/:id
    if (partes.length === 2) {
      const id = partes[1];

      if (method === 'PATCH') {
        const { expectedVersion, ...patch } = parseBody(req) as { expectedVersion?: number };
        const atual = await tabela.byId(sql, id);
        if (!atual) {
          res.status(404).json({ error: 'Registro não encontrado' });
          return;
        }
        const erro = await validarEntidade(sql, nome, patch, atual);
        if (erro) {
          res.status(400).json({ error: erro });
          return;
        }
        const result = await tabela.update(sql, id, patch, expectedVersion);
        if (result.status === 'not_found') {
          res.status(404).json({ error: 'Registro não encontrado' });
          return;
        }
        if (result.status === 'ok') {
          await registrarAlteracao(
            sql, tabela.nome, atual, patch, autor,
          );
        }
        res.status(result.status === 'conflict' ? 409 : 200).json(result.item);
        return;
      }

      if (method === 'DELETE') {
        // Lê antes de apagar: depois do delete não há mais rótulo para gravar,
        // e "excluiu alguma coisa" não serve de histórico.
        const antes = await tabela.byId(sql, id);
        const ok = await tabela.remove(sql, id);
        if (!ok) {
          res.status(404).json({ error: 'Registro não encontrado' });
          return;
        }
        if (antes) {
          await registrarExclusao(sql, tabela.nome, antes, autor);
        }
        res.status(200).json({ ok: true });
        return;
      }

      res.setHeader('Allow', 'PATCH, DELETE');
      res.status(405).json({ error: 'Método não permitido' });
      return;
    }

    res.status(404).json({ error: 'Rota não encontrada' });
  } catch (err) {
    if (err instanceof ErroOperacao) { res.status(err.status).json({ error: err.message }); return; }
    const fk = mensagemFK(err);
    if (fk) {
      res.status(409).json({ error: fk });
      return;
    }
    console.error('[api/portfolio]', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro interno' });
  }
}
