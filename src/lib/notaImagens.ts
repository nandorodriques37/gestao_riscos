// Regras puras das imagens de uma página da aba Anotações. Moram em `src/lib`
// porque valem dos dois lados: o servidor recusa o documento que as quebra e o
// editor não deixa entrar o que o servidor recusaria (mesma ideia de
// `resumoAcoes.ts`).
//
// A imagem é um nó do documento com `src` RELATIVO à própria página:
// `/api/notas/<notaId>/imagens/<imagemId>`. Sem extensão (o plugin de dev
// manda caminho com extensão para o Vite), nunca `data:` (os bytes iriam para
// o JSON da página e para o cache local), nunca `blob:` (morre ao recarregar),
// nunca URL de fora (imagem de terceiro some sem aviso) e nunca de outra
// página (excluir a outra levaria a imagem junto, pelo cascade).

/** Formatos aceitos numa página. Sem AVIF (o canvas não reencoda em todo
 * navegador) e nunca SVG, que carrega script. */
export const MIMES_NOTA: readonly string[] = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** Imagem sem referência no documento só sai do banco depois deste prazo:
 * é o que deixa o Ctrl+Z trazer de volta um bloco removido. */
export const HORAS_ATE_VARRER = 24;

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_RE = new RegExp(`^${UUID}$`, 'i');
const SRC_RE = new RegExp(`^/api/notas/(${UUID})/imagens/(${UUID})$`, 'i');

export function ehUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

export function notaImagemUrl(notaId: string, imagemId: string): string {
  return `/api/notas/${notaId}/imagens/${imagemId}`;
}

/** Id da imagem quando o `src` é desta página; `null` em qualquer outro caso. */
export function imagemIdDoSrc(src: unknown, notaId: string): string | null {
  if (typeof src !== 'string') return null;
  const m = SRC_RE.exec(src);
  if (!m || m[1].toLowerCase() !== notaId.toLowerCase()) return null;
  return m[2].toLowerCase();
}

export function ehSrcDaNota(src: unknown, notaId: string): boolean {
  return imagemIdDoSrc(src, notaId) !== null;
}

/** Nó do documento do editor, só no que estas regras leem. */
export interface NoDoc {
  type?: unknown;
  attrs?: Record<string, unknown> | null;
  content?: unknown;
}

/**
 * Documento a partir do texto gravado. `null` para página vazia e para texto
 * que não é um documento — quem chama decide o que cada caso significa.
 */
export function lerDoc(conteudo: unknown): NoDoc | null {
  if (typeof conteudo !== 'string' || conteudo.trim() === '') return null;
  try {
    const doc = JSON.parse(conteudo) as unknown;
    if (doc && typeof doc === 'object' && !Array.isArray(doc) && (doc as NoDoc).type === 'doc') return doc as NoDoc;
  } catch { /* texto que não é JSON */ }
  return null;
}

export interface ImagemDoDoc {
  src: unknown;
  alt: unknown;
}

/**
 * Imagens na ordem em que aparecem no documento, inclusive dentro de listas.
 * Pilha explícita, sem recursão: um documento aninhado de propósito estouraria
 * a pilha do servidor bem abaixo do teto de tamanho e viraria 500.
 */
export function imagensDoDoc(doc: NoDoc | null): ImagemDoDoc[] {
  const out: ImagemDoDoc[] = [];
  const pilha: unknown[] = [doc];
  while (pilha.length > 0) {
    const no = pilha.pop();
    if (!no || typeof no !== 'object') continue;
    const n = no as NoDoc;
    if (n.type === 'image') out.push({ src: n.attrs?.src, alt: n.attrs?.alt });
    if (Array.isArray(n.content)) for (let i = n.content.length - 1; i >= 0; i--) pilha.push(n.content[i]);
  }
  return out;
}

/**
 * Até onde o documento desce. O editor nunca passa de umas dezenas de níveis
 * (lista dentro de lista); o teto existe para um documento montado à mão pela
 * API não estourar a pilha de quem o percorre por recursão — o ProseMirror
 * inclusive. Pilha explícita, pelo mesmo motivo.
 */
export function profundidadeDoDoc(doc: NoDoc | null): number {
  let maior = 0;
  const pilha: Array<[unknown, number]> = [[doc, 1]];
  while (pilha.length > 0) {
    const [no, nivel] = pilha.pop()!;
    if (!no || typeof no !== 'object') continue;
    if (nivel > maior) maior = nivel;
    const filhos = (no as NoDoc).content;
    if (Array.isArray(filhos)) for (const f of filhos) pilha.push([f, nivel + 1]);
  }
  return maior;
}

/** Ids das imagens desta página citadas pelo documento. */
export function imagensCitadas(doc: NoDoc | null, notaId: string): Set<string> {
  const ids = new Set<string>();
  for (const img of imagensDoDoc(doc)) {
    const id = imagemIdDoSrc(img.src, notaId);
    if (id) ids.add(id);
  }
  return ids;
}
