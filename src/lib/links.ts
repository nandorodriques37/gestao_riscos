// A regra única de link da aba Anotações: o que pode virar `<a href>` numa
// página. O editor (a extensão Link, em `EditorNota`) e a barra flutuante
// (`BolhaFormato`) leem esta função — não existe uma segunda lista.
//
// Só web e e-mail: `http(s)://` e `mailto:`. Qualquer outro esquema fica de
// fora — `javascript:`, `data:`, `vbscript:`, e também `ftp:` ou `tel:`, que a
// regra padrão do TipTap aceitaria.

/**
 * Espaço, caractere de controle e de formatação (largura zero) em qualquer
 * ponto. O navegador ignora tab e quebra de linha dentro do esquema
 * (`java&#9;script:` executa), então a conferência é feita sem eles. Tirar
 * também os outros invisíveis não abre brecha: com um deles no meio, o
 * navegador não reconhece esquema nenhum e lê o endereço como caminho.
 */
const INVISIVEIS = /[\p{Cc}\p{Cf}\p{Z}]/gu;

const WEB_OU_EMAIL = /^(?:https?:\/\/|mailto:)/i;

/** Começa com um esquema (`algo:`). Porta não conta: `exemplo.com:8080` não tem esquema. */
const COM_ESQUEMA = /^[a-z][a-z0-9+.-]*:(?!\d)/i;

/**
 * Endereço sem esquema que o autolink reconhece no texto digitado:
 * "www.exemplo.com", "exemplo.com.br/x", "fulano@empresa.com". Caminho
 * relativo ("/x", "#topo", "./a") não é endereço da web.
 */
const DOMINIO_OU_EMAIL = /^(?:[^@/?#:]+@)?[^@/?#:.]+(?:\.[^@/?#:.]+)+(?::\d+)?(?:[/?#].*)?$/;

/**
 * O link pode existir? Nunca lança: o `href` de uma marca gravada pode vir
 * nulo, numérico ou ausente (documento escrito direto na API), e o editor
 * chama esta regra ao desenhar — um erro aqui derrubaria a tela inteira.
 *
 * `defaultValidate` é a validação padrão que a extensão Link do TipTap entrega
 * quando pergunta. Ela só decide o caso SEM esquema: o autolink e a colagem
 * conferem o texto como digitado ("www.exemplo.com", "fulano@empresa.com")
 * antes de pôr o `https://` ou o `mailto:`. Sem ela (a barra flutuante, que
 * já normalizou o endereço), endereço sem esquema é recusado.
 */
export function linkPermitido(url: unknown, defaultValidate?: (url: string) => boolean): boolean {
  if (typeof url !== 'string') return false;
  const limpo = url.replace(INVISIVEIS, '');
  if (!limpo) return false;
  if (WEB_OU_EMAIL.test(limpo)) return true;
  if (COM_ESQUEMA.test(limpo)) return false;
  if (typeof defaultValidate !== 'function' || !DOMINIO_OU_EMAIL.test(limpo)) return false;
  try {
    return defaultValidate(limpo) === true;
  } catch {
    return false;
  }
}

/**
 * A mesma regra no formato do `isAllowedUri` da extensão Link do TipTap
 * (`(url, ctx) => boolean`). É o que o editor configura.
 */
export function linkPermitidoNoEditor(url: unknown, ctx?: { defaultValidate?: (url: string) => boolean }): boolean {
  return linkPermitido(url, ctx?.defaultValidate);
}
