import { CollapsibleCard } from "../components/CollapsibleCard.tsx";
import { Field, Input, Select, Textarea } from "../components/Field.tsx";
import { FormBody, useFormSubmit } from "../components/FormSection.tsx";
import type { AppState } from "../types.ts";

interface Props {
  state: AppState;
  onRefresh: () => void;
}

export function EntitiesSection({ state, onRefresh }: Props) {
  return (
    <section id="sec-entities" className="border-b border-border px-5 py-6">
      <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        Entidades base
      </h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
        <AccountCard onRefresh={onRefresh} />
        <CharCard state={state} onRefresh={onRefresh} />
        <MachineCard onRefresh={onRefresh} />
        <HuntCard onRefresh={onRefresh} />
        <SkillCard onRefresh={onRefresh} />
        <ClientSpellBindingCard state={state} onRefresh={onRefresh} />
      </div>
    </section>
  );
}

function ClientSpellBindingCard({ state, onRefresh }: Props) {
  const { handleSubmit, busy, msg } = useFormSubmit({ url: "/api/client-spell-bindings", onSuccess: onRefresh });
  return (
    <CollapsibleCard icon="K" iconKind="skill" title="Magias no cliente">
      <FormBody onSubmit={handleSubmit} busy={busy} msg={msg} submitLabel="Salvar hotkey">
        <Field label="Personagem">
          <Select name="characterId" required>
            <option value="">Selecionar...</option>
            {state.characters.map(character => <option key={character.id} value={character.id}>{character.name}</option>)}
          </Select>
        </Field>
        <Field label="Magia">
          <Select name="skillId" required>
            <option value="">Selecionar...</option>
            {state.skills.map(skill => <option key={skill.id} value={skill.id}>{skill.name} ({skill.manaCost ?? 0} mana)</option>)}
          </Select>
        </Field>
        <Field label="Hotkey do cliente"><Input name="hotkey" required placeholder="F1 ou CTRL+F1" /></Field>
        <Field label="Slot Multi-Action">
          <Select name="multiActionSlot" defaultValue="1">
            <option value="1">I — primeira ação</option>
            <option value="2">II — se I estiver indisponível</option>
            <option value="3">III — se I e II estiverem indisponíveis</option>
          </Select>
        </Field>
        <Field label="Modo de uso">
          <Select name="castMode">
            <option value="hotkey">Hotkey configurada</option>
            <option value="spell-words">Palavras da magia</option>
          </Select>
        </Field>
        <Field label="Alvo">
          <Select name="targetMode">
            <option value="current-target">Alvo atual</option>
            <option value="self">Próprio personagem</option>
            <option value="crosshair">Crosshair</option>
          </Select>
        </Field>
        <Field label="Verificada em"><Input name="lastVerifiedAt" type="datetime-local" /></Field>
        <Field label="Notas"><Textarea name="notes" placeholder="Revalidar após importar hotkeys ou atualizar o cliente" /></Field>
      </FormBody>
    </CollapsibleCard>
  );
}

function AccountCard({ onRefresh }: { onRefresh: () => void }) {
  const { handleSubmit, busy, msg } = useFormSubmit({ url: "/api/accounts", onSuccess: onRefresh });
  return (
    <CollapsibleCard icon="C" iconKind="account" title="Conta">
      <FormBody onSubmit={handleSubmit} busy={busy} msg={msg} submitLabel="Salvar conta">
        <Field label="Nome"><Input name="name" required /></Field>
        <Field label="Login"><Input name="loginIdentifier" required /></Field>
        <Field label="Referencia secreta"><Input name="secretReference" placeholder="vault:tibia/main" /></Field>
        <Field label="Notas"><Textarea name="notes" /></Field>
      </FormBody>
    </CollapsibleCard>
  );
}

function CharCard({ state, onRefresh }: Props) {
  const { handleSubmit, busy, msg } = useFormSubmit({ url: "/api/characters", onSuccess: onRefresh });
  return (
    <CollapsibleCard icon="P" iconKind="char" title="Char">
      <FormBody onSubmit={handleSubmit} busy={busy} msg={msg} submitLabel="Salvar char">
        <Field label="Conta">
          <Select name="accountId" required>
            <option value="">Selecionar...</option>
            {state.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field label="Nome"><Input name="name" required /></Field>
        <Field label="World"><Input name="world" /></Field>
        <Field label="Vocacao"><Input name="vocation" /></Field>
        <Field label="Level"><Input name="level" type="number" min="1" /></Field>
      </FormBody>
    </CollapsibleCard>
  );
}

function MachineCard({ onRefresh }: { onRefresh: () => void }) {
  const { handleSubmit, busy, msg } = useFormSubmit({ url: "/api/machines", onSuccess: onRefresh });
  return (
    <CollapsibleCard icon="M" iconKind="machine" title="Maquina">
      <FormBody onSubmit={handleSubmit} busy={busy} msg={msg} submitLabel="Salvar maquina">
        <Field label="Node ID"><Input name="nodeId" required placeholder="pc-main" /></Field>
        <Field label="Nome"><Input name="name" required /></Field>
        <Field label="Funcao">
          <Select name="role">
            <option value="perception">Percepcao</option>
            <option value="coordinator">Coordenador</option>
            <option value="raspberry-executor">Raspberry executor</option>
          </Select>
        </Field>
        <Field label="Host preferido"><Input name="preferredHost" placeholder="192.168.0.10" /></Field>
        <Field label="Notas de conexao"><Textarea name="connectionNotes" /></Field>
      </FormBody>
    </CollapsibleCard>
  );
}

function HuntCard({ onRefresh }: { onRefresh: () => void }) {
  const { handleSubmit, busy, msg } = useFormSubmit({ url: "/api/hunts", onSuccess: onRefresh });
  return (
    <CollapsibleCard icon="H" iconKind="hunt" title="Hunt">
      <FormBody onSubmit={handleSubmit} busy={busy} msg={msg} submitLabel="Salvar hunt">
        <Field label="Nome"><Input name="name" required /></Field>
        <Field label="Cidade"><Input name="city" /></Field>
        <Field label="Perfil de rota"><Input name="routeProfile" /></Field>
        <Field label="Level minimo"><Input name="minLevel" type="number" min="1" /></Field>
        <Field label="Notas"><Textarea name="notes" /></Field>
      </FormBody>
    </CollapsibleCard>
  );
}

function SkillCard({ onRefresh }: { onRefresh: () => void }) {
  const { handleSubmit, busy, msg } = useFormSubmit({ url: "/api/skills", onSuccess: onRefresh });
  return (
    <CollapsibleCard icon="S" iconKind="skill" title="Skill">
      <FormBody onSubmit={handleSubmit} busy={busy} msg={msg} submitLabel="Salvar skill">
        <Field label="Nome"><Input name="name" required placeholder="Exori" /></Field>
        <Field label="Palavras"><Input name="spellWords" placeholder="exori" /></Field>
        <Field label="Hotkey"><Input name="hotkey" placeholder="F1" /></Field>
        <Field label="Categoria">
          <Select name="category">
            <option value="attack">Ataque</option>
            <option value="healing">Cura</option>
            <option value="support">Suporte</option>
            <option value="utility">Utilidade</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Custo de mana"><Input name="manaCost" type="number" min="0" defaultValue="0" /></Field>
          <Field label="Level minimo"><Input name="requiredLevel" type="number" min="0" defaultValue="0" /></Field>
        </div>
        <Field label="Vocacoes (virgula)"><Input name="allowedVocations" required placeholder="knight,elite knight" /></Field>
        <Field label="Cooldown ms"><Input name="cooldownMs" type="number" min="0" defaultValue="1000" /></Field>
        <Field label="Notas"><Textarea name="notes" /></Field>
      </FormBody>
    </CollapsibleCard>
  );
}
