import { CollapsibleCard } from "../components/CollapsibleCard.tsx";
import { Field, GroupLabel, Input, Select, Textarea } from "../components/Field.tsx";
import { FormBody, useFormSubmit } from "../components/FormSection.tsx";
import type { AppState } from "../types.ts";

interface Props {
  state: AppState;
  onRefresh: () => void;
}

export function OpsSection({ state, onRefresh }: Props) {
  return (
    <section id="sec-ops" className="border-b border-border px-5 py-6">
      <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        Operacoes
      </h2>
      <AssignmentCard state={state} onRefresh={onRefresh} />
      <HuntSkillRuleCard state={state} onRefresh={onRefresh} />
    </section>
  );
}

function AssignmentCard({ state, onRefresh }: Props) {
  const { handleSubmit, busy, msg } = useFormSubmit({ url: "/api/assignments", onSuccess: onRefresh });
  return (
    <CollapsibleCard icon="A" iconKind="assign" title="Atribuicao de hunt" wide>
      <FormBody onSubmit={handleSubmit} busy={busy} msg={msg} submitLabel="Salvar atribuicao">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Maquina">
            <Select name="machineId" required>
              <option value="">Selecionar...</option>
              {state.machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </Field>
          <Field label="Char">
            <Select name="characterId" required>
              <option value="">Selecionar...</option>
              {state.characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Hunt">
            <Select name="huntId" required>
              <option value="">Selecionar...</option>
              {state.hunts.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select name="status">
              <option value="planned">Planejada</option>
              <option value="active">Ativa</option>
              <option value="paused">Pausada</option>
              <option value="disabled">Desativada</option>
            </Select>
          </Field>
          <Field label="Prioridade"><Input name="priority" type="number" defaultValue="100" /></Field>
          <Field label="Notas" className="sm:col-span-3"><Textarea name="notes" /></Field>
        </div>
      </FormBody>
    </CollapsibleCard>
  );
}

function HuntSkillRuleCard({ state, onRefresh }: Props) {
  const { handleSubmit, busy, msg } = useFormSubmit({ url: "/api/hunt-skill-rules", onSuccess: onRefresh });
  return (
    <CollapsibleCard icon="R" iconKind="rule" title="Regra de skill na hunt" wide>
      <FormBody onSubmit={handleSubmit} busy={busy} msg={msg} submitLabel="Salvar regra">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Hunt">
            <Select name="huntId" required>
              <option value="">Selecionar...</option>
              {state.hunts.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </Select>
          </Field>
          <Field label="Skill">
            <Select name="skillId" required>
              <option value="">Selecionar...</option>
              {state.skills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Prioridade"><Input name="priority" type="number" defaultValue="100" /></Field>
        </div>
        <GroupLabel>Condicoes de mana</GroupLabel>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Minima %"><Input name="minManaPercent" type="number" min="0" max="100" /></Field>
          <Field label="Maxima %"><Input name="maxManaPercent" type="number" min="0" max="100" /></Field>
        </div>
        <GroupLabel>Condicoes de HP</GroupLabel>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Minimo %"><Input name="minHpPercent" type="number" min="0" max="100" /></Field>
          <Field label="Maximo %"><Input name="maxHpPercent" type="number" min="0" max="100" /></Field>
        </div>
        <GroupLabel>Criaturas em tela</GroupLabel>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Minimas"><Input name="minCreatures" type="number" min="0" /></Field>
          <Field label="Maximas"><Input name="maxCreatures" type="number" min="0" /></Field>
        </div>
        <Field label="Notas"><Textarea name="notes" /></Field>
      </FormBody>
    </CollapsibleCard>
  );
}
