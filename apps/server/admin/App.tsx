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
  Database,
  Link as LinkIcon,
  ShoppingCart,
  Layers,
  Play,
  ListTodo,
} from "lucide-react";
import "./index.css";

// Pages
import Dashboard from "./pages/Dashboard";
import Workers from "./pages/Workers";
import Import from "./pages/Import";
import ImportProductionData from "./pages/ImportProductionData";
import ImportWizard from "./pages/ImportWizard";
import ImportWorkerEquipment from "./pages/ImportWorkerEquipment";
import ImportProductSteps from "./pages/ImportProductSteps";
import ImportProductionHistory from "./pages/ImportProductionHistory";
import Export from "./pages/Export";
import CertificationMatrix from "./pages/CertificationMatrix";
import WorkerDetail from "./pages/WorkerDetail";
import Equipment from "./pages/Equipment";
import ProductionSummary from "./pages/ProductionSummary";
import RecentActivity from "./pages/RecentActivity";
import FishbowlBOMs from "./pages/FishbowlBOMs";
import FishbowlOrders from "./pages/FishbowlOrders";
import DemandPool from "./pages/DemandPool";
import PlanningRuns from "./pages/PlanningRuns";
import PlanningRunDetail from "./pages/PlanningRunDetail";
import ActivePlan from "./pages/ActivePlan";
import BOMSteps from "./pages/BOMSteps";

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

        <NavGroup title="Planning">
          <NavItem href="/planning/demand" icon={<ListTodo size={18} />} label="Demand Pool" />
          <NavItem href="/planning/runs" icon={<Layers size={18} />} label="Planning Runs" />
          <NavItem href="/planning/active" icon={<Play size={18} />} label="Active Plan" />
        </NavGroup>

        <NavGroup title="Production">
          <NavItem href="/production-summary" icon={<BarChart3 size={18} />} label="Summary" />
          <NavItem href="/recent-activity" icon={<FileSpreadsheet size={18} />} label="Recent Activity" />
        </NavGroup>

        <NavGroup title="Fishbowl">
          <NavItem href="/fishbowl/boms" icon={<LinkIcon size={18} />} label="BOMs" />
          <NavItem href="/fishbowl/orders" icon={<ShoppingCart size={18} />} label="Sales Orders" />
        </NavGroup>

        <NavGroup title="Setup">
          <NavItem href="/bom-steps" icon={<Package size={18} />} label="BOM Steps" />
          <NavItem href="/workers" icon={<Users size={18} />} label="Workers" />
          <NavItem href="/certifications" icon={<Award size={18} />} label="Certifications" />
          <NavItem href="/equipment" icon={<Wrench size={18} />} label="Equipment" />
        </NavGroup>

        <NavGroup title="Import">
          <NavItem href="/import/worker-equipment" icon={<Upload size={18} />} label="1. Workers & Equipment" />
          <NavItem href="/import/product-steps" icon={<Upload size={18} />} label="2. Product Steps" />
          <NavItem href="/import/production-history" icon={<FileSpreadsheet size={18} />} label="3. Production History" />
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
            <Route path="/planning/demand" component={DemandPool} />
            <Route path="/planning/runs/:id" component={PlanningRunDetail} />
            <Route path="/planning/runs" component={PlanningRuns} />
            <Route path="/planning/active" component={ActivePlan} />
            <Route path="/fishbowl/boms" component={FishbowlBOMs} />
            <Route path="/fishbowl/orders" component={FishbowlOrders} />
            <Route path="/bom-steps" component={BOMSteps} />
            <Route path="/import/worker-equipment" component={ImportWorkerEquipment} />
            <Route path="/import/product-steps" component={ImportProductSteps} />
            <Route path="/import/production-history" component={ImportProductionHistory} />
            <Route path="/export" component={Export} />
            <Route path="/import-wizard" component={ImportWizard} />
            <Route path="/import" component={Import} />
            <Route path="/import-production" component={ImportProductionData} />
            <Route path="/workers/:id" component={WorkerDetail} />
            <Route path="/workers" component={Workers} />
            <Route path="/certifications" component={CertificationMatrix} />
            <Route path="/equipment" component={Equipment} />
            <Route path="/production-summary" component={ProductionSummary} />
            <Route path="/recent-activity" component={RecentActivity} />
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
