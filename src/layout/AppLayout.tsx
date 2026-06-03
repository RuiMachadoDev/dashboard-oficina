import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  ArrowLeftRight,
  BarChart2,
  Settings,
  X,
} from "lucide-react";
import LogoutButton from "../components/LogoutButton";
import { Toaster } from "../components/ui/Toaster";
import { checkMigrations, type MigrationCheck } from "../lib/healthCheck";

const navItems = [
  { to: "/",           label: "Dashboard",  icon: LayoutDashboard, end: true  },
  { to: "/movimentos", label: "Movimentos", icon: ArrowLeftRight,  end: false },
  { to: "/relatorios", label: "Relatórios", icon: BarChart2,       end: false },
  { to: "/definicoes", label: "Definições", icon: Settings,        end: false },
] as const;

function navClass(isActive: boolean) {
  const base = "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors";
  return isActive
    ? `${base} bg-zinc-100 font-semibold text-zinc-900`
    : `${base} font-medium text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900`;
}

export default function AppLayout() {
  const [missing, setMissing] = useState<MigrationCheck[]>([]);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    checkMigrations().then((checks) => {
      setMissing(checks.filter((c) => !c.ok));
    });
  }, []);

  const showBanner = missing.length > 0 && !bannerDismissed;

  return (
    <div className="h-screen overflow-hidden bg-zinc-50 text-zinc-900">
      <div className="flex h-full">

        {/* Sidebar (desktop) */}
        <aside className="sticky top-0 hidden h-screen w-56 flex-col border-r bg-white md:flex">
          <div className="px-5 py-5">
            <div className="text-base font-bold tracking-tight">Dashboard Oficina</div>
            <div className="mt-0.5 text-xs text-zinc-400">Bosch Car Service</div>
          </div>

          <div className="mx-4 border-t" />

          <nav className="flex-1 px-3 py-3 space-y-0.5">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => navClass(isActive)}>
                <Icon size={16} strokeWidth={1.75} />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="mx-4 border-t" />
          <div className="px-3 py-3">
            <LogoutButton />
          </div>
        </aside>

        {/* Main column */}
        <div className="flex min-h-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b bg-white">
            <div className="flex items-center justify-between px-4 py-3 md:px-6">
              <div className="text-lg font-bold">Dashboard Financeiro · Bosch Car Service</div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">
                  Admin
                </span>
                <div className="md:hidden"><LogoutButton /></div>
              </div>
            </div>
          </header>

          {/* Migration health banner */}
          {showBanner && (
            <div className="flex items-start justify-between gap-4 border-b border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              <div>
                <p className="font-semibold">
                  {missing.length === 1 ? "1 migração em falta" : `${missing.length} migrações em falta`} — algumas funcionalidades podem não funcionar.
                </p>
                <p className="mt-1">
                  Executa no <strong>Supabase → SQL Editor</strong>, por esta ordem:
                </p>
                <ol className="mt-1 list-decimal pl-4 space-y-0.5">
                  {missing.map((m) => (
                    <li key={m.id}>
                      <code className="font-mono">{m.file}</code> — {m.label}
                    </li>
                  ))}
                </ol>
                <p className="mt-1.5 text-amber-700">
                  Ficheiros em <code className="font-mono">supabase/migrations/</code>.
                </p>
              </div>
              <button
                onClick={() => setBannerDismissed(true)}
                className="flex-shrink-0 rounded p-1 hover:bg-amber-100"
                aria-label="Fechar aviso"
              >
                <X size={14} />
              </button>
            </div>
          )}

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-6">
            <Outlet />
          </main>

          {/* Mobile bottom nav */}
          <nav className="flex border-t bg-white md:hidden">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to} to={to} end={end}
                className={({ isActive }) =>
                  `flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium ${
                    isActive ? "text-zinc-900" : "text-zinc-400"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={18} strokeWidth={isActive ? 2 : 1.75} />
                    <span>{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
      <Toaster />
    </div>
  );
}
