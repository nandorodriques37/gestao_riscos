import { useCallback } from 'react';
import type { RiskRecord } from '../types';
import { fetchRecords, createRecordApi, patchRecordApi, deleteRecordApi, restoreRecordsApi } from '../lib/api';
import { useStoredCollection } from './useStoredCollection';
import { invalidarDados } from '../lib/dataSync';
export type { SaveStatus } from './useStoredCollection';
const adapter = { source: 'riscos' as const, cache: 'riskMatrix.cache.v1', fetch: fetchRecords, create: createRecordApi, patch: patchRecordApi, remove: deleteRecordApi };
export function useRecords() {
  const c = useStoredCollection(adapter);
  const { add, commit } = c;
  const addRecord = useCallback((data: Partial<RiskRecord> = {}) => add(data), [add]);
  const restore = useCallback(async () => { commit(await restoreRecordsApi()); invalidarDados('riscos'); }, [commit]);
  return { records: c.items, loading: c.loading, error: c.error, saveStatus: c.saveStatus,
    updateRecordById: c.update, saveRecord: c.saveNow, acceptRecord: c.accept, addRecord, deleteRecordById: c.remove,
    restore, refresh: c.refresh, flushPending: c.flushPending, clearError: c.clearError, hasPendingWrites: c.hasPendingWrites };
}
export type UseRecords = ReturnType<typeof useRecords>;
