// `/api/portfolio/:entidade/:id` — PATCH e DELETE de qualquer entidade do
// portfólio.
//
// Existe como arquivo próprio porque catch-all não casa dois segmentos nas
// funções avulsas desta Vercel: com `[...path].ts` no lugar deste arquivo,
// toda gravação do portfólio devolvia 404 na borda, sem invocar função nenhuma
// e sem log — a classificação da Triagem, a edição de objetivo, iniciativa,
// marco, medição, pessoa e o plano de ação. Pasta dinâmica casa.
export { default } from '../../_portfolioRoute.js';
