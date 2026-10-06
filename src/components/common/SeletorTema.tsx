import type { ThemePref } from '../../lib/uiPrefs';

/**
 * Tema em três segmentos escritos — Claro, Escuro, Sistema.
 *
 * Substitui o botão que ciclava entre os três: quem estava no claro e queria o
 * escuro clicava uma vez, mas quem queria seguir o sistema clicava duas e não
 * via o que cada clique fazia. Com os três à vista a escolha é direta e o
 * estado é legível sem ícone — o que também dispensa o desenho em CSS que
 * existia porque nenhum glifo de sol e lua cabia na fonte.
 */
const OPCOES: { valor: ThemePref; rotulo: string }[] = [
  { valor: 'light', rotulo: 'Claro' },
  { valor: 'dark', rotulo: 'Escuro' },
  { valor: 'system', rotulo: 'Sistema' },
];

interface SeletorTemaProps {
  theme: ThemePref;
  onTheme: (pref: ThemePref) => void;
}

export function SeletorTema({ theme, onTheme }: SeletorTemaProps) {
  return (
    <div className="seletor-tema" role="radiogroup" aria-label="Tema">
      {OPCOES.map(o => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={theme === o.valor}
          className="seletor-tema-opcao"
          onClick={() => onTheme(o.valor)}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}
