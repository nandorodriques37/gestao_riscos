import { useState } from 'react';
import type { Iniciativa, Objetivo, Pessoa } from '../../types';
import { chaveDoNome } from '../../lib/nomes';
import { ROTULO_STATUS_INICIATIVA } from '../../lib/portfolioLabels';
export function IniciativaPicker({ iniciativas, objetivos, pessoas, value, onChange }: {
  iniciativas: Iniciativa[]; objetivos: Objetivo[]; pessoas: Pessoa[]; value: string | null; onChange: (id: string | null) => void;
}) {
  const [busca, setBusca] = useState(''), [limit, setLimit] = useState(20);
  const matches = iniciativas.filter(i => {
    if (i.id !== value && (i.status === 'cancelada' || i.status === 'concluida')) return false;
    const obj = objetivos.find(o => o.id === i.objetivo_id)?.descricao ?? '';
    return chaveDoNome(i.nome + ' ' + obj).includes(chaveDoNome(busca));
  });
  return <div className="iniciativa-picker">
    <input className="modal-input" type="search" aria-label="Buscar iniciativa" placeholder="Buscar por iniciativa ou objetivo…"
      value={busca} onChange={e => { setBusca(e.target.value); setLimit(20); }} />
    <div className="picker-lista" role="group" aria-label="Iniciativas disponíveis">
      <button type="button" className="picker-opcao" aria-pressed={value === null} onClick={() => onChange(null)}>Sem iniciativa · ação autônoma</button>
      {matches.slice(0, limit).map(i => <button type="button" key={i.id} className="picker-opcao" aria-pressed={value === i.id} onClick={() => onChange(i.id)}>
        <strong>{i.nome || 'Iniciativa sem nome'}</strong>
        <span>{objetivos.find(o => o.id === i.objetivo_id)?.descricao || 'Sem objetivo'}</span>
        <small>{ROTULO_STATUS_INICIATIVA[i.status]} · {pessoas.find(p => p.id === i.dono_id)?.nome || 'Sem responsável'}</small>
      </button>)}
      {!matches.length && <p className="muted">Nenhuma iniciativa encontrada.</p>}
    </div>
    {matches.length > limit && <button type="button" className="btn btn-ghost" onClick={() => setLimit(l => l + 20)}>Mostrar mais ({matches.length - limit})</button>}
  </div>;
}
