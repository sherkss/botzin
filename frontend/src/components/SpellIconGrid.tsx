import { useEffect, useMemo, useState } from "react";
import { apiFetch, apiFetchBlob } from "../api.ts";

interface SpellIconLink {
  id: string;
  name: string;
  type: string;
  group: string;
  words: string | null;
  source?: string | null;
}

const EMPTY_LINKS: readonly SpellIconLink[] = [];

/**
 * The icon route requires the bearer token, so the images cannot be pointed at
 * with a plain <img src>. Each one is fetched as a blob and exposed through an
 * object URL, which is revoked when the component unmounts.
 */
function useSpellIcons(spells: readonly SpellIconLink[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];

    void (async () => {
      for (const spell of spells) {
        if (cancelled) break;
        try {
          const blob = await apiFetchBlob(`/api/spell-icons/image?spell=${encodeURIComponent(spell.id)}`);
          if (cancelled) break;
          const url = URL.createObjectURL(blob);
          created.push(url);
          setUrls((current) => ({ ...current, [spell.id]: url }));
        } catch {
          // A missing icon just leaves the placeholder in place.
        }
      }
    })();

    return () => {
      cancelled = true;
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [spells]);

  return urls;
}

export function SpellIconGrid() {
  const [links, setLinks] = useState<SpellIconLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    apiFetch<{ links: SpellIconLink[] }>("/api/spell-icons")
      .then((payload) => setLinks(payload.links.filter((link) => link.source)))
      .catch((cause: Error) => setError(cause.message));
  }, []);

  const visible = useMemo(() => {
    if (!links) return [];
    const term = query.trim().toLowerCase();
    if (!term) return links;
    return links.filter((link) =>
      link.name.toLowerCase().includes(term) || (link.words ?? "").toLowerCase().includes(term));
  }, [links, query]);

  // Load from the full list, not the filtered one: keying the fetch effect on the
  // filter result would revoke and re-download every icon on each keystroke.
  const icons = useSpellIcons(links ?? EMPTY_LINKS);

  if (error) return <p className="text-[12px] text-red-400">Falha ao carregar ícones: {error}</p>;
  if (!links) return <p className="text-[12px] text-muted">Carregando ícones…</p>;
  if (links.length === 0) {
    return (
      <p className="text-[12px] text-muted">
        Nenhum ícone vinculado. Rode <code>scripts/extract-client-spell-icons.py</code> e
        depois <code>scripts/link-spell-icons.py</code>.
      </p>
    );
  }

  return (
    <div>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar exori, cura, rune…"
        className="mb-3 w-full rounded border border-border bg-surface-2 px-2 py-1 text-[12px]"
      />
      <p className="mb-2 text-[11px] text-subtle">{visible.length} de {links.length} magias</p>
      <div className="grid max-h-[420px] grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2 overflow-y-auto">
        {visible.map((spell) => (
          <div key={spell.id} className="flex items-center gap-2 rounded bg-surface-3 px-2 py-1">
            {icons[spell.id]
              ? <img src={icons[spell.id]} alt={spell.name} width={32} height={32}
                     className="shrink-0 [image-rendering:pixelated]" />
              : <span className="h-8 w-8 shrink-0 rounded bg-surface-2" />}
            <span className="min-w-0">
              <span className="block truncate text-[12px]">{spell.name}</span>
              <span className="block truncate text-[10px] text-subtle">
                {spell.words ?? spell.type}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
