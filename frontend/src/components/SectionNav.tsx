const LINKS = [
  { href: "#sec-entities", label: "Entidades" },
  { href: "#sec-ops",      label: "Operacoes" },
  { href: "#sec-learning", label: "Aprendizado" },
  { href: "#sec-status",   label: "Status" },
];

export function SectionNav() {
  return (
    <nav
      aria-label="Secoes"
      className="flex gap-1 overflow-x-auto border-b border-border bg-surface px-5 py-3"
    >
      {LINKS.map(({ href, label }) => (
        <a
          key={href}
          href={href}
          className="rounded-full border border-transparent px-3 py-1 text-[12px] font-medium whitespace-nowrap text-muted transition-[background,color,border-color] duration-[120ms] hover:border-border hover:bg-surface-3 hover:text-text"
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
