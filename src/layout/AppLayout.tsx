import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  Wrench,
  Users,
  Wallet,
  BarChart2,
  Settings,
} from "lucide-react";
import LogoutButton from "../components/LogoutButton";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/servicos", label: "Serviços", icon: Wrench, end: false },
  { to: "/funcionarios", label: "Funcionários", icon: Users, end: false },
  { to: "/despesas", label: "Despesas Fixas", icon: Wallet, end: false },
  { to: "/relatorios", label: "Relatórios", icon: BarChart2, end: false },
  { to: "/definicoes", label: "Definições", icon: Settings, end: false },
] as const;

function navClass(isActive: boolean) {
  const base = "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors";
  return isActive
    ? `${base} bg-zinc-100 font-semibold text-zinc-900`
    : `${base} font-medium text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900`;
}

export default function AppLayout() {
  return (
    <div className="h-screen overflow-hidden bg-zinc-50 text-zinc-900">
      <div className="flex h-full">

        {/* ── Sidebar (desktop) ───────────────────────────── */}
        <aside className="sticky top-0 hidden h-screen w-64 flex-col border-r bg-white md:flex">

          {/* Brand */}
          <div className="px-5 py-5">
            <div className="text-base font-bold tracking-tight text-zinc-900">
              Dashboard Oficina
            </div>
            <div className="mt-0.5 text-xs text-zinc-400">Bosch Car Service</div>
          </div>

          <div className="mx-4 border-t" />

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => navClass(isActive)}
              >
                <Icon size={16} strokeWidth={1.75} />
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Sidebar footer */}
          <div className="mx-4 border-t" />
          <div className="px-3 py-3">
            <LogoutButton />
          </div>
        </aside>

        {/* ── Main column ─────────────────────────────────── */}
        <div className="flex min-h-0 flex-1 flex-col">

          {/* Header */}
          <header className="sticky top-0 z-30 border-b bg-white">
            <div className="flex items-center justify-between px-4 py-3 md:px-6">
              <div>
                <div className="text-xs font-medium text-zinc-400">Bosch Car Service</div>
                <div className="text-lg font-bold leading-tight">Gestão de Mão-de-Obra</div>
              </div>

              <div className="flex items-center gap-2">
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">
                  Admin
                </span>
                {/* Logout only visible on mobile — desktop uses sidebar footer */}
                <div className="md:hidden">
                  <LogoutButton />
                </div>
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-6">
            <Outlet />
          </main>

          {/* ── Mobile bottom nav ─────────────────────────── */}
          <nav className="flex border-t bg-white md:hidden">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors ${
                    isActive
                      ? "text-zinc-900"
                      : "text-zinc-400 hover:text-zinc-600"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={18} strokeWidth={isActive ? 2 : 1.75} />
                    <span className="leading-none">{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>

        </div>
      </div>
    </div>
  );
}
