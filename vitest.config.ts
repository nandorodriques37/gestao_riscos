import { defineConfig } from 'vitest/config';

// As regras de negócio são funções puras (sem DOM) — ambiente node basta.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
