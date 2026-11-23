import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, closestCorners,
  useSensor, useSensors,
  type Announcements, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import type { EnrichedTaskRow } from '../../lib/taskRows';
import type { TierKind } from '../../lib/calculations';
import { gutTier } from '../../lib/taskCalculations';
import { PRIORITY_BANDS, SEM_NOTA } from '../../lib/taskPriority';
import { TASK_STATUSES } from '../../types';
import type { KanbanGroupBy } from '../../lib/uiPrefs';
import { KanbanColumn } from './KanbanColumn';
import { KanbanCard, KanbanCardFace } from './KanbanCard';
import type { MoveOption } from './MoveMenu';
import type { Pessoa, TaskStatus } from '../../types';
import { agruparPorDono, grupoDaLinha, type OpcaoDono } from '../../lib/agrupamentoDono';
import { plural } from '../../lib/portfolioLabels';

interface TarefasKanbanProps {
  rows: EnrichedTaskRow[];
  groupBy: KanbanGroupBy;
  /** Recebe o índice da tarefa no array e o id da coluna de destino. */
  onMove: (idx: number, columnId: string) => void;
  onOpen: (idx: number) => void;
  onToggleConcluida: (idx: number) => void;
  onAdd: () => void;
  onDraggingChange: (dragging: boolean) => void;
  /** Fichas, para nomear as colunas quando o quadro é por responsável. */
  pessoas: Pessoa[];
  /**
   * Para quem a tarefa pode ser passada pelo menu ⋯ — todo o cadastro ativo,
   * não só quem já tem coluna: passar para quem está livre é o caso comum.
   */
  opcoesDono: OpcaoDono[];
  /** Mudança de status pelo menu, quando a coluna não é o status. */
  onStatus: (idx: number, status: TaskStatus) => void;
}

interface Column {
  id: string;
  label: string;
  tier?: TierKind;
  rows: EnrichedTaskRow[];
  /** Linha de apoio do cabeçalho (atrasadas, GUT crítico). */
  sub?: string;
  semDono?: boolean;
}

const TIER_POR_FAIXA: Record<string, TierKind> = {
  'Crítica': 'critico',
  'Alta': 'alto',
  'Média': 'medio',
  'Baixa': 'baixo',
  [SEM_NOTA]: 'null',
};

/** GUT decrescente; tarefa sem nota vai para o fim. Mesma ordem padrão da tabela. */
function porGutDesc(a: EnrichedTaskRow, b: EnrichedTaskRow): number {
  if (a.gut == null && b.gut == null) return 0;
  if (a.gut == null) return 1;
  if (b.gut == null) return -1;
  return b.gut - a.gut;
}

function buildColumns(rows: EnrichedTaskRow[], groupBy: KanbanGroupBy, pessoas: Pessoa[]): Column[] {
  const ordenadas = rows.slice().sort(porGutDesc);

  // Uma coluna por pessoa que tem tarefa na tela, na ordem da Lista agrupada:
  // mais atrasadas primeiro, "Sem dono" no fim. Quem não tem tarefa não vira
  // coluna vazia — recebe pelo menu ⋯ do card.
  if (groupBy === 'responsavel') {
    return agruparPorDono(ordenadas, pessoas).map(g => ({
      id: g.id,
      label: g.nome,
      rows: g.linhas,
      semDono: g.semDono,
      sub: [
        g.atrasadas > 0 ? plural(g.atrasadas, 'atrasada', 'atrasadas') : '',
        g.criticas > 0 ? `${g.criticas} GUT crítico` : '',
      ].filter(Boolean).join(' · ') || undefined,
    }));
  }

  if (groupBy === 'prioridade') {
    const ids = [...PRIORITY_BANDS, SEM_NOTA];
    return ids.map(id => ({
      id,
      label: id,
      tier: TIER_POR_FAIXA[id],
      rows: ordenadas.filter(r => (r.prioridade ?? SEM_NOTA) === id),
    }));
  }

  // Status é texto livre no banco. Além dos três oficiais, qualquer valor que
  // `normTaskStatus` não reconheça vira uma coluna própria — sem isso, uma tarefa
  // marcada como "Bloqueado" simplesmente sumiria do quadro.
  const extras = [...new Set(
    ordenadas.map(r => r.normSt).filter(s => !(TASK_STATUSES as readonly string[]).includes(s)),
  )];
  return [...TASK_STATUSES, ...extras].map(id => ({
    id,
    label: id,
    rows: ordenadas.filter(r => r.normSt === id),
  }));
}

/** Coluna vazia diz o que o drop vai fazer, não só que está vazia. */
function dicaDeDrop(groupBy: KanbanGroupBy, id: string, label: string): string {
  if (groupBy === 'responsavel') return `Solte aqui para passar a tarefa para ${label}`;
  if (groupBy === 'status') return `Solte aqui para marcar como ${label}`;
  if (id === SEM_NOTA) return 'Solte aqui para apagar as notas G, U e T';
  return `Solte aqui para priorizar como ${label}`;
}

const instrucoes = {
  draggable:
    'Para mover a tarefa, arraste o card até outra coluna. '
    + 'Sem mouse, use o botão de reticências do card e escolha o destino.',
};

export function TarefasKanban({
  rows, groupBy, onMove, onOpen, onToggleConcluida, onAdd, onDraggingChange, pessoas, opcoesDono, onStatus,
}: TarefasKanbanProps) {
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  // O teto da coluna é "o que sobra da viewport abaixo do quadro" — é isso que
  // mantém o cabeçalho e o rodapé da coluna à vista enquanto os cards rolam.
  // Medir o próprio quadro em vez de chutar um offset fixo é o que faz isso
  // continuar certo quando a faixa de KPIs quebra em duas linhas.
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const medir = () => {
      const topo = el.getBoundingClientRect().top + window.scrollY;
      el.style.setProperty('--kanban-offset', `${Math.round(topo) + 24}px`);
    };
    medir();
    const observer = new ResizeObserver(medir);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);

  // Mouse e toque em sensores separados: o TouchSensor só arma depois de 200ms
  // parado, que é o que deixa o dedo rolar o quadro sem levantar um card.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );

  const columns = useMemo(() => buildColumns(rows, groupBy, pessoas), [rows, groupBy, pessoas]);
  const porResponsavel = groupBy === 'responsavel';

  const moveOptions: MoveOption[] = useMemo(
    () => (porResponsavel
      ? opcoesDono.map(o => ({ id: o.id, label: o.nome }))
      : columns.map(c => ({ id: c.id, label: c.label }))),
    [porResponsavel, opcoesDono, columns],
  );

  // O leitor de tela anuncia a coluna pelo nome, não pelo id (que é um uuid
  // quando a coluna é uma pessoa).
  const nomeDaColuna = (id: string | number) => columns.find(c => c.id === String(id))?.label ?? String(id);

  const draggingRow = draggingIdx != null ? rows.find(r => r.idx === draggingIdx) ?? null : null;

  function colunaDe(row: EnrichedTaskRow): string {
    if (groupBy === 'responsavel') return grupoDaLinha(row);
    return groupBy === 'prioridade' ? row.prioridade ?? SEM_NOTA : row.normSt;
  }

  function handleDragStart(e: DragStartEvent) {
    setDraggingIdx(Number(e.active.id));
    onDraggingChange(true);
  }

  function finish() {
    setDraggingIdx(null);
    onDraggingChange(false);
  }

  function handleDragEnd(e: DragEndEvent) {
    finish();
    const destino = e.over?.id;
    if (destino == null) return;
    const idx = Number(e.active.id);
    const row = rows.find(r => r.idx === idx);
    if (!row || colunaDe(row) === destino) return;
    onMove(idx, String(destino));
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const row = rows.find(r => r.idx === Number(active.id));
      return `Pegou a tarefa ${row?.task.tarefa || 'sem título'}.`;
    },
    onDragOver: ({ over }) => (over ? `Sobre a coluna ${nomeDaColuna(over.id)}.` : 'Fora de qualquer coluna.'),
    onDragEnd: ({ active, over }) => {
      const row = rows.find(r => r.idx === Number(active.id));
      const nome = row?.task.tarefa || 'sem título';
      return over ? `Tarefa ${nome} levada para ${nomeDaColuna(over.id)}.` : `Tarefa ${nome} devolvida ao lugar.`;
    },
    onDragCancel: () => 'Movimento cancelado.',
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={finish}
      accessibility={{ announcements, screenReaderInstructions: instrucoes }}
    >
      <div className="kanban-board" ref={boardRef}>
        {columns.map(col => (
          <KanbanColumn
            key={col.id}
            id={col.id}
            label={col.label}
            tier={col.tier}
            sub={col.sub}
            semDono={col.semDono}
            count={col.rows.length}
            emptyHint={dicaDeDrop(groupBy, col.id, col.label)}
            onAdd={onAdd}
          >
            {col.rows.map(row => (
              <KanbanCard
                key={row.idx}
                row={row}
                currentColumnId={col.id}
                moveOptions={moveOptions}
                moveTitulo={porResponsavel ? 'Passar para' : 'Mover para'}
                onMove={onMove}
                onStatus={porResponsavel ? onStatus : undefined}
                onOpen={onOpen}
                onToggleConcluida={onToggleConcluida}
              />
            ))}
          </KanbanColumn>
        ))}
      </div>

      {/* O card levantado; o original fica no lugar, esmaecido, servindo de espaço reservado. */}
      <DragOverlay dropAnimation={null}>
        {draggingRow && (
          <div className="kanban-card kanban-card-overlay" data-tier={gutTier(draggingRow.gut)}>
            <KanbanCardFace
              row={draggingRow}
              currentColumnId={colunaDe(draggingRow)}
              moveOptions={moveOptions}
              moveTitulo={porResponsavel ? 'Passar para' : 'Mover para'}
              onMove={onMove}
              onToggleConcluida={onToggleConcluida}
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
