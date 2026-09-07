import { useEffect, useMemo, useState } from 'react';
import type { Pessoa, Tab } from '../../types';
import type { UsePortfolio } from '../../hooks/usePortfolio';
import {
  usoPorPessoa, wipPorDono, cargaPorPessoa, hojeISO, periodoDe,
} from '../../lib/portfolioMetrics';
import { chaveDoNome } from '../../lib/planoDeAcao';
import { formatarNumero, plural } from '../../lib/portfolioLabels';
import { EmptyState } from '../common/EmptyState';
import { PessoaModal } from './PessoaModal';
import { fetchTasks } from '../../lib/tasksApi';

interface PessoasTabProps {
  pf: UsePortfolio;
  onIrPara: (tab: Tab) => void;
}

export function PessoasTab({ pf, onIrPara }: PessoasTabProps) {
  const {
    portfolio, loading, error, clearError,
    createEntidade, patchEntidade, deleteEntidade, mesclarPessoas,
  } = pf;
  const { pessoas, objetivos, iniciativas } = portfolio;

  const [editando, setEditando] = useState<Pessoa | null>(null);
  const [criando, setCriando] = useState(false);
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [mesclando, setMesclando] = useState(false);
  const [resumoMesclagem, setResumoMesclagem] = useState<string | null>(null);

  const hojeStr = hojeISO();

  // Todo o trabalho, não só as mitigações: tarefa livre e mitigação são a
  // mesma tabela, e as duas apontam para `pessoas`. Uma busca só, sem polling —
  // esta tela não muda enquanto está aberta.
  const [trabalho, setTrabalho] = useState<{ dono_id: string | null }[]>([]);
  useEffect(() => {
    let vivo = true;
    void fetchTasks()
      .then(t => { if (vivo) setTrabalho(t); })
      .catch(() => { /* sem a lista, o aviso conta só o que o portfólio sabe */ });
    return () => { vivo = false; };
  }, []);

  const uso = useMemo(
    () => usoPorPessoa(pessoas, objetivos, iniciativas, trabalho),
    [pessoas, objetivos, iniciativas, trabalho],
  );
  const wip = useMemo(() => wipPorDono(iniciativas, pessoas), [iniciativas, pessoas]);
  const carga = useMemo(
    () => cargaPorPessoa(iniciativas, pessoas, periodoDe(hojeStr)),
    [iniciativas, pessoas, hojeStr],
  );

  const wipPorId = useMemo(
    () => new Map(wip.filter(w => w.pessoa).map(w => [w.pessoa!.id, w])),
    [wip],
  );
  const cargaPorId = useMemo(() => new Map(carga.map(c => [c.pessoa.id, c])), [carga]);

  /**
   * Nomes que só diferem por acento ou caixa. Acontece porque o editor de plano
   * de ação cadastra quem não existe: um "Joao" digitado sem acento vira uma
   * pessoa nova ao lado de "João".
   */
  const duplicados = useMemo(() => {
    const grupos = new Map<string, Pessoa[]>();
    for (const p of pessoas) {
      const k = chaveDoNome(p.nome);
      if (!k) continue;
      grupos.set(k, [...(grupos.get(k) ?? []), p]);
    }
    return [...grupos.values()].filter(g => g.length > 1);
  }, [pessoas]);

  const visiveis = useMemo(() => {
    const lista = mostrarInativos ? pessoas : pessoas.filter(p => p.ativo);
    return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [pessoas, mostrarInativos]);

  const inativos = pessoas.length - pessoas.filter(p => p.ativo).length;
  const semCapacidade = pessoas.filter(p => p.ativo && p.dias_projeto_mes == null).length;

  async function excluir(p: Pessoa) {
    const u = uso.find(x => x.pessoa.id === p.id);
    if (u && u.total > 0) {
      if (!window.confirm(
        `${p.nome} é dona de ${plural(u.total, 'item', 'itens')} `
        + `(${u.objetivos} objetivos, ${u.iniciativas} iniciativas, ${u.trabalho} tarefas e ações).\n\n`
        + 'Excluir não apaga esses itens — deixa todos sem dono, e não há como saber depois '
        + 'quem era.\n\nSe a pessoa apenas saiu do time, marque como inativa: o histórico fica de pé.',
      )) return;
    } else if (!window.confirm(`Excluir ${p.nome}?`)) {
      return;
    }
    const ok = await deleteEntidade('pessoas', p.id);
    if (ok) setEditando(null);
  }

  /**
   * Junta duas fichas da mesma pessoa: tudo que apontava para a origem passa a
   * apontar para o destino, e só então a origem é excluída. A ordem importa —
   * excluir antes deixaria os itens sem dono, que é exatamente o estrago que
   * esta função existe para desfazer.
   */
  async function mesclar(destino: Pessoa, origem: Pessoa) {
    if (!window.confirm(
      `Juntar "${origem.nome}" em "${destino.nome}"?\n\n`
      + `Tudo que hoje é de ${origem.nome} passa a ser de ${destino.nome}, e a ficha `
      + 'duplicada é excluída. Não dá para desfazer pela tela.',
    )) return;

    setMesclando(true);
    // Quem repõe as FKs é o servidor. Esta função já fez isso aqui, item a
    // item, sobre três listas do pacote do portfólio — e não enxergava as
    // tarefas livres, que passaram a ter dono. Uma tabela esquecida não falha:
    // `set null` aceita, e o dono some calado de tudo que a pessoa carregava.
    const movidos = await mesclarPessoas(destino.id, origem.id);
    setMesclando(false);
    setResumoMesclagem(movidos == null
      ? `Não foi possível juntar "${origem.nome}" em "${destino.nome}".`
      : `"${origem.nome}" virou "${destino.nome}". ${plural(movidos, 'item movido', 'itens movidos')}.`);
  }

  if (loading && pessoas.length === 0) {
    return (
      <div className="tab-page-lg">
        <div className="app-loading" role="status" aria-label="Carregando pessoas…">
          <div className="skeleton-table">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton-row" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-page-lg">
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button className="error-banner-dismiss" onClick={clearError} aria-label="Fechar aviso">×</button>
        </div>
      )}

      <div className="page-bar">
        <div>
          <div className="page-title">Pessoas</div>
          <div className="page-subtitle">
            {plural(pessoas.filter(p => p.ativo).length, 'pessoa ativa', 'pessoas ativas')} ·
            {' '}quem pode ser dono de objetivo, iniciativa ou ação
          </div>
        </div>
        <div className="actions-row">
          {inativos > 0 && (
            <button className="btn btn-ghost" onClick={() => setMostrarInativos(v => !v)}>
              {mostrarInativos ? 'Ocultar inativos' : `Mostrar inativos · ${inativos}`}
            </button>
          )}
          <button className="btn btn-navy" onClick={() => setCriando(true)}>+ Nova pessoa</button>
        </div>
      </div>

      {resumoMesclagem && (
        <div className="card" style={{ marginBottom: 'var(--sp-3)' }}>
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)' }}>{resumoMesclagem}</div>
        </div>
      )}

      {duplicados.length > 0 && (
        <div className="card" style={{ marginBottom: 'var(--sp-3)', borderColor: 'color-mix(in oklab, var(--tier-alto) 34%, transparent)' }}>
          <div className="section-title">
            {plural(duplicados.length, 'nome repetido', 'nomes repetidos')}
          </div>
          <div className="bento-sub">
            Estas fichas têm o mesmo nome escrito de formas diferentes. Juntar transfere tudo
            para a ficha que você escolher e apaga a outra.
          </div>
          <div className="lista-linhas">
            {duplicados.map(grupo => {
              const [principal, ...resto] = [...grupo].sort((a, b) => {
                const ua = uso.find(u => u.pessoa.id === a.id)?.total ?? 0;
                const ub = uso.find(u => u.pessoa.id === b.id)?.total ?? 0;
                return ub - ua;
              });
              return resto.map(dup => (
                <div className="lista-linha" key={dup.id}>
                  <span className="lista-texto">
                    <strong>{dup.nome}</strong> → {principal.nome}
                  </span>
                  <span className="lista-nota">
                    {uso.find(u => u.pessoa.id === dup.id)?.total ?? 0} itens a mover
                  </span>
                  <button
                    className="btn btn-outline-navy"
                    disabled={mesclando}
                    onClick={() => { void mesclar(principal, dup); }}
                  >
                    {mesclando ? 'Juntando…' : 'Juntar'}
                  </button>
                </div>
              ));
            })}
          </div>
        </div>
      )}

      {semCapacidade > 0 && (
        <div className="form-aviso" style={{ marginTop: 0, marginBottom: 'var(--sp-3)' }}>
          {plural(semCapacidade, 'pessoa ativa está', 'pessoas ativas estão')} sem capacidade de
          projeto declarada. Sem esse teto, o Painel mostra a carga delas mas não tem régua para
          acusar sobrecarga.
        </div>
      )}

      {visiveis.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="◇"
            message="Ninguém cadastrado ainda"
            hint="Pessoas aparecem sozinhas quando você digita um responsável no plano de ação de um risco — ou você cadastra aqui, com papel, área e capacidade."
            action={{ label: '+ Nova pessoa', onClick: () => setCriando(true) }}
          />
        </div>
      ) : (
        <div className="tabela-simples-wrap">
          <table className="tabela-simples">
            <thead>
              <tr>
                <th>Pessoa</th>
                <th>Área</th>
                <th className="num">Objetivos</th>
                <th className="num">Iniciativas</th>
                <th className="num">Trabalho</th>
                <th className="num">Em execução</th>
                <th>Carga do mês</th>
                <th style={{ width: 72 }} />
              </tr>
            </thead>
            <tbody>
              {visiveis.map(p => {
                const u = uso.find(x => x.pessoa.id === p.id);
                const w = wipPorId.get(p.id);
                const c = cargaPorId.get(p.id);
                const teto = p.dias_projeto_mes;
                const escala = Math.max(c?.diasNoPeriodo ?? 0, teto ?? 0) || 1;
                return (
                  <tr key={p.id} data-inativo={!p.ativo || undefined}>
                    <td>
                      <div className="pessoa-nome">{p.nome}</div>
                      <div className="lista-nota">
                        {[p.papel, p.ativo ? null : 'inativa'].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </td>
                    <td className="muted" data-rotulo="Área">{p.area || '—'}</td>
                    <td className="num" data-rotulo="Objetivos">{u?.objetivos ?? 0}</td>
                    <td className="num" data-rotulo="Iniciativas">{u?.iniciativas ?? 0}</td>
                    <td className="num" data-rotulo="Trabalho">{u?.trabalho ?? 0}</td>
                    <td className="num" data-rotulo="Em execução">
                      {w?.acimaDoLimite ? (
                        <span className="tier-chip" data-tier="alto">
                          <span className="tier-dot" aria-hidden="true" />
                          {w.wip}
                        </span>
                      ) : (w?.wip ?? 0)}
                    </td>
                    <td data-rotulo="Carga do mês">
                      {c ? (
                        <div className="carga-linha">
                          <span className="carga-track">
                            <span
                              className="carga-fill"
                              data-acima={c.acimaDaCapacidade}
                              style={{ width: `${Math.min(100, (c.diasNoPeriodo / escala) * 100)}%` }}
                            />
                            {teto != null && (
                              <span className="carga-limite" style={{ left: `${(teto / escala) * 100}%` }} />
                            )}
                          </span>
                          <span className="lista-nota tabular">
                            {formatarNumero(c.diasNoPeriodo, 1)}{teto != null ? `/${teto}` : ''} d
                          </span>
                        </div>
                      ) : (
                        <span className="lista-nota">
                          {teto != null ? `teto ${teto} d` : 'sem teto'}
                        </span>
                      )}
                    </td>
                    <td>
                      <button className="link-ini" onClick={() => setEditando(p)}>Editar</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="bento-sub" style={{ marginTop: 'var(--sp-4)', maxWidth: '80ch' }}>
        A carga do mês espalha o esforço de cada iniciativa ativa pela janela dela e soma só a
        fatia deste mês. Iniciativa sem esforço ou sem janela não entra —{' '}
        <button className="link-ini" onClick={() => onIrPara('iniciativas')}>preencha lá</button>{' '}
        e a conta aparece aqui.
      </div>

      {criando && (
        <PessoaModal erro={error}
          onSalvar={dados => createEntidade('pessoas', dados)}
          onClose={() => setCriando(false)}
        />
      )}

      {editando && (
        <PessoaModal
          key={editando.id}
          pessoa={editando}
          onSalvar={dados => patchEntidade('pessoas', editando.id, dados, editando.version)}
          onExcluir={() => { void excluir(editando); }}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}
