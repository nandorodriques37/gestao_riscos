import type { ReactNode } from 'react';

/**
 * A conclusão da tela em uma frase: faixa azul da marca, texto branco, e o
 * número que sustenta a frase em <b> (coral claro). Uma por tela, depois do
 * visual dominante — é o "então o quê" do dado, não um segundo título.
 */
export function Insight({ children }: { children: ReactNode }) {
  return <div className="insight" role="note">{children}</div>;
}
