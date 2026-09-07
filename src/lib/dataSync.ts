export type DataSource = 'riscos' | 'tarefas' | 'portfolio';
const listeners = new Set<(source: DataSource) => void>();
export function invalidarDados(source: DataSource) { listeners.forEach(listener => listener(source)); }
export function observarDados(listener: (source: DataSource) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
