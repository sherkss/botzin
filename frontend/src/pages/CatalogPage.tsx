import { useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "../api.ts";
import type { CatalogPage, CreatureCatalogRecord, GameKnowledgeCoverage, GameKnowledgeRecord, ItemCatalogRecord, TibiaLiveStatus } from "../types.ts";

type CatalogKind = "creatures" | "items" | "knowledge";
const PAGE_SIZE = 25;

export function CatalogPage() {
  const [kind, setKind] = useState<CatalogKind>("creatures");
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [domain, setDomain] = useState("");
  const [page, setPage] = useState<CatalogPage<CreatureCatalogRecord | ItemCatalogRecord | GameKnowledgeRecord> | null>(null);
  const [coverage, setCoverage] = useState<GameKnowledgeCoverage | null>(null);
  const [liveStatus, setLiveStatus] = useState<TibiaLiveStatus | null>(null);
  const [status, setStatus] = useState("Carregando catálogo...");

  useEffect(() => {
    let active = true;
    setStatus("Carregando catálogo...");
    const params = new URLSearchParams({ q: query, limit: String(PAGE_SIZE), offset: String(offset) });
    if (kind === "knowledge" && domain) params.set("domain", domain);
    void apiFetch<CatalogPage<CreatureCatalogRecord | ItemCatalogRecord | GameKnowledgeRecord>>(`/api/catalog/${kind}?${params}`)
      .then((value) => {
        if (!active) return;
        setPage(value);
        setStatus(value.total === 0 ? "Nenhum resultado encontrado." : "");
      })
      .catch((error: unknown) => {
        if (active) setStatus(error instanceof Error ? error.message : "Falha ao consultar catálogo.");
      });
    return () => { active = false; };
  }, [kind, domain, query, offset]);

  useEffect(() => {
    if (kind !== "knowledge" || coverage) return;
    void apiFetch<GameKnowledgeCoverage>("/api/catalog/knowledge/coverage").then(setCoverage).catch(() => undefined);
  }, [kind, coverage]);

  useEffect(() => {
    if (kind !== "knowledge" || liveStatus) return;
    void apiFetch<TibiaLiveStatus>("/api/catalog/live-status").then(setLiveStatus).catch(() => undefined);
  }, [kind, liveStatus]);

  function selectKind(value: CatalogKind): void {
    setKind(value);
    setDomain("");
    setOffset(0);
    setPage(null);
  }

  function search(event: FormEvent): void {
    event.preventDefault();
    setQuery(draft.trim());
    setOffset(0);
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-border px-6 py-5">
        <h1 className="text-[18px] font-semibold">Catálogo do jogo</h1>
        <p className="mt-0.5 text-[13px] text-muted">Criaturas, itens e conhecimento estruturado consultado pela IA</p>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Tab active={kind === "creatures"} onClick={() => selectKind("creatures")}>Criaturas</Tab>
          <Tab active={kind === "items"} onClick={() => selectKind("items")}>Itens</Tab>
          <Tab active={kind === "knowledge"} onClick={() => selectKind("knowledge")}>Conhecimento</Tab>
          <form onSubmit={search} className="ml-auto flex min-w-[280px] gap-2">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={kind === "creatures" ? "Buscar dragon, demon..." : kind === "items" ? "Buscar armor, potion..." : "Buscar quest, cidade, boss..."}
              className="min-w-0 flex-1 rounded-[6px] border border-border bg-bg px-3 py-2 text-[12px] outline-none focus:border-link"
            />
            <button className="rounded-[6px] bg-accent px-4 py-2 text-[12px] font-medium text-white">Buscar</button>
          </form>
        </div>

        {kind === "knowledge" && coverage && (
          <div className="mb-4 rounded-[8px] border border-border bg-surface p-3">
            <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
              <span><b className="text-text">{coverage.total.toLocaleString("pt-BR")}</b> conhecimentos</span>
              <span>{coverage.official.toLocaleString("pt-BR")} oficiais</span>
              <span>{coverage.community.toLocaleString("pt-BR")} comunitários</span>
              <span>{coverage.user.toLocaleString("pt-BR")} ensinado pelo usuário</span>
              <span>{coverage.volatile.toLocaleString("pt-BR")} exigem atualização frequente</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <DomainButton active={!domain} onClick={() => { setDomain(""); setOffset(0); }}>Todos</DomainButton>
              {coverage.domains.map((item) => (
                <DomainButton key={item.domain} active={domain === item.domain} onClick={() => { setDomain(item.domain); setOffset(0); }}>
                  {domainLabel(item.domain)} ({item.count})
                </DomainButton>
              ))}
            </div>
          </div>
        )}

        {kind === "knowledge" && liveStatus && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[8px] border border-border bg-surface px-4 py-3 text-[11px] text-muted">
            <span className="font-medium text-text">Status oficial:</span>
            <span>Criatura boostada: <b className="text-text">{liveStatus.boostedCreature.name}</b></span>
            <span>Boss boostado: <b className="text-text">{liveStatus.boostedBoss.name}</b></span>
            <a href={liveStatus.eventScheduleUrl} target="_blank" rel="noreferrer" className="text-link">Calendário de eventos</a>
          </div>
        )}

        <div className="mb-3 flex items-center justify-between text-[12px] text-muted">
          <span>{page ? `${page.total.toLocaleString("pt-BR")} registros` : status}</span>
          {query && <span>Busca: “{query}”</span>}
        </div>

        {status && !page?.items.length ? (
          <div className="rounded-[8px] border border-border bg-surface p-5 text-[13px] text-muted">{status}</div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
            {page?.items.map((record) => kind === "creatures"
              ? <CreatureCard key={record.id} creature={record as CreatureCatalogRecord} />
              : kind === "items"
                ? <ItemCard key={record.id} item={record as ItemCatalogRecord} />
                : <KnowledgeCard key={record.id} record={record as GameKnowledgeRecord} />)}
          </div>
        )}

        {page && page.total > PAGE_SIZE && (
          <div className="mt-5 flex items-center justify-center gap-3">
            <PageButton disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Anterior</PageButton>
            <span className="text-[12px] text-muted">Página {Math.floor(offset / PAGE_SIZE) + 1} de {Math.ceil(page.total / PAGE_SIZE)}</span>
            <PageButton disabled={offset + PAGE_SIZE >= page.total} onClick={() => setOffset(offset + PAGE_SIZE)}>Próxima</PageButton>
          </div>
        )}
      </div>
    </div>
  );
}

function KnowledgeCard({ record }: { record: GameKnowledgeRecord }) {
  const dialogueTurns = Array.isArray(record.metadata.turns) ? record.metadata.turns.length : 0;
  const unresolved = record.domain === "mystery" && record.metadata.resolutionStatus === "unresolved";
  const translatedBook = record.domain === "book" && record.metadata.translationStatus === "machine-translated";
  const bookLocation = record.domain === "book" && typeof record.metadata.location === "string" ? record.metadata.location : "";
  return (
    <article className="rounded-[9px] border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-[14px] font-semibold">{record.name}</h2><p className="text-[11px] text-subtle">{domainLabel(record.domain)}</p></div>
        <span className="rounded bg-surface-3 px-2 py-1 text-[10px] text-muted">{unresolved ? "Não resolvido · " : ""}{record.trust === "official" ? "Oficial" : record.trust === "user" ? "Ensinado" : "Comunidade"}{record.volatile ? " · dinâmico" : ""}</span>
      </div>
      {dialogueTurns > 0 && <p className="mt-2 text-[11px] font-medium text-text">{dialogueTurns.toLocaleString("pt-BR")} interações estruturadas</p>}
      {translatedBook && <p className="mt-2 text-[11px] font-medium text-text">Português · tradução automática — original em inglês preservado</p>}
      {bookLocation && <Line label="Encontrado em" value={bookLocation} />}
      {record.summary && <p className="mt-3 text-[12px] leading-5 text-muted">{record.summary}</p>}
      {record.content && record.content !== record.summary && <p className="mt-2 line-clamp-5 whitespace-pre-line text-[11px] leading-5 text-subtle">{record.content}</p>}
      <a href={record.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-[11px] text-link">Abrir fonte</a>
    </article>
  );
}

function CreatureCard({ creature }: { creature: CreatureCatalogRecord }) {
  return (
    <article className="rounded-[9px] border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-[14px] font-semibold">{creature.name}</h2><p className="text-[11px] text-subtle">{creature.race}</p></div>
        <span className="rounded bg-surface-3 px-2 py-1 text-[11px] text-muted">{creature.hitpoints.toLocaleString("pt-BR")} HP · {creature.experience.toLocaleString("pt-BR")} XP</span>
      </div>
      {creature.weakness.length > 0 && <Line label="Fraco contra" value={creature.weakness.join(", ")} />}
      {creature.strong.length > 0 && <Line label="Forte contra" value={creature.strong.join(", ")} />}
      {creature.immune.length > 0 && <Line label="Imune" value={creature.immune.join(", ")} />}
      {creature.location && <Line label="Locais" value={creature.location} />}
      {creature.maxDamage > 0 && <Line label="Dano máximo estimado" value={`${creature.maxDamage.toLocaleString("pt-BR")} (${Object.entries(creature.damageByType).map(([type, value]) => `${type} ${value}`).join(" · ")})`} />}
      {Object.keys(creature.damageModifiers).length > 0 && <Line label="Dano recebido" value={Object.entries(creature.damageModifiers).map(([type, value]) => `${type} ${value}%`).join(" · ")} />}
      {creature.attacks.length > 0 && <Line label="Ataques" value={creature.attacks.map((attack) => `${attack.name} ${attack.minimum}-${attack.maximum} ${attack.element}`).join(" · ")} />}
      {creature.lootDetails.length > 0
        ? <Line label="Loot" value={creature.lootDetails.slice(0, 8).map((drop) => `${drop.itemName}${drop.amount ? ` (${drop.amount})` : ""}${drop.rarity ? ` [${drop.rarity}]` : ""}`).join(", ") + (creature.lootDetails.length > 8 ? "…" : "")} />
        : creature.loot.length > 0 && <Line label="Loot" value={creature.loot.slice(0, 8).join(", ") + (creature.loot.length > 8 ? "…" : "")} />}
      {creature.description && <p className="mt-3 line-clamp-3 text-[12px] leading-5 text-muted">{creature.description}</p>}
      <a href={creature.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-[11px] text-link">Fonte oficial</a>
      {creature.communitySourceUrl && <a href={creature.communitySourceUrl} target="_blank" rel="noreferrer" className="ml-3 mt-3 inline-block text-[11px] text-link">Dano/loot da comunidade</a>}
    </article>
  );
}

function ItemCard({ item }: { item: ItemCatalogRecord }) {
  return (
    <article className="rounded-[9px] border border-border bg-surface p-4">
      <h2 className="text-[14px] font-semibold">{item.name}</h2>
      <Line label="Categoria" value={item.categoryName ?? "Não informada"} />
      <Line label="Tipo" value={[item.primaryType, item.secondaryType].filter(Boolean).join(" · ") || "Não informado"} />
      {item.objectClass && <Line label="Classe" value={item.objectClass} />}
      {item.wikiUrl && <a href={item.wikiUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-[11px] text-link">Abrir no TibiaWiki</a>}
    </article>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return <p className="mt-2 text-[12px] text-muted"><span className="font-medium text-text">{label}:</span> {value}</p>;
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`rounded-[6px] border px-4 py-2 text-[12px] ${active ? "border-link bg-surface-3 text-text" : "border-border text-muted"}`}>{children}</button>;
}

function PageButton({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button disabled={disabled} onClick={onClick} className="rounded-[6px] border border-border px-3 py-2 text-[12px] text-muted disabled:opacity-40">{children}</button>;
}

function DomainButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`rounded px-2 py-1 text-[10px] ${active ? "bg-accent text-white" : "bg-surface-3 text-muted"}`}>{children}</button>;
}

function domainLabel(domain: string): string {
  return ({
    achievement: "Achievements", book: "Livros", boss: "Bosses", building: "Prédios", charm: "Charms", city: "Cidades",
    event: "Eventos", "hunting-place": "Hunts", market: "Market", mechanic: "Mecânicas", mount: "Montarias",
    mystery: "Mistérios", npc: "NPCs", "npc-dialogue": "Diálogos de NPC", outfit: "Outfits", quest: "Quests", rune: "Runas", "soul-core": "Soul Cores", wheel: "Roda do Destino"
  } as Record<string, string>)[domain] ?? domain;
}
