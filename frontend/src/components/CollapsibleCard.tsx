import { type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

const ICON_COLORS: Record<string, string> = {
  account: "bg-icon-account",
  char:    "bg-icon-char",
  machine: "bg-icon-machine",
  hunt:    "bg-icon-hunt",
  skill:   "bg-icon-skill",
  assign:  "bg-icon-assign",
  rule:    "bg-icon-rule",
  method:  "bg-icon-method",
  session: "bg-icon-session",
  source:  "bg-icon-source",
  upload:  "bg-icon-upload",
  link:    "bg-icon-link",
};

interface Props {
  icon: string;
  iconKind: keyof typeof ICON_COLORS;
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  wide?: boolean;
}

export function CollapsibleCard({ icon, iconKind, title, children, defaultOpen = true, wide = false }: Props) {
  const wideClass = wide ? "mb-4 last:mb-0" : "";

  return (
    <details
      open={defaultOpen}
      className={`group overflow-hidden rounded-[10px] border border-border bg-surface transition-[border-color] duration-[120ms] hover:border-border-2 ${wideClass}`}
    >
      <summary className="flex cursor-pointer select-none list-none items-center gap-2.5 border-b border-border bg-surface-2 px-4 py-3 text-[13px] font-medium transition-colors duration-[120ms] hover:bg-surface-3 [&::-webkit-details-marker]:hidden">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-opacity-15 text-[11px] font-bold text-white ${ICON_COLORS[iconKind] ?? "bg-muted"}`}
        >
          {icon}
        </span>
        {title}
        <ChevronRight className="ml-auto text-subtle transition-transform duration-200 group-open:rotate-90" size={17} />
      </summary>
      <div className="p-4">{children}</div>
    </details>
  );
}
