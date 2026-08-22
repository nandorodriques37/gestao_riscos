import type { Marco } from '../types';

export type EstadoMarco = 'entregue' | 'atrasado' | 'previsto' | 'cancelado';

/**
 * Estado visual do marco. `atrasado` não é um status do banco: é `previsto` com
 * a data atual já vencida. Guardar isso como coluna daria um campo que precisa
 * de um cron para continuar verdadeiro.
 */
export function estadoDoMarco(m: Marco, hoje: string): EstadoMarco {
  if (m.status === 'cancelado') return 'cancelado';
  if (m.status === 'entregue') return 'entregue';
  const data = m.data_plano_atual ?? m.data_plano_original;
  return data != null && data < hoje ? 'atrasado' : 'previsto';
}

/** Data em que o marco de fato está hoje: a real, se houver; senão a planejada. */
export function dataEfetiva(m: Marco): string | null {
  return m.data_real ?? m.data_plano_atual ?? m.data_plano_original;
}
