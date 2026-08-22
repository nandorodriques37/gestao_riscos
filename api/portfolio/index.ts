// A Vercel não entrega `/api/portfolio` ao catch-all vizinho — sem este
// arquivo o caminho base devolve 404, e é ele que o app carrega primeiro.
//
// Não é um handler próprio: é o MESMO do catch-all. Uma primeira versão
// respondia só o pacote aqui, e aí a Vercel passou a mandar `/api/portfolio/*`
// inteiro para este arquivo — todo sub-caminho virou "pacote", em silêncio.
// Reexportando o handler, tanto faz qual dos dois a Vercel escolher; ele lê os
// segmentos da URL (`segmentosDaUrl`) e não do parâmetro de rota.
export { default } from './[[...path]].js';
