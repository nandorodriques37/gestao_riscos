/**
 * Zoom de leitura das Anotações: o tamanho do texto da página, escolhido por
 * quem lê. É preferência DESTA tela (localStorage), não formatação: a página
 * de ninguém muda, e quem abre a mesma nota vê no tamanho que escolheu.
 *
 * Degraus fixos, em porcentagem. 100 é a escala do sistema (corpo de 16px).
 */
export const ZOOMS_NOTA = [90, 100, 115, 130, 150] as const;
export type ZoomNota = (typeof ZOOMS_NOTA)[number];

export const ZOOM_PADRAO: ZoomNota = 100;

const CHAVE = 'riskMatrix.notas.zoom.v1';

function ehZoom(valor: unknown): valor is ZoomNota {
  return typeof valor === 'number' && (ZOOMS_NOTA as readonly number[]).includes(valor);
}

/** O degrau gravado; o padrão quando não há, ou quando o valor não é um degrau. */
export function lerZoomNota(): ZoomNota {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (bruto) {
      const valor: unknown = JSON.parse(bruto);
      if (ehZoom(valor)) return valor;
    }
  } catch {
    // storage ausente/corrompido — vale o padrão
  }
  return ZOOM_PADRAO;
}

export function gravarZoomNota(zoom: ZoomNota): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(zoom));
  } catch {
    // storage indisponível — o zoom vale só enquanto a tela estiver aberta
  }
}

/** O degrau vizinho; o próprio quando já está na ponta. */
export function passoZoom(zoom: ZoomNota, sentido: 1 | -1): ZoomNota {
  const i = ZOOMS_NOTA.indexOf(zoom);
  return ZOOMS_NOTA[Math.min(ZOOMS_NOTA.length - 1, Math.max(0, i + sentido))];
}
