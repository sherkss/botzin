import { useState, type FormEvent, type ReactNode } from "react";
import { apiPost, apiUpload, buildPayload } from "../api.ts";

interface UseFormOptions {
  url: string;
  onSuccess: () => void;
  upload?: boolean;
}

export function useFormSubmit({ url, onSuccess, upload = false }: UseFormOptions) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg("Salvando...");
    try {
      const formData = new FormData(e.currentTarget);
      if (upload) {
        await apiUpload(url, formData);
      } else {
        await apiPost(url, buildPayload(formData));
      }
      setMsg("Salvo com sucesso!");
      onSuccess();
    } catch (err) {
      setMsg(`Erro: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return { handleSubmit, busy, msg };
}

interface FormProps {
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  msg: string;
  submitLabel: string;
  children: ReactNode;
}

export function FormBody({ onSubmit, busy, msg, submitLabel, children }: FormProps) {
  const isError = msg.startsWith("Erro");

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {children}

      {msg && (
        <p
          className={`rounded-[6px] border px-3 py-1.5 text-[12px] ${
            isError
              ? "border-[#f8514933] bg-[#f8514910] text-[#f85149]"
              : "border-[#3fb95033] bg-[#3fb95010] text-[#3fb950]"
          }`}
        >
          {msg}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="rounded-[6px] border border-white/10 bg-accent px-4 py-1.5 text-[12px] font-medium text-white transition-colors duration-[120ms] hover:bg-accent-hover disabled:opacity-60"
      >
        {busy ? "Salvando..." : submitLabel}
      </button>
    </form>
  );
}
