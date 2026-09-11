import { useSessionState } from '../../hooks/useSessionState';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Iniciativa, StoredRiskRecord } from '../../types';
import type { UsePortfolio } from '../../hooks/usePortfolio';
import { computePrioriz, priorizTier, round2 } from '../../lib/calculations';
import { portfolioPorOrigem, iniciativaAtiva, saudeIniciativas } from '../../lib/portfolioMetrics';
import {
  ROTULO_FONTE, ROTULO_STATUS_INICIATIVA, BADGE_STATUS_INICIATIVA,
  formatarMoeda, formatarData, plural,
} from '../../lib/portfolioLabels';
import { proximoMarco, dataPlanoMarco } from './iniciativasUi';
import './iniciativas.css';
import { OBJETIVO_BALDE } from '../../lib/portfolioUi';
import { EmptyState } from '../common/EmptyState';
import { Kpi, KpiRow } from '../common/Kpi';
import { IniciativaDetalhe } from './IniciativaDetalhe';
import { IniciativaModal } from './IniciativaModal';

interface IniciativasTabProps {
  novoObjetivoId?: string | null;
  onNovaIniciativaFechada?: () => void;
  idsDoRecorte?: Set<string> | null;
  riscos: StoredRiskRecord[];
  pf: UsePortfolio;
  selecionada: string | null;
  onSelecionar: (id: string | null) => void;
  onAbrirRisco: (id: string) => void;
}

type Agrupamento = 'objetivo' | 'origem' | 'dono';

const AGRUPAMENTOS: { chave: Agrupamento; label: string }[] = [
  { chave: 'objetivo', label: 'Por objetivo' },
  { chave: 'origem', label: 'Por origem' },
  { chave: 'dono', label: 'Por responsável' },
];


export function IniciativasTab({
  riscos, pf, selecionada, onSelecionar, onAbrirRisco, novoObjetivoId, onNovaIniciativaFechada, idsDoRecorte,
}: IniciativasTabProps) {
  const { portfolio, loading, error, clearError, createEntidade, patchEntidade, deleteEntidade } = pf;
  const { objetivos, iniciativas, marcos, acoes_risco, pessoas } = portfolio;

  const [agrupamento, setAgrupamento] = useSessionState<Agrupamento>('iniciativas.grupo', 'objetivo');
  const [busca, setBusca] = useSessionState('iniciativas.busca', '');
  const [situacao, setSituacao] = useSessionState('iniciativas.situacao', 'todas');
  const [objetivoFiltro, setObjetivoFiltro] = useSessionState('iniciativas.objetivo', '');
  const [donoFiltro, setDonoFiltro] = useSessionState('iniciativas.dono', '');
  const [ordem, setOrdem] = useSessionState('iniciativas.ordem', 'prioridade');
  const [recolhidos, setRecolhidos] = useSessionState<string[]>('iniciativas.recolhidos', []);
  const [posicao, setPosicao] = useSessionState('iniciativas.posicao', 0);
  const ultimoAberto = useRef<string | null>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    if (selecionada) {
      ultimoAberto.current = selecionada;
      window.scrollTo({ top: 0 });
      tituloRef.current?.focus({ preventScroll: true });
    } else {
      window.scrollTo({ top: posicao });
      if (ultimoAberto.current) {
        document.getElementById(`iniciativa-${ultimoAberto.current}`)?.focus({ preventScroll: true });
      }
    }
  }, [selecionada, loading, posicao]);
  function abrir(id: string) { setPosicao(window.scrollY); onSelecionar(id); }
  function limparFiltros() { setBusca(''); setSituacao('todas'); setObjetivoFiltro(''); setDonoFiltro(''); }
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<Iniciativa | null>(null);


  const objetivoPorId = useMemo(() => new Map(objetivos.map(o => [o.id, o])), [objetivos]);
  const pessoaPorId = useMemo(() => new Map(pessoas.map(p => [p.id, p.nome])), [pessoas]);
  const origem = useMemo(() => portfolioPorOrigem(iniciativas), [iniciativas]);
  const saude = useMemo(() => saudeIniciativas(iniciativas, marcos), [iniciativas, marcos]);

  const atencao = useMemo(() => new Set([...saude.semMarco, ...saude.atrasadas].map(i => i.id)), [saude]);
  const proximos = useMemo(() => new Map(iniciativas.map(i => [i.id, proximoMarco(marcos, i.id)])), [iniciativas, marcos]);

  const marcosPorIniciativa = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of marcos) {
      if (!x.iniciativa_id) continue;
      m.set(x.iniciativa_id, (m.get(x.iniciativa_id) ?? 0) + 1);
    }
    return m;
  }, [marcos]);

  const riscosPorIni = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const a of acoes_risco) {
      if (a.status === 'cancelada' || !a.iniciativa_id || !a.risco_id) continue;
      const s = m.get(a.iniciativa_id) ?? new Set<string>();
      s.add(a.risco_id);
      m.set(a.iniciativa_id, s);
    }
    return m;
  }, [acoes_risco]);

  const filtradas = useMemo(() => {
    const q = busca.toLowerCase().trim();
    return iniciativas.filter(i => {
      if (idsDoRecorte && !idsDoRecorte.has(i.id)) return false;
      if (situacao === 'ativas' && !iniciativaAtiva(i)) return false;
      if (situacao === 'atencao' && !atencao.has(i.id)) return false;
      if (situacao !== 'todas' && situacao !== 'ativas' && situacao !== 'atencao' && i.status !== situacao) return false;
      if (objetivoFiltro && i.objetivo_id !== objetivoFiltro) return false;
      if (donoFiltro === 'sem' ? !!i.dono_id : donoFiltro && i.dono_id !== donoFiltro) return false;
      if (!q) return true;
      const obj = i.objetivo_id ? objetivoPorId.get(i.objetivo_id)?.descricao ?? '' : '';
      const dono = i.dono_id ? pessoaPorId.get(i.dono_id) ?? '' : '';
      return [i.nome, i.descricao, i.recurso, obj, dono].join(' ').toLowerCase().includes(q);
    });
  }, [iniciativas, idsDoRecorte, busca, situacao, objetivoFiltro, donoFiltro, atencao, objetivoPorId, pessoaPorId]);

  /** Grupos da lista. A ordem interna é sempre a da priorização — o que decide primeiro fica em cima. */
  const grupos = useMemo(() => {
    // `chave` viaja junto do grupo porque é ela que identifica: o `titulo` é
    // rótulo, e rótulo repete. Dois objetivos sem descrição preenchida viram
    // dois grupos distintos chamados "Sem objetivo", e usar o título como
    // `key` do React fazia os dois disputarem a mesma identidade — React
    // avisa, e pode duplicar ou omitir filhos.
    const acc = new Map<string, { chave: string; titulo: string; nota: string; itens: Iniciativa[] }>();

    for (const i of filtradas) {
      let chave: string;
      let titulo: string;
      if (agrupamento === 'objetivo') {
        chave = i.objetivo_id ?? '';
        const o = i.objetivo_id ? objetivoPorId.get(i.objetivo_id) : undefined;
        titulo = !o?.descricao || o.descricao === OBJETIVO_BALDE ? 'Sem objetivo vinculado' : o.descricao;
      } else if (agrupamento === 'origem') {
        chave = i.fonte;
        titulo = ROTULO_FONTE[i.fonte];
      } else {
        chave = i.dono_id ?? '';
        titulo = i.dono_id ? pessoaPorId.get(i.dono_id) ?? 'Dono removido' : 'Sem dono';
      }
      const g = acc.get(chave) ?? { chave, titulo, nota: '', itens: [] };
      g.itens.push(i);
      acc.set(chave, g);
    }

    const lista = [...acc.values()];
    for (const g of lista) {
      g.itens.sort((a, b) => {
        if (ordem === 'nome') return a.nome.localeCompare(b.nome, 'pt-BR');
        if (ordem === 'prazo') {
          const da = dataPlanoMarco(proximos.get(a.id)) || '9999';
          const db = dataPlanoMarco(proximos.get(b.id)) || '9999';
          if (da !== db) return da.localeCompare(db);
        }
        const pa = computePrioriz(a);
        const pb = computePrioriz(b);
        if (pa == null && pb == null) return a.nome.localeCompare(b.nome, 'pt-BR');
        if (pa == null) return 1;
        if (pb == null) return -1;
        return pb - pa;
      });
      const soma = g.itens.reduce((s, i) => s + (i.impacto_rs ?? 0), 0);
      g.nota = soma > 0 ? formatarMoeda(soma) : `${g.itens.length}`;
    }

    // Balde da migração por último; no resto, o grupo mais cheio primeiro.
    return lista.sort((a, b) => {
      const ba = a.titulo === 'Sem objetivo vinculado' ? 1 : 0;
      const bb = b.titulo === 'Sem objetivo vinculado' ? 1 : 0;
      if (ba !== bb) return ba - bb;
      return b.itens.length - a.itens.length;
    });
  }, [filtradas, agrupamento, objetivoPorId, pessoaPorId, ordem, proximos]);

  const atual = selecionada ? iniciativas.find(i => i.id === selecionada) ?? null : null;

  // A seleção pertence à URL; voltar para a lista não seleciona outro item.

  async function excluir(i: Iniciativa) {
    const presas = acoes_risco.filter(a => a.iniciativa_id === i.id).length;
    const aviso = presas > 0
      ? `Excluir "${i.nome}"? As ${plural(presas, 'ação vinculada volta', 'ações vinculadas voltam')} a ser mitigações autônomas dos riscos de origem, e os marcos são apagados.`
      : `Excluir "${i.nome}"? Os marcos dela são apagados junto.`;
    if (!window.confirm(aviso)) return;
    const ok = await deleteEntidade('iniciativas', i.id);
    if (ok) { setEditando(null); onSelecionar(null); }
  }

  if (loading && iniciativas.length === 0) {
    return (
      <div className="tab-page-lg iniciativas-page">
        <div className="app-loading" role="status" aria-label="Carregando iniciativas…">
          <div className="skeleton-table">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton-row" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-page-lg iniciativas-page">
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button className="error-banner-dismiss" onClick={clearError} aria-label="Fechar aviso">×</button>
        </div>
      )}

      <div className="page-bar" hidden={!!selecionada}>
        <div>
          <div className="page-title">Iniciativas</div>
          <div className="page-subtitle">
            {origem.deRisco.iniciativas} nasceram de risco · {origem.deOportunidade.iniciativas} de
            oportunidade · {plural(iniciativas.filter(iniciativaAtiva).length, 'ativa', 'ativas')}
          </div>
        </div>
        <div className="actions-row">
          <button
            className="btn btn-navy"
            onClick={() => setCriando(true)}
            disabled={objetivos.length === 0}
            title={objetivos.length === 0
              ? 'Cadastre um objetivo primeiro — iniciativa sem objetivo não é salva.'
              : undefined}
          >
            + Nova iniciativa
          </button>
        </div>
      </div>

      {!selecionada && iniciativas.length > 0 && (
        <KpiRow colunas={4}>
          <Kpi label="No portfólio" valor={saude.total} onClick={() => setSituacao('todas')} ativo={situacao === 'todas'} />
          <Kpi label="Ativas" valor={saude.ativas} sub="Aprovadas, em execução ou pausadas" acento="brand" onClick={() => setSituacao('ativas')} ativo={situacao === 'ativas'} />
          <Kpi label="Precisam de atenção" valor={atencao.size} sub="Ativas sem marco ou com marco vencido" acento="alto" onClick={() => setSituacao('atencao')} ativo={situacao === 'atencao'} />
          <Kpi label="Concluídas" valor={saude.concluidas} acento="baixo" onClick={() => setSituacao('concluida')} ativo={situacao === 'concluida'} />
        </KpiRow>
      )}

      {selecionada && (
        <div className="ini-page-detail">
          <div className="ini-back-bar">
            <button className="btn btn-ghost" onClick={() => onSelecionar(null)}>← Voltar ao portfólio</button>
            <h1 ref={tituloRef} tabIndex={-1}>Detalhe da iniciativa</h1>
          </div>
          {atual ? <IniciativaDetalhe
            key={atual.id} iniciativa={atual}
            objetivo={atual.objetivo_id ? objetivoPorId.get(atual.objetivo_id) ?? null : null}
            pessoas={pessoas} marcos={marcos} acoes={acoes_risco} riscos={riscos} pf={pf}
            onEditar={() => setEditando(atual)} onAbrirRisco={onAbrirRisco}
          /> : <div className="card"><EmptyState message="Iniciativa não encontrada" hint="Ela pode ter sido removida. Volte ao portfólio para consultar as iniciativas disponíveis." /></div>}
        </div>
      )}

      {!selecionada && (iniciativas.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="◇"
            message="Nenhuma iniciativa no portfólio"
            hint={objetivos.length === 0
              ? 'Cadastre um objetivo para vincular sua primeira iniciativa.'
              : 'Crie a primeira, ou extraia as que já existem dentro dos planos de ação pela Triagem.'}
            action={objetivos.length > 0
              ? { label: '+ Nova iniciativa', onClick: () => setCriando(true) }
              : undefined}
          />
        </div>
      ) : (
        <section className="ini-portfolio" aria-label="Portfólio de iniciativas">
          <div className="card ini-toolbar">
            <input className="search-input" aria-label="Buscar iniciativas" placeholder="Buscar por iniciativa, objetivo ou responsável…" value={busca} onChange={e => setBusca(e.target.value)} />
            <div className="ini-filters">
              <label>Objetivo<select value={objetivoFiltro} onChange={e => setObjetivoFiltro(e.target.value)}><option value="">Todos os objetivos</option>{objetivos.map(o => <option key={o.id} value={o.id}>{o.descricao === OBJETIVO_BALDE ? 'Sem objetivo vinculado' : o.descricao || 'Sem descrição'}</option>)}</select></label>
              <label>Responsável<select value={donoFiltro} onChange={e => setDonoFiltro(e.target.value)}><option value="">Todos os responsáveis</option><option value="sem">Sem responsável</option>{pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>
              <label>Situação<select value={situacao} onChange={e => setSituacao(e.target.value)}><option value="todas">Todas as situações</option><option value="ativas">Ativas</option><option value="atencao">Precisam de atenção</option>{Object.entries(ROTULO_STATUS_INICIATIVA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label>Ordenar por<select value={ordem} onChange={e => setOrdem(e.target.value)}><option value="prioridade">Maior prioridade</option><option value="prazo">Próximo prazo</option><option value="nome">Nome</option></select></label>
            </div>
            <div className="ini-list-controls">
              <div className="filter-pills" aria-label="Agrupar iniciativas">{AGRUPAMENTOS.map(a => <button key={a.chave} className={`filter-pill${agrupamento === a.chave ? ' active' : ''}`} aria-pressed={agrupamento === a.chave} onClick={() => setAgrupamento(a.chave)}>{a.label}</button>)}</div>
              <span role="status">{filtradas.length} de {iniciativas.length} iniciativas</span>
              <button className="btn btn-ghost" onClick={limparFiltros}>Limpar filtros</button>
            </div>
          </div>
          {grupos.length === 0 ? <div className="card"><EmptyState message="Nenhuma iniciativa com esses filtros" action={{ label: 'Limpar filtros', onClick: limparFiltros }} /></div> : grupos.map(g => {
            const chave = `${agrupamento}:${g.chave}`;
            const fechado = recolhidos.includes(chave);
            return <section className="card ini-portfolio-group" key={chave}>
              <button className="ini-group-toggle" aria-expanded={!fechado} onClick={() => setRecolhidos(fechado ? recolhidos.filter(k => k !== chave) : [...recolhidos, chave])}>
                <span aria-hidden="true">{fechado ? '›' : '⌄'}</span><h2>{g.titulo}</h2><span>{plural(g.itens.length, 'iniciativa', 'iniciativas')}</span>
              </button>
              {!fechado && <>
                <div className="ini-portfolio-columns" aria-hidden="true"><span>Iniciativa / objetivo</span><span>Responsável</span><span>Situação</span><span>Próximo marco</span><span>Prioridade</span><span /></div>
                {g.itens.map(i => {
                  const p = computePrioriz(i);
                  const marco = proximos.get(i.id);
                  const cobertos = riscosPorIni.get(i.id)?.size ?? 0;
                  const obj = i.objetivo_id ? objetivoPorId.get(i.objetivo_id)?.descricao : null;
                  return <div className="ini-portfolio-row" key={i.id}>
                    <div className="ini-row-title"><button id={`iniciativa-${i.id}`} className="ini-open" onClick={() => abrir(i.id)}>{i.nome || 'Iniciativa sem nome'}</button><span>{obj && obj !== OBJETIVO_BALDE ? obj : 'Sem objetivo vinculado'}</span><small>{ROTULO_FONTE[i.fonte]} · {plural(cobertos, 'risco vinculado', 'riscos vinculados')}</small>{(!obj || obj === OBJETIVO_BALDE) && <button className="link-ini ini-assign" onClick={() => setEditando(i)}>Vincular objetivo</button>}</div>
                    <div className="ini-row-cell" data-label="Responsável">{i.dono_id ? pessoaPorId.get(i.dono_id) ?? 'Responsável removido' : 'Sem responsável'}</div>
                    <div className="ini-row-cell" data-label="Situação"><span className="badge" data-badge={BADGE_STATUS_INICIATIVA[i.status]}>{ROTULO_STATUS_INICIATIVA[i.status]}</span></div>
                    <div className="ini-row-cell" data-label="Próximo marco"><span>{marco?.nome || (marcosPorIniciativa.get(i.id) ? 'Sem marco pendente' : 'Sem marco definido')}</span>{marco && <small>{formatarData(dataPlanoMarco(marco))}</small>}{atencao.has(i.id) && <span className="badge" data-badge="amber">{saude.atrasadas.some(a => a.id === i.id) ? 'Marco vencido' : 'Sem marco'}</span>}</div>
                    <div className="ini-row-cell" data-label="Prioridade" title="Impacto ÷ esforço + gravidade. Quanto maior, maior a prioridade.">{p == null ? 'Não avaliada' : <span className="tier-chip" data-tier={priorizTier(p)}>{String(round2(p)).replace('.', ',')}</span>}</div>
                    <button className="ini-row-arrow" aria-label={`Abrir ${i.nome || 'iniciativa sem nome'}`} onClick={() => abrir(i.id)}>↗</button>
                  </div>;
                })}
              </>}
            </section>;
          })}
        </section>
      ))}

      {(criando || novoObjetivoId) && (
        <IniciativaModal
          objetivos={objetivos}
          pessoas={pessoas}
          qtdMarcos={0}
          objetivoInicial={novoObjetivoId} erro={error}
          onSalvar={dados => createEntidade('iniciativas', dados)}
          onClose={() => { setCriando(false); onNovaIniciativaFechada?.(); }}
        />
      )}

      {editando && (
        <IniciativaModal
          key={editando.id}
          iniciativa={editando}
          objetivos={objetivos}
          pessoas={pessoas}
          qtdMarcos={marcosPorIniciativa.get(editando.id) ?? 0}
          erro={error} onSalvar={dados => patchEntidade('iniciativas', editando.id, dados, editando.version)}
          onExcluir={() => { void excluir(editando); }}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}
