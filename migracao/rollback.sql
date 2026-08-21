-- Rollback da Fase 1 — desfaz a camada de dados do portfólio.
--
-- Depois de rodar isto o app volta exatamente ao estado anterior: `risk_records`
-- e `tasks` ficam intactos, com os mesmos registros e os mesmos valores em
-- `acoes` e `acoes_itens`. As colunas removidas do risco são todas aditivas e
-- nunca foram lidas por tela, CSV ou KPI na Fase 1.
--
-- Antes de rodar, guarde o dump:  GET /api/portfolio/backup
--
-- Uso (Neon):  psql "$DATABASE_URL" -f migracao/rollback.sql
-- Uso (dev):   apagar a pasta .pglite-dev/ recria tudo do zero.

begin;

-- Ordem inversa da criação: quem referencia cai antes de quem é referenciado.
drop table if exists acoes_risco;
drop table if exists marcos;
drop table if exists iniciativas;
drop table if exists objetivos;
drop table if exists pessoas;

-- Colunas aditivas do registro de risco.
alter table risk_records drop column if exists data_situacao;
alter table risk_records drop column if exists situacao;
alter table risk_records drop column if exists causa_raiz;
alter table risk_records drop column if exists exposicao_rs;

commit;

-- Conferência: as duas contagens têm de bater com o backup tirado antes.
--   select count(*) from risk_records;   -- esperado: 62 em base recém-semeada
--   select count(*) from tasks;          -- esperado: 68 em base recém-semeada
