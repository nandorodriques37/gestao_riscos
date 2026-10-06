import { useEffect, useMemo, useState } from 'react';
import type { Pessoa, Tab } from '../../types';
import type { UsePortfolio } from '../../hooks/usePortfolio';
import {
  usoPorPessoa, wipPorDono, cargaPorPessoa, hojeISO, periodoDe,
} from '../../lib/portfolioMetrics';
import { chaveDoNome } from '../../lib/planoDeAcao';
import { formatarNumero, plural } from '../../lib/portfolioLabels';
import { julgar } from '../../lib/portfolioUi';
import { Kpi, KpiRow } from '../common/Kpi';
import { EmptyState } from '../common/EmptyState';
import { onActivateKey } from '../../lib/a11y';
import { useConfirmacao } from '../common/Confirmacao';
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

  const ativas = useMemo(() => pessoas.filter(p => p.ativo), [pessoas]);
  const inativos = pessoas.length - ativas.length;

  /*
   * Capacidade e carga, só de quem está ativo e declarou teto: somar a carga de
   * quem não tem teto contra o teto dos outros inflaria o "alocado". `carga`
   * já vem ordenada, e `acimaDaCapacidade` já exige capacidade declarada.
   */
  const ativasPorId = useMemo(() => new Set(ativas.map(p => p.id)), [ativas]);
  const capacidadeTotal = useMemo(
    () => ativas.reduce((soma, p) => soma + (p.dias_projeto_mes ?? 0), 0),
    [ativas],
  );
  const cargaComTeto = useMemo(
    () => carga.filter(c => ativasPorId.has(c.pessoa.id) && c.capacidade != null && c.capacidade > 0),
    [carga, ativasPorId],
  );
  const alocado = useMemo(
    () => cargaComTeto.reduce((soma, c) => soma + c.diasNoPeriodo, 0),
    [cargaComTeto],
  );
  const capacidadeComCarga = useMemo(
    () => cargaComTeto.reduce((soma, c) => soma + (c.capacidade ?? 0), 0),
    [cargaComTeto],
  );
  const acima = useMemo(
    () => carga.filter(c => c.acimaDaCapacidade && ativasPorId.has(c.pessoa.id))
      .sort((a, b) => (b.diasNoPeriodo / (b.capacidade ?? 1)) - (a.diasNoPeriodo / (a.capacidade ?? 1))),
    [carga, ativasPorId],
  );
  const maisCarregada = acima[0] ?? null;
  const pctAcima = maisCarregada
    ? Math.round(((maisCarregada.diasNoPeriodo / (maisCarregada.capacidade ?? 1)) - 1) * 100)
    : 0;
  const semCapacidade = pessoas.filter(p => p.ativo && p.dias_projeto_mes == null).length;
  const primeiraSemTeto = pessoas.find(p => p.ativo && p.dias_projeto_mes == null) ?? null;
  const [confirmar, dialogoConfirmacao] = useConfirmacao();

  async function excluir(p: Pessoa) {
    const u = uso.find(x => x.pessoa.id === p.id);
    const consequencia = u && u.total > 0
      ? `${p.nome} é dona de ${plural(u.total, 'item', 'itens')} (${u.objetivos} objetivos, `
        + `${u.iniciativas} iniciativas, ${u.trabalho} tarefas e ações). Excluir não apaga esses itens — `
        + 'deixa todos sem dono, e não há como saber depois quem era. Se a pessoa apenas saiu do '
        + 'time, marque como inativa: o histórico fica de pé.'
      : 'A ficha some da lista. Nenhum objetivo, iniciativa ou tarefa depende dela.';
    if (!(await confirmar({
      titulo: `Excluir ${p.nome}?`,
      consequencia,
      rotuloConfirmar: 'Excluir pessoa',
    }))) return;
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
    if (!(await confirmar({
      titulo: `Juntar "${origem.nome}" em "${destino.nome}"?`,
      consequencia: `Tudo que hoje é de ${origem.nome} passa a ser de ${destino.nome}, e a ficha `
        + 'duplicada é excluída. Não dá para desfazer pela tela.',
      rotuloConfirmar: 'Juntar fichas',
      perigo: false,
    }))) return;

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
          <div className="page-title">
            {ativas.length === 0 ? 'Pessoas' : maisCarregada ? (
              <>
                <em>{maisCarregada.pessoa.nome}</em> está {pctAcima}% acima da capacidade
                {acima.length > 1 && `, e mais ${plural(acima.length - 1, 'pessoa', 'pessoas')}`}
              </>
            ) : 'Ninguém acima da capacidade'}
          </div>
          <div className="page-subtitle">
            {plural(ativas.length, 'pessoa ativa', 'pessoas ativas')} · carga em dias de projeto por mês ·
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

      {ativas.length > 0 && (
        <KpiRow colunas={4}>
          <Kpi
            label="Pessoas ativas" valor={ativas.length} acento="brand"
            sub={inativos > 0 ? plural(inativos, 'inativa', 'inativas') : 'nenhuma inativa'}
          />
          <Kpi
            label="Capacidade por mês"
            valor={capacidadeTotal > 0 ? `${formatarNumero(capacidadeTotal, 0)} d` : '—'}
            sub={capacidadeTotal > 0 ? 'dias de projeto somados' : 'ninguém declarou o teto'}
            acento="brand"
          />
          <Kpi
            label="Alocado"
            valor={capacidadeComCarga > 0 ? `${Math.round((alocado / capacidadeComCarga) * 100)}%` : '—'}
            sub={capacidadeComCarga > 0
              ? `${formatarNumero(alocado, 1)} d de ${formatarNumero(capacidadeComCarga, 0)} d`
              : 'sem carga contra um teto'}
            acento="brand"
            {...(capacidadeComCarga > 0 && alocado > capacidadeComCarga ? julgar('risco', 'Acima') : {})}
          />
          <Kpi
            label="Acima da capacidade" valor={acima.length}
            sub={maisCarregada
              ? `${maisCarregada.pessoa.nome}, ${formatarNumero(maisCarregada.diasNoPeriodo, 1)} d de ${maisCarregada.capacidade} d`
              : 'ninguém passou do teto'}
            acento={acima.length > 0 ? 'critico' : 'baixo'}
            {...(acima.length > 0 ? julgar('risco', 'Sobrecarga') : {})}
          />
        </KpiRow>
      )}

      {resumoMesclagem && (
        <div className="card">
          <div className="bento-sub">{resumoMesclagem}</div>
        </div>
      )}

      {duplicados.length > 0 && (
        <div className="card pessoas-duplicadas">
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
        <div className="form-aviso form-aviso-com-acao pessoas-aviso">
          <span>
            {plural(semCapacidade, 'pessoa ativa está', 'pessoas ativas estão')} sem capacidade de
            projeto declarada. Sem esse teto, o Painel mostra a carga delas mas não tem régua para
            acusar sobrecarga de forma auditável.
          </span>
          {primeiraSemTeto && (
            <button className="btn btn-ghost" onClick={() => setEditando(primeiraSemTeto)}>
              Declarar capacidade
            </button>
          )}
        </div>
      )}

      {visiveis.length === 0 ? (
        <div className="card">
          <EmptyState
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
                <th className="col-acao" />
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
                  <tr
                    key={p.id}
                    data-inativo={!p.ativo || undefined}
                    role="button"
                    tabIndex={0}
                    aria-label={`Editar ${p.nome}`}
                    onClick={() => setEditando(p)}
                    onKeyDown={onActivateKey(() => setEditando(p))}
                  >
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
                        teto != null
                          ? <span className="lista-nota">teto {teto} d</span>
                          : <button className="nao-preenchido" onClick={e => { e.stopPropagation(); setEditando(p); }}>Não preenchido</button>
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

      <div className="bento-sub pessoas-nota">
        A carga do mês espalha o esforço de cada iniciativa ativa pela janela dela e soma só a
        fatia deste mês. Iniciativa sem esforço ou sem janela não entra —{' '}
        <button className="link-ini" onClick={() => onIrPara('iniciativas')}>preencha lá</button>{' '}
        e a conta aparece aqui.
      </div>

      {dialogoConfirmacao}

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
