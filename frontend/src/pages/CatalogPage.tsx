import { useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "../api.ts";
import type { CatalogPage, CreatureCatalogRecord, ItemCatalogRecord } from "../types.ts";

type CatalogKind = "creatures" | "items";
const PAGE_SIZE = 25;

export function CatalogPage() {
  const [kind, setKind] = useState<CatalogKind>("creatures");
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<CatalogPage<CreatureCatalogRecord | ItemCatalogRecord> | null>(null);
  const [status, setStatus] = useState("Carregando catálogo...");

  useEffect(() => {
    let active = true;
    setStatus("Carregando catálogo...");
    const params = new URLSearchParams({ q: query, limit: String(PAGE_SIZE), offset: String(offset) });
    void apiFetch<CatalogPage<CreatureCatalogRecord | ItemCatalogRecord>>(`/api/catalog/${kind}?${params}`)
      .then((value) => {
        if (!active) return;
        setPage(value);
        setStatus(value.total === 0 ? "Nenhum resultado encontrado." : "");
      })
      .catch((error: unknown) => {
        if (active) setStatus(error instanceof Error ? error.message : "Falha ao consultar catálogo.");
      });
    return () => { active = false; };
  }, [kind, query, offset]);

  function selectKind(value: CatalogKind): void {
    setKind(value);
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
        <p className="mt-0.5 text-[13px] text-muted">Criaturas oficiais e itens pesquisáveis para consulta da IA</p>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Tab active={kind === "creatures"} onClick={() => selectKind("creatures")}>Criaturas</Tab>
          <Tab active={kind === "items"} onClick={() => selectKind("items")}>Itens</Tab>
          <form onSubmit={search} className="ml-auto flex min-w-[280px] gap-2">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={kind === "creatures" ? "Buscar dragon, demon..." : "Buscar armor, potion..."}
              className="min-w-0 flex-1 rounded-[6px] border border-border bg-bg px-3 py-2 text-[12px] outline-none focus:border-link"
            />
            <button className="rounded-[6px] bg-accent px-4 py-2 text-[12px] font-medium text-white">Buscar</button>
          </form>
        </div>

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
              : <ItemCard key={record.id} item={record as ItemCatalogRecord} />)}
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
      {creature.loot.length > 0 && <Line label="Loot" value={creature.loot.slice(0, 8).join(", ") + (creature.loot.length > 8 ? "…" : "")} />}
      {creature.description && <p className="mt-3 line-clamp-3 text-[12px] leading-5 text-muted">{creature.description}</p>}
      <a href={creature.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-[11px] text-link">Fonte oficial</a>
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
