import { useEffect, useRef, type ReactNode, type KeyboardEvent } from 'react';
import { useBloqueioDeRolagem } from '../../hooks/useBloqueioDeRolagem';

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

interface ModalShellProps {
  titulo: string;
  subtitulo?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Barra inferior. O botão de fechar do cabeçalho já existe sem ela. */
  rodape?: ReactNode;
  /** Mais largo para formulários de duas colunas. */
  largo?: boolean;
}

/**
 * Casca de modal com a mesma acessibilidade que o `EditModal` já implementava:
 * `role="dialog"`, foco inicial no primeiro campo, foco devolvido ao fechar,
 * Tab e Shift+Tab presos dentro do cartão, Esc fecha.
 *
 * O `EditModal` de risco NÃO foi migrado para cá de propósito: ele funciona,
 * tem regras próprias de rascunho e commit, e reescrevê-lo agora seria risco
 * sem retorno. Esta casca serve os formulários novos do portfólio.
 */
export function ModalShell({ titulo, subtitulo, onClose, children, rodape, largo }: ModalShellProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  // No celular o cartão é uma folha colada na base; sem a trava, chegar ao fim
  // da rolagem dele passa o gesto para a página de trás.
  useBloqueioDeRolagem();

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    cardRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => anterior?.focus?.();
  }, []);

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key !== 'Tab' || !cardRef.current) return;
    const itens = Array.from(cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter(el => el.offsetParent !== null);
    if (itens.length === 0) return;
    const primeiro = itens[0];
    const ultimo = itens[itens.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={cardRef}
        className="modal-card"
        data-largo={largo || undefined}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="modal-header">
          <div>
            <div className="modal-title">{titulo}</div>
            {subtitulo && <div className="modal-subtitle">{subtitulo}</div>}
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Fechar">×</button>
        </div>

        <div className="modal-body">{children}</div>

        {rodape && <div className="modal-footer">{rodape}</div>}
      </div>
    </div>
  );
}
