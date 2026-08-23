// Plano de ação de um risco, agora com uma fonte só: a tabela `acoes_risco`.
//
// O editor continua existindo — o que acabou foi a cópia. Antes o mesmo plano
// vivia em `risk_records.acoes_itens` (array JSON, editável) e em `acoes_risco`
// (linhas próprias, lidas pelo Rastro e pelas métricas). Duas verdades sobre a
// mesma coisa, e nenhuma garantia de que concordassem.
//
// Agora o editor lê e escreve `acoes_risco`. `acoes` continua sendo mantido,
// mas como RESUMO derivado — é o que a coluna da tabela, a busca, o Gráficos, o
// CSV e o KPI de completude consomem. `acoes_itens` para de ser escrito e fica
// como histórico; nada é apagado.
import type { AcaoRisco, Pessoa, RiskRecord, StatusAcaoRisco } from '../types';
import { parseAcoes } from './acoes';

// Vive em `nomes.ts` para a API poder usá-la sem arrastar código de tela
// junto; reexportada aqui para os importadores antigos não mudarem.
import { chaveDoNome } from './nomes';
export { chaveDoNome };

/** Separador do resumo textual gravado em `acoes`. Igual ao de `resumirAcoes`. */
const RESUMO_SEP = ' · ';

/** Status que o editor oferece, na ordem em que uma ação costuma andar. */
export const STATUS_EDITAVEIS: readonly StatusAcaoRisco[] = [
  'aberta', 'em_andamento', 'concluida', 'cancelada',
];

/**
 * Uma linha do plano enquanto está sendo editada.
 *
 * `dono` é texto, não `dono_id`: o campo sempre foi um nome digitado com
 * autocomplete, e trocar isso por um select de pessoas tiraria do usuário a
 * capacidade de cadastrar alguém no meio do preenchimento. A ligação com
 * `pessoas` é resolvida na gravação — ver `resolverDono`.
 */
export interface LinhaPlano {
  /** Id da linha em `acoes_risco`, ou um id local enquanto ela é nova. */
  id: string;
  /** Verdadeiro enquanto a linha não existe no banco. */
  nova: boolean;
  descricao: string;
  dono: string;
  /** 'YYYY-MM-DD' ou '' — formato nativo do <input type="date">. */
  prazo: string;
  status: StatusAcaoRisco;
  /** Iniciativa que executa esta mitigação, quando há uma. Não editável aqui. */
  iniciativa_id: string | null;
  /** Versão da linha no banco, para a concorrência otimista. */
  version?: number;
}

function novoId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `linha-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export function linhaVazia(): LinhaPlano {
  return {
    id: novoId(), nova: true, descricao: '', dono: '', prazo: '',
    status: 'aberta', iniciativa_id: null,
  };
}


/** Converte as linhas gravadas na forma que o editor manipula. */
export function paraLinhas(acoes: AcaoRisco[], pessoas: Pessoa[]): LinhaPlano[] {
  const nomePorId = new Map(pessoas.map(p => [p.id, p.nome]));
  return acoes.map(a => ({
    id: a.id,
    nova: false,
    descricao: a.descricao,
    dono: a.dono_id ? nomePorId.get(a.dono_id) ?? '' : '',
    prazo: a.prazo ?? '',
    status: a.status || 'aberta',
    iniciativa_id: a.iniciativa_id,
    version: a.version,
  }));
}

/**
 * Linhas a partir do plano antigo, para um risco que ainda não foi extraído.
 *
 * Todas nascem `nova: true` — só existem de fato quando alguém salvar. Abrir e
 * fechar o modal sem mexer em nada não grava linha nenhuma.
 */
export function linhasDeLegado(
  record: Pick<RiskRecord, 'acoes' | 'acoes_itens' | 'responsavel' | 'status'>,
): LinhaPlano[] {
  const STATUS: Record<string, StatusAcaoRisco> = {
    'A fazer': 'aberta',
    'Em andamento': 'em_andamento',
    'Concluída': 'concluida',
  };
  return parseAcoes(record).map(item => ({
    id: novoId(),
    nova: true,
    descricao: item.descricao,
    dono: item.responsavel,
    prazo: item.prazo,
    status: STATUS[item.status] ?? 'aberta',
    iniciativa_id: null,
  }));
}

export interface DiffPlano {
  criar: LinhaPlano[];
  atualizar: LinhaPlano[];
  remover: LinhaPlano[];
}

/** Campos da linha que viajam para o banco. */
function campos(l: LinhaPlano, donoId: string | null): Record<string, unknown> {
  return {
    descricao: l.descricao.trim(),
    dono_id: donoId,
    prazo: l.prazo || null,
    status: l.status,
  };
}

/**
 * O que mudou entre o que estava gravado e o que está na tela.
 *
 * Linha nova sem descrição é descartada em silêncio: é a linha em branco que
 * alguém adicionou e não preencheu, e criá-la só sujaria o rastro.
 */
export function diffPlano(base: LinhaPlano[], atual: LinhaPlano[]): DiffPlano {
  const porId = new Map(base.map(l => [l.id, l]));
  const vistos = new Set<string>();

  const criar: LinhaPlano[] = [];
  const atualizar: DiffPlano['atualizar'] = [];

  for (const linha of atual) {
    if (linha.nova) {
      if (linha.descricao.trim()) criar.push(linha);
      continue;
    }
    vistos.add(linha.id);
    const antes = porId.get(linha.id);
    if (!antes) continue;
    const mudou = antes.descricao !== linha.descricao
      || antes.dono !== linha.dono
      || antes.prazo !== linha.prazo
      || antes.status !== linha.status;
    if (mudou) atualizar.push(linha);
  }

  const remover = base.filter(l => !vistos.has(l.id));
  return { criar, atualizar, remover };
}

/**
 * Resumo textual gravado em `acoes`.
 *
 * Ação cancelada fica de fora: o resumo alimenta a coluna "Ações", a busca, o
 * Gráficos e o KPI de completude, e uma mitigação abandonada não deveria contar
 * como plano existente em nenhum dos quatro.
 */
export function resumoDoPlano(linhas: LinhaPlano[]): string {
  return linhas
    .filter(l => l.status !== 'cancelada')
    .map(l => l.descricao.trim())
    .filter(Boolean)
    .join(RESUMO_SEP);
}

/** Data local de hoje em 'YYYY-MM-DD', para comparar com o valor do input. */
function hojeISO(hoje: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${hoje.getFullYear()}-${p(hoje.getMonth() + 1)}-${p(hoje.getDate())}`;
}

/** Prazo vencido e ação ainda viva. Vencer hoje não é atraso. */
export function linhaAtrasada(l: LinhaPlano, hoje: Date = new Date()): boolean {
  if (!l.prazo) return false;
  if (l.status === 'concluida' || l.status === 'cancelada') return false;
  return l.prazo < hojeISO(hoje);
}

/* ------------------------------------------------------------------ */
/* Gravação                                                            */
/* ------------------------------------------------------------------ */

/** As três chamadas que a gravação precisa. Injetadas para poderem ser fingidas no teste. */
export interface ApiPlano {
  criarPessoa: (nome: string) => Promise<Pessoa>;
  criarAcao: (dados: Record<string, unknown>) => Promise<AcaoRisco>;
  atualizarAcao: (id: string, patch: Record<string, unknown>) => Promise<AcaoRisco>;
  removerAcao: (id: string) => Promise<void>;
}

export interface ResultadoSalvar {
  criadas: number;
  atualizadas: number;
  removidas: number;
  pessoasCriadas: string[];
  /** As linhas que de fato ficaram no banco depois de tudo. */
  linhas: LinhaPlano[];
  /** Resumo derivado das linhas que persistiram — nunca do que se pretendia salvar. */
  resumo: string;
  /** Mensagens das operações que falharam. Vazio = tudo passou. */
  erros: string[];
}

/**
 * Aplica o plano editado.
 *
 * A ordem importa e falha segura: as LINHAS são gravadas primeiro, e só depois
 * o chamador deriva `acoes` do que realmente persistiu. Se uma linha falhar, o
 * resumo sai consistente com o banco em vez de anunciar uma ação que não existe.
 *
 * Cada operação é isolada: uma falha não impede as outras, e o que deu errado
 * volta em `erros` para a tela dizer o que não entrou.
 */
export async function salvarPlano(opts: {
  riscoId: string;
  base: LinhaPlano[];
  atual: LinhaPlano[];
  pessoas: Pessoa[];
  api: ApiPlano;
}): Promise<ResultadoSalvar> {
  const { riscoId, base, atual, pessoas, api } = opts;
  const diff = diffPlano(base, atual);

  const erros: string[] = [];
  const pessoasCriadas: string[] = [];
  // Índice de nomes já conhecidos, que cresce conforme pessoas são criadas —
  // duas linhas com o mesmo dono novo não podem virar duas pessoas.
  const idPorChave = new Map(pessoas.map(p => [chaveDoNome(p.nome), p.id]));

  async function resolverDono(nome: string): Promise<string | null> {
    const limpo = nome.trim();
    if (!limpo) return null;
    const chave = chaveDoNome(limpo);
    const existente = idPorChave.get(chave);
    if (existente) return existente;
    try {
      const nova = await api.criarPessoa(limpo);
      idPorChave.set(chave, nova.id);
      pessoasCriadas.push(limpo);
      return nova.id;
    } catch {
      // Sem pessoa, a ação ainda vale: grava sem dono em vez de perder a linha.
      erros.push(`Não foi possível cadastrar "${limpo}" como responsável.`);
      return null;
    }
  }

  let criadas = 0;
  let atualizadas = 0;
  let removidas = 0;

  // O que sobreviveu a cada operação, indexado pelo id que a linha tinha na
  // TELA — é por ele que a ordem final é remontada no fim.
  const sobreviventes = new Map<string, LinhaPlano>();
  // Remoções que falharam: continuam no banco, mas não estão mais na tela.
  const remocoesFalhas: LinhaPlano[] = [];

  // 1. Remoções primeiro: liberam espaço e não dependem de nada.
  for (const linha of diff.remover) {
    try {
      await api.removerAcao(linha.id);
      removidas++;
    } catch {
      erros.push(`Não foi possível remover "${linha.descricao.slice(0, 40)}".`);
      remocoesFalhas.push(linha);
    }
  }

  // 2. Atualizações.
  for (const linha of diff.atualizar) {
    try {
      const donoId = await resolverDono(linha.dono);
      const salva = await api.atualizarAcao(linha.id, campos(linha, donoId));
      atualizadas++;
      sobreviventes.set(linha.id, { ...linha, version: salva.version });
    } catch {
      erros.push(`Não foi possível gravar "${linha.descricao.slice(0, 40)}".`);
      // Mantém o que estava no banco, não o que a tela mostrava.
      const antes = base.find(b => b.id === linha.id);
      if (antes) sobreviventes.set(linha.id, antes);
    }
  }

  // 3. Criações.
  for (const linha of diff.criar) {
    try {
      const donoId = await resolverDono(linha.dono);
      const criada = await api.criarAcao({
        risco_id: riscoId,
        iniciativa_id: null,
        ...campos(linha, donoId),
        // Nasce classificada: veio de uma decisão explícita no editor, não da
        // fila da migração. Sem isso a aba Triagem voltaria a aparecer.
        triagem: 'acao',
      });
      criadas++;
      sobreviventes.set(linha.id, { ...linha, id: criada.id, nova: false, version: criada.version });
    } catch {
      erros.push(`Não foi possível criar "${linha.descricao.slice(0, 40)}".`);
    }
  }

  // Ordem final: a da tela, porque é assim que quem editou espera reencontrar o
  // plano. Linha que não foi mexida sai como estava; o que falhou ao remover
  // volta para o fim, já que continua existindo no banco.
  const inalteradas = new Set(base.map(l => l.id));
  const linhas: LinhaPlano[] = [];
  for (const linha of atual) {
    const salva = sobreviventes.get(linha.id);
    if (salva) { linhas.push(salva); continue; }
    // Não foi criada, atualizada nem removida: continua igual ao que estava.
    if (!linha.nova && inalteradas.has(linha.id)) linhas.push(linha);
  }
  linhas.push(...remocoesFalhas);

  return {
    criadas, atualizadas, removidas, pessoasCriadas, linhas,
    resumo: resumoDoPlano(linhas),
    erros,
  };
}
