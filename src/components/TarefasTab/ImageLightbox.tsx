import { useEffect, useRef } from 'react';
import type { TaskAttachment } from '../../types';
import { taskAttachmentUrl } from '../../lib/tasksApi';
import { formatBytes } from '../../lib/imageAttachments';

interface ImageLightboxProps {
  taskId: string;
  anexos: TaskAttachment[];
  /** Índice da imagem em exibição dentro de `anexos`. */
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

/**
 * Visualizador em tela cheia. Fica acima do modal de edição e captura o próprio
 * teclado: sem o `stopPropagation`, o Esc subiria para a armadilha de foco do
 * modal e fecharia a edição inteira em vez de só a imagem.
 */
export function ImageLightbox({ taskId, anexos, index, onIndexChange, onClose }: ImageLightboxProps) {
  const anexo = anexos[index];
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);

  if (!anexo) return null;

  const total = anexos.length;

  function irPara(delta: number) {
    onIndexChange((index + delta + total) % total);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowRight' && total > 1) { e.preventDefault(); irPara(1); }
    else if (e.key === 'ArrowLeft' && total > 1) { e.preventDefault(); irPara(-1); }
  }

  return (
    <div
      ref={ref}
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`Imagem: ${anexo.nome}`}
      tabIndex={-1}
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div className="lightbox-bar" onClick={e => e.stopPropagation()}>
        <span className="lightbox-nome">
          {anexo.nome}
          <span className="lightbox-meta">
            {formatBytes(anexo.tamanho)}{total > 1 ? ` · ${index + 1} de ${total}` : ''}
          </span>
        </span>
        <button className="lightbox-btn" onClick={onClose} aria-label="Fechar imagem">×</button>
      </div>

      <div className="lightbox-palco" onClick={e => e.stopPropagation()}>
        {total > 1 && (
          <button className="lightbox-nav" onClick={() => irPara(-1)} aria-label="Imagem anterior">‹</button>
        )}
        {/* A imagem vive num invólucro flexível: solta no meio da linha, o
            `max-width: 100%` dela mediria o palco inteiro e espremeria as setas. */}
        <div className="lightbox-figura">
          <img className="lightbox-img" src={taskAttachmentUrl(taskId, anexo.id)} alt={anexo.nome} />
        </div>
        {total > 1 && (
          <button className="lightbox-nav" onClick={() => irPara(1)} aria-label="Próxima imagem">›</button>
        )}
      </div>
    </div>
  );
}
