/**
 * Chave de comparação de nome de pessoa: sem acento, sem caixa, sem espaço
 * repetido. "JOÃO FERNANDO", "João Fernando" e "joao  fernando" dão a mesma.
 *
 * Vive num módulo só seu porque a API também precisa dela — para mesclar
 * fichas repetidas e para casar responsável com pessoa — e o resto de
 * `planoDeAcao.ts` é código de tela. Módulo sem dependência atravessa os dois
 * lados sem arrastar nada junto.
 */
export function chaveDoNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}
