import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
export function useSessionState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const storageKey = 'riskMatrix.session.' + key;
  const [value, setValue] = useState<T>(() => { try { return JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') ?? initial; } catch { return initial; } });
  useEffect(() => { try { sessionStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* preferência opcional */ } }, [storageKey, value]);
  return [value, setValue];
}
