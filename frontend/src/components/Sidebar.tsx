import { useState } from "react";
import { BookOpen, Bot, ChevronLeft, Database, Gauge, LogOut, PanelLeft, Settings, Sparkles, Workflow, X } from "lucide-react";
import type { User } from "../types.ts";

export type PageId = "dashboard" | "entities" | "ops" | "learning" | "catalog" | "config";

const NAV_GROUPS = [
  { label: "Visão geral", items: [{ id: "dashboard" as PageId, label: "Dashboard", icon: Gauge }] },
  { label: "Operação", items: [
    { id: "entities" as PageId, label: "Entidades", icon: Database },
    { id: "ops" as PageId, label: "Operações", icon: Workflow },
  ]},
  { label: "Inteligência", items: [
    { id: "learning" as PageId, label: "Aprendizado", icon: Sparkles },
    { id: "catalog" as PageId, label: "Catálogo", icon: BookOpen },
  ]},
];

interface Props { currentPage: PageId; onNavigate: (page: PageId) => void; mobileOpen: boolean; onMobileClose: () => void; user: User; onLogout: () => void; }

export function Sidebar({ currentPage, onNavigate, mobileOpen, onMobileClose, user, onLogout }: Props) {
  const [expanded, setExpanded] = useState(true);
  function navigate(page: PageId) { onNavigate(page); onMobileClose(); }

  return <>
    {mobileOpen && <button className="sidebar-backdrop" aria-label="Fechar menu" onClick={onMobileClose} />}
    <aside className={`app-sidebar ${expanded ? "is-expanded" : "is-compact"} ${mobileOpen ? "is-mobile-open" : ""}`}>
      <div className="sidebar-brand">
        <span className="brand-mark"><Bot size={21} /></span>
        <span className="brand-copy"><strong>Botzin</strong><small>Automation intelligence</small></span>
        <button className="sidebar-mobile-close" onClick={onMobileClose} aria-label="Fechar menu"><X size={19} /></button>
      </div>

      <nav className="sidebar-nav" aria-label="Navegação principal">
        {NAV_GROUPS.map(group => <div className="nav-group" key={group.label}>
          <div className="nav-group-label">{group.label}</div>
          {group.items.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => navigate(id)} title={!expanded ? label : undefined} aria-current={currentPage === id ? "page" : undefined} className={`nav-item ${currentPage === id ? "is-active" : ""}`}>
            <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
          </button>)}
        </div>)}
      </nav>

      <div className="sidebar-bottom">
        <button type="button" onClick={() => navigate("config")} title={!expanded ? "Configurações" : undefined} className={`nav-item ${currentPage === "config" ? "is-active" : ""}`}><Settings size={18} /><span>Configurações</span></button>
        <div className="sidebar-profile">
          <span className="avatar">{user.displayName.slice(0, 2).toUpperCase()}</span>
          <span className="profile-copy"><strong>{user.displayName}</strong><small>{user.role}</small></span>
          <button onClick={onLogout} title="Sair" aria-label="Sair"><LogOut size={17} /></button>
        </div>
        <button className="sidebar-collapse" onClick={() => setExpanded(v => !v)} aria-label={expanded ? "Recolher menu" : "Expandir menu"} title={expanded ? "Recolher menu" : "Expandir menu"}>{expanded ? <ChevronLeft size={17} /> : <PanelLeft size={17} />}<span>Recolher menu</span></button>
      </div>
    </aside>
  </>;
}
