// Quem está usando o app, do lado do navegador.
//
// É AUTODECLARADO e o app não finge o contrário: a pessoa digita o próprio nome
// uma vez e ele viaja num cabeçalho a cada gravação. Não prova nada — serve
// para um time pequeno saber quem mexeu no quê.
//
// Quando existir autenticação de verdade, este arquivo some e o servidor passa
// a ler a identidade da sessão. O cabeçalho já é o formato certo para essa
// troca: muda a origem do valor, não quem consome.
const CHAVE = 'riskMatrix.autor.v1';

export function lerAutor(): string {
  try {
    return localStorage.getItem(CHAVE)?.trim() ?? '';
  } catch {
    // storage indisponível — segue anônimo
    return '';
  }
}

export function gravarAutor(nome: string): void {
  const limpo = nome.trim().slice(0, 80);
  try {
    if (limpo) localStorage.setItem(CHAVE, limpo);
    else localStorage.removeItem(CHAVE);
  } catch {
    // storage indisponível — o nome vale só para esta aba
  }
}

/**
 * Cabeçalhos de uma gravação. `encodeURIComponent` porque cabeçalho HTTP não
 * aceita acento cru — "João" sem isso derruba a requisição inteira no fetch.
 */
export function cabecalhosDeEscrita(): Record<string, string> {
  const autor = lerAutor();
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (autor) h['X-Autor'] = encodeURIComponent(autor);
  return h;
}
