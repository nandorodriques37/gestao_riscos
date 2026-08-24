import { useEffect, useMemo, useRef, useState } from 'react';
import type { Iniciativa, StoredRiskRecord } from '../../types';
import type { UsePortfolio } from '../../hooks/usePortfolio';
import { computePrioriz, priorizTier, round2 } from '../../lib/calculations';
import { portfolioPorOrigem, iniciativaAtiva, saudeIniciativas } from '../../lib/portfolioMetrics';
import {
  ROTULO_FONTE, ROTULO_STATUS_INICIATIVA, BADGE_STATUS_INICIATIVA,
  formatarMoeda, plural,
} from '../../lib/portfolioLabels';
import { OBJETIVO_BALDE } from '../../lib/portfolioUi';
import { EmptyState } from '../common/EmptyState';
import { Kpi, KpiRow } from '../common/Kpi';
import { IniciativaDetalhe } from './IniciativaDetalhe';
import { IniciativaModal } from './IniciativaModal';

interface IniciativasTabProps {
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
  { chave: 'dono', label: 'Por dono' },
];

/**
 * Abaixo disto a aba deixa de mostrar índice e detalhe juntos e vira lista →
 * detalhe. Tem de casar com a faixa de celular de `styles/responsive.css` e a
 * regra de `.ini-layout[data-detalhe]` em `styles/portfolio.css` — é o único
 * ponto do componente que precisa saber a largura, e ele precisa porque a
 * escolha automática da primeira iniciativa só faz sentido quando as duas
 * metades cabem na tela ao mesmo tempo.
 */
const LARGURA_EMPILHADO = 760;

export function IniciativasTab({
  riscos, pf, selecionada, onSelecionar, onAbrirRisco,
}: IniciativasTabProps) {
  const { portfolio, loading, error, clearError, createEntidade, patchEntidade, deleteEntidade } = pf;
  const { objetivos, iniciativas, marcos, acoes_risco, pessoas } = portfolio;

  const [agrupamento, setAgrupamento] = useState<Agrupamento>('objetivo');
  const [busca, setBusca] = useState('');
  const [soAtivas, setSoAtivas] = useState(false);
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<Iniciativa | null>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  const objetivoPorId = useMemo(() => new Map(objetivos.map(o => [o.id, o])), [objetivos]);
  const pessoaPorId = useMemo(() => new Map(pessoas.map(p => [p.id, p.nome])), [pessoas]);
  const origem = useMemo(() => portfolioPorOrigem(iniciativas), [iniciativas]);
  const saude = useMemo(() => saudeIniciativas(iniciativas, marcos), [iniciativas, marcos]);

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
      if (!a.iniciativa_id || !a.risco_id) continue;
      const s = m.get(a.iniciativa_id) ?? new Set<string>();
      s.add(a.risco_id);
      m.set(a.iniciativa_id, s);
    }
    return m;
  }, [acoes_risco]);

  const filtradas = useMemo(() => {
    const q = busca.toLowerCase().trim();
    return iniciativas.filter(i => {
      if (soAtivas && !iniciativaAtiva(i)) return false;
      if (!q) return true;
      const obj = i.objetivo_id ? objetivoPorId.get(i.objetivo_id)?.descricao ?? '' : '';
      const dono = i.dono_id ? pessoaPorId.get(i.dono_id) ?? '' : '';
      return [i.nome, i.descricao, i.recurso, obj, dono].join(' ').toLowerCase().includes(q);
    });
  }, [iniciativas, busca, soAtivas, objetivoPorId, pessoaPorId]);

  /** Grupos da lista. A ordem interna é sempre a da priorização — o que decide primeiro fica em cima. */
  const grupos = useMemo(() => {
    const acc = new Map<string, { titulo: string; nota: string; itens: Iniciativa[] }>();

    for (const i of filtradas) {
      let chave: string;
      let titulo: string;
      if (agrupamento === 'objetivo') {
        chave = i.objetivo_id ?? '';
        const o = i.objetivo_id ? objetivoPorId.get(i.objetivo_id) : undefined;
        titulo = o?.descricao || 'Sem objetivo';
      } else if (agrupamento === 'origem') {
        chave = i.fonte;
        titulo = ROTULO_FONTE[i.fonte];
      } else {
        chave = i.dono_id ?? '';
        titulo = i.dono_id ? pessoaPorId.get(i.dono_id) ?? 'Dono removido' : 'Sem dono';
      }
      const g = acc.get(chave) ?? { titulo, nota: '', itens: [] };
      g.itens.push(i);
      acc.set(chave, g);
    }

    const lista = [...acc.values()];
    for (const g of lista) {
      g.itens.sort((a, b) => {
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
      const ba = a.titulo === OBJETIVO_BALDE ? 1 : 0;
      const bb = b.titulo === OBJETIVO_BALDE ? 1 : 0;
      if (ba !== bb) return ba - bb;
      return b.itens.length - a.itens.length;
    });
  }, [filtradas, agrupamento, objetivoPorId, pessoaPorId]);

  const atual = selecionada ? iniciativas.find(i => i.id === selecionada) ?? null : null;

  // Seleciona a primeira ao abrir, e recupera a seleção quando a escolhida some
  // (excluída em outra aba, ou filtrada para fora da lista).
  //
  // NÃO no celular. Lá o layout é lista → detalhe: com seleção, o índice sai de
  // cena (ver styles/portfolio.css). Escolher sozinho jogaria a pessoa direto
  // num detalhe que ela não pediu, e — pior — o botão "‹ Todas" viraria um
  // no-op, porque zerar a seleção dispararia este efeito de volta na hora.
  //
  // Em tela larga as duas metades convivem e um detalhe vazio é só espaço
  // desperdiçado, então lá a escolha automática continua certa.
  useEffect(() => {
    if (iniciativas.length === 0) return;
    if (atual) return;
    if (window.matchMedia(`(max-width: ${LARGURA_EMPILHADO}px)`).matches) return;
    const primeira = grupos[0]?.itens[0];
    if (primeira) onSelecionar(primeira.id);
  }, [iniciativas.length, atual, grupos, onSelecionar]);

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
      <div className="tab-page-lg">
        <div className="app-loading" role="status" aria-label="Carregando iniciativas…">
          <div className="skeleton-table">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton-row" />)}
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

      {iniciativas.length > 0 && (
        <KpiRow>
          <Kpi label="No portfólio" valor={saude.total} acento="brand" />
          <Kpi label="Concluídas" valor={saude.concluidas} acento="baixo" />
          <Kpi
            label="Ativas"
            valor={saude.ativas}
            sub="aprovada, em execução ou pausada"
            acento="alto"
          />
          <Kpi
            label="Sem marco"
            valor={saude.semMarco.length}
            sub="ativas, sem entrega verificável"
            acento={saude.semMarco.length > 0 ? 'medio' : 'null'}
          />
          <Kpi
            label="Com marco vencido"
            valor={saude.atrasadas.length}
            acento={saude.atrasadas.length > 0 ? 'critico' : 'null'}
          />
        </KpiRow>
      )}

      {iniciativas.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="◇"
            message="Nenhuma iniciativa no portfólio"
            hint={objetivos.length === 0
              ? 'Cadastre um objetivo primeiro: toda iniciativa pendura em um, e o servidor recusa as que não penduram.'
              : 'Crie a primeira, ou extraia as que já existem dentro dos planos de ação pela Triagem.'}
            action={objetivos.length > 0
              ? { label: '+ Nova iniciativa', onClick: () => setCriando(true) }
              : undefined}
          />
        </div>
      ) : (
        // `data-detalhe` diz ao CSS que há uma iniciativa aberta. No celular
        // (≤760px) é o que faz o índice sair de cena e o detalhe ocupar a tela
        // — lista → detalhe, sem rolagem dentro de rolagem. Acima disso os dois
        // convivem e o atributo não muda nada.
        <div className="ini-layout" data-detalhe={atual ? 'true' : undefined}>
          <div className="card card-col ini-lista" ref={listaRef}>
            <div className="ini-lista-topo">
              <span className="ini-lista-titulo">Lista de iniciativas</span>
              <span className="ini-lista-conta">
                {filtradas.length === iniciativas.length
                  ? plural(iniciativas.length, 'iniciativa', 'iniciativas')
                  : `${filtradas.length} de ${iniciativas.length}`}
              </span>
            </div>

            <input
              className="search-input"
              placeholder="Buscar iniciativa…"
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />

            <div className="filter-pills">
              {AGRUPAMENTOS.map(a => (
                <button
                  key={a.chave}
                  className={`filter-pill${agrupamento === a.chave ? ' active' : ''}`}
                  onClick={() => setAgrupamento(a.chave)}
                >
                  {a.label}
                </button>
              ))}
            </div>

            <label className="ini-meta" style={{ marginTop: 0, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={soAtivas}
                onChange={e => setSoAtivas(e.target.checked)}
              />
              Só as ativas
            </label>

            {grupos.length === 0 ? (
              <div className="bento-sub">Nenhuma iniciativa com esses filtros.</div>
            ) : (
              grupos.map(g => (
                <div key={g.titulo}>
                  <div className="fato-label ini-grupo-label">
                    {g.titulo} · {g.nota}
                  </div>
                  {g.itens.map(i => {
                    const p = computePrioriz(i);
                    const cobertos = riscosPorIni.get(i.id)?.size ?? 0;
                    return (
                      <button
                        key={i.id}
                        className="ini-linha"
                        data-ativa={i.id === selecionada}
                        onClick={() => onSelecionar(i.id)}
                      >
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span className="ini-nome">{i.nome || 'Iniciativa sem nome'}</span>
                          <span className="ini-meta">
                            <span className="badge" data-badge={BADGE_STATUS_INICIATIVA[i.status]}>
                              {ROTULO_STATUS_INICIATIVA[i.status]}
                            </span>
                            {marcosPorIniciativa.get(i.id) ? (
                              <span>{plural(marcosPorIniciativa.get(i.id) ?? 0, 'marco', 'marcos')}</span>
                            ) : (
                              <span>sem marco</span>
                            )}
                            {cobertos > 0 && <span>· cobre {cobertos}</span>}
                          </span>
                        </span>
                        {p != null && (
                          <span className="tier-chip" data-tier={priorizTier(p)}>
                            <span className="tier-dot" aria-hidden="true" />
                            {String(round2(p)).replace('.', ',')}
                          </span>
                        )}
                        <span className="ini-chevron" aria-hidden="true">›</span>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {atual ? (
            <div className="ini-detalhe">
              {/* Cabeçalho do detalhe: onde a lista acaba e uma iniciativa só começa.
                  Empilhado, é ele que ainda diz de quem é o que está na tela. */}
              <div className="ini-detalhe-topo">
                <span className="ini-detalhe-marca" aria-hidden="true" />
                <span className="ini-detalhe-kicker">Detalhe</span>
                <span className="ini-detalhe-nome">{atual.nome || 'Iniciativa sem nome'}</span>
                {/* Dois botões porque são duas ações diferentes, não duas
                    aparências da mesma: entre 761 e 1280px a lista está na
                    tela e o botão leva o olho até ela; a ≤760px ela não está
                    montada em cena, e voltar é desfazer a seleção. Qual dos
                    dois aparece é decidido no CSS, como o resto das faixas. */}
                <button
                  className="btn btn-ghost ini-voltar"
                  onClick={() => listaRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })}
                >
                  ↑ Lista
                </button>
                <button
                  className="btn btn-ghost ini-voltar-lista"
                  onClick={() => onSelecionar(null)}
                >
                  ‹ Todas
                </button>
              </div>

              <IniciativaDetalhe
                key={atual.id}
                iniciativa={atual}
                objetivo={atual.objetivo_id ? objetivoPorId.get(atual.objetivo_id) ?? null : null}
                pessoas={pessoas}
                marcos={marcos}
                acoes={acoes_risco}
                riscos={riscos}
                pf={pf}
                onEditar={() => setEditando(atual)}
                onAbrirRisco={onAbrirRisco}
              />
            </div>
          ) : (
            <div className="card ini-detalhe-vazio">
              <EmptyState
                icon="›"
                message="Escolha uma iniciativa na lista"
                hint="O detalhe traz a trilha de marcos, a origem e os riscos que ela cobre hoje."
              />
            </div>
          )}
        </div>
      )}

      {criando && (
        <IniciativaModal
          objetivos={objetivos}
          pessoas={pessoas}
          qtdMarcos={0}
          onSalvar={dados => createEntidade('iniciativas', dados)}
          onClose={() => setCriando(false)}
        />
      )}

      {editando && (
        <IniciativaModal
          key={editando.id}
          iniciativa={editando}
          objetivos={objetivos}
          pessoas={pessoas}
          qtdMarcos={marcosPorIniciativa.get(editando.id) ?? 0}
          onSalvar={dados => patchEntidade('iniciativas', editando.id, dados)}
          onExcluir={() => { void excluir(editando); }}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}
