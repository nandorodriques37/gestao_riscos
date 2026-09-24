// Ordem da lista de objetivos — funções puras, sem rede nem estado.
//
// Duas coisas diferentes moram aqui e não podem se confundir:
//   - a ORDEM MANUAL, que é a ordem da lista que o servidor devolve (a coluna
//     `position`), vale para todos e só muda por reordenação explícita;
//   - a VISTA, que reordena na tela por impacto, progresso ou prazo e nunca
//     grava nada. Trocar de critério e voltar para Manual devolve a ordem
//     combinada intacta.
//
// Por isso as funções de mover trabalham com lista de ids, e não com o tipo
// Objetivo: o que se grava é a sequência, não o conteúdo.

export type CriterioObjetivos = 'manual' | 'impacto' | 'progresso' | 'prazo';

export const CRITERIOS_OBJETIVOS: readonly { id: CriterioObjetivos; rotulo: string }[] = [
  { id: 'manual', rotulo: 'Manual' },
  { id: 'impacto', rotulo: 'Impacto' },
  { id: 'progresso', rotulo: 'Progresso' },
  { id: 'prazo', rotulo: 'Prazo' },
];

/** Compara dois valores que podem faltar: ausência sempre fecha a fila. */
function nuloPorUltimo<V>(a: V | null, b: V | null, cmp: (x: V, y: V) => number): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return cmp(a, b);
}

/**
 * A lista na vista pedida. Nunca muta a entrada, e é estável: no empate vale a
 * ordem de entrada — que é a manual —, então dois objetivos sem prazo ficam na
 * ordem que o time combinou, e não numa ordem que muda a cada leitura.
 *
 * `metrica` é chamada uma vez por objetivo, e só pelos critérios que a usam.
 */
export function ordenarObjetivos<T extends { id: string; prazo: string | null }>(
  lista: T[],
  criterio: CriterioObjetivos,
  metrica: (o: T) => { impacto: number; progresso: number | null },
): T[] {
  if (criterio === 'manual') return [...lista];

  const usaMetrica = criterio === 'impacto' || criterio === 'progresso';
  const decorada = lista.map((o, pos) => ({
    o,
    pos,
    m: usaMetrica ? metrica(o) : null,
  }));

  const compara = (a: typeof decorada[number], b: typeof decorada[number]): number => {
    switch (criterio) {
      case 'impacto':
        return (b.m?.impacto ?? 0) - (a.m?.impacto ?? 0);
      case 'progresso':
        return nuloPorUltimo(a.m?.progresso ?? null, b.m?.progresso ?? null, (x, y) => y - x);
      case 'prazo':
        // 'YYYY-MM-DD' ordena como texto. Prazo em branco conta como ausente.
        return nuloPorUltimo(a.o.prazo || null, b.o.prazo || null, (x, y) => x.localeCompare(y));
      default:
        return 0;
    }
  };

  return decorada
    .sort((a, b) => compara(a, b) || a.pos - b.pos)
    .map(d => d.o);
}

/**
 * Sobe (-1) ou desce (+1) um item uma posição. É o caminho do teclado e do
 * modo Reordenar. Fora dos limites, ou id que não está na lista, devolve uma
 * cópia igual — a tela não precisa conferir antes de chamar.
 */
export function moverUm(ids: readonly string[], id: string, delta: -1 | 1): string[] {
  const copia = [...ids];
  const de = copia.indexOf(id);
  const para = de + delta;
  if (de < 0 || para < 0 || para >= copia.length) return copia;
  [copia[de], copia[para]] = [copia[para], copia[de]];
  return copia;
}

/**
 * Leva `id` para o lugar de `alvoId` — é o que o arraste faz ao soltar.
 *
 * Tira o item e o insere no índice ORIGINAL do alvo: vindo de cima, ele cai
 * logo abaixo do alvo; vindo de baixo, logo acima. É o comportamento que a
 * mão espera ao arrastar sobre uma linha, nos dois sentidos.
 */
export function moverPara(ids: readonly string[], id: string, alvoId: string): string[] {
  const copia = [...ids];
  const de = copia.indexOf(id);
  const para = copia.indexOf(alvoId);
  if (de < 0 || para < 0 || de === para) return copia;
  copia.splice(de, 1);
  copia.splice(para, 0, id);
  return copia;
}

/**
 * Aplica a nova ordem dos itens VISÍVEIS sobre a ordem completa.
 *
 * A tela só reordena o que mostra, mas o servidor grava a lista inteira. Os
 * lugares ocupados por visíveis recebem os visíveis na nova ordem; os ocultos
 * (abandonados escondidos, fora do recorte, o balde da migração) ficam
 * exatamente onde estavam. Reordenar com um filtro ligado não pode
 * embaralhar o que o filtro esconde.
 *
 * Id visível que não existe em `todos` é ignorado, assim como repetição.
 */
export function aplicarOrdemVisivel(
  todos: readonly string[], visiveisNaNovaOrdem: readonly string[],
): string[] {
  const existentes = new Set(todos);
  const fila: string[] = [];
  const naFila = new Set<string>();
  for (const id of visiveisNaNovaOrdem) {
    if (!existentes.has(id) || naFila.has(id)) continue;
    fila.push(id);
    naFila.add(id);
  }

  let proximo = 0;
  return todos.map(id => (naFila.has(id) && proximo < fila.length ? fila[proximo++] : id));
}
