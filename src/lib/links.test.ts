import { describe, expect, it, vi } from 'vitest';
import { isAllowedUri } from '@tiptap/extension-link';
import { linkPermitido, linkPermitidoNoEditor } from './links';

/** A validação padrão que a extensão Link entrega no `ctx` (a mesma função dela). */
const padrao = (url: string) => !!isAllowedUri(url);

describe('linkPermitido', () => {
  it('aceita web e e-mail', () => {
    expect(linkPermitido('https://www.paguemenos.com.br')).toBe(true);
    expect(linkPermitido('http://exemplo.com/a?b=1#c')).toBe(true);
    expect(linkPermitido('  HTTPS://EXEMPLO.COM  ')).toBe(true);
    expect(linkPermitido('mailto:fulano@empresa.com.br')).toBe(true);
  });

  it('recusa javascript:, data:, vbscript: e os disfarces com espaço e controle', () => {
    for (const url of [
      'javascript:alert(1)',
      ' JaVaScRiPt:alert(1)',
      'java\tscript:alert(1)',
      'java\nscript:alert(1)',
      'jav\u0000ascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'ftp://exemplo.com',
      'tel:+5585999999999',
    ]) {
      expect(linkPermitido(url, padrao), url).toBe(false);
    }
  });

  it('nunca lança: href nulo, numérico, ausente ou objeto é recusado', () => {
    for (const url of [null, undefined, 5, NaN, {}, [], true, '', '   ']) {
      expect(() => linkPermitido(url, padrao)).not.toThrow();
      expect(linkPermitido(url, padrao)).toBe(false);
    }
    expect(linkPermitido('www.exemplo.com', () => { throw new Error('quebrou'); })).toBe(false);
  });

  it('sem esquema, só com a validação padrão do Link e só domínio ou e-mail', () => {
    // O texto como digitado, que o autolink confere antes de pôr o protocolo.
    expect(linkPermitido('www.paguemenos.com.br', padrao)).toBe(true);
    expect(linkPermitido('exemplo.com.br/caminho?x=1', padrao)).toBe(true);
    expect(linkPermitido('fulano@empresa.com.br', padrao)).toBe(true);
    // Sem a validação (a barra flutuante, que já normalizou): recusa.
    expect(linkPermitido('www.paguemenos.com.br')).toBe(false);
    // Caminho relativo não é endereço da web, mesmo que o padrão do TipTap aceite.
    for (const url of ['/api/portfolio', '#topo', './a', '?q=1']) {
      expect(padrao(url), url).toBe(true);
      expect(linkPermitido(url, padrao), url).toBe(false);
    }
  });

  it('no formato do isAllowedUri, passa a validação do ctx adiante', () => {
    const defaultValidate = vi.fn(() => true);
    expect(linkPermitidoNoEditor('www.exemplo.com', { defaultValidate })).toBe(true);
    expect(defaultValidate).toHaveBeenCalledWith('www.exemplo.com');
    expect(linkPermitidoNoEditor(null, { defaultValidate })).toBe(false);
    expect(linkPermitidoNoEditor('www.exemplo.com')).toBe(false);
  });
});
