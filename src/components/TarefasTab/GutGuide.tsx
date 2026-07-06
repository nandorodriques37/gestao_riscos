import { useState } from 'react';
import { TIER_CHIP_COLORS } from '../../lib/calculations';
import type { TierKind } from '../../lib/calculations';

const NOTAS = [
  { nota: 5, gravidade: 'Extremamente grave', urgencia: 'Ação imediata', tendencia: 'Piora muito rápido' },
  { nota: 4, gravidade: 'Muito grave', urgencia: 'Curtíssimo prazo', tendencia: 'Piora em breve' },
  { nota: 3, gravidade: 'Grave', urgencia: 'O quanto antes', tendencia: 'Piora no médio prazo' },
  { nota: 2, gravidade: 'Pouco grave', urgencia: 'Pode aguardar', tendencia: 'Piora no longo prazo' },
  { nota: 1, gravidade: 'Sem gravidade', urgencia: 'Sem pressa', tendencia: 'Não muda' },
];

const FAIXAS: { label: string; faixa: string; tier: TierKind }[] = [
  { label: 'Crítica', faixa: '100 – 125', tier: 'critico' },
  { label: 'Alta', faixa: '60 – 99', tier: 'alto' },
  { label: 'Média', faixa: '30 – 59', tier: 'medio' },
  { label: 'Baixa', faixa: '1 – 29', tier: 'baixo' },
];

export function GutGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="gut-guide">
      <button className="btn btn-ghost" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        ? Guia GUT
      </button>
      {open && (
        <div className="gut-guide-panel" role="dialog" aria-label="Guia da Matriz GUT">
          <div className="gut-guide-header">
            <div className="gut-guide-title">Como pontuar (1 a 5)</div>
            <button className="modal-close" onClick={() => setOpen(false)}>×</button>
          </div>
          <p className="gut-guide-intro">
            Pontue cada tarefa de 1 a 5 nos três critérios. GUT = G × U × T (mín. 1, máx. 125). Quanto maior, mais prioritário.
          </p>
          <table className="gut-guide-table">
            <thead>
              <tr>
                <th>Nota</th>
                <th>Gravidade</th>
                <th>Urgência</th>
                <th>Tendência</th>
              </tr>
            </thead>
            <tbody>
              {NOTAS.map(n => (
                <tr key={n.nota}>
                  <td className="center">{n.nota}</td>
                  <td>{n.gravidade}</td>
                  <td>{n.urgencia}</td>
                  <td>{n.tendencia}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="gut-guide-title" style={{ marginTop: 14 }}>Faixas de prioridade</div>
          <div className="gut-guide-faixas">
            {FAIXAS.map(f => {
              const chip = TIER_CHIP_COLORS[f.tier];
              return (
                <span key={f.label} className="tier-chip" style={{ background: chip.bg, color: chip.fg }}>
                  <span className="tier-dot" style={{ background: chip.dot }} />
                  {f.label} · {f.faixa}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
