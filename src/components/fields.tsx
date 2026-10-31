// Champs de saisie. Le texte tapé reste affiché tel quel pendant la frappe, même incomplet (« 1, »).
import { useState, type ChangeEvent, type ReactNode } from 'react';

interface NumFieldProps {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  className?: string;
  'aria-label'?: string;
}

export function NumField({ value, onChange, step = 0.1, ...rest }: NumFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="number"
      step={step}
      {...rest}
      value={draft ?? String(value)}
      onChange={e => {
        setDraft(e.target.value);
        const v = parseFloat(e.target.value.replace(',', '.'));
        if (Number.isFinite(v)) onChange(v);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

interface FileButtonProps {
  accept: string;
  onFile: (file: File) => void;
  className?: string;
  title?: string;
  children: ReactNode;
}

export function FileButton({ accept, onFile, className = 'btn', title, children }: FileButtonProps) {
  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFile(f);
    e.target.value = '';
  };
  return (
    <label className={className} title={title}>
      {children}
      <input type="file" accept={accept} onChange={pick} hidden />
    </label>
  );
}

interface SegOption<T extends string> {
  value: T;
  label: ReactNode;
}

interface SegRadioProps<T extends string> {
  name: string;
  value: T;
  options: SegOption<T>[];
  onChange: (v: T) => void;
}

export function SegRadio<T extends string>({ name, value, options, onChange }: SegRadioProps<T>) {
  return (
    <div className="seg full">
      {options.map(o => (
        <label key={o.value} className={value === o.value ? 'on' : ''}>
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  );
}
