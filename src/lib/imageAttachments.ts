// Preparo de imagens no cliente, antes de subir. Uma foto de celular tem 4–8 MB
// e 4000px de largura; o modal mostra a miniatura em 120px e o visualizador em
// no máximo a altura da tela. Reduzir aqui é o que mantém o upload dentro do
// limite de corpo da função serverless e o banco em tamanho sensato.
import { MIMES_NOTA } from './notaImagens';

/** Teto por imagem, em bytes do binário — o mesmo validado no backend. */
export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;

/** Maior lado da imagem depois da redução. Cobre a tela cheia em telas 2x. */
export const MAX_IMAGE_DIMENSION = 1600;

/** Qualidade do re-encode com perda — acima disso o ganho de tamanho some. */
export const ENCODE_QUALITY = 0.82;

/** Formatos aceitos, na forma que o `accept` do <input type="file"> espera. */
export const ACCEPT_IMAGE_MIMES = 'image/png,image/jpeg,image/webp,image/gif,image/avif';

// ---------- Imagens de página (aba Anotações) ----------
// Print de tela é o caso típico: letra miúda que 1600px e 0,82 borram. O teto
// em bytes continua o mesmo (3 MB; em base64 ~4 MB, abaixo dos 4,5 MB do corpo).

/** Maior lado de uma imagem de página. */
export const MAX_IMAGE_DIMENSION_NOTA = 2400;
/** Qualidade do re-encode numa página — preserva a letra miúda do print. */
export const QUALIDADE_NOTA = 0.9;
/** Formatos de uma página: os de `MIMES_NOTA`, sem AVIF e nunca SVG. */
export const ACCEPT_IMAGEM_NOTA = MIMES_NOTA.join(',');

/** Lista do `accept` em MIMEs minúsculos. */
function mimesDe(aceitos: string): string[] {
  return aceitos.split(',').map(m => m.trim().toLowerCase()).filter(Boolean);
}

const ROTULO_MIME: Record<string, string> = {
  'image/png': 'PNG', 'image/jpeg': 'JPG', 'image/webp': 'WebP', 'image/gif': 'GIF', 'image/avif': 'AVIF',
};

function rotuloDoMime(mime: string): string {
  return ROTULO_MIME[mime.toLowerCase()] ?? (mime.split('/')[1] ?? mime).toUpperCase();
}

/** "PNG, JPG, WebP ou GIF" a partir da lista aceita: a mensagem não mente quando a lista muda. */
export function listaDeFormatos(aceitos: string): string {
  const nomes = mimesDe(aceitos).map(rotuloDoMime);
  return nomes.length <= 1 ? nomes.join('') : `${nomes.slice(0, -1).join(', ')} ou ${nomes[nomes.length - 1]}`;
}

/**
 * Por que o arquivo não serve. `formato` e `tamanho` são regra (a tela mostra
 * em âmbar e oferece outro arquivo); `ilegivel` é arquivo corrompido ou
 * navegador que não decodifica. Erro de rede não passa por aqui.
 */
export type MotivoRecusa = 'formato' | 'tamanho' | 'ilegivel';

export class ImagemRecusadaError extends Error {
  motivo: MotivoRecusa;
  constructor(motivo: MotivoRecusa, mensagem: string) {
    super(mensagem);
    this.name = 'ImagemRecusadaError';
    this.motivo = motivo;
  }
}

/**
 * Formatos que não passam pelo canvas: GIF perderia a animação (o canvas só
 * captura o primeiro quadro) e AVIF não é codificável por `toDataURL` em
 * nenhum navegador atual. Sobem como estão — ou são recusados por tamanho.
 */
const SEM_REENCODE = new Set(['image/gif', 'image/avif']);

/**
 * Imagem pronta para o POST — base64 puro, sem o prefixo `data:`. `largura` e
 * `altura` vêm quando a imagem passou pelo decodificador (GIF e AVIF sobem
 * sem passar); só a tela as usa — o POST manda apenas nome, MIME e dados.
 */
export interface PreparedAttachment {
  nome: string;
  mime: string;
  dados: string;
  largura?: number;
  altura?: number;
}

export interface OpcoesPreparo {
  /** Maior lado depois da redução. Padrão: o das tarefas, 1600px. */
  maxDimension?: number;
  /** Qualidade do re-encode com perda. Padrão: 0,82. */
  qualidade?: number;
  /** Formatos aceitos, no formato do `accept`. Padrão: os das tarefas (com AVIF). */
  aceitos?: string;
}

/**
 * O arquivo é de um formato aceito? `aceitos` é a lista no formato do
 * `accept`; sem ela, vale a das tarefas. Aceita um número no lugar da lista e
 * o ignora: `files.filter(isImageFile)` passa o ÍNDICE como segundo argumento,
 * e ler o índice como lista quebraria o filtro das tarefas.
 */
export function isImageFile(file: { type: string }, aceitos?: string | number): boolean {
  const lista = typeof aceitos === 'string' ? aceitos : ACCEPT_IMAGE_MIMES;
  return mimesDe(lista).includes(file.type.toLowerCase());
}

/** Tamanho do binário a partir do base64, sem decodificar. */
export function base64Bytes(dados: string): number {
  const len = dados.length;
  if (len === 0) return 0;
  const padding = dados.endsWith('==') ? 2 : dados.endsWith('=') ? 1 : 0;
  return Math.floor(len / 4) * 3 - padding;
}

/** Dimensões reduzidas mantendo a proporção. Imagem menor que o teto não cresce. */
export function scaledSize(width: number, height: number, max: number): { width: number; height: number } {
  const maior = Math.max(width, height);
  if (maior <= max || maior === 0) return { width, height };
  const fator = max / maior;
  return {
    width: Math.max(1, Math.round(width * fator)),
    height: Math.max(1, Math.round(height * fator)),
  };
}

/** Tamanho legível na legenda da miniatura. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/** Troca a extensão do nome pela do formato realmente enviado. */
export function comExtensaoDe(nome: string, mime: string): string {
  const ext = mime.split('/')[1] === 'jpeg' ? 'jpg' : mime.split('/')[1];
  if (!ext) return nome;
  const base = nome.replace(/\.[^.]+$/, '') || 'imagem';
  return `${base}.${ext}`;
}

/** Separa um data URL em MIME e base64. O MIME vem do próprio dado, não do pedido. */
function partesDoDataUrl(dataUrl: string): { mime: string; dados: string } {
  const virgula = dataUrl.indexOf(',');
  const cabecalho = dataUrl.slice(0, virgula);
  const mime = cabecalho.slice(5).split(';')[0] || 'image/png';
  return { mime, dados: dataUrl.slice(virgula + 1) };
}

/**
 * Arquivo a partir de um data URL — a imagem que chega embutida num HTML
 * colado. O MIME vem do próprio dado. Lança quando o dado não decodifica.
 */
export function arquivoDeDataUrl(dataUrl: string, nome: string): File {
  const virgula = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:') || virgula === -1) {
    throw new ImagemRecusadaError('ilegivel', 'A imagem colada não pôde ser lida.');
  }
  const cabecalho = dataUrl.slice(5, virgula);
  const mime = (cabecalho.split(';')[0] || 'application/octet-stream').toLowerCase();
  const corpo = dataUrl.slice(virgula + 1);
  let bytes: Uint8Array;
  try {
    if (/;base64$/i.test(cabecalho)) {
      const bin = atob(corpo.replace(/\s/g, ''));
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(corpo));
    }
  } catch {
    throw new ImagemRecusadaError('ilegivel', 'A imagem colada não pôde ser lida.');
  }
  return new File([bytes as BlobPart], nome, { type: mime });
}

function lerComoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ImagemRecusadaError('ilegivel', 'Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

function carregarImagem(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new ImagemRecusadaError('ilegivel', 'Arquivo de imagem inválido ou corrompido.'));
    img.src = dataUrl;
  });
}

/**
 * Redesenha a imagem já reduzida. Pede WebP, que rende o menor arquivo; se o
 * navegador não souber codificar, `toDataURL` devolve PNG silenciosamente — daí
 * o MIME sair do próprio resultado, e não da nossa intenção.
 */
function reencodar(
  img: HTMLImageElement, maxDimension: number, qualidade: number,
): { mime: string; dados: string; largura: number; altura: number } | null {
  const { width, height } = scaledSize(img.naturalWidth, img.naturalHeight, maxDimension);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, width, height);
  const webp = partesDoDataUrl(canvas.toDataURL('image/webp', qualidade));
  if (webp.mime === 'image/webp') return { ...webp, largura: width, altura: height };
  // Sem WebP: JPEG comprime muito melhor que o PNG do fallback automático.
  return { ...partesDoDataUrl(canvas.toDataURL('image/jpeg', qualidade)), largura: width, altura: height };
}

/**
 * Valida, reduz quando preciso e devolve a imagem pronta para o POST. Lança
 * `ImagemRecusadaError` (um `Error`) com mensagem em português quando o
 * arquivo não serve — quem chama mostra a mensagem ao lado do campo.
 *
 * Sem opções, é o preparo dos anexos de tarefa (1600px, 0,82, com AVIF). As
 * páginas da aba Anotações passam `MAX_IMAGE_DIMENSION_NOTA`, `QUALIDADE_NOTA`
 * e `ACCEPT_IMAGEM_NOTA`.
 */
export async function prepareAttachment(file: File, opcoes: OpcoesPreparo = {}): Promise<PreparedAttachment> {
  const { maxDimension = MAX_IMAGE_DIMENSION, qualidade = ENCODE_QUALITY, aceitos = ACCEPT_IMAGE_MIMES } = opcoes;
  if (!isImageFile(file, aceitos)) {
    throw new ImagemRecusadaError('formato', `Formato não aceito. Use ${listaDeFormatos(aceitos)}.`);
  }

  const dataUrl = await lerComoDataUrl(file);
  const original = partesDoDataUrl(dataUrl);
  const nomeOriginal = file.name || 'imagem';

  const cabeNoLimite = base64Bytes(original.dados) <= MAX_ATTACHMENT_BYTES;

  const tipo = file.type.toLowerCase();
  if (SEM_REENCODE.has(tipo)) {
    if (!cabeNoLimite) {
      throw new ImagemRecusadaError(
        'tamanho',
        `Imagem grande demais: ${rotuloDoMime(tipo)} sobe sem redução e precisa ter até ${formatBytes(MAX_ATTACHMENT_BYTES)}.`,
      );
    }
    return { nome: nomeOriginal, mime: original.mime, dados: original.dados };
  }

  const img = await carregarImagem(dataUrl);
  const precisaReduzir = Math.max(img.naturalWidth, img.naturalHeight) > maxDimension;
  if (!precisaReduzir && cabeNoLimite) {
    return { nome: nomeOriginal, mime: original.mime, dados: original.dados, largura: img.naturalWidth, altura: img.naturalHeight };
  }

  const reduzida = reencodar(img, maxDimension, qualidade);
  if (!reduzida) throw new ImagemRecusadaError('ilegivel', 'Não foi possível processar a imagem neste navegador.');

  // Em imagem pequena e já comprimida, o re-encode às vezes engorda o arquivo.
  const melhor: PreparedAttachment = cabeNoLimite && base64Bytes(reduzida.dados) >= base64Bytes(original.dados) && !precisaReduzir
    ? { ...original, nome: nomeOriginal, largura: img.naturalWidth, altura: img.naturalHeight }
    : { ...reduzida, nome: comExtensaoDe(nomeOriginal, reduzida.mime) };

  if (base64Bytes(melhor.dados) > MAX_ATTACHMENT_BYTES) {
    throw new ImagemRecusadaError(
      'tamanho',
      `Mesmo reduzida, a imagem passa de ${formatBytes(MAX_ATTACHMENT_BYTES)}. Recorte a imagem e tente de novo.`,
    );
  }
  return melhor;
}
