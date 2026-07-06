import { useState } from 'react';

const NOTAS = [
  { nota: 5, gravidade: 'Extremamente grave', urgencia: 'Ação imediata', tendencia: 'Piora muito rápido' },
  { nota: 4, gravidade: 'Muito grave', urgencia: 'Curtíssimo prazo', tendencia: 'Piora em breve' },
  { nota: 3, gravidade: 'Grave', urgencia: 'O quanto antes', tendencia: 'Piora no médio prazo' },
  { nota: 2, gravidade: 'Pouco grave', urgencia: 'Pode aguardar', tendencia: 'Piora no longo prazo' },
  { nota: 1, gravidade: 'Sem gravidade', urgencia: 'Sem pressa', tendencia: 'Não muda' },
];

const FAIXAS = [
  { label: 'Crítica', faixa: '100 – 125', cor: '#DC2626' },
  { label: 'Alta', faixa: '60 – 99', cor: '#D97706' },
  { label: 'Média', faixa: '30 – 59', cor: '#B8901F' },
  { label: 'Baixa', faixa: '1 – 29', cor: '#15803D' },
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
            {FAIXAS.map(f => (
              <span key={f.label} className="score-badge" style={{ background: f.cor }}>
                {f.label} · {f.faixa}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
