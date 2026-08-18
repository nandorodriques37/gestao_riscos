import { useEffect, useRef, useState } from 'react';
import type { TaskAttachment } from '../../types';
import { taskAttachmentUrl } from '../../lib/tasksApi';
import { ACCEPT_IMAGE_MIMES, formatBytes, isImageFile } from '../../lib/imageAttachments';
import { ImageLightbox } from './ImageLightbox';

interface AnexosEditorProps {
  taskId: string;
  anexos: TaskAttachment[];
  /** Sobe uma imagem. Rejeita com a mensagem que o usuário deve ler. */
  onAdd: (file: File) => Promise<void>;
  onRemove: (anexoId: string) => Promise<void>;
}

/**
 * Grade de miniaturas com as três entradas que as pessoas realmente usam:
 * botão, arrastar-e-soltar e colar da área de transferência (print de tela cai
 * aqui). O upload é imediato — anexo não espera o "Salvar" do modal, que grava
 * campos de texto por outro caminho.
 */
export function AnexosEditor({ taskId, anexos, onAdd, onRemove }: AnexosEditorProps) {
  const [enviando, setEnviando] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [visualizando, setVisualizando] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);

  async function enviarArquivos(files: File[]) {
    const imagens = files.filter(isImageFile);
    if (imagens.length === 0) {
      if (files.length > 0) setErro('Só é possível anexar imagens (PNG, JPEG, WebP, GIF ou AVIF).');
      return;
    }
    setErro(null);
    setEnviando(n => n + imagens.length);
    // Em série: o preparo usa canvas e o envio é pesado — em paralelo, várias
    // fotos grandes travariam a aba e estourariam o limite de corpo junto.
    for (const file of imagens) {
      try {
        await onAdd(file);
      } catch (err) {
        if (montado.current) setErro(err instanceof Error ? err.message : 'Falha ao anexar a imagem.');
      } finally {
        if (montado.current) setEnviando(n => n - 1);
      }
    }
  }

  // O listener de colar é registrado uma vez, mas precisa sempre da versão mais
  // recente do envio (que fecha sobre `onAdd`) — daí a ref.
  const enviarRef = useRef(enviarArquivos);
  enviarRef.current = enviarArquivos;

  // Colar imagem funciona com o modal aberto, sem exigir foco nesta seção —
  // é assim que se anexa um print recém-capturado.
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const files = Array.from(e.clipboardData?.files ?? []).filter(isImageFile);
      if (files.length === 0) return;
      e.preventDefault();
      void enviarRef.current(files);
    }
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setArrastando(false);
    void enviarArquivos(Array.from(e.dataTransfer.files));
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    void enviarArquivos(Array.from(e.target.files ?? []));
    e.target.value = ''; // permite reenviar o mesmo arquivo depois de removê-lo
  }

  async function remover(anexo: TaskAttachment) {
    if (!window.confirm(`Remover a imagem "${anexo.nome}"?`)) return;
    setErro(null);
    try {
      await onRemove(anexo.id);
      if (montado.current) setVisualizando(null);
    } catch (err) {
      if (montado.current) setErro(err instanceof Error ? err.message : 'Falha ao remover a imagem.');
    }
  }

  return (
    <div
      className="anexos"
      data-arrastando={arrastando || undefined}
      onDragOver={e => { e.preventDefault(); setArrastando(true); }}
      onDragLeave={e => { if (e.currentTarget === e.target) setArrastando(false); }}
      onDrop={handleDrop}
    >
      {anexos.length > 0 && (
        <ul className="anexos-grade">
          {anexos.map((anexo, i) => (
            <li className="anexo-item" key={anexo.id}>
              <button
                type="button"
                className="anexo-thumb"
                onClick={() => setVisualizando(i)}
                aria-label={`Ver imagem: ${anexo.nome}`}
                title={anexo.nome}
              >
                <img src={taskAttachmentUrl(taskId, anexo.id)} alt={anexo.nome} loading="lazy" />
              </button>
              <button
                type="button"
                className="anexo-remover"
                onClick={() => void remover(anexo)}
                aria-label={`Remover imagem: ${anexo.nome}`}
                title="Remover imagem"
              >
                ×
              </button>
              <div className="anexo-legenda" title={anexo.nome}>
                <span className="anexo-nome">{anexo.nome}</span>
                <span className="anexo-tamanho">{formatBytes(anexo.tamanho)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {anexos.length === 0 && enviando === 0 && (
        <div className="anexos-vazio">Nenhuma imagem anexada. Arraste uma imagem aqui, cole (Ctrl+V) ou use o botão abaixo.</div>
      )}

      {enviando > 0 && (
        <div className="anexos-enviando" role="status" aria-live="polite">
          {enviando === 1 ? 'Enviando imagem…' : `Enviando ${enviando} imagens…`}
        </div>
      )}

      {erro && <div className="anexos-erro" role="alert">{erro}</div>}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_IMAGE_MIMES}
        multiple
        className="anexos-input"
        onChange={handleInputChange}
      />
      <button type="button" className="acoes-add" onClick={() => inputRef.current?.click()}>
        + Adicionar imagem
      </button>

      {visualizando != null && anexos.length > 0 && (
        <ImageLightbox
          taskId={taskId}
          anexos={anexos}
          index={Math.min(visualizando, anexos.length - 1)}
          onIndexChange={setVisualizando}
          onClose={() => setVisualizando(null)}
        />
      )}
    </div>
  );
}
