import { defineConfig } from 'vitest/config';

// As regras de negócio são funções puras (sem DOM) — ambiente node basta.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'api/**/*.test.ts'],

    // Cada arquivo de teste de API sobe um Postgres embarcado (pglite) no
    // `beforeAll`. Com vários arquivos em paralelo numa máquina ocupada, essa
    // subida passa dos 10s padrão e o vitest derruba o hook — o teste não falha
    // por estar errado, falha por concorrência. Já aconteceu localmente três
    // vezes; num CI compartilhado aconteceria mais.
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
