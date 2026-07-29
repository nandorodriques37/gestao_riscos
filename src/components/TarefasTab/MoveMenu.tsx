import { useEffect, useRef, useState } from 'react';

export interface MoveOption {
  /** Identificador da coluna de destino. */
  id: string;
  label: string;
}

interface MoveMenuProps {
  options: readonly MoveOption[];
  /** Coluna onde o card está agora — fica desabilitada na lista. */
  currentId: string;
  onMove: (id: string) => void;
  /** Nome da tarefa, para o rótulo acessível do gatilho. */
  taskLabel: string;
}

/**
 * Menu "Mover para" de um card. É o caminho de teclado do quadro: arrastar exige
 * ponteiro, então toda coluna de destino também precisa estar a um Tab e um Enter
 * de distância. Serve igualmente a quem só prefere não arrastar.
 */
/** Altura estimada do painel, só para decidir se ele abre para cima ou para baixo. */
const ALTURA_ITEM = 32;
const ALTURA_EXTRA = 44;

export function MoveMenu({ options, currentId, onMove, taskLabel }: MoveMenuProps) {
  const [open, setOpen] = useState(false);
  // Coordenadas de viewport: o painel é `fixed` porque o corpo da coluna rola e
  // recortaria um popover posicionado dentro dele.
  const [coords, setCoords] = useState<{ left: number; top?: number; bottom?: number }>({ left: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Fecha ao clicar fora ou no Esc, devolvendo o foco ao gatilho — senão o foco
  // cairia no <body> e a navegação por teclado perderia o lugar.
  // Rolar também fecha: um painel ancorado na viewport descolaria do card.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) {
      const altura = options.length * ALTURA_ITEM + ALTURA_EXTRA;
      // Abre para cima quando cabe; senão para baixo. O card costuma estar na
      // metade de baixo da coluna, então "para cima" é o caso comum.
      setCoords(r.top >= altura
        ? { left: r.right, bottom: window.innerHeight - r.top + 4 }
        : { left: r.right, top: r.bottom + 4 });
    }
    setOpen(true);
  }

  function handleMove(id: string) {
    setOpen(false);
    triggerRef.current?.focus();
    onMove(id);
  }

  return (
    <div className="move-menu" ref={wrapRef} onClick={e => e.stopPropagation()}>
      <button
        ref={triggerRef}
        className="move-menu-trigger"
        onClick={toggle}
        onKeyDown={e => e.stopPropagation()}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Mover tarefa: ${taskLabel}`}
        title="Mover"
      >
        ⋯
      </button>
      {open && (
        <div
          className="move-menu-panel"
          role="menu"
          aria-label="Mover para"
          // Enter num item também é Enter no card, que abriria o modal por cima.
          // O Esc continua funcionando: é ouvido no documento, em captura.
          onKeyDown={e => e.stopPropagation()}
          // Coordenadas medidas em runtime; a aparência toda vem do CSS.
          style={{ left: coords.left, top: coords.top, bottom: coords.bottom }}
        >
          <div className="move-menu-title">Mover para</div>
          {options.map(opt => (
            <button
              key={opt.id}
              role="menuitem"
              className="move-menu-item"
              disabled={opt.id === currentId}
              onClick={() => handleMove(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
