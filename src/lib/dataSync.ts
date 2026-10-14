/**
 * Aviso entre coleções: "gravei aqui, quem depende de mim relê".
 *
 * Riscos, tarefas e portfólio se invalidam entre si — uma mitigação é tarefa e
 * ação do portfólio ao mesmo tempo, e o resumo do plano mora no risco. As
 * páginas da aba Anotações ficam fora dessa teia: nada lê uma página e uma
 * página não lê nada. Sem a exceção, cada salvamento automático de uma página
 * (um a cada pausa na digitação) relia riscos, tarefas e o pacote inteiro do
 * portfólio, e cada gravação de risco baixava o texto de todas as páginas.
 */
export type DataSource = 'riscos' | 'tarefas' | 'portfolio' | 'notas';

/** Fontes que não invalidam nem são invalidadas pelas outras. */
const ISOLADAS: ReadonlySet<DataSource> = new Set<DataSource>(['notas']);

/**
 * Se uma gravação em `origem` deixa `alvo` desatualizado. A própria fonte
 * nunca: quem gravou já aceitou a resposta do servidor.
 */
export function invalida(origem: DataSource, alvo: DataSource): boolean {
  if (origem === alvo) return false;
  return !ISOLADAS.has(origem) && !ISOLADAS.has(alvo);
}

const listeners = new Set<(source: DataSource) => void>();
export function invalidarDados(source: DataSource) { listeners.forEach(listener => listener(source)); }
export function observarDados(listener: (source: DataSource) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
