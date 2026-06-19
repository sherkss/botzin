import { useState, type FormEvent } from "react";
import { Field, Input } from "./Field.tsx";

interface Props {
  onLogin: (username: string, password: string) => Promise<void>;
}

export function LoginPanel({ onLogin }: Props) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await onLogin(String(data.get("username")), String(data.get("password")));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao entrar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-bg p-10">
      <div className="w-full max-w-sm rounded-[10px] border border-border bg-surface p-8">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-3.5 flex h-13 w-13 items-center justify-center rounded-[12px] bg-accent text-[22px] font-bold text-white">
            B
          </div>
          <h1 className="text-[18px] font-semibold">Botzin</h1>
          <p className="mt-1 text-[13px] text-muted">Entre com suas credenciais de acesso</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <Field label="Usuario">
            <Input name="username" autoComplete="username" required placeholder="admin" />
          </Field>
          <Field label="Senha">
            <Input name="password" type="password" autoComplete="current-password" required placeholder="••••••••" />
          </Field>

          {error && (
            <p className="rounded-[6px] border border-[#f8514933] bg-[#f8514910] px-3 py-2 text-[12px] text-[#f85149]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-1 w-full rounded-[6px] border border-white/10 bg-accent px-4 py-2 text-[13px] font-medium text-white transition-colors duration-[120ms] hover:bg-accent-hover disabled:opacity-60"
          >
            {busy ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
