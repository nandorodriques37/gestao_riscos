// Cliente HTTP da aba Anotações.
//
// Próprio, e não o `portfolioApi`: as páginas ficam fora do pacote do
// portfólio (o texto é longo e o pacote vai no polling de 15s), e o conflito
// de versão precisa lançar um erro com `.current` — é esse nome que o
// `useStoredCollection` procura para aceitar a versão do servidor. Com o
// `.atual` do portfólio, o hook trataria o 409 como queda de rede e tentaria
// gravar para sempre.
import type { Nota, NotaImagem } from '../types';
import { cabecalhosDeEscrita } from './autor';

const BASE = '/api/portfolio/notas';

/** O que a tela grava numa página. `id`, `version` e `updated_at` são do servidor. */
export type NotaPatch = Partial<Pick<Nota, 'titulo' | 'conteudo' | 'fixada' | 'autor' | 'editado_por'>>;

/** Outra pessoa gravou a página entre a leitura e a escrita (concorrência otimista). */
export class NotaConflictError extends Error {
  /** A página como está no servidor agora. */
  current: Nota;
  status = 409;
  constructor(current: Nota) {
    super('Esta página foi alterada por outra pessoa enquanto você editava.');
    this.name = 'NotaConflictError';
    this.current = current;
  }
}

/**
 * O servidor respondeu e recusou. Leva o `status`: é por ele que o
 * `useStoredCollection` separa o 4xx que não muda tentando de novo (404 da
 * página excluída, 400 do limite de tamanho) da falha que passa sozinha.
 */
export class NotaHttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'NotaHttpError';
    this.status = status;
  }
}

/** Falha de rede (o `fetch` nem teve resposta). Sem `status`: o hook tenta de novo. */
export const MSG_SEM_CONEXAO_SERVIDOR = 'Sem conexão com o servidor.';

/** O `fetch` rejeita com a mensagem do navegador, em inglês ("Failed to fetch"). */
async function pedir(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new Error(MSG_SEM_CONEXAO_SERVIDOR);
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `Erro ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      // corpo não-JSON — mantém a mensagem padrão
    }
    throw new NotaHttpError(msg, res.status);
  }
  return res.json() as Promise<T>;
}

export async function listNotas(): Promise<Nota[]> {
  return parse(await pedir(BASE));
}

export async function createNota(data: NotaPatch): Promise<Nota> {
  return parse(await pedir(BASE, {
    method: 'POST',
    headers: cabecalhosDeEscrita(),
    body: JSON.stringify(data),
  }));
}

export async function patchNota(id: string, patch: NotaPatch, version?: number): Promise<Nota> {
  const res = await pedir(`${BASE}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: cabecalhosDeEscrita(),
    body: JSON.stringify({ ...patch, expectedVersion: version }),
  });
  if (res.status === 409) throw new NotaConflictError(await res.json() as Nota);
  return parse(res);
}

export async function deleteNota(id: string): Promise<void> {
  await parse(await pedir(`${BASE}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: cabecalhosDeEscrita(),
  }));
}

// ---------- Imagens ----------

/** O corpo do POST: base64 puro, sem o prefixo `data:`. Nada além disso viaja. */
export interface ImagemParaEnviar {
  nome: string;
  mime: string;
  dados: string;
}

export interface OpcoesEnvio {
  /** Fração enviada, de 0 a 1. Só chega quando o navegador sabe o total. */
  onProgresso?: (fracao: number) => void;
  /** Aborta o envio. A promessa rejeita com `AbortError` (ver `ehCancelamento`). */
  signal?: AbortSignal;
}

export const MSG_LIMITE_ENVIO = 'A imagem passou do limite de envio.';
export const MSG_SEM_CONEXAO = 'Sem conexão: a imagem não subiu.';

/** Envio abortado pela tela (troca de página, Remover). Não é erro para mostrar. */
export function ehCancelamento(err: unknown): boolean {
  return (err as { name?: unknown } | null)?.name === 'AbortError';
}

function cancelado(): DOMException {
  return new DOMException('Envio cancelado.', 'AbortError');
}

/** Mensagem de um corpo de erro: JSON `{ error }` da API, ou o padrão. */
function mensagemDoCorpo(texto: string, status: number): string {
  try {
    const body = JSON.parse(texto) as { error?: unknown };
    if (typeof body?.error === 'string' && body.error) return body.error;
  } catch {
    // corpo não-JSON
  }
  return `Erro ${status}`;
}

/**
 * Sobe uma imagem para a página. XMLHttpRequest, e não `fetch`, porque o
 * `fetch` não informa o progresso do envio — e é o progresso que a barra do
 * bloco mostra. Os cabeçalhos de autoria vão à mão pelo mesmo motivo.
 *
 * O 413 chega em TEXTO (da Vercel e do plugin de dev, antes de a API ver o
 * pedido), por isso vira mensagem fixa pelo status, sem ler o corpo.
 */
export function uploadNotaImagem(notaId: string, imagem: ImagemParaEnviar, opcoes: OpcoesEnvio = {}): Promise<NotaImagem> {
  const { onProgresso, signal } = opcoes;
  return new Promise<NotaImagem>((resolve, reject) => {
    if (signal?.aborted) { reject(cancelado()); return; }
    const xhr = new XMLHttpRequest();
    const soltar = () => signal?.removeEventListener('abort', abortar);
    const abortar = () => xhr.abort();
    xhr.open('POST', `/api/notas/${encodeURIComponent(notaId)}/imagens`);
    for (const [nome, valor] of Object.entries(cabecalhosDeEscrita())) xhr.setRequestHeader(nome, valor);
    if (onProgresso) {
      xhr.upload.onprogress = e => { if (e.lengthComputable && e.total > 0) onProgresso(Math.min(1, e.loaded / e.total)); };
    }
    xhr.onload = () => {
      soltar();
      if (xhr.status === 413) { reject(new Error(MSG_LIMITE_ENVIO)); return; }
      if (xhr.status < 200 || xhr.status >= 300) { reject(new Error(mensagemDoCorpo(xhr.responseText, xhr.status))); return; }
      try {
        resolve(JSON.parse(xhr.responseText) as NotaImagem);
      } catch {
        reject(new Error('Resposta inválida do servidor ao enviar a imagem.'));
      }
    };
    xhr.onerror = () => { soltar(); reject(new Error(MSG_SEM_CONEXAO)); };
    xhr.onabort = () => { soltar(); reject(cancelado()); };
    signal?.addEventListener('abort', abortar, { once: true });
    xhr.send(JSON.stringify({ nome: imagem.nome, mime: imagem.mime, dados: imagem.dados }));
  });
}
