import { useState, useCallback } from "react";
import { apiFetch } from "../api.ts";
import type { AppState } from "../types.ts";

const EMPTY: AppState = {
  accounts: [],
  characters: [],
  machines: [],
  hunts: [],
  skills: [],
  assignments: [],
  huntSkillRules: [],
  learningMethods: [],
  learningSources: [],
  learningMethodSources: [],
  learningSessions: [],
};

export function useAppState() {
  const [state, setState] = useState<AppState>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setStatusMsg("Carregando...");
    try {
      const data = await apiFetch<AppState>("/api/config");
      setState(data);
      setStatusMsg(`Atualizado em ${new Date().toLocaleTimeString("pt-BR")}`);
    } catch (err) {
      setStatusMsg(`Erro ao carregar: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  return { state, loading, statusMsg, refresh };
}
