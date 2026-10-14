// Os blocos que uma página da aba Anotações sabe criar, e a busca do menu "/".
//
// É uma lista só, e dado puro: o menu "/" do editor (Lote 3) e a barra de
// formato do celular (Lote 4) leem daqui o nome, os apelidos, o atalho de
// markdown e a sigla do ícone. Quem transforma o bloco no documento é
// `aplicarBloco` (`components/AnotacoesTab/menuBarra.ts`); o desenho dos
// ícones mora em `MenuBarraView.tsx`.
import { chaveDoNome } from './nomes';

export type IdBloco =
  | 'texto'
  | 'titulo1'
  | 'titulo2'
  | 'titulo3'
  | 'numerada'
  | 'marcadores'
  | 'tarefas'
  | 'citacao'
  | 'divisor'
  | 'imagem';

export interface BlocoNota {
  id: IdBloco;
  /** Como o bloco aparece no menu. */
  nome: string;
  /**
   * Outros nomes que a busca aceita. Valem sem acento e sem caixa, como o
   * nome. Entram os termos em inglês de quem vem do Notion ("h1", "todo").
   */
  apelidos: readonly string[];
  /** O atalho de markdown que cria o mesmo bloco ao digitar (`##`, `1.`). */
  atalho?: string;
  /** Texto curto no lugar do atalho, para o bloco que não tem tecla. */
  dica?: string;
  /** Ícone escrito (H1, H2, H3). Sem sigla, o ícone é um desenho. */
  sigla?: string;
}

/** Na ordem do canvas aprovado. A busca desempata por esta ordem. */
export const BLOCOS_NOTA: readonly BlocoNota[] = [
  { id: 'texto', nome: 'Texto', apelidos: ['parágrafo', 'texto simples', 'normal', 'text', 'paragraph'] },
  { id: 'titulo1', nome: 'Título 1', apelidos: ['h1', 'título1', 'cabeçalho 1', 'heading 1'], atalho: '#', sigla: 'H1' },
  { id: 'titulo2', nome: 'Título 2', apelidos: ['h2', 'título2', 'subtítulo', 'cabeçalho 2', 'heading 2'], atalho: '##', sigla: 'H2' },
  { id: 'titulo3', nome: 'Título 3', apelidos: ['h3', 'título3', 'cabeçalho 3', 'heading 3'], atalho: '###', sigla: 'H3' },
  { id: 'numerada', nome: 'Lista numerada', apelidos: ['numerada', 'lista ordenada', 'número', 'ol', 'numbered list'], atalho: '1.' },
  { id: 'marcadores', nome: 'Lista com marcadores', apelidos: ['marcadores', 'tópicos', 'lista simples', 'ul', 'bullet list'], atalho: '-' },
  { id: 'tarefas', nome: 'Lista de tarefas', apelidos: ['tarefa', 'checklist', 'pendência', 'caixa de seleção', 'todo', 'to-do'], atalho: '[]' },
  { id: 'citacao', nome: 'Citação', apelidos: ['citar', 'quote', 'blockquote'], atalho: '>' },
  { id: 'divisor', nome: 'Divisor', apelidos: ['linha', 'separador', 'régua', 'hr', 'divider'], atalho: '---' },
  { id: 'imagem', nome: 'Imagem', apelidos: ['foto', 'figura', 'print', 'captura', 'img', 'image'], dica: 'colar ou enviar' },
];

export function blocoPorId(id: IdBloco): BlocoNota {
  return BLOCOS_NOTA.find(b => b.id === id) as BlocoNota;
}

/**
 * Quão bem um nome (já normalizado) casa com a consulta (já normalizada).
 * Menor é melhor; `null` é "não casa".
 *   0  igual ("h1", "imagem")
 *   1  começa igual ("tit" → "titulo 1")
 *   2  cada palavra da consulta começa uma palavra do nome ("lista t" → "lista de tarefas")
 *   3  aparece no meio, com 3 letras ou mais ("rada" → "lista numerada")
 */
function pontuarNome(nome: string, consulta: string): number | null {
  if (nome === consulta) return 0;
  if (nome.startsWith(consulta)) return 1;
  const palavras = nome.split(' ');
  if (consulta.split(' ').every(t => palavras.some(p => p.startsWith(t)))) return 2;
  if (consulta.length >= 3 && nome.includes(consulta)) return 3;
  return null;
}

/** O atalho compara cru: "#", "1.", "[]" e "---" não têm acento nem caixa. */
function pontuarAtalho(atalho: string | undefined, crua: string): number | null {
  if (!atalho) return null;
  if (atalho === crua) return 0;
  if (atalho.startsWith(crua)) return 1;
  return null;
}

function pontuar(bloco: BlocoNota, consulta: string, crua: string): number | null {
  let melhor: number | null = pontuarAtalho(bloco.atalho, crua);
  for (const nome of [bloco.nome, ...bloco.apelidos]) {
    const p = consulta ? pontuarNome(chaveDoNome(nome), consulta) : null;
    if (p !== null && (melhor === null || p < melhor)) melhor = p;
  }
  return melhor;
}

/**
 * Os blocos que casam com o texto digitado depois da "/", do melhor para o
 * pior; no empate, a ordem do menu. Sem acento e sem caixa (`chaveDoNome`),
 * por nome, apelido ou atalho de markdown. Consulta vazia devolve todos.
 */
export function filtrarBlocos(consulta: string, blocos: readonly BlocoNota[] = BLOCOS_NOTA): BlocoNota[] {
  const chave = chaveDoNome(consulta);
  const crua = consulta.trim();
  if (!chave) return [...blocos];
  return blocos
    .map((bloco, ordem) => ({ bloco, ordem, nota: pontuar(bloco, chave, crua) }))
    .filter((c): c is { bloco: BlocoNota; ordem: number; nota: number } => c.nota !== null)
    .sort((a, b) => a.nota - b.nota || a.ordem - b.ordem)
    .map(c => c.bloco);
}
