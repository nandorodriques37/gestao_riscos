import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { formatBytes } from '../../lib/imageAttachments';

/** Uma imagem do visualizador. `tamanho` (bytes) só aparece quando quem chama sabe. */
export interface ImagemDoVisor {
  id: string;
  nome: string;
  src: string;
  tamanho?: number;
}

interface ImageLightboxProps {
  imagens: ImagemDoVisor[];
  /** Índice da imagem em exibição dentro de `imagens`. */
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

/**
 * Visualizador em tela cheia, dos anexos das tarefas e das imagens das páginas.
 * Fica acima do modal de edição e captura o próprio teclado: sem o
 * `stopPropagation`, o Esc subiria para a armadilha de foco do modal e fecharia
 * a edição inteira em vez de só a imagem.
 *
 * Ao fechar, o foco volta a quem o abriu (a miniatura, o botão Ampliar, o
 * editor com a imagem selecionada) — sem isso ele cairia no <body> e o teclado
 * recomeçaria do topo da página.
 */
export function ImageLightbox({ imagens, index, onIndexChange, onClose }: ImageLightboxProps) {
  const imagem = imagens[index];
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const quemAbriu = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.focus();
    return () => {
      if (quemAbriu && quemAbriu.isConnected) quemAbriu.focus({ preventScroll: true });
    };
  }, []);

  if (!imagem) return null;

  const total = imagens.length;
  const meta = [
    imagem.tamanho != null ? formatBytes(imagem.tamanho) : null,
    total > 1 ? `${index + 1} de ${total}` : null,
  ].filter(Boolean).join(' · ');

  function irPara(delta: number) {
    onIndexChange((index + delta + total) % total);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowRight' && total > 1) { e.preventDefault(); irPara(1); }
    else if (e.key === 'ArrowLeft' && total > 1) { e.preventDefault(); irPara(-1); }
  }

  // Fora do cartão do modal, no <body>: `position: fixed` dentro de um ancestral
  // com `transform` mede o ancestral, e o visualizador cobria só o modal em vez
  // da tela. Os eventos React continuam subindo pela árvore lógica, então o
  // `stopPropagation` do teclado abaixo segue protegendo o Esc do modal.
  return createPortal((
    <div
      ref={ref}
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`Imagem: ${imagem.nome}`}
      tabIndex={-1}
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div className="lightbox-bar" onClick={e => e.stopPropagation()}>
        <span className="lightbox-nome">
          {imagem.nome}
          {meta && <span className="lightbox-meta">{meta}</span>}
        </span>
        <div className="lightbox-acoes">
          {/* Baixa a cópia que subiu (a reduzida), com o nome dela. */}
          <a className="lightbox-btn lightbox-baixar" href={imagem.src} download={imagem.nome}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d="M12 4v11" />
              <path d="M7 10.5l5 5 5-5" />
              <path d="M5 20h14" />
            </svg>
            Baixar
          </a>
          <button className="lightbox-btn" onClick={onClose} aria-label="Fechar imagem">×</button>
        </div>
      </div>

      <div className="lightbox-palco" onClick={e => e.stopPropagation()}>
        {total > 1 && (
          <button className="lightbox-nav" onClick={() => irPara(-1)} aria-label="Imagem anterior">‹</button>
        )}
        {/* A imagem vive num invólucro flexível: solta no meio da linha, o
            `max-width: 100%` dela mediria o palco inteiro e espremeria as setas. */}
        <div className="lightbox-figura">
          <img className="lightbox-img" src={imagem.src} alt={imagem.nome} />
        </div>
        {total > 1 && (
          <button className="lightbox-nav" onClick={() => irPara(1)} aria-label="Próxima imagem">›</button>
        )}
      </div>
    </div>
  ), document.body);
}
