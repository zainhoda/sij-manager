import React from "react";
import { createRoot } from "react-dom/client";
import { Router, Route, Switch, Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Upload,
  Download,
  FileSpreadsheet,
  Package,
  Users,
  Award,
  ClipboardList,
  Calendar,
  Wrench,
  BarChart3,
} from "lucide-react";
import "./index.css";

// Pages
import Dashboard from "./pages/Dashboard";
import Workers from "./pages/Workers";
import ProductSteps from "./pages/ProductSteps";
import Import from "./pages/Import";
import ImportProductionData from "./pages/ImportProductionData";
import ImportWizard from "./pages/ImportWizard";
import ImportWorkerEquipment from "./pages/ImportWorkerEquipment";
import ImportProducts from "./pages/ImportProducts";
import ImportOrders from "./pages/ImportOrders";
import ImportProductionHistory from "./pages/ImportProductionHistory";
import Export from "./pages/Export";
import CertificationMatrix from "./pages/CertificationMatrix";
import Orders from "./pages/Orders";
import Schedules from "./pages/Schedules";
import ScheduleDetail from "./pages/ScheduleDetail";
import Equipment from "./pages/Equipment";
import BuildVersions from "./pages/BuildVersions";
import ProductionSummary from "./pages/ProductionSummary";
import PlanEditor from "./pages/PlanEditor";

interface NavItemProps {
  href: string;
  icon: React.ReactNode;
  label: string;
}

function NavItem({ href, icon, label }: NavItemProps) {
  const [location] = useLocation();
  const isActive = location === href || (href !== "/" && location.startsWith(href));

  return (
    <Link
      href={href}
      className={`nav-item ${isActive ? "active" : ""}`}
    >
      <span className="nav-icon">{icon}</span>
      <span className="nav-label">{label}</span>
    </Link>
  );
}

interface NavGroupProps {
  title: string;
  children: React.ReactNode;
}

function NavGroup({ title, children }: NavGroupProps) {
  return (
    <div className="nav-group">
      <div className="nav-group-title">{title}</div>
      {children}
    </div>
  );
}

function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <Link href="/" className="sidebar-logo">
          <span className="logo-icon">SIJ</span>
          <span className="logo-text">Manager</span>
        </Link>
      </div>

      <nav className="sidebar-nav">
        <NavItem href="/" icon={<LayoutDashboard size={18} />} label="Dashboard" />

        <NavGroup title="Production">
          <NavItem href="/production-summary" icon={<BarChart3 size={18} />} label="Summary" />
          <NavItem href="/schedules" icon={<Calendar size={18} />} label="Schedules" />
          <NavItem href="/orders" icon={<ClipboardList size={18} />} label="Orders" />
        </NavGroup>

        <NavGroup title="Setup">
          <NavItem href="/products" icon={<Package size={18} />} label="Products" />
          <NavItem href="/workers" icon={<Users size={18} />} label="Workers" />
          <NavItem href="/certifications" icon={<Award size={18} />} label="Certifications" />
          <NavItem href="/equipment" icon={<Wrench size={18} />} label="Equipment" />
        </NavGroup>

        <NavGroup title="Import">
          <NavItem href="/import/worker-equipment" icon={<Upload size={18} />} label="1. Workers & Equipment" />
          <NavItem href="/import/products" icon={<Upload size={18} />} label="2. Products" />
          <NavItem href="/import/orders" icon={<Upload size={18} />} label="3. Orders" />
          <NavItem href="/import/production-history" icon={<FileSpreadsheet size={18} />} label="4. Production History" />
        </NavGroup>

        <NavGroup title="Export">
          <NavItem href="/export" icon={<Download size={18} />} label="Export Data" />
        </NavGroup>
      </nav>
    </aside>
  );
}

function App() {
  return (
    <Router base="/admin">
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/import/worker-equipment" component={ImportWorkerEquipment} />
            <Route path="/import/products" component={ImportProducts} />
            <Route path="/import/orders" component={ImportOrders} />
            <Route path="/import/production-history" component={ImportProductionHistory} />
            <Route path="/export" component={Export} />
            <Route path="/import-wizard" component={ImportWizard} />
            <Route path="/import" component={Import} />
            <Route path="/import-production" component={ImportProductionData} />
            <Route path="/products/:id/build-versions">{(params) => <BuildVersions params={params} />}</Route>
            <Route path="/products/:id">{(params) => <ProductSteps params={params} />}</Route>
            <Route path="/products" component={ProductSteps} />
            <Route path="/workers" component={Workers} />
            <Route path="/certifications" component={CertificationMatrix} />
            <Route path="/equipment" component={Equipment} />
            <Route path="/orders" component={Orders} />
            <Route path="/orders/:id/plan">{(params) => <PlanEditor params={params} />}</Route>
            <Route path="/schedules/:id" component={ScheduleDetail} />
            <Route path="/schedules" component={Schedules} />
            <Route path="/production-summary" component={ProductionSummary} />
            <Route>
              <div className="page">
                <h1>404 - Not Found</h1>
              </div>
            </Route>
          </Switch>
        </main>
      </div>
    </Router>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
