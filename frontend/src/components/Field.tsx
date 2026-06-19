import { type ReactNode } from "react";

interface FieldProps {
  label: string;
  children: ReactNode;
  className?: string;
}

export function Field({ label, children, className = "" }: FieldProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputBase =
  "w-full rounded-[6px] border border-border bg-bg px-2.5 py-[7px] text-[13px] text-text placeholder:text-subtle focus:border-link focus:outline-none focus:ring-[3px] focus:ring-link/15 transition-[border-color,box-shadow] duration-[120ms] appearance-none";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputBase} ${props.className ?? ""}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`${inputBase} min-h-[64px] resize-y ${props.className ?? ""}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${inputBase} ${props.className ?? ""}`} />
  );
}

export function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 mb-2 border-b border-border pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-subtle">
      {children}
    </div>
  );
}
