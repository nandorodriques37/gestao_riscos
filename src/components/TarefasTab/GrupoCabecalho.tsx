import type { GrupoDono } from '../../lib/agrupamentoDono';
import { initials } from '../../lib/taskRows';
import { plural } from '../../lib/portfolioLabels';

interface GrupoCabecalhoProps {
  grupo: GrupoDono;
  aberto: boolean;
  onToggle: () => void;
  /** id do bloco que o botão abre e fecha, para `aria-controls`. */
  controla: string;
}

/**
 * Cabeçalho de um grupo da Lista — o mesmo na tabela e nos cartões do celular.
 *
 * O número é o de linhas NA TELA ("8 tarefas"), não o de abertas: o filtro de
 * status pode mostrar concluídas, e o cabeçalho tem de bater com o que está
 * embaixo dele. Atrasadas e GUT crítico são trabalho aberto por definição.
 */
export function GrupoCabecalho({ grupo, aberto, onToggle, controla }: GrupoCabecalhoProps) {
  const { nome, semDono, inativa, linhas, atrasadas, criticas, aFazer, emAndamento, concluidas } = grupo;
  const status = [
    { chave: 'fazer', n: aFazer, rotulo: 'a fazer' },
    { chave: 'andamento', n: emAndamento, rotulo: 'em andamento' },
    { chave: 'concluida', n: concluidas, rotulo: concluidas === 1 ? 'concluída' : 'concluídas' },
  ];
  const composicao = status.filter(s => s.n > 0);

  return (
    <button
      type="button"
      className="grupo-cabecalho"
      aria-expanded={aberto}
      aria-controls={controla}
      onClick={onToggle}
    >
      <span className="grupo-seta" aria-hidden="true">{aberto ? '▾' : '▸'}</span>
      <span className="grupo-avatar" data-sem-dono={semDono || undefined} aria-hidden="true">
        {semDono ? '?' : initials(nome)}
      </span>
      <span className="grupo-nome" data-sem-dono={semDono || undefined}>{nome}</span>
      {inativa && <span className="badge" data-badge="neutro">inativa</span>}
      <span className="grupo-qtd tabular">{plural(linhas.length, 'tarefa', 'tarefas')}</span>

      <span className="grupo-alertas">
        {atrasadas > 0 && (
          <span className="badge tabular" data-badge="risco">{plural(atrasadas, 'atrasada', 'atrasadas')}</span>
        )}
        {criticas > 0 && (
          <span className="tier-chip tabular" data-tier="critico">
            <span className="tier-dot" />
            {criticas} GUT crítico
          </span>
        )}
        {atrasadas === 0 && criticas === 0 && aFazer + emAndamento > 0 && (
          <span className="badge" data-badge="ok">Nada atrasado</span>
        )}
      </span>

      {composicao.length > 0 && (
        <span className="grupo-status">
          <span className="grupo-status-barra" aria-hidden="true">
            {composicao.map(s => (
              <span key={s.chave} data-status={s.chave} style={{ flexGrow: s.n }} />
            ))}
          </span>
          <span className="grupo-status-legenda tabular">
            {composicao.map(s => `${s.n} ${s.rotulo}`).join(' · ')}
          </span>
        </span>
      )}
    </button>
  );
}
