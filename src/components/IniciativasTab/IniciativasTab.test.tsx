// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IniciativasTab } from './IniciativasTab';
import type { UsePortfolio } from '../../hooks/usePortfolio';
import type { Iniciativa, Marco } from '../../types';
import { proximoMarco } from './iniciativasUi';
vi.mock('../common/Historico', () => ({ Historico: () => null }));
beforeEach(() => { sessionStorage.clear(); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const iniciativas = [
  { id: 'a', nome: 'Reformular BI de rupturas', objetivo_id: 'o', dono_id: 'p', fonte: 'risco', status: 'em_execucao' },
  { id: 'b', nome: 'Rever pedidos', objetivo_id: 'o', dono_id: 'p', fonte: 'risco', status: 'concluida' },
] as Iniciativa[];
const pf = { portfolio: { iniciativas, objetivos: [{ id: 'o', descricao: 'Disponibilidade' }], pessoas: [{ id: 'p', nome: 'Ana' }], marcos: [], acoes_risco: [] }, loading: false } as unknown as UsePortfolio;
function Harness({ recorte }: { recorte?: Set<string> }) {
  const [id, setId] = useState<string | null>(null);
  return <IniciativasTab riscos={[]} pf={pf} selecionada={id} onSelecionar={setId} onAbrirRisco={vi.fn()} idsDoRecorte={recorte} />;
}
it('abre detalhe exclusivo e volta preservando busca e foco', () => {
  render(<Harness />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Buscar iniciativas' }), { target: { value: 'rupturas' } });
  fireEvent.click(screen.getByRole('button', { name: 'Reformular BI de rupturas' }));
  expect(screen.queryByRole('textbox', { name: 'Buscar iniciativas' })).toBeNull();
  expect(screen.getByRole('heading', { name: 'Detalhe da iniciativa' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '← Voltar ao portfólio' }));
  expect((screen.getByRole('textbox', { name: 'Buscar iniciativas' }) as HTMLInputElement).value).toBe('rupturas');
  expect(screen.queryByRole('button', { name: 'Rever pedidos' })).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reformular BI de rupturas' }));
});
it('busca respeita também o recorte vindo do painel', () => {
  render(<Harness recorte={new Set(['a'])} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Buscar iniciativas' }), { target: { value: 'pedidos' } });
  expect(screen.getByText('Nenhuma iniciativa com esses filtros')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Rever pedidos' })).toBeNull();
});
it('indicadores filtram e grupos podem ser recolhidos', () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: /Concluídas/ }));
  expect(screen.getByRole('button', { name: 'Rever pedidos' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Reformular BI de rupturas' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Disponibilidade.*iniciativa/ }));
  expect(screen.queryByRole('button', { name: 'Rever pedidos' })).toBeNull();
});
it('próximo marco exclui entregues e cancelados e usa plano atual antes do original', () => {
  const marcos = [
    { id: '1', iniciativa_id: 'a', nome: 'Entregue', status: 'entregue', data_plano_original: '2020-01-01' },
    { id: '2', iniciativa_id: 'a', nome: 'Replanejado', status: 'previsto', data_plano_original: '2020-01-01', data_plano_atual: '2027-01-01' },
    { id: '3', iniciativa_id: 'a', nome: 'Vencido', status: 'previsto', data_plano_original: '2025-01-01' },
    { id: '4', iniciativa_id: 'a', nome: 'Cancelado', status: 'cancelado', data_plano_original: '2019-01-01' },
  ] as Marco[];
  expect(proximoMarco(marcos, 'a')?.id).toBe('3');
  expect(proximoMarco(marcos, 'b')).toBeUndefined();
});
