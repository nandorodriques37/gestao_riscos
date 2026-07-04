const RETRY_BASE_DELAY = 3000;
const RETRY_MAX_DELAY = 20000;

/** Atraso (ms) antes da próxima tentativa de retry, com backoff exponencial e teto. */
export function nextRetryDelay(attempt: number): number {
  return Math.min(RETRY_MAX_DELAY, RETRY_BASE_DELAY * 2 ** attempt);
}
