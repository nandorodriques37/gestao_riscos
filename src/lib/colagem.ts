// Colar e soltar no editor de página (aba Anotações): as regras, sem editor.
//
// A área de transferência traz várias representações do mesmo conteúdo, e a
// escolha errada custa caro nos dois sentidos: um print colado como texto vira
// nada, e uma tabela do Excel colada como imagem vira um PNG da tabela que
// ninguém mais consegue editar (o Excel e o Word mandam um PNG junto com o
// HTML). O que decide é o HTML que acompanha os arquivos: com texto, é
// conteúdo; sem texto (print, "Copiar imagem" do navegador), é imagem.
//
// No HTML colado, uma <img> nunca entra pelo endereço que trouxe: a página só
// guarda imagem enviada para ela (ver `notaImagens.ts`). `imagensDoHtmlColado`
// diz o que fazer com cada uma.
import { imagemIdDoSrc } from './notaImagens';
import { plural } from './portfolioLabels';

/** O que interessa da área de transferência (ou do arraste) para decidir. */
export interface ResumoColagem {
  /** MIME de cada arquivo que veio junto. */
  arquivos: readonly string[];
  /** O `text/html`; '' quando não veio. */
  html: string;
}

/** `arquivos`: sobem como imagens. `conteudo`: o editor cola o texto (e o HTML). */
export type EscolhaColagem = 'arquivos' | 'conteudo';

/**
 * Texto visível de um trecho de HTML, com espaços colapsados. Estilo, script
 * e comentário não são texto: o HTML do Excel vem cheio dos três e, sem
 * tirá-los, todo print colado de uma planilha "teria texto".
 */
export function textoDoHtml(html: string): string {
  if (!html.trim()) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('style, script, template, title, meta, link').forEach(n => n.remove());
  return (doc.body?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Arquivos só ganham quando o HTML que veio junto não tem texto. Sem arquivo,
 * é sempre conteúdo. Arquivo que não é imagem também conta: ele vira um bloco
 * recusado que diz por quê, em vez de sumir calado.
 */
export function escolherColagem({ arquivos, html }: ResumoColagem): EscolhaColagem {
  if (arquivos.length === 0) return 'conteudo';
  return textoDoHtml(html) === '' ? 'arquivos' : 'conteudo';
}

/**
 * Endereço relativo quando o absoluto é da mesma origem. O navegador costuma
 * escrever o `src` absoluto ao copiar da página renderizada
 * (`https://app/api/notas/…`), e a página só guarda o relativo.
 */
export function srcRelativo(src: string | null | undefined, origem?: string): string {
  const bruto = (src ?? '').trim();
  if (!origem || !/^https?:\/\//i.test(bruto)) return bruto;
  try {
    const url = new URL(bruto);
    if (url.origin !== new URL(origem).origin) return bruto;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return bruto;
  }
}

/** A origem desta aba, quando há uma (no Node dos testes puros não há). */
export function origemAtual(): string | undefined {
  return typeof window !== 'undefined' ? window.location?.origin : undefined;
}

export interface ImagemColada {
  /** O endereço como veio (relativo, quando era da mesma origem). */
  src: string;
  /** O texto alternativo, que vira o nome do arquivo; '' quando não veio. */
  nome: string;
}

export interface ImagensColadas {
  /** Embutidas no próprio HTML (`data:`): sobem como arquivo. */
  embutidas: ImagemColada[];
  /** De outra página deste app: baixadas daqui mesmo e reenviadas para esta. */
  deOutraPagina: ImagemColada[];
  /** Da web, ou de qualquer endereço que não é deste app: não entram. */
  daWeb: number;
}

const SRC_DE_NOTA = /^\/api\/notas\/[0-9a-f-]{36}\/imagens\/[0-9a-f-]{36}$/i;

/**
 * Separa as <img> de um HTML colado em três destinos. Imagem DESTA página não
 * aparece em nenhum: o próprio editor a aceita, porque o endereço já é dela.
 * Imagem de outra página é reenviada, e não citada: citar o endereço da outra
 * faria a imagem sumir quando a outra fosse excluída (o cascade leva junto).
 */
export function imagensDoHtmlColado(html: string, notaId: string, origem: string | undefined = origemAtual()): ImagensColadas {
  const saida: ImagensColadas = { embutidas: [], deOutraPagina: [], daWeb: 0 };
  if (!html.trim()) return saida;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const img of Array.from(doc.querySelectorAll('img'))) {
    const src = srcRelativo(img.getAttribute('src'), origem);
    if (!src) continue;
    const nome = (img.getAttribute('alt') ?? '').trim();
    if (/^data:/i.test(src)) saida.embutidas.push({ src, nome });
    else if (imagemIdDoSrc(src, notaId)) continue;
    else if (SRC_DE_NOTA.test(src)) saida.deOutraPagina.push({ src, nome });
    else saida.daWeb += 1;
  }
  return saida;
}

/** O aviso que não bloqueia ninguém: o texto entrou, as imagens da web não. */
export function avisoImagensDaWeb(n: number): string {
  if (n <= 0) return '';
  const quantas = plural(n, 'imagem da web', 'imagens da web');
  return n === 1
    ? `${quantas} não foi colada. Copie a imagem em si e cole de novo.`
    : `${quantas} não foram coladas. Copie cada imagem em si e cole de novo.`;
}
