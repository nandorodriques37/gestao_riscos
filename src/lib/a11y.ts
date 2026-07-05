import type { KeyboardEvent } from 'react';

/**
 * Handler de teclado para tornar elementos não-nativos (div/tr com onClick)
 * operáveis como botões: aciona com Enter ou Espaço e evita o scroll do Espaço.
 * Use junto de role="button" e tabIndex={0}.
 */
export function onActivateKey(handler: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      handler();
    }
  };
}
