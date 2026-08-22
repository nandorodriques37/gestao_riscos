import { useRef } from 'react';
import type { Iniciativa } from '../../types';
import { ROTULO_STATUS_ACAO, ROTULO_STATUS_INICIATIVA } from '../../lib/portfolioLabels';
import {
  linhaAtrasada, linhaVazia, STATUS_EDITAVEIS, type LinhaPlano,
} from '../../lib/planoDeAcao';

interface AcoesEditorProps {
  linhas: LinhaPlano[];
  onChange: (linhas: LinhaPlano[]) => void;
  /** Id do <datalist> de responsáveis já declarado pelo modal. */
  responsavelListId: string;
  /** Para mostrar dentro de qual iniciativa cada mitigação é executada. */
  iniciativas: Iniciativa[];
  onAbrirIniciativa: (id: string) => void;
  /** Promover uma mitigação autônoma a iniciativa. */
  onPromover: (linha: LinhaPlano) => void;
}

/**
 * Lista editável do plano de ação. Cada ação é um cartão com o que fazer, quem
 * faz, até quando, em que pé está — e, agora, para onde ela foi: autônoma, ou
 * executada dentro de uma iniciativa.
 *
 * O plano vive só em `acoes_risco`. Antes existia uma segunda cópia dentro do
 * próprio registro de risco, e este editor mexia nela enquanto o Rastro e as
 * métricas liam a outra. Continua sendo rascunho: nada vai ao servidor até o
 * modal salvar.
 */
export function AcoesEditor({
  linhas, onChange, responsavelListId, iniciativas, onAbrirIniciativa, onPromover,
}: AcoesEditorProps) {
  // Guarda o id da linha recém-criada para focar sua descrição assim que o
  // React a montar (o botão de adicionar fica abaixo da lista).
  const novoIdRef = useRef<string | null>(null);
  const iniciativaPorId = new Map(iniciativas.map(i => [i.id, i]));

  function patchLinha(id: string, patch: Partial<LinhaPlano>) {
    onChange(linhas.map(l => (l.id === id ? { ...l, ...patch } : l)));
  }

  /**
   * Remover uma mitigação que está dentro de uma iniciativa deixa a iniciativa
   * sem cobrir aquele risco — e em silêncio, se ninguém avisar. Avisa, mas não
   * bloqueia: travar prenderia o usuário a uma linha errada.
   */
  function removeLinha(linha: LinhaPlano) {
    const ini = linha.iniciativa_id ? iniciativaPorId.get(linha.iniciativa_id) : undefined;
    if (ini && !window.confirm(
      `Esta mitigação é executada dentro de "${ini.nome || 'iniciativa sem nome'}".\n\n`
      + 'Removendo-a, a iniciativa deixa de cobrir este risco — e o risco volta a contar '
      + 'como sem tratamento, se não sobrar nenhuma outra ação.\n\n'
      + 'Se a ideia é só marcar que ela foi abandonada, use o status "Cancelada" no lugar.',
    )) return;
    onChange(linhas.filter(l => l.id !== linha.id));
  }

  function addLinha() {
    const nova = linhaVazia();
    novoIdRef.current = nova.id;
    onChange([...linhas, nova]);
  }

  function focarSeNovo(el: HTMLTextAreaElement | null, id: string) {
    if (el && novoIdRef.current === id) {
      novoIdRef.current = null;
      el.focus();
    }
  }

  return (
    <div className="acoes-list">
      {linhas.map((linha, i) => {
        const atrasada = linhaAtrasada(linha);
        const ini = linha.iniciativa_id ? iniciativaPorId.get(linha.iniciativa_id) : undefined;
        return (
          <div className="acao-card" key={linha.id} data-em-iniciativa={Boolean(ini)}>
            <div className="acao-card-head">
              <span className="acao-card-title">Ação {i + 1}</span>
              <button
                type="button"
                className="delete-btn"
                aria-label={`Remover ação ${i + 1}`}
                title="Remover ação"
                onClick={() => removeLinha(linha)}
              >
                ×
              </button>
            </div>

            <textarea
              className="modal-textarea acao-descricao"
              rows={2}
              ref={el => focarSeNovo(el, linha.id)}
              aria-label={`Ação ${i + 1}`}
              placeholder="O que será feito"
              value={linha.descricao}
              onChange={e => patchLinha(linha.id, { descricao: e.target.value })}
            />

            <div className="modal-grid-3">
              <div>
                <div className="modal-field-label">Responsável</div>
                <input
                  className="modal-input"
                  list={responsavelListId}
                  aria-label={`Responsável pela ação ${i + 1}`}
                  placeholder="Quem"
                  value={linha.dono}
                  onChange={e => patchLinha(linha.id, { dono: e.target.value })}
                />
              </div>
              <div>
                <div className="modal-field-label">Prazo</div>
                <div className="acao-prazo">
                  <input
                    className="modal-input"
                    type="date"
                    aria-label={`Prazo da ação ${i + 1}`}
                    value={linha.prazo}
                    onChange={e => patchLinha(linha.id, { prazo: e.target.value })}
                  />
                  {atrasada && <span className="badge" data-badge="red">Atrasado</span>}
                </div>
              </div>
              <div>
                <div className="modal-field-label">Status</div>
                <select
                  className="modal-input"
                  aria-label={`Status da ação ${i + 1}`}
                  value={linha.status || 'aberta'}
                  onChange={e => patchLinha(linha.id, { status: e.target.value as LinhaPlano['status'] })}
                >
                  {STATUS_EDITAVEIS.map(s => (
                    <option key={s} value={s}>{ROTULO_STATUS_ACAO[s]}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Para onde a mitigação foi. É a informação que o plano em texto
                nunca teve, e a que explica o estado de tratamento do risco. */}
            <div className="acao-destino">
              {ini ? (
                <>
                  <span>dentro de</span>
                  <button type="button" className="link-ini" onClick={() => onAbrirIniciativa(ini.id)}>
                    {ini.nome || 'Iniciativa sem nome'}
                  </button>
                  <span className="muted">· {ROTULO_STATUS_INICIATIVA[ini.status]}</span>
                </>
              ) : linha.nova ? (
                <span className="muted">
                  Mitigação nova — salve para poder promovê-la a iniciativa.
                </span>
              ) : (
                <>
                  <span className="muted">mitigação autônoma</span>
                  <button type="button" className="link-ini" onClick={() => onPromover(linha)}>
                    promover a iniciativa
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}

      {linhas.length === 0 && (
        <div className="acoes-empty">Nenhuma ação cadastrada.</div>
      )}

      <button type="button" className="acoes-add" onClick={addLinha}>+ Adicionar ação</button>
    </div>
  );
}
