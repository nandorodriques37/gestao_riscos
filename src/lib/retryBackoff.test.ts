import { describe, it, expect } from 'vitest';
import { nextRetryDelay } from './retryBackoff';

describe('nextRetryDelay', () => {
  it('dobra o atraso a cada tentativa', () => {
    expect(nextRetryDelay(0)).toBe(3000);
    expect(nextRetryDelay(1)).toBe(6000);
    expect(nextRetryDelay(2)).toBe(12000);
  });

  it('tem um teto máximo', () => {
    expect(nextRetryDelay(3)).toBe(20000); // 24000 -> capped
    expect(nextRetryDelay(10)).toBe(20000);
  });
});
