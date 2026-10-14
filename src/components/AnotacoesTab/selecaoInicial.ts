import { NodeSelection, TextSelection, type Selection } from '@tiptap/pm/state';
import { StepMap } from '@tiptap/pm/transform';
import { GapCursor } from '@tiptap/pm/gapcursor';

/**
 * A seleção com que a página abre nunca é um bloco inteiro.
 *
 * O ProseMirror abre o documento com `Selection.atStart`, e quando o primeiro
 * bloco é um átomo (imagem, divisor) isso devolve a seleção DO BLOCO: a
 * imagem já nasce com o anel e a barra, e o que o Enter no título faz depois
 * fica por conta do navegador (no Chromium o texto grudava no começo do
 * primeiro item da lista). No lugar dela vai o cursor de lacuna antes do bloco
 * (digitar cria um parágrafo acima, como no Notion); onde a lacuna não vale, o
 * texto mais próximo.
 */
export function semBlocoSelecionado(sel: Selection): Selection {
  if (!(sel instanceof NodeSelection)) return sel;
  const $antes = sel.$from;
  // `GapCursor.valid` não é público; o `map` da lacuna aplica a mesma regra e
  // só devolve uma lacuna onde ela vale.
  const lacuna = new GapCursor($antes).map($antes.doc, StepMap.empty);
  if (lacuna instanceof GapCursor) return lacuna;
  return TextSelection.findFrom($antes, 1, true) ?? TextSelection.findFrom($antes, -1, true) ?? sel;
}
