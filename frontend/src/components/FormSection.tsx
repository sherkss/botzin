import { useState, type FormEvent, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";
import { Button } from "./ui.tsx";
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
        <p role={isError ? "alert" : "status"}
          className={`flex items-center gap-2 rounded-[8px] border px-3 py-2.5 text-[12px] ${
            isError
              ? "border-[#f8514933] bg-[#f8514910] text-[#f85149]"
              : "border-[#3fb95033] bg-[#3fb95010] text-[#3fb950]"
          }`}
        >
          {isError ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}{msg}
        </p>
      )}

      <Button
        type="submit"
        disabled={busy}
        variant="primary"
      >
        {busy && <LoaderCircle className="animate-spin" size={15} />}{busy ? "Salvando..." : submitLabel}
      </Button>
    </form>
  );
}
