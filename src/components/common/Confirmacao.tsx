import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ModalShell } from './ModalShell';

/**
 * Confirmação de ação destrutiva.
 *
 * Nunca "Tem certeza?" com OK/Cancelar: o diálogo diz o que acontece, com a
 * consequência contada em números ("Os 5 marcos vão junto"), e os dois botões
 * têm nome — o de confirmar diz o verbo, o outro é "Manter". `window.confirm`
 * não deixa nomear botão, e é por isso que ele saiu.
 *
 * Uso: `const [confirmar, dialogo] = useConfirmacao();` — `confirmar(pedido)`
 * devolve uma Promise<boolean>, e `dialogo` é o nó que a tela renderiza onde
 * quiser (é um portal, a posição não importa). Um pedido por vez.
 */
export interface PedidoConfirmacao {
  /** A pergunta, com o nome do que vai ser afetado: `Excluir "X"?` */
  titulo: string;
  /** O que acontece, contado em números. */
  consequencia: ReactNode;
  /** O verbo do botão de confirmar: "Excluir iniciativa", "Juntar fichas". */
  rotuloConfirmar: string;
  /** O botão que não faz nada. "Manter" por padrão. */
  rotuloManter?: string;
  /** Falso quando a ação não destrói nada (declarar, juntar) — botão da marca, não de perigo. */
  perigo?: boolean;
}

export function useConfirmacao(): [(pedido: PedidoConfirmacao) => Promise<boolean>, ReactNode] {
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirmar = useCallback((p: PedidoConfirmacao) => new Promise<boolean>(resolve => {
    // Um pedido em cima do outro resolve o anterior como "manter".
    resolver.current?.(false);
    resolver.current = resolve;
    setPedido(p);
  }), []);

  const fechar = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setPedido(null);
  };

  const dialogo = pedido ? (
    <ModalShell
      titulo={pedido.titulo}
      onClose={() => fechar(false)}
      compacto
      rodape={(
        <>
          <button type="button" className="btn btn-ghost" onClick={() => fechar(false)}>
            {pedido.rotuloManter ?? 'Manter'}
          </button>
          <button
            type="button"
            className={`btn ${pedido.perigo === false ? 'btn-navy' : 'btn-danger'}`}
            onClick={() => fechar(true)}
          >
            {pedido.rotuloConfirmar}
          </button>
        </>
      )}
    >
      <p className="confirmacao-texto">{pedido.consequencia}</p>
    </ModalShell>
  ) : null;

  return [confirmar, dialogo];
}
