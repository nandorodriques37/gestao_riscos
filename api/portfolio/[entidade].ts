// `/api/portfolio/:entidade` — lista e criação, mais os caminhos de operação
// (`backup`, `auditoria`, `migrar-acoes`, `promover-triagem`), que também têm
// um segmento só. Mesmo handler das outras duas rotas.
export { default } from '../_portfolioRoute.js';
