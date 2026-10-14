// O nó de imagem de uma página. É a imagem do TipTap com três travas:
//
// 1. Só entra pelo parser (colar HTML, arrastar trecho de outra página) a
//    imagem cujo endereço é DESTA página. Remota, `data:`, `blob:` e a de outra
//    página ficam de fora aqui; quem decide o que fazer com elas é o colar
//    (`colagem.ts`), que reenvia as que dá para trazer.
// 2. Sem regra de digitação: `![x](https://…)` não vira imagem de fora.
// 3. Atributos só os que a página guarda: `src`, `alt`, `width`, `height`.
//
// O servidor confere a mesma regra ao gravar (`validarEntidade`); a trava daqui
// é o que impede o autosave de mandar um documento que ele recusaria.
import Image, { type ImageOptions } from '@tiptap/extension-image';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ehSrcDaNota } from '../../lib/notaImagens';
import { origemAtual, srcRelativo } from '../../lib/colagem';
import { ImagemNotaView } from './ImagemNotaView';

export interface OpcoesImagemNota extends ImageOptions {
  /** A página dona do editor. Um editor por página: nunca muda. */
  notaId: string;
  /** Abre o visualizador na imagem que está nesta posição do documento. */
  onAmpliar: ((pos: number) => void) | null;
}

function dimensao(valor: string | null): number | null {
  const n = Number.parseInt(valor ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export const ImagemNota = Image.extend<OpcoesImagemNota>({
  addOptions() {
    return {
      ...(this.parent?.() as ImageOptions),
      inline: false,
      allowBase64: false,
      notaId: '',
      onAmpliar: null,
    };
  },

  addAttributes() {
    return {
      src: { default: null, parseHTML: el => srcRelativo(el.getAttribute('src'), origemAtual()) || null },
      alt: { default: null, parseHTML: el => el.getAttribute('alt') || null },
      width: { default: null, parseHTML: el => dimensao(el.getAttribute('width')) },
      height: { default: null, parseHTML: el => dimensao(el.getAttribute('height')) },
    };
  },

  parseHTML() {
    return [{
      tag: 'img[src]',
      getAttrs: el => (
        ehSrcDaNota(srcRelativo((el as HTMLElement).getAttribute('src'), origemAtual()), this.options.notaId) ? null : false
      ),
    }];
  },

  addInputRules() {
    return [];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImagemNotaView);
  },
});
