// Regras puras da aba Anotações: texto, trecho, ordem, busca, recorte e o
// título da aba. Nada aqui conhece React, rótulo de botão ou cor.
//
// O texto de uma página é DERIVADO do documento do editor (JSON do TipTap
// guardado em `conteudo`). Não existe coluna de texto paralela: duas cópias do
// mesmo conteúdo discordariam no primeiro salvamento que gravasse só uma.
import type { Nota } from '../types';
import { lerDoc, type NoDoc } from './notaImagens';
import { chaveDoNome } from './nomes';
import { plural } from './portfolioLabels';

/* ------------------------------------------------------------------------ */
/* Texto                                                                    */
/* ------------------------------------------------------------------------ */

interface TextoCache { texto: string; chave: string }

/**
 * A lista inteira relê o texto de cada página a cada tecla (busca, trecho), e
 * o documento pode ter centenas de KB. A chave do cache é o próprio texto
 * gravado: a página que não mudou não é percorrida de novo.
 */
const cache = new Map<string, TextoCache>();
const LIMITE_CACHE = 300;

function percorrer(doc: NoDoc): string[] {
  const linhas: string[] = [];
  const visitar = (no: unknown) => {
    if (!no || typeof no !== 'object') return;
    const n = no as NoDoc & { text?: unknown };
    const filhos = Array.isArray(n.content) ? (n.content as Array<NoDoc & { text?: unknown }>) : [];
    // Bloco de texto (parágrafo, título, bloco de código): o conteúdo é inline.
    // Vira uma linha; a quebra manual (Shift+Enter) abre outra.
    if (filhos.some(f => f?.type === 'text' || f?.type === 'hardBreak')) {
      let linha = '';
      for (const f of filhos) {
        if (f?.type === 'text' && typeof f.text === 'string') linha += f.text;
        else if (f?.type === 'hardBreak') { linhas.push(linha); linha = ''; }
      }
      linhas.push(linha);
      return;
    }
    // Contêiner (documento, lista, item, citação): desce. Imagem e divisor não
    // têm texto e não viram linha.
    filhos.forEach(visitar);
  };
  visitar(doc);
  return linhas.flatMap(l => l.split('\n')).filter(l => l.trim() !== '');
}

function textoComChave(conteudo: string): TextoCache {
  const guardado = cache.get(conteudo);
  if (guardado) return guardado;
  const doc = lerDoc(conteudo);
  const texto = doc ? percorrer(doc).join('\n') : '';
  const novo = { texto, chave: chaveDoNome(texto) };
  if (cache.size >= LIMITE_CACHE) cache.delete(cache.keys().next().value as string);
  cache.set(conteudo, novo);
  return novo;
}

/**
 * Texto puro da página: uma linha por bloco de texto, na ordem do documento,
 * sem as linhas em branco. Imagem e divisor não entram. Documento vazio ou
 * ilegível dá `''`.
 */
export function textoDaNota(conteudo: string): string {
  return textoComChave(conteudo).texto;
}

/**
 * Documento do editor a partir de texto puro: um parágrafo por linha (linha
 * vazia vira parágrafo vazio). É o caminho inverso de `textoDaNota`, para
 * testes e para o esboço do editor — o editor de verdade grava o JSON dele.
 */
export function docDeTexto(texto: string): string {
  const linhas = texto === '' ? [] : texto.split('\n');
  return JSON.stringify({
    type: 'doc',
    content: linhas.length === 0
      ? [{ type: 'paragraph' }]
      : linhas.map(l => (l ? { type: 'paragraph', content: [{ type: 'text', text: l }] } : { type: 'paragraph' })),
  });
}

/** Quantas linhas de texto a página tem — a consequência que o "Excluir" anuncia. */
export function linhasDaNota(conteudo: string): number {
  const texto = textoDaNota(conteudo);
  return texto ? texto.split('\n').length : 0;
}

/** Pontuação que fecha um item de lista e ficaria pendurada antes do separador. */
const PONTUACAO_FINAL = /[\s;,:]+$/;

/**
 * Prévia de uma linha para a lista de páginas: o texto a partir da primeira
 * linha que não repete o título, com as linhas seguintes emendadas por " · "
 * até `max` caracteres. Emenda porque a página típica abre com um título curto
 * ("Meus") e a linha sozinha não diria nada. Passou de `max`, corta na última
 * palavra inteira e põe reticências. Página sem texto dá `''`.
 */
export function trechoDaNota(nota: Pick<Nota, 'titulo' | 'conteudo'>, max = 120): string {
  const linhas = textoDaNota(nota.conteudo).split('\n').map(l => l.trim()).filter(Boolean);
  const titulo = chaveDoNome(nota.titulo);
  let i = 0;
  while (i < linhas.length && titulo && chaveDoNome(linhas[i]) === titulo) i++;
  const resto = linhas.slice(i);
  if (resto.length === 0) return '';
  const emendado = resto.map((l, k) => (k < resto.length - 1 ? l.replace(PONTUACAO_FINAL, '') : l)).join(' · ');
  if (emendado.length <= max) return emendado;
  const corte = emendado.slice(0, Math.max(1, max - 1));
  const espaco = corte.lastIndexOf(' ');
  const base = (espaco > max / 2 ? corte.slice(0, espaco) : corte).replace(/[\s·;,:]+$/, '');
  return `${base}…`;
}

/* ------------------------------------------------------------------------ */
/* Ordem, busca e recorte                                                    */
/* ------------------------------------------------------------------------ */

function instante(iso: string | null | undefined): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

/** Fixadas primeiro; dentro de cada grupo, a editada por último no topo. Estável. */
export function ordenarNotas<T extends Pick<Nota, 'fixada' | 'updated_at'>>(notas: readonly T[]): T[] {
  return [...notas].sort((a, b) =>
    (Number(Boolean(b.fixada)) - Number(Boolean(a.fixada))) || (instante(b.updated_at) - instante(a.updated_at)));
}

export type RecorteNotas = 'todas' | 'minhas';

export interface FiltroNotas {
  /** Texto da busca. Casa título e texto, sem acento e sem caixa. */
  busca: string;
  recorte: RecorteNotas;
  /** Nome do chip de autor. Vazio: ninguém se identificou e "Minhas" fica vazio. */
  autor: string;
}

/**
 * A página é "minha" quando eu a escrevi OU fui o último a editá-la. Casa por
 * `chaveDoNome`, como o resto do app: "DERYLSON" e "Derylson" são a mesma
 * pessoa. Sem nome no chip, nada é de ninguém.
 */
export function ehMinha(nota: Pick<Nota, 'autor' | 'editado_por'>, autor: string): boolean {
  const eu = chaveDoNome(autor);
  if (!eu) return false;
  return chaveDoNome(nota.autor ?? '') === eu || chaveDoNome(nota.editado_por ?? '') === eu;
}

/** Busca no título e no texto da página, sem acento e sem caixa. Busca vazia casa tudo. */
export function casaBusca(nota: Pick<Nota, 'titulo' | 'conteudo'>, busca: string): boolean {
  const q = chaveDoNome(busca);
  if (!q) return true;
  return chaveDoNome(nota.titulo ?? '').includes(q) || textoComChave(nota.conteudo ?? '').chave.includes(q);
}

/** Aplica a busca e o recorte. Não reordena: quem ordena é `ordenarNotas`. */
export function filtrarNotas<T extends Pick<Nota, 'titulo' | 'conteudo' | 'autor' | 'editado_por'>>(
  notas: readonly T[], filtro: FiltroNotas,
): T[] {
  return notas.filter(n => (filtro.recorte === 'todas' || ehMinha(n, filtro.autor)) && casaBusca(n, filtro.busca));
}

/* ------------------------------------------------------------------------ */
/* Semana, título da aba e "há quanto tempo"                                 */
/* ------------------------------------------------------------------------ */

/** Segunda-feira 00:00, no fuso de quem está olhando. */
export function inicioDaSemana(hoje: Date): Date {
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** Editada de segunda a domingo da semana de `hoje`, hora local. */
export function editadaNaSemana(nota: Pick<Nota, 'updated_at'>, hoje: Date): boolean {
  const inicio = inicioDaSemana(hoje);
  // setDate, e não +7×24h: a semana do horário de verão não tem 168 horas.
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 7);
  const t = instante(nota.updated_at);
  return t >= inicio.getTime() && t < fim.getTime();
}

export function editadasNaSemana(notas: readonly Pick<Nota, 'updated_at'>[], hoje: Date): number {
  return notas.filter(n => editadaNaSemana(n, hoje)).length;
}

export const SUBTITULO_ANOTACOES = 'Bloco de notas da equipe · todos veem, cada página guarda quem escreveu';

/**
 * Título da aba, que afirma o achado com número: "7 páginas, 4 editadas nesta
 * semana". Sem página nenhuma, o nome da seção — o estado vazio logo abaixo é
 * quem explica, e o título não repete o vazio.
 */
export function tituloDaAba(notas: readonly Pick<Nota, 'updated_at'>[], hoje: Date): { titulo: string; subtitulo: string } {
  const total = notas.length;
  if (total === 0) return { titulo: 'Anotações', subtitulo: SUBTITULO_ANOTACOES };
  const paginas = plural(total, 'página', 'páginas');
  const editadas = editadasNaSemana(notas, hoje);
  let titulo: string;
  if (editadas === 0) titulo = `${paginas}, ${total === 1 ? 'sem edição' : 'nenhuma editada'} nesta semana`;
  else if (total === 1) titulo = `${paginas}, editada nesta semana`;
  else if (editadas === total) titulo = `${paginas}, todas editadas nesta semana`;
  else titulo = `${paginas}, ${editadas} ${editadas === 1 ? 'editada' : 'editadas'} nesta semana`;
  return { titulo, subtitulo: SUBTITULO_ANOTACOES };
}

const DOIS = (n: number) => String(n).padStart(2, '0');

function diasCorridos(de: Date, ate: Date): number {
  const a = new Date(de.getFullYear(), de.getMonth(), de.getDate());
  const b = new Date(ate.getFullYear(), ate.getMonth(), ate.getDate());
  // Arredonda: a meia-noite do dia do horário de verão fica a 23 ou 25 horas.
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * Há quanto tempo, na voz da lista: "agora", "há 5 min", "há 2 h" (mesmo
 * dia), "ontem", "há 3 dias" (até cinco), depois a data — "08/10", com o ano
 * quando não é o corrente ("08/10/25"). Instante no futuro (relógio
 * adiantado) é "agora". Data ilegível dá `''`.
 */
export function quandoEditada(iso: string, agora: Date): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const quando = new Date(t);
  const diff = agora.getTime() - t;
  if (diff < 60_000) return 'agora';
  if (diff < 3_600_000) return `há ${Math.floor(diff / 60_000)} min`;
  const dias = diasCorridos(quando, agora);
  if (dias <= 0) return `há ${Math.floor(diff / 3_600_000)} h`;
  if (dias === 1) return 'ontem';
  if (dias <= 5) return `há ${dias} dias`;
  const dm = `${DOIS(quando.getDate())}/${DOIS(quando.getMonth() + 1)}`;
  return quando.getFullYear() === agora.getFullYear() ? dm : `${dm}/${String(quando.getFullYear()).slice(2)}`;
}
