import { BrowserRouter, Route, Routes } from "react-router-dom";
import AppLayout from "./layout/AppLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import { ErrorBoundary } from "./components/ErrorBoundary";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import MovimentosPage from "./pages/MovimentosPage";
import RelatoriosPage from "./pages/RelatoriosPage";
import DefinicoesPage from "./pages/DefinicoesPage";

// Legacy pages — accessible via direct URL but not in the main nav.
import ServicosPage from "./pages/ServicosPage";
import ServicoDetalhePage from "./pages/ServicoDetalhePage";
import FuncionariosPage from "./pages/FuncionariosPage";
import DespesasPage from "./pages/DespesasPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<ErrorBoundary><LoginPage /></ErrorBoundary>} />

        <Route
          element={
            <ErrorBoundary>
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            </ErrorBoundary>
          }
        >
          {/* Primary routes */}
          <Route path="/" element={<DashboardPage />} />
          <Route path="/movimentos" element={<MovimentosPage />} />
          <Route path="/relatorios" element={<RelatoriosPage />} />
          <Route path="/definicoes" element={<DefinicoesPage />} />

          {/* Legacy routes — preserved for existing data access */}
          <Route path="/servicos" element={<ServicosPage />} />
          <Route path="/servicos/:id" element={<ServicoDetalhePage />} />
          <Route path="/funcionarios" element={<FuncionariosPage />} />
          <Route path="/despesas" element={<DespesasPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
