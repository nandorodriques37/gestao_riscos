import { useId, type ReactNode } from 'react';

/**
 * Campos de formulário do portfólio. Existem para uma razão só: rótulo e
 * controle ligados por `id`/`htmlFor` sem que cada tela precise inventar um id.
 * O visual continua vindo das classes `modal-*` que o `EditModal` já usa — não
 * há estilo novo aqui.
 */

interface Base {
  label: string;
  /** Texto curto abaixo do campo. Explica a regra, não repete o rótulo. */
  ajuda?: ReactNode;
}

function Envolve({ label, ajuda, id, children }: Base & { id: string; children: ReactNode }) {
  return (
    <div className="form-campo">
      <label className="modal-field-label" htmlFor={id}>{label}</label>
      {children}
      {ajuda && <div className="campo-ajuda">{ajuda}</div>}
    </div>
  );
}

export function CampoTexto({
  label, ajuda, valor, onChange, placeholder, tipo = 'text',
}: Base & {
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
  tipo?: 'text' | 'date';
}) {
  const id = useId();
  return (
    <Envolve label={label} ajuda={ajuda} id={id}>
      <input
        id={id}
        className="modal-input"
        type={tipo}
        value={valor}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
      />
    </Envolve>
  );
}

export function CampoArea({
  label, ajuda, valor, onChange, placeholder, linhas = 3,
}: Base & { valor: string; onChange: (v: string) => void; placeholder?: string; linhas?: number }) {
  const id = useId();
  return (
    <Envolve label={label} ajuda={ajuda} id={id}>
      <textarea
        id={id}
        className="modal-textarea"
        rows={linhas}
        value={valor}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
      />
    </Envolve>
  );
}

/**
 * Número que aceita vazio. `''` vira `null`, não `0`: a diferença entre "custa
 * zero" e "ninguém preencheu" é o que segura os avisos de lacuna do Painel.
 */
export function CampoNumero({
  label, ajuda, valor, onChange, min, max, step = 'any', sufixo,
}: Base & {
  valor: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  step?: number | 'any';
  sufixo?: string;
}) {
  const id = useId();
  return (
    <Envolve label={label} ajuda={ajuda} id={id}>
      <div className="campo-com-sufixo">
        <input
          id={id}
          className="modal-input tabular"
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={valor ?? ''}
          onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
        {sufixo && <span className="campo-sufixo">{sufixo}</span>}
      </div>
    </Envolve>
  );
}

export function CampoSelect<T extends string>({
  label, ajuda, valor, onChange, opcoes, rotulo, vazio,
}: Base & {
  valor: T;
  onChange: (v: T) => void;
  opcoes: readonly T[];
  rotulo: (v: T) => string;
  /** Texto da opção neutra. Omitido, o campo não aceita vazio. */
  vazio?: string;
}) {
  const id = useId();
  return (
    <Envolve label={label} ajuda={ajuda} id={id}>
      <select
        id={id}
        className="modal-input"
        value={valor}
        onChange={e => onChange(e.target.value as T)}
      >
        {vazio != null && <option value="">{vazio}</option>}
        {opcoes.map(o => <option key={o} value={o}>{rotulo(o)}</option>)}
      </select>
    </Envolve>
  );
}

/** Select de chave estrangeira: `''` na tela, `null` no dado. */
export function CampoRef({
  label, ajuda, valor, onChange, opcoes, vazio = 'Não definido',
}: Base & {
  valor: string | null;
  onChange: (v: string | null) => void;
  opcoes: { id: string; nome: string }[];
  vazio?: string;
}) {
  const id = useId();
  return (
    <Envolve label={label} ajuda={ajuda} id={id}>
      <select
        id={id}
        className="modal-input"
        value={valor ?? ''}
        onChange={e => onChange(e.target.value === '' ? null : e.target.value)}
      >
        <option value="">{vazio}</option>
        {opcoes.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
      </select>
    </Envolve>
  );
}
