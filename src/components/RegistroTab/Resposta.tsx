import { respostaKind } from '../../lib/calculations';

/**
 * Resposta ao risco, na tabela e no cartão.
 *
 * "Mitigar" é a resposta de quase toda linha: como etiqueta, repetia o mesmo
 * pill dez vezes seguidas sem acrescentar informação nenhuma — só ruído. Vira
 * texto simples. A etiqueta fica para a exceção, que é o que vale a pena
 * notar ao passar o olho: evitar (ameaça) e aceitar ou transferir (escolha
 * que alguém precisa sustentar).
 */
export function Resposta({ valor }: { valor: string }) {
  const kind = respostaKind(valor);
  if (kind === 'neutro') return <span className="resposta-texto">{valor || '—'}</span>;
  return <span className="badge" data-badge={kind}>{valor}</span>;
}
