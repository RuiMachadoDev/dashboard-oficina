import { BrowserRouter, Route, Routes } from "react-router-dom";
import AppLayout from "./layout/AppLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ServicosPage from "./pages/ServicosPage";
import FuncionariosPage from "./pages/FuncionariosPage";
import DespesasPage from "./pages/DespesasPage";
import ServicoDetalhePage from "./pages/ServicoDetalhePage";
import DefinicoesPage from "./pages/DefinicoesPage";
import RelatoriosPage from "./pages/RelatoriosPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<DashboardPage />} />
          <Route path="/servicos" element={<ServicosPage />} />
          <Route path="/funcionarios" element={<FuncionariosPage />} />
          <Route path="/despesas" element={<DespesasPage />} />
          <Route path="/servicos/:id" element={<ServicoDetalhePage />} />
          <Route path="/definicoes" element={<DefinicoesPage />} />
          <Route path="/relatorios" element={<RelatoriosPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
