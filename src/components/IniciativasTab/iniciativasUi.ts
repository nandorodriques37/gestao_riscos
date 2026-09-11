import type { Marco } from '../../types';

export function dataPlanoMarco(m: Marco | null | undefined): string | null {
  return m?.data_plano_atual ?? m?.data_plano_original ?? null;
}

/** Pendências com prazo primeiro, incluindo as vencidas; entregues e canceladas ficam fora. */
export function proximoMarco(marcos: Marco[], iniciativaId: string): Marco | undefined {
  return marcos.filter(m => m.iniciativa_id === iniciativaId && m.status !== 'entregue' && m.status !== 'cancelado')
    .sort((a, b) => (dataPlanoMarco(a) ?? '9999').localeCompare(dataPlanoMarco(b) ?? '9999') || a.nome.localeCompare(b.nome, 'pt-BR'))[0];
}
