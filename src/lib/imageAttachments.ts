// Preparo de imagens no cliente, antes de subir. Uma foto de celular tem 4–8 MB
// e 4000px de largura; o modal mostra a miniatura em 120px e o visualizador em
// no máximo a altura da tela. Reduzir aqui é o que mantém o upload dentro do
// limite de corpo da função serverless e o banco em tamanho sensato.

/** Teto por imagem, em bytes do binário — o mesmo validado no backend. */
export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;

/** Maior lado da imagem depois da redução. Cobre a tela cheia em telas 2x. */
export const MAX_IMAGE_DIMENSION = 1600;

/** Qualidade do re-encode com perda — acima disso o ganho de tamanho some. */
const ENCODE_QUALITY = 0.82;

/** Formatos aceitos, na forma que o `accept` do <input type="file"> espera. */
export const ACCEPT_IMAGE_MIMES = 'image/png,image/jpeg,image/webp,image/gif,image/avif';

const ALLOWED = new Set(ACCEPT_IMAGE_MIMES.split(','));

/**
 * Formatos que não passam pelo canvas: GIF perderia a animação (o canvas só
 * captura o primeiro quadro) e AVIF não é codificável por `toDataURL` em
 * nenhum navegador atual. Sobem como estão — ou são recusados por tamanho.
 */
const SEM_REENCODE = new Set(['image/gif', 'image/avif']);

/** Imagem pronta para o POST — base64 puro, sem o prefixo `data:`. */
export interface PreparedAttachment {
  nome: string;
  mime: string;
  dados: string;
}

export function isImageFile(file: { type: string }): boolean {
  return ALLOWED.has(file.type.toLowerCase());
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

function lerComoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

function carregarImagem(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Arquivo de imagem inválido ou corrompido.'));
    img.src = dataUrl;
  });
}

/**
 * Redesenha a imagem já reduzida. Pede WebP, que rende o menor arquivo; se o
 * navegador não souber codificar, `toDataURL` devolve PNG silenciosamente — daí
 * o MIME sair do próprio resultado, e não da nossa intenção.
 */
function reencodar(img: HTMLImageElement): { mime: string; dados: string } | null {
  const { width, height } = scaledSize(img.naturalWidth, img.naturalHeight, MAX_IMAGE_DIMENSION);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, width, height);
  const webp = partesDoDataUrl(canvas.toDataURL('image/webp', ENCODE_QUALITY));
  if (webp.mime === 'image/webp') return webp;
  // Sem WebP: JPEG comprime muito melhor que o PNG do fallback automático.
  return partesDoDataUrl(canvas.toDataURL('image/jpeg', ENCODE_QUALITY));
}

/**
 * Valida, reduz quando preciso e devolve a imagem pronta para o POST. Lança
 * `Error` com mensagem em português quando o arquivo não serve — quem chama
 * mostra a mensagem ao lado do campo.
 */
export async function prepareAttachment(file: File): Promise<PreparedAttachment> {
  if (!isImageFile(file)) {
    throw new Error('Só é possível anexar imagens (PNG, JPEG, WebP, GIF ou AVIF).');
  }

  const dataUrl = await lerComoDataUrl(file);
  const original = partesDoDataUrl(dataUrl);
  const nomeOriginal = file.name || 'imagem';

  const cabeNoLimite = base64Bytes(original.dados) <= MAX_ATTACHMENT_BYTES;

  if (SEM_REENCODE.has(file.type)) {
    if (!cabeNoLimite) {
      throw new Error(`Imagem grande demais: GIF e AVIF sobem sem redução e precisam ter até ${formatBytes(MAX_ATTACHMENT_BYTES)}.`);
    }
    return { nome: nomeOriginal, mime: original.mime, dados: original.dados };
  }

  const img = await carregarImagem(dataUrl);
  const precisaReduzir = Math.max(img.naturalWidth, img.naturalHeight) > MAX_IMAGE_DIMENSION;
  if (!precisaReduzir && cabeNoLimite) {
    return { nome: nomeOriginal, mime: original.mime, dados: original.dados };
  }

  const reduzida = reencodar(img);
  if (!reduzida) throw new Error('Não foi possível processar a imagem neste navegador.');

  // Em imagem pequena e já comprimida, o re-encode às vezes engorda o arquivo.
  const melhor = cabeNoLimite && base64Bytes(reduzida.dados) >= base64Bytes(original.dados) && !precisaReduzir
    ? { ...original, nome: nomeOriginal }
    : { ...reduzida, nome: comExtensaoDe(nomeOriginal, reduzida.mime) };

  if (base64Bytes(melhor.dados) > MAX_ATTACHMENT_BYTES) {
    throw new Error(`Mesmo reduzida, a imagem passa de ${formatBytes(MAX_ATTACHMENT_BYTES)}. Tente recortá-la antes de anexar.`);
  }
  return melhor;
}
