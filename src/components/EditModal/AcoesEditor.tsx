import { useRef } from 'react';
import type { AcaoItem } from '../../types';
import { ACAO_STATUSES } from '../../types';
import { acaoAtrasada, novaAcao } from '../../lib/acoes';

interface AcoesEditorProps {
  itens: AcaoItem[];
  onChange: (itens: AcaoItem[]) => void;
  /** Id do <datalist> de responsáveis já declarado pelo modal. */
  responsavelListId: string;
}

/**
 * Lista editável do plano de ação: cada linha tem o que fazer, quem faz, até
 * quando e em que pé está. Controlado — o rascunho vive no EditModal, que grava
 * tudo de uma vez no Salvar.
 */
export function AcoesEditor({ itens, onChange, responsavelListId }: AcoesEditorProps) {
  // Guarda o id da linha recém-criada para focar sua descrição assim que o
  // React a montar (o botão de adicionar fica abaixo da lista).
  const novoIdRef = useRef<string | null>(null);

  function patchItem(id: string, patch: Partial<AcaoItem>) {
    onChange(itens.map(i => (i.id === id ? { ...i, ...patch } : i)));
  }

  function removeItem(id: string) {
    onChange(itens.filter(i => i.id !== id));
  }

  function addItem() {
    const item = novaAcao();
    novoIdRef.current = item.id;
    onChange([...itens, item]);
  }

  function focarSeNovo(el: HTMLInputElement | null, id: string) {
    if (el && novoIdRef.current === id) {
      novoIdRef.current = null;
      el.focus();
    }
  }

  return (
    <div className="acoes-list">
      {itens.length > 0 && (
        <div className="acoes-head" aria-hidden="true">
          <span>Ação</span>
          <span>Responsável</span>
          <span>Prazo</span>
          <span>Status</span>
          <span />
        </div>
      )}

      {itens.map((item, i) => {
        const atrasada = acaoAtrasada(item);
        return (
          <div className="acao-row" key={item.id}>
            <input
              className="modal-input"
              ref={el => focarSeNovo(el, item.id)}
              aria-label={`Ação ${i + 1}`}
              placeholder="O que será feito"
              value={item.descricao}
              onChange={e => patchItem(item.id, { descricao: e.target.value })}
            />
            <input
              className="modal-input"
              list={responsavelListId}
              aria-label={`Responsável pela ação ${i + 1}`}
              placeholder="Quem"
              value={item.responsavel}
              onChange={e => patchItem(item.id, { responsavel: e.target.value })}
            />
            <div className="acao-prazo">
              <input
                className="modal-input"
                type="date"
                aria-label={`Prazo da ação ${i + 1}`}
                value={item.prazo}
                onChange={e => patchItem(item.id, { prazo: e.target.value })}
              />
              {atrasada && <span className="badge" data-badge="red">Atrasado</span>}
            </div>
            <select
              className="modal-input"
              aria-label={`Status da ação ${i + 1}`}
              value={item.status}
              onChange={e => patchItem(item.id, { status: e.target.value as AcaoItem['status'] })}
            >
              {ACAO_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button
              type="button"
              className="delete-btn"
              aria-label={`Remover ação ${i + 1}`}
              title="Remover ação"
              onClick={() => removeItem(item.id)}
            >
              ×
            </button>
          </div>
        );
      })}

      {itens.length === 0 && (
        <div className="acoes-empty">Nenhuma ação cadastrada.</div>
      )}

      <button type="button" className="acoes-add" onClick={addItem}>+ Adicionar ação</button>
    </div>
  );
}
