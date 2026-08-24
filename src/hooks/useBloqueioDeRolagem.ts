import { useEffect } from 'react';

/**
 * Trava a rolagem do corpo enquanto uma camada sobreposta está aberta.
 *
 * No desktop isso é um detalhe. No celular é o que separa uma folha inferior de
 * um retângulo flutuando sobre uma página que continua andando por baixo do
 * dedo: sem a trava, rolar dentro do modal e chegar ao fim transfere o gesto
 * para a página de trás, e quando a folha fecha o app está em outro lugar.
 *
 * Guarda o valor anterior em vez de assumir `''`: dois modais empilhados (o de
 * risco abre o de promoção) desfariam a trava do primeiro ao fechar o segundo.
 * Contagem de referência não é necessária porque cada camada restaura
 * exatamente o que encontrou.
 */
export function useBloqueioDeRolagem(ativo = true) {
  useEffect(() => {
    if (!ativo) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = anterior; };
  }, [ativo]);
}
