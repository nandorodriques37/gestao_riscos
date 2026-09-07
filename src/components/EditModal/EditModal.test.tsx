// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { EditModal } from './EditModal';
import type { Iniciativa, StoredRiskRecord } from '../../types';
import type { RiscoSalvo, SalvarRiscoPedido } from '../../lib/portfolioApi';
vi.mock('../common/Historico', () => ({ Historico: () => null }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const record: StoredRiskRecord = {
  id: 'risk-1', version: 1, area: 'Operações', rotina: '', categoria: '', risco: 'Falha original', resposta: 'Mitigar',
  probab: 3, impact: 4, acoes: '', acoes_itens: [], resultado: '', esforco: null, impacto2: null, gravidade: null,
  recurso: '', responsavel: '', status: '', obs: '', exposicao_rs: null, causa_raiz: '', situacao: 'validado', data_situacao: null,
};
function props() {
  return { record, onCommit: vi.fn<(p: SalvarRiscoPedido) => Promise<RiscoSalvo | null>>().mockResolvedValue(null),
    onClose: vi.fn(), onDelete: vi.fn(), onAbrirIniciativa: vi.fn(), onPromoverAcao: vi.fn(),
    areaOptions: [], rotinaOptions: [], categoriaOptions: [], recursoOptions: [], responsavelOptions: [],
    acoesVinculadas: [], pessoas: [], objetivos: [],
    iniciativas: [{ id: 'i1', nome: 'Revisão de controles', status: 'backlog', dono_id: null, objetivo_id: null } as Iniciativa] };
}
it('falha mantém rascunho e versão-base; reenvio conserva a chave da operação', async () => {
  const p = props(), { rerender } = render(<EditModal {...p} />);
  fireEvent.change(screen.getByDisplayValue('Falha original'), { target: { value: 'Meu rascunho' } });
  rerender(<EditModal {...p} record={{ ...record, version: 5, risco: 'Outra edição' }} />);
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Salvar e fechar' })));
  expect(p.onCommit.mock.calls[0][0]).toMatchObject({ expectedVersion: 1, patch: { risco: 'Meu rascunho' } });
  expect(p.onClose).not.toHaveBeenCalled(); expect(screen.getByDisplayValue('Meu rascunho')).toBeTruthy();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Salvar' })));
  expect(p.onCommit.mock.calls[0][0].chave).toBe(p.onCommit.mock.calls[1][0].chave);
});
it('Cancelar permite continuar editando ou descartar, sem salvamento oculto', () => {
  const p = props(), confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(<EditModal {...p} />);
  fireEvent.change(screen.getByDisplayValue('Falha original'), { target: { value: 'Rascunho' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' })); expect(p.onClose).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' })); expect(p.onClose).toHaveBeenCalledOnce();
  expect(p.onCommit).not.toHaveBeenCalled();
});
it('vincula iniciativa existente junto com a nova ação e bloqueia duplo salvamento', async () => {
  const p = props(); let finish!: (value: RiscoSalvo | null) => void;
  p.onCommit.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  render(<EditModal {...p} />);
  fireEvent.click(screen.getByRole('button', { name: 'Tratamento' }));
  fireEvent.click(screen.getByRole('button', { name: '+ Adicionar ação' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Ação 1' }), { target: { value: 'Conferir processo' } });
  fireEvent.click(screen.getByRole('button', { name: 'Vincular a uma iniciativa' }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar iniciativa' }), { target: { value: 'revisao' } });
  fireEvent.click(screen.getByRole('button', { name: /Revisão de controles/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Salvando…' }));
  expect(p.onCommit).toHaveBeenCalledOnce();
  expect(p.onCommit.mock.calls[0][0].atual[0]).toMatchObject({ iniciativa_id: 'i1', descricao: 'Conferir processo' });
  expect(screen.getByRole('textbox', { name: 'Ação 1' }).matches(':disabled')).toBe(true);
  await act(async () => finish(null));
  expect(screen.getByDisplayValue('Conferir processo')).toBeTruthy();
});
it('cria iniciativa somente depois de receber o ID da ação salva', async () => {
  const p = props();
  p.onCommit.mockImplementation(async pedido => ({ record: { ...record, version: 2 }, acoes: [],
    plano: { linhas: [{ ...pedido.atual[0], id: 'id-confirmado', nova: false, version: 1 }], criadas: 1, atualizadas: 0, removidas: 0, pessoasCriadas: [], resumo: 'Nova ação', erros: [] } }));
  render(<EditModal {...p} />);
  fireEvent.click(screen.getByRole('button', { name: 'Tratamento' }));
  fireEvent.click(screen.getByRole('button', { name: '+ Adicionar ação' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Ação 1' }), { target: { value: 'Nova ação' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Salvar ação e criar iniciativa' })));
  expect(p.onPromoverAcao).toHaveBeenCalledWith('id-confirmado');
});
