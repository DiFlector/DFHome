import { NavLink, Route, Routes } from "react-router-dom";
import { FlowIcon, HomeIcon, LayoutIcon, SettingsIcon } from "./components/icons";
import Dashboard from "./pages/Dashboard";
import DeviceDetail from "./pages/DeviceDetail";
import Plan from "./pages/Plan";
import ScenarioForm from "./pages/ScenarioForm";
import Scenarios from "./pages/Scenarios";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <h1>
          <span className="brand-mark">
            <HomeIcon width={16} height={16} stroke="#fff" />
          </span>
          DFHome
        </h1>
        <nav>
          <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
            <HomeIcon />
            Устройства
          </NavLink>
          <NavLink to="/plan" className={({ isActive }) => (isActive ? "active" : "")}>
            <LayoutIcon />
            Дашборд
          </NavLink>
          <NavLink to="/scenarios" className={({ isActive }) => (isActive ? "active" : "")}>
            <FlowIcon />
            Сценарии
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => (isActive ? "active" : "")}>
            <SettingsIcon />
            Настройки
          </NavLink>
        </nav>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/devices/:id" element={<DeviceDetail />} />
          <Route path="/plan" element={<Plan />} />
          <Route path="/scenarios" element={<Scenarios />} />
          <Route path="/scenarios/new" element={<ScenarioForm />} />
          <Route path="/scenarios/:id/edit" element={<ScenarioForm />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
