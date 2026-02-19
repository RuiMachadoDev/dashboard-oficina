import { BrowserRouter, Route, Routes } from "react-router-dom";
import AppLayout from "./layout/AppLayout";
import DashboardPage from "./pages/DashboardPage";
import DespesasPage from "./pages/DespesasPage";
import FuncionariosPage from "./pages/FuncionariosPage";
import ServicosPage from "./pages/ServicosPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/servicos" element={<ServicosPage />} />
          <Route path="/funcionarios" element={<FuncionariosPage />} />
          <Route path="/despesas" element={<DespesasPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
