// `/api/portfolio` — o pacote com as seis listas, que o app carrega primeiro.
//
// Um arquivo por profundidade de caminho: nenhuma das rotas dinâmicas casa o
// caminho base, que não tem segmento nenhum. Todas reexportam o mesmo handler,
// que lê os segmentos da URL (`segmentosDaUrl`) e não do parâmetro de rota —
// já houve um bug de produção em que a Vercel preenchia esse parâmetro num
// roteamento e não no outro, e todo sub-caminho virou "pacote", em silêncio.
export { default } from '../_portfolioRoute.js';
