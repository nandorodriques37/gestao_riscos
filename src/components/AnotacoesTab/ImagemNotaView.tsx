import { useState } from 'react';
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { formatBytes, listaDeFormatos, ACCEPT_IMAGEM_NOTA, type MotivoRecusa } from '../../lib/imageAttachments';
import type { OpcoesImagemNota } from './imagemNota';

// Ícones em SVG inline (o app não usa pacote de ícones). `currentColor`: a cor
// vem do botão, que vem do token.
function Svg({ children, tamanho = 18, traco = 2 }: { children: React.ReactNode; tamanho?: number; traco?: number }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={traco}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function IconeImagem({ tamanho = 20 }: { tamanho?: number }) {
  return (
    <Svg tamanho={tamanho} traco={1.8}>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="M4 18l5-5 4 4 3-3 4 4" />
    </Svg>
  );
}

export function IconeAmpliar() {
  return (
    <Svg>
      <path d="M14 4h6v6" />
      <path d="M10 20H4v-6" />
      <path d="M20 4l-6.5 6.5" />
      <path d="M4 20l6.5-6.5" />
    </Svg>
  );
}

export function IconeBaixar() {
  return (
    <Svg>
      <path d="M12 4v11" />
      <path d="M7 10.5l5 5 5-5" />
      <path d="M5 20h14" />
    </Svg>
  );
}

function IconeRemover() {
  return (
    <Svg>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h7a1.5 1.5 0 0 0 1.5-1.5L18 7" />
      <path d="M10 11v6M14 11v6" />
    </Svg>
  );
}

function IconeAlerta() {
  return (
    <Svg traco={2.2}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5" />
      <path d="M12 16.5v.01" />
    </Svg>
  );
}

function IconeArquivoRecusado() {
  return (
    <Svg tamanho={28} traco={1.8}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" />
      <path d="M14 3v5h5" />
      <path d="M10 13l4 4M14 13l-4 4" />
    </Svg>
  );
}

/**
 * Uma imagem da página. O documento guarda só o endereço; os bytes saem da
 * rota da imagem com cache imutável. Clicar abre o visualizador; a barra
 * (Ampliar, Baixar, Remover) aparece com o mouse em cima, com o foco dentro ou
 * com a imagem selecionada — e sempre, em tela de toque.
 *
 * Remover não pede confirmação de propósito: é edição comum do documento, o
 * Ctrl+Z traz de volta, e o servidor só apaga os bytes 24 h depois de a
 * imagem sair da página.
 */
export function ImagemNotaView({ node, selected, deleteNode, extension, getPos, editor }: ReactNodeViewProps) {
  const src = typeof node.attrs.src === 'string' ? node.attrs.src : '';
  const alt = typeof node.attrs.alt === 'string' ? node.attrs.alt : '';
  const nome = alt || 'imagem';
  const largura = typeof node.attrs.width === 'number' ? node.attrs.width : undefined;
  const altura = typeof node.attrs.height === 'number' ? node.attrs.height : undefined;
  // Guardado por endereço: um desfazer que troque o `src` não herda o erro do anterior.
  const [falhou, setFalhou] = useState<string | null>(null);
  /** Cada "Tentar de novo" monta um <img> novo, que pede o arquivo outra vez. */
  const [tentativa, setTentativa] = useState(0);
  const indisponivel = falhou === src;
  const opcoes = extension.options as OpcoesImagemNota;

  function ampliar() {
    const pos = getPos();
    if (typeof pos === 'number') opcoes.onAmpliar?.(pos);
  }

  function remover() {
    deleteNode();
    // O botão sai junto com a imagem: sem isto o foco cairia no <body>.
    editor.commands.focus();
  }

  /** A falha pode ser só a rede (ou um 500 passageiro): o arquivo é pedido de novo. */
  function tentarDeNovo() {
    setFalhou(null);
    setTentativa(t => t + 1);
    // Os botões saem com o aviso: o foco volta ao texto, não ao <body>.
    editor.commands.focus();
  }

  return (
    <NodeViewWrapper
      as="figure"
      className="nota-imagem"
      data-selecionada={selected || undefined}
      data-indisponivel={indisponivel || undefined}
    >
      {indisponivel ? (
        <div className="nota-imagem-indisponivel">
          <p className="nota-upload-titulo"><IconeImagem tamanho={18} />Imagem indisponível</p>
          <p className="nota-upload-motivo">A imagem não carregou agora. Pode ser a conexão: tente de novo antes de remover.</p>
          <div className="nota-upload-acoes">
            <button type="button" className="btn btn-navy" onClick={tentarDeNovo}>Tentar de novo</button>
            <button type="button" className="btn btn-outline-navy" onClick={remover}>Remover</button>
          </div>
        </div>
      ) : (
        <>
          {/* `data-drag-handle`: arrastar a imagem move o bloco (o TipTap desenha a cópia levantada). */}
          <div className="nota-imagem-quadro" data-drag-handle="">
            <img
              key={tentativa}
              src={src}
              alt={alt}
              width={largura}
              height={altura}
              loading="lazy"
              onClick={ampliar}
              onError={() => setFalhou(src)}
            />
          </div>
          <div className="nota-imagem-barra" role="group" aria-label={`Ações da imagem ${nome}`}>
            <button type="button" className="nota-imagem-btn" onClick={ampliar} aria-label="Ampliar" title="Ampliar">
              <IconeAmpliar />
            </button>
            <a className="nota-imagem-btn" href={src} download={nome} aria-label="Baixar" title="Baixar">
              <IconeBaixar />
            </a>
            <span className="nota-imagem-sep" aria-hidden="true" />
            <button type="button" className="nota-imagem-btn" onClick={remover} aria-label="Remover" title="Remover">
              <IconeRemover />
            </button>
          </div>
        </>
      )}
    </NodeViewWrapper>
  );
}

// ---------------------------------------------------------------------------
// Envio em andamento: o que o marcador de upload (fora do documento) mostra.
// ---------------------------------------------------------------------------

/** Fila → preparando (redução no navegador) → enviando; ou erro / recusada. */
export type FaseEnvio = 'fila' | 'preparando' | 'enviando' | 'erro' | 'recusada';

export interface EnvioImagem {
  id: string;
  fase: FaseEnvio;
  /** Nome do arquivo como chegou. */
  nome: string;
  /** Tamanho do arquivo como chegou; 0 quando ainda não se sabe. */
  bytesOriginais: number;
  /** Tamanho da cópia reduzida que sobe. */
  bytesEnviados?: number;
  /** Fração enviada, de 0 a 1. */
  progresso: number;
  /** Largura e altura da cópia reduzida: o bloco já reserva o tamanho final. */
  largura?: number;
  altura?: number;
  /** A mensagem do erro ou da recusa. */
  mensagem?: string;
  motivo?: MotivoRecusa;
  /** Título da recusa quando o do motivo não descreve o caso (a imagem de outra página que sumiu). */
  titulo?: string;
  /** Endereço local (`blob:`) da miniatura do que não subiu. Só na tela, nunca no documento. */
  previa?: string;
}

interface EnvioImagemViewProps {
  envio: EnvioImagem;
  onTentarDeNovo: () => void;
  onRemover: () => void;
  onEscolherOutro: () => void;
}

const TITULO_RECUSA: Record<MotivoRecusa, string> = {
  formato: 'Formato não aceito',
  tamanho: 'Imagem grande demais',
  ilegivel: 'Não foi possível ler a imagem',
};

function porcento(fracao: number): number {
  return Math.max(0, Math.min(100, Math.round(fracao * 100)));
}

export function EnvioImagemView({ envio, onTentarDeNovo, onRemover, onEscolherOutro }: EnvioImagemViewProps) {
  const { fase, nome } = envio;

  if (fase === 'erro' || fase === 'recusada') {
    const recusada = fase === 'recusada';
    const motivo = recusada && envio.motivo === 'formato'
      ? `Use ${listaDeFormatos(ACCEPT_IMAGEM_NOTA)}.`
      : envio.mensagem ?? '';
    return (
      <figure className="nota-upload-bloco" data-fase={fase}>
        <div className="nota-upload-falha">
          <div className="nota-upload-mini" aria-hidden="true">
            {recusada ? <IconeArquivoRecusado /> : envio.previa ? <img src={envio.previa} alt="" /> : <IconeImagem tamanho={28} />}
          </div>
          <div className="nota-upload-falha-texto">
            {recusada ? (
              <>
                <p className="nota-upload-titulo">{envio.titulo ?? TITULO_RECUSA[envio.motivo ?? 'ilegivel']}</p>
                <p className="nota-upload-arquivo tabular">{nome}{envio.bytesOriginais > 0 ? ` · ${formatBytes(envio.bytesOriginais)}` : ''}</p>
                <p className="nota-upload-motivo">{motivo}</p>
              </>
            ) : (
              <>
                <p className="nota-upload-titulo" role="alert"><IconeAlerta />A imagem não subiu</p>
                <p className="nota-upload-motivo">{motivo} Até subir, a imagem existe só nesta tela.</p>
              </>
            )}
            <div className="nota-upload-acoes">
              {recusada ? (
                <button type="button" className="btn btn-navy" onClick={onEscolherOutro}>Escolher outro arquivo</button>
              ) : (
                <button type="button" className="btn btn-navy" onClick={onTentarDeNovo}>Tentar de novo</button>
              )}
              <button type="button" className="btn btn-outline-navy" onClick={onRemover}>Remover</button>
            </div>
          </div>
        </div>
      </figure>
    );
  }

  const enviando = fase === 'enviando';
  const pct = porcento(envio.progresso);
  const reduzida = enviando && envio.bytesEnviados != null && envio.bytesOriginais > 0
    && envio.bytesEnviados < envio.bytesOriginais * 0.95;
  const detalhe = reduzida
    ? `Reduzida de ${formatBytes(envio.bytesOriginais)} para ${formatBytes(envio.bytesEnviados ?? 0)}`
    : `${nome}${envio.bytesOriginais > 0 ? ` · ${formatBytes(envio.bytesEnviados ?? envio.bytesOriginais)}` : ''}`;
  const titulo = fase === 'fila' ? 'Na fila: sobe depois da anterior' : enviando ? 'Enviando imagem…' : 'Preparando a imagem…';
  // Tamanho final reservado: o texto abaixo não pula quando a imagem chega.
  const reserva = envio.largura && envio.altura
    ? { width: `${envio.largura}px`, aspectRatio: `${envio.largura} / ${envio.altura}` }
    : undefined;

  return (
    <figure className="nota-upload-bloco" data-fase={fase} aria-busy="true">
      <div className="nota-upload-espera" style={reserva}>
        <IconeImagem tamanho={28} />
        <p className="nota-upload-titulo" role="status">
          {titulo}
          {enviando && <span className="tabular" aria-hidden="true"> {pct}%</span>}
        </p>
        <div
          className="nota-upload-progresso"
          role="progressbar"
          aria-label={`Envio da imagem ${nome}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={enviando ? pct : undefined}
          data-indeterminado={!enviando || undefined}
        >
          <i style={enviando ? { width: `${pct}%` } : undefined} />
        </div>
        <p className="nota-upload-motivo tabular">{detalhe}</p>
      </div>
    </figure>
  );
}
