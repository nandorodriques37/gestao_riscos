// Saída do portfólio: um CSV de iniciativas e o backup completo em JSON.
//
// Existe porque o CSV do registro para no risco — ele não sabe nada de
// objetivo, marco ou cobertura. Sem isto, a única forma de tirar o portfólio do
// app era abrir a URL do backup na barra do navegador.
import type { AcaoRisco, Iniciativa, Marco, Objetivo, Pessoa, PortfolioBundle } from '../types';
import { computePrioriz, round2 } from './calculations';
import { estadoDoMarco } from './marcos';
import {
  ROTULO_FONTE, ROTULO_VETOR, ROTULO_STATUS_INICIATIVA, ROTULO_CONFIANCA,
} from './portfolioLabels';
import { hojeISO, marcosNoPrazo, slipMedio } from './portfolioMetrics';

const SEP = ';';

function esc(v: unknown): string {
  const s = v == null ? '' : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

/** Decimal com vírgula: é o que o Excel em pt-BR lê como número. */
function numero(v: number | null | undefined): string {
  return v == null ? '' : String(v).replace('.', ',');
}

const CABECALHO = [
  'Objetivo', 'Iniciativa', 'Descrição', 'Origem', 'Vetor', 'Status', 'Dono', 'Recurso',
  'Esforço', 'Impacto', 'Gravidade', 'Priorização',
  'Esforço (dias)', 'Impacto (R$)', 'Confiança',
  'Início', 'Fim planejado (original)', 'Fim planejado (atual)', 'Fim real',
  'Marcos', 'Marcos entregues', 'Marcos vencidos', '% no prazo', 'Slip médio (dias)',
  'Riscos cobertos', 'Resultado esperado', 'Observações',
];

export interface FontesDoCsv {
  iniciativas: Iniciativa[];
  objetivos: Objetivo[];
  pessoas: Pessoa[];
  marcos: Marco[];
  acoes: AcaoRisco[];
}

/**
 * Uma linha por iniciativa, com o objetivo, a saúde dos marcos e quantos riscos
 * ela cobre. É a visão que a reunião de portfólio pede — não a de risco.
 */
export function portfolioParaCSV(f: FontesDoCsv, hoje: Date = new Date()): string {
  const objetivoPorId = new Map(f.objetivos.map(o => [o.id, o.descricao]));
  const pessoaPorId = new Map(f.pessoas.map(p => [p.id, p.nome]));
  const hojeStr = hojeISO(hoje);

  const riscosPorIni = new Map<string, Set<string>>();
  for (const a of f.acoes) {
    if (!a.iniciativa_id || !a.risco_id) continue;
    const s = riscosPorIni.get(a.iniciativa_id) ?? new Set<string>();
    s.add(a.risco_id);
    riscosPorIni.set(a.iniciativa_id, s);
  }

  const linhas = [CABECALHO.map(esc).join(SEP)];

  for (const i of f.iniciativas) {
    const meus = f.marcos.filter(m => m.iniciativa_id === i.id);
    const prazo = marcosNoPrazo(meus, hoje);
    const slip = slipMedio(meus);
    const entregues = meus.filter(m => m.status === 'entregue').length;
    const vencidos = meus.filter(m => estadoDoMarco(m, hojeStr) === 'atrasado').length;
    const p = computePrioriz(i);

    linhas.push([
      i.objetivo_id ? objetivoPorId.get(i.objetivo_id) ?? '' : '',
      i.nome,
      i.descricao,
      ROTULO_FONTE[i.fonte],
      ROTULO_VETOR[i.vetor],
      ROTULO_STATUS_INICIATIVA[i.status],
      i.dono_id ? pessoaPorId.get(i.dono_id) ?? '' : '',
      i.recurso,
      numero(i.esforco),
      numero(i.impacto2),
      numero(i.gravidade),
      p == null ? '' : numero(round2(p)),
      numero(i.esforco_dias),
      numero(i.impacto_rs),
      ROTULO_CONFIANCA[i.confianca_impacto],
      i.inicio ?? '',
      i.fim_plano_original ?? '',
      i.fim_plano_atual ?? '',
      i.fim_real ?? '',
      String(meus.length),
      String(entregues),
      String(vencidos),
      prazo.pct == null ? '' : numero(Math.round(prazo.pct * 100)),
      slip.diasMedio == null ? '' : numero(slip.diasMedio),
      String(riscosPorIni.get(i.id)?.size ?? 0),
      i.resultado,
      i.obs,
    ].map(esc).join(SEP));
  }

  return linhas.join('\r\n');
}

/** Dispara o download de um texto como arquivo. */
export function baixarArquivo(conteudo: string, nome: string, mime: string): void {
  const blob = new Blob([conteudo], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** BOM na frente: sem ele o Excel abre acentuação quebrada. */
export function baixarPortfolioCSV(f: FontesDoCsv, hoje: Date = new Date()): void {
  const nome = `portfolio-${hojeISO(hoje)}.csv`;
  baixarArquivo(`﻿${portfolioParaCSV(f, hoje)}`, nome, 'text/csv');
}

/**
 * Baixa o dump completo — riscos, tarefas e todas as tabelas do portfólio.
 * É o que se guarda antes de qualquer migração, e o que prova depois que nada
 * se perdeu.
 */
export async function baixarBackup(hoje: Date = new Date()): Promise<void> {
  const res = await fetch('/api/portfolio/backup');
  if (!res.ok) throw new Error(`Falha ao gerar o backup (${res.status}).`);
  const dump = (await res.json()) as unknown;
  baixarArquivo(JSON.stringify(dump, null, 2), `backup-${hojeISO(hoje)}.json`, 'application/json');
}

/** Quantos itens o CSV do portfólio vai levar — para o botão dizer antes de clicar. */
export function tamanhoDoPortfolio(p: PortfolioBundle): number {
  return p.iniciativas.length;
}
