import { NavLink, Outlet } from "react-router-dom";
import LogoutButton from "../components/LogoutButton";

const linkBase =
  "block rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-zinc-100";
const linkActive = "bg-zinc-100";

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-64 border-r bg-white p-4 md:block">
          <div className="mb-6">
            <div className="text-lg font-bold">Dashboard Oficina</div>
            <div className="text-xs text-zinc-500">Admin</div>
          </div>

          <nav className="space-y-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `${linkBase} ${isActive ? linkActive : ""}`
              }
            >
              Dashboard
            </NavLink>

            <NavLink
              to="/servicos"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? linkActive : ""}`
              }
            >
              Serviços
            </NavLink>

            <NavLink
              to="/funcionarios"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? linkActive : ""}`
              }
            >
              Funcionários
            </NavLink>

            <NavLink
              to="/despesas"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? linkActive : ""}`
              }
            >
              Despesas Fixas
            </NavLink>

            <NavLink
              to="/relatorios"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? linkActive : ""}`
              }
            >
              Relatórios
            </NavLink>

            <NavLink
              to="/definicoes"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? linkActive : ""}`
              }
            >
              Definições
            </NavLink>
          </nav>
        </aside>

        <div className="flex-1">
          <header className="border-b bg-white">
            <div className="flex items-center justify-between px-4 py-4 md:px-6">
              <div>
                <div className="text-sm text-zinc-500">Bosch Car Service</div>
                <div className="text-xl font-bold">Gestão de Mão-de-Obra</div>
              </div>

              <div className="flex items-center gap-3">
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-700">
                  Admin
                </span>
                <LogoutButton />
              </div>
            </div>
          </header>

          <main className="px-4 py-6 md:px-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
