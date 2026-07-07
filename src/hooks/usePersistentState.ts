import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useState com persistência em localStorage. O valor inicial é lido do storage
 * (com fallback para `initial`) e cada alteração é gravada de volta. Usado para
 * preferências de UI que devem sobreviver ao recarregar a página — larguras de
 * coluna e seleção de filtros na aba Registro.
 */
export function usePersistentState<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void] {
  const initialRef = useRef(initial);

  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) return JSON.parse(raw) as T;
    } catch {
      // storage indisponível ou valor corrompido — usa o padrão
    }
    return initialRef.current;
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // storage indisponível — segue apenas em memória
    }
  }, [key, state]);

  const set = useCallback((value: T | ((prev: T) => T)) => {
    setState(value);
  }, []);

  return [state, set];
}
