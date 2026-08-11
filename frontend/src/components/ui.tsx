import { AlertCircle, Inbox, LoaderCircle, RefreshCw } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

export function Button({ variant = "secondary", className = "", children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button {...props} className={`ui-button ui-button--${variant} ${className}`}>{children}</button>;
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "success" | "warning" | "danger" | "info"; children: ReactNode }) {
  return <span className={`ui-badge ui-badge--${tone}`}><span className="ui-badge__dot" />{children}</span>;
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div className="min-w-0">
        {eyebrow && <div className="page-header__eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}

export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="section-header"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>;
}

export function EmptyState({ title = "Nenhum registro encontrado", description, action }: { title?: string; description?: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-state__icon"><Inbox size={22} /></span><h3>{title}</h3>{description && <p>{description}</p>}{action}</div>;
}

export function LoadingState({ label = "Carregando dados..." }: { label?: string }) {
  return <div className="loading-state" role="status"><LoaderCircle className="animate-spin" size={18} /><span>{label}</span></div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="error-state" role="alert"><AlertCircle size={20} /><div><strong>Não foi possível carregar os dados</strong><p>{message}</p></div>{onRetry && <Button onClick={onRetry}><RefreshCw size={15} />Tentar novamente</Button>}</div>;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`skeleton ${className}`} aria-hidden="true" />;
}
