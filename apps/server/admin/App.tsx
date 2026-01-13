import React from "react";
import { createRoot } from "react-dom/client";
import { Router, Route, Switch, Link } from "wouter";
import "./index.css";

// Pages
import Workers from "./pages/Workers";
import ProductSteps from "./pages/ProductSteps";
import Import from "./pages/Import";

function Dashboard() {
  return (
    <div className="page">
      <h1>Dashboard</h1>
      <p>Welcome to SIJ Manager Admin</p>
      <nav className="nav-links">
        <Link href="/workers">Workers</Link>
        <Link href="/orders">Orders</Link>
        <Link href="/schedules">Schedules</Link>
        <Link href="/equipment">Equipment</Link>
      </nav>
    </div>
  );
}

function App() {
  return (
    <Router base="/admin">
      <div className="app">
        <header className="header">
          <Link href="/" className="logo">SIJ Manager</Link>
          <nav className="nav">
            <Link href="/import">Import</Link>
            <Link href="/products">Products</Link>
            <Link href="/workers">Workers</Link>
            <Link href="/orders">Orders</Link>
            <Link href="/schedules">Schedules</Link>
            <Link href="/equipment">Equipment</Link>
          </nav>
        </header>
        <main className="main">
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/import" component={Import} />
            <Route path="/products/:id">{(params) => <ProductSteps params={params} />}</Route>
            <Route path="/products" component={ProductSteps} />
            <Route path="/workers" component={Workers} />
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
