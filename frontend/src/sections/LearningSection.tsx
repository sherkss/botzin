import { CollapsibleCard } from "../components/CollapsibleCard.tsx";
import { Field, Input, Select, Textarea } from "../components/Field.tsx";
import { FormBody, useFormSubmit } from "../components/FormSection.tsx";
import type { AppState } from "../types.ts";

interface Props {
  state: AppState;
  onRefresh: () => void;
}

export function LearningSection({ state, onRefresh }: Props) {
  return (
    <section id="sec-learning" className="border-b border-border px-5 py-6">
      <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        Aprendizado
      </h2>
      <LearningMethodCard state={state} onRefresh={onRefresh} />
      <LearningSessionCard state={state} onRefresh={onRefresh} />
      <LearningSourceCard onRefresh={onRefresh} />
      <VideoUploadCard onRefresh={onRefresh} />
      <LearningMethodSourceCard state={state} onRefresh={onRefresh} />
    </section>
  );
}

function LearningMethodCard({ state, onRefresh }: Props) {
  const { handleSubmit, busy, msg } = useFormSubmit({ url: "/api/learning-methods", onSuccess: onRefresh });
  return (
    <CollapsibleCard icon="L" iconKind="method" title="Metodo de aprendizado" wide defaultOpen={false}>
      <FormBody onSubmit={handleSubmit} busy={busy} msg={msg} submitLabel="Salvar metodo">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Nome" className="sm:col-span-2"><Input name="name" required placeholder="Demo manual EK hunt" /></Field>
          <Field label="Peso"><Input name="weight" type="number" step="0.1" defaultValue="1" /></Field>
          <Field label="Tipo">
            <Select name="methodType">
              <option value="manual-rules">Regras manuais</option>
              <option value="human-demonstration">Demonstracao humana</option>
              <option value="replay">Replay de sessoes</option>
              <option value="human-feedback">Feedback humano</option>
              <option value="hunt-telemetry">Telemetria de hunt</option>
              <option value="external-knowledge">Conhecimento externo</option>
            </Select>
          </Field>
          <Field label="Escopo">
            <Select name="scope">
              <option value="global">Global</option>
              <option value="hunt">Hunt</option>
              <option value="character">Char</option>
              <option value="party">Party</option>
            </Select>
          </Field>
          <Field label="Modo">
            <Select name="mode">
              <option value="observe">Observar</option>
              <option value="suggest">Sugerir</option>
              <option value="execute">Executar</option>
            </Select>
          </Field>
          <Field label="Hunt (opcional)">
            <Select name="huntId">
              <option value="">Nenhuma</option>
              {state.hunts.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </Select>
          </Field>
          <Field label="Char (opcional)">
            <Select name="characterId">
              <option value="">Nenhum</option>
              {state.characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Config JSON" className="sm:col-span-3">
            <Textarea name="configJson" placeholder='{"source":"obs","recordInputs":true}' />
          </Field>
          <Field label="Notas" className="sm:col-span-3"><Textarea name="notes" /></Field>
        </div>
      </FormBody>
    </CollapsibleCard>
  );
}

function LearningSessionCard({ state, onRefresh }: Props) {
  const { handleSubmit, busy, msg } = useFormSubmit({ url: "/api/learning-sessions", onSuccess: onRefresh });
  return (
    <CollapsibleCard icon="S" iconKind="session" title="Sessao de ensino" wide defaultOpen={false}>
      <FormBody onSubmit={handleSubmit} busy={busy} msg={msg} submitLabel="Salvar sessao">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Metodo">
            <Select name="methodId" required>
              <option value="">Selecionar...</option>
              {state.learningMethods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </Field>
          <Field label="Atribuicao (opcional)">
            <Select name="assignmentId">
              <option value="">Nenhuma</option>
              {state.assignments.map(a => <option key={a.id} value={a.id}>{a.id}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select name="status">
              <option value="recording">Gravando</option>
              <option value="reviewing">Revisando</option>
              <option value="approved">Aprovada</option>
              <option value="rejected">Rejeitada</option>
              <option value="archived">Arquivada</option>
            </Select>
          </Field>
          <Field label="Nome" className="sm:col-span-3">
            <Input name="name" required placeholder="Treino hunt dragon 01" />
          </Field>
          <Field label="Resumo JSON" className="sm:col-span-3">
            <Textarea name="summaryJson" placeholder='{"xpHour":0,"profit":0}' />
          </Field>
          <Field label="Notas" className="sm:col-span-3"><Textarea name="notes" /></Field>
        </div>
      </FormBody>
    </CollapsibleCard>
  );
}

function LearningSourceCard({ onRefresh }: { onRefresh: () => void }) {
  const { handleSubmit, busy, msg } = useFormSubmit({ url: "/api/learning-sources", onSuccess: onRefresh });
  return (
    <CollapsibleCard icon="F" iconKind="source" title="Fonte de ensino" wide defaultOpen={false}>
      <FormBody onSubmit={handleSubmit} busy={busy} msg={msg} submitLabel="Salvar fonte">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Nome" className="sm:col-span-2"><Input name="name" required placeholder="Video hunt EK dragons" /></Field>
          <Field label="Tipo">
            <Select name="sourceType">
              <option value="video">Video</option>
              <option value="image">Imagem/frame</option>
              <option value="text">Texto</option>
              <option value="web-page">Pagina web</option>
              <option value="market-snapshot">Snapshot market</option>
              <option value="obs-recording">Gravacao OBS</option>
              <option value="replay">Replay</option>
              <option value="telemetry">Telemetria</option>
              <option value="manual-note">Nota manual</option>
            </Select>
          </Field>
          <Field label="Status">
            <Select name="status">
              <option value="pending">Pendente</option>
              <option value="processing">Processando</option>
              <option value="ready">Pronto</option>
              <option value="failed">Falhou</option>
              <option value="archived">Arquivado</option>
            </Select>
          </Field>
          <Field label="Confianca">
            <Select name="trustLevel">
              <option value="medium">Media</option>
              <option value="low">Baixa</option>
              <option value="high">Alta</option>
              <option value="verified">Verificada</option>
            </Select>
          </Field>
          <Field label="URI ou caminho" className="sm:col-span-3">
            <Input name="uri" placeholder="C:\videos\hunt.mp4 ou https://..." />
          </Field>
          <Field label="Hash"><Input name="contentHash" /></Field>
          <Field label="Idioma"><Input name="language" placeholder="pt-BR" /></Field>
          <Field label="Capturado em"><Input name="capturedAt" type="datetime-local" /></Field>
          <Field label="Metadata JSON" className="sm:col-span-3">
            <Textarea name="metadataJson" placeholder='{"hunt":"dragons"}' />
          </Field>
          <Field label="Notas" className="sm:col-span-3"><Textarea name="notes" /></Field>
        </div>
      </FormBody>
    </CollapsibleCard>
  );
}

function VideoUploadCard({ onRefresh }: { onRefresh: () => void }) {
  const { handleSubmit, busy, msg } = useFormSubmit({ url: "/api/learning-sources/upload-video", onSuccess: onRefresh, upload: true });
  return (
    <CollapsibleCard icon="V" iconKind="upload" title="Upload de video de hunt" wide defaultOpen={false}>
      <FormBody onSubmit={handleSubmit} busy={busy} msg={msg} submitLabel="Enviar video">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Nome" className="sm:col-span-2">
            <Input name="name" required placeholder="Hunt EK dragons 2026-06-16" />
          </Field>
          <Field label="Arquivo">
            <input
              name="video"
              type="file"
              required
              accept="video/mp4,video/webm,video/quicktime,video/x-matroska,video/x-msvideo,.mp4,.mkv,.mov,.avi,.webm"
              className="w-full rounded-[6px] border border-border bg-bg px-2 py-1.5 text-[13px] text-muted cursor-pointer"
            />
          </Field>
          <Field label="Tipo">
            <Select name="sourceType">
              <option value="video">Video</option>
              <option value="obs-recording">Gravacao OBS</option>
            </Select>
          </Field>
          <Field label="Confianca">
            <Select name="trustLevel">
              <option value="high">Alta</option>
              <option value="medium">Media</option>
              <option value="verified">Verificada</option>
              <option value="low">Baixa</option>
            </Select>
          </Field>
          <Field label="Hunt"><Input name="hunt" placeholder="Dragon Lair" /></Field>
          <Field label="Quest"><Input name="quest" /></Field>
          <Field label="Idioma"><Input name="language" defaultValue="pt-BR" /></Field>
          <Field label="Capturado em"><Input name="capturedAt" type="datetime-local" /></Field>
          <Field label="Notas" className="sm:col-span-3"><Textarea name="notes" /></Field>
        </div>
      </FormBody>
    </CollapsibleCard>
  );
}

function LearningMethodSourceCard({ state, onRefresh }: Props) {
  const { handleSubmit, busy, msg } = useFormSubmit({ url: "/api/learning-method-sources", onSuccess: onRefresh });
  return (
    <CollapsibleCard icon="V" iconKind="link" title="Vinculo fonte → metodo" wide defaultOpen={false}>
      <FormBody onSubmit={handleSubmit} busy={busy} msg={msg} submitLabel="Vincular fonte">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Metodo">
            <Select name="methodId" required>
              <option value="">Selecionar...</option>
              {state.learningMethods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </Field>
          <Field label="Fonte">
            <Select name="sourceId" required>
              <option value="">Selecionar...</option>
              {state.learningSources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Papel">
            <Select name="role">
              <option value="primary">Principal</option>
              <option value="validation">Validacao</option>
              <option value="reference">Referencia</option>
              <option value="negative-example">Exemplo negativo</option>
            </Select>
          </Field>
          <Field label="Peso"><Input name="weight" type="number" step="0.1" defaultValue="1" /></Field>
        </div>
      </FormBody>
    </CollapsibleCard>
  );
}
