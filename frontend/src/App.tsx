import { useEffect, useState } from "react";
import { TopBar } from "./components/TopBar.tsx";
import { Sidebar, type PageId } from "./components/Sidebar.tsx";
import { Footer } from "./components/Footer.tsx";
import { LoginPanel } from "./components/LoginPanel.tsx";
import { DashboardPage } from "./pages/DashboardPage.tsx";
import { EntitiesPage } from "./pages/EntitiesPage.tsx";
import { OpsPage } from "./pages/OpsPage.tsx";
import { LearningPage } from "./pages/LearningPage.tsx";
import { ConfigPage } from "./pages/ConfigPage.tsx";
import { CatalogPage } from "./pages/CatalogPage.tsx";
import { useAuth } from "./hooks/useAuth.ts";
import { useAppState } from "./hooks/useAppState.ts";

export function App() {
  const { user, checked, login, logout, checkSession } = useAuth();
  const { state, statusMsg, refresh } = useAppState();
  const [currentPage, setCurrentPage] = useState<PageId>("dashboard");

  useEffect(() => {
    checkSession().then(u => { if (u) refresh(); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLogin(username: string, password: string) {
    await login(username, password);
    await refresh();
  }

  if (!checked) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <div className="text-[13px] text-muted">Carregando...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen flex-col bg-bg">
        <TopBar user={null} onRefresh={() => {}} onLogout={() => {}} />
        <LoginPanel onLogin={handleLogin} />
      </div>
    );
  }

  function renderPage() {
    switch (currentPage) {
      case "dashboard":
        return <DashboardPage state={state} statusMsg={statusMsg} onRefresh={refresh} />;
      case "entities":
        return <EntitiesPage state={state} onRefresh={refresh} />;
      case "ops":
        return <OpsPage state={state} onRefresh={refresh} />;
      case "learning":
        return <LearningPage state={state} onRefresh={refresh} />;
      case "catalog":
        return <CatalogPage />;
      case "config":
        return <ConfigPage state={state} statusMsg={statusMsg} onRefresh={refresh} />;
    }
  }

  return (
    <div className="flex h-screen flex-col bg-bg">
      <TopBar user={user} onRefresh={refresh} onLogout={logout} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />

        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-1 overflow-hidden">
            {renderPage()}
          </div>
          <Footer />
        </main>
      </div>
    </div>
  );
}
