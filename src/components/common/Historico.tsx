import { useEffect, useState } from 'react';
import { buscarAuditoria, type LinhaAuditoria } from '../../lib/auditoriaApi';
import { ROTULO_TABELA, descreverEvento } from '../../lib/auditoriaTextos';

interface HistoricoProps {
  /** Sem isto, mostra a atividade recente de tudo. */
  registroId?: string;
  tabela?: string;
  limite?: number;
  /** Muda quando o registro é gravado, para o histórico recarregar. */
  chaveDeAtualizacao?: unknown;
  vazio?: string;
}

function quando(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Trilha de quem mudou o quê. Lê o servidor sob demanda em vez de entrar no
 * polling do portfólio: histórico é consulta pontual, não estado da tela — e
 * carregá-lo a cada 15 s puxaria linha que ninguém está olhando.
 */
export function Historico({
  registroId, tabela, limite = 30, chaveDeAtualizacao, vazio,
}: HistoricoProps) {
  const [linhas, setLinhas] = useState<LinhaAuditoria[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setErro(null);
    buscarAuditoria({ registroId, tabela, limite })
      .then(r => { if (vivo) setLinhas(r); })
      .catch(e => { if (vivo) setErro(e instanceof Error ? e.message : 'Falha ao carregar o histórico'); });
    return () => { vivo = false; };
  }, [registroId, tabela, limite, chaveDeAtualizacao]);

  if (erro) return <div className="campo-ajuda">{erro}</div>;
  if (linhas == null) return <div className="campo-ajuda">Carregando histórico…</div>;

  if (linhas.length === 0) {
    return (
      <div className="campo-ajuda">
        {vazio ?? 'Nada mudou ainda — ou mudou antes de o histórico existir.'}
      </div>
    );
  }

  return (
    <ol className="historico">
      {linhas.map(l => (
        <li className="historico-item" key={l.id} data-acao={l.acao}>
          <div className="historico-quando tabular">{quando(l.em)}</div>
          <div className="historico-corpo">
            <div className="historico-texto">{descreverEvento(l)}</div>
            {/* A frase acima já nomeia o campo — repeti-lo aqui era ruído. O que
                falta, e só no feed global, é de que coisa a linha fala. */}
            <div className="historico-meta">
              <span>{l.autor}</span>
              {!registroId && (
                <>
                  {/* "Criou iniciativa" já disse o tipo; repetir aqui daria
                      "Criou iniciativa · iniciativa · Teste de trilha". */}
                  {l.acao === 'alterou' && (
                    <><span aria-hidden="true">·</span><span>{ROTULO_TABELA[l.tabela] ?? l.tabela}</span></>
                  )}
                  {l.rotulo && (
                    <><span aria-hidden="true">·</span><span className="historico-rotulo">{l.rotulo}</span></>
                  )}
                </>
              )}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
