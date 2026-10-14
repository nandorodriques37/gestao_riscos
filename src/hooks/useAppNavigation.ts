import { useCallback, useEffect, useRef, useState } from 'react';
import { canNavigate, readRoute, temGuard, routeHash, type AppRoute } from '../lib/navigation';

/**
 * Destino e seleção na URL, com Voltar/Avançar do navegador.
 *
 * Uma navegação GUARDADA (alguém com rascunho sujo, texto recusado ou imagem
 * subindo responde antes) pode levar segundos: um diálogo esperando a pessoa,
 * ou o envio de uma gravação na fila. Enquanto ela espera, duas regras:
 *
 * - O destino que a pessoa pediu tem a vez. Correção automática da URL — o
 *   `navigate(..., true)`, que substitui a entrada do histórico: a escolha da
 *   primeira página das Anotações, o recorte limpo — é descartada em vez de
 *   passar por cima. Antes ela trocava `lastHash` no meio da espera, e o
 *   destino pedido no Voltar sumia calado quando o guard dizia "pode ir".
 * - Navegação explícita do app (sem `replace`) ainda vale: é um clique mais
 *   novo que o Voltar, e o mais novo ganha. A espera que perdeu não reaplica
 *   o destino dela.
 *
 * `perguntar` é o `canNavigate` que conta como espera; o `App` usa este no
 * lugar do outro, para a regra valer também para as trocas que ele inicia.
 */
export function useAppNavigation() {
  const [route, setRoute] = useState(() => readRoute(window.location.hash));
  const lastHash = useRef(window.location.hash);
  /** Navegações guardadas esperando resposta (do navegador ou do app). */
  const esperas = useRef(0);
  /** Sobe a cada navegação aplicada: a espera que perdeu a vez sabe que perdeu. */
  const geracao = useRef(0);

  const emEspera = useCallback(() => esperas.current > 0, []);

  const perguntar = useCallback(async () => {
    esperas.current++;
    try { return await canNavigate(); } finally { esperas.current--; }
  }, []);

  /** Aplica o destino. `false` quando foi descartado (correção automática durante uma espera). */
  const navigate = useCallback((next: AppRoute, replace = false): boolean => {
    if (replace && esperas.current > 0) return false;
    const hash = routeHash(next);
    if (hash !== window.location.hash) {
      if (replace) window.history.replaceState(null, '', hash);
      else window.history.pushState(null, '', hash);
    }
    geracao.current++;
    lastHash.current = hash; setRoute(next);
    return true;
  }, []);

  useEffect(() => {
    const read = async () => {
      const alvo = window.location.hash, base = lastHash.current;
      if (alvo === base) return;
      if (temGuard()) {
        // O navegador já andou: volta para onde estava enquanto o diálogo pergunta,
        // e só reaplica o destino se o usuário confirmar e nada mais navegou.
        window.history.pushState(null, '', base || '#tab=painel');
        const antes = geracao.current;
        if (!(await perguntar()) || geracao.current !== antes) return;
        window.history.pushState(null, '', alvo);
      }
      geracao.current++;
      lastHash.current = alvo; setRoute(readRoute(alvo));
    };
    const ouvir = () => { void read(); };
    window.addEventListener('popstate', ouvir); window.addEventListener('hashchange', ouvir);
    return () => { window.removeEventListener('popstate', ouvir); window.removeEventListener('hashchange', ouvir); };
  }, [perguntar]);

  return { route, navigate, perguntar, emEspera };
}
