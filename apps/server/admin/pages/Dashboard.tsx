import React, { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  Package,
  TrendingUp,
  TrendingDown,
  Users,
  Clock,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
} from "lucide-react";
import ProductionChart from "../components/ProductionChart";

interface DashboardOrder {
  id: number;
  productName: string;
  quantity: number;
  dueDate: string;
  status: string;
  progressPercent: number;
  daysUntilDue: number;
  startDate: string | null;
  estimatedCompletionDate: string | null;
  isOnTrack: boolean;
}

interface TopWorker {
  id: number;
  name: string;
  unitsToday: number;
  efficiency: number;
}

interface DailyProduction {
  date: string;
  units: number;
  dayName: string;
}

interface DashboardData {
  activeOrders: number;
  ordersDueThisWeek: number;
  unitsToday: number;
  unitsYesterday: number;
  avgEfficiency: number;
  workersActiveToday: number;
  totalWorkers: number;
  orders: DashboardOrder[];
  topWorkers: TopWorker[];
  dailyProduction: DailyProduction[];
  period: "today" | "yesterday";
  actualUnitsToday: number;
  lastUpdated: string;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<"today" | "yesterday">("today");
  const [initialized, setInitialized] = useState(false);

  const fetchDashboard = async (period: "today" | "yesterday") => {
    try {
      const response = await fetch(`/api/dashboard?period=${period}`);
      if (!response.ok) throw new Error("Failed to fetch dashboard");
      const json = await response.json();
      setData(json);
      setError(null);
      return json as DashboardData;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Initial load: auto-switch to last business day if no production today
  useEffect(() => {
    const init = async () => {
      const result = await fetchDashboard("today");
      if (result && result.actualUnitsToday === 0) {
        setSelectedPeriod("yesterday");
        await fetchDashboard("yesterday");
      }
      setInitialized(true);
    };
    init();
  }, []);

  // Refetch when period changes (only after initialization)
  useEffect(() => {
    if (initialized) {
      fetchDashboard(selectedPeriod);
    }
  }, [selectedPeriod]);

  // Periodic refresh
  useEffect(() => {
    if (!initialized) return;
    const interval = setInterval(() => fetchDashboard(selectedPeriod), 30000);
    return () => clearInterval(interval);
  }, [selectedPeriod, initialized]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-500 text-lg">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-600 text-lg">{error}</p>
          <button
            onClick={() => fetchDashboard(selectedPeriod)}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const unitsDiff = data.unitsToday - data.unitsYesterday;
  const unitsDiffPercent = data.unitsYesterday > 0
    ? Math.round((unitsDiff / data.unitsYesterday) * 100)
    : 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Production Dashboard</h1>
          <p className="text-slate-500 mt-1">Real-time overview of manufacturing operations</p>
        </div>
        <div className="flex items-center gap-4">
          {/* Period Toggle */}
          <div className="flex items-center bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setSelectedPeriod("today")}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                selectedPeriod === "today"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setSelectedPeriod("yesterday")}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                selectedPeriod === "yesterday"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Last Business Day
            </button>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Updates every 30s</span>
          </div>
        </div>
      </div>

      {/* Hero KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Active Orders */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Active Orders</span>
            <Package className="w-5 h-5 text-blue-500" />
          </div>
          <div className="text-5xl font-bold text-slate-900 mb-2">{data.activeOrders}</div>
          <p className="text-sm text-slate-500">
            <span className="text-orange-500 font-medium">{data.ordersDueThisWeek}</span> due this week
          </p>
        </div>

        {/* Step Completions */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
              Step Completions
            </span>
            {unitsDiff >= 0 ? (
              <TrendingUp className="w-5 h-5 text-green-500" />
            ) : (
              <TrendingDown className="w-5 h-5 text-red-500" />
            )}
          </div>
          <div className="text-5xl font-bold text-slate-900 mb-2">{data.unitsToday.toLocaleString()}</div>
          <p className="text-sm">
            {unitsDiff >= 0 ? (
              <span className="text-green-600 font-medium">+{unitsDiff} ({unitsDiffPercent}%)</span>
            ) : (
              <span className="text-red-600 font-medium">{unitsDiff} ({unitsDiffPercent}%)</span>
            )}
            <span className="text-slate-500"> vs {selectedPeriod === "today" ? "last business day" : "prior day"}</span>
          </p>
        </div>

        {/* Efficiency */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Efficiency</span>
            <Clock className="w-5 h-5 text-purple-500" />
          </div>
          <div className="flex items-center gap-4">
            {/* Circular Progress */}
            <div className="relative w-20 h-20">
              <svg className="w-20 h-20 transform -rotate-90">
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  stroke="#e2e8f0"
                  strokeWidth="8"
                  fill="none"
                />
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  stroke={data.avgEfficiency >= 100 ? "#22c55e" : data.avgEfficiency >= 80 ? "#f59e0b" : "#ef4444"}
                  strokeWidth="8"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${(data.avgEfficiency / 100) * 226} 226`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-bold text-slate-900">{data.avgEfficiency}%</span>
              </div>
            </div>
            <div>
              <p className={`text-sm font-medium ${data.avgEfficiency >= 100 ? 'text-green-600' : data.avgEfficiency >= 80 ? 'text-orange-600' : 'text-red-600'}`}>
                {data.avgEfficiency >= 100 ? 'Above Target' : data.avgEfficiency >= 80 ? 'Near Target' : 'Below Target'}
              </p>
              <p className="text-xs text-slate-500">7-day average</p>
            </div>
          </div>
        </div>

        {/* Workers Active */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
              Workers {selectedPeriod === "today" ? "Active" : "Were Active"}
            </span>
            <Users className="w-5 h-5 text-teal-500" />
          </div>
          <div className="text-5xl font-bold text-slate-900 mb-2">{data.workersActiveToday}</div>
          <p className="text-sm text-slate-500">
            of <span className="font-medium text-slate-700">{data.totalWorkers}</span> total workers
          </p>
        </div>
      </div>

      {/* Middle Section: Orders + Top Workers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Progress - Takes 2 columns */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-900">Order Progress</h2>
            <Link href="/orders" className="text-sm text-blue-500 hover:text-blue-600 font-medium">
              View All →
            </Link>
          </div>

          {data.orders.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No active orders</p>
            </div>
          ) : (
            <div className="space-y-4">
              {data.orders.map((order) => {
                const formatDate = (dateStr: string | null) => {
                  if (!dateStr) return null;
                  // Parse as local time to avoid timezone shift (YYYY-MM-DD -> local midnight)
                  const [year, month, day] = dateStr.split('-').map(Number);
                  const date = new Date(year!, month! - 1, day!);
                  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                };

                return (
                  <Link key={order.id} href={`/orders/${order.id}/detail`} className="block border border-slate-100 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-slate-900">{order.productName}</h3>
                        <p className="text-sm text-slate-500">Order #{order.id} · {order.quantity.toLocaleString()} units</p>
                      </div>
                      <OrderStatusBadge order={order} />
                    </div>

                    {/* Progress Bar */}
                    <div className="mb-3">
                      <div className="relative h-5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            order.progressPercent >= 100 ? 'bg-green-500' :
                            order.isOnTrack ? 'bg-blue-500' :
                            'bg-red-500'
                          }`}
                          style={{ width: `${Math.min(order.progressPercent, 100)}%` }}
                        />
                        <span className={`absolute inset-0 flex items-center justify-center text-xs font-semibold ${
                          order.progressPercent > 50 ? 'text-white' : 'text-slate-600'
                        }`}>
                          {order.progressPercent}%
                        </span>
                      </div>
                    </div>

                    {/* Timeline */}
                    <div className="flex items-center justify-between text-xs">
                      <div className="text-slate-500">
                        <span className="font-medium">Started:</span>{' '}
                        <span className="text-slate-700">{formatDate(order.startDate) || 'Not started'}</span>
                      </div>
                      <div className="text-slate-500">
                        <span className="font-medium">Due:</span>{' '}
                        <span className="text-slate-700">{formatDate(order.dueDate)}</span>
                      </div>
                      <div className={order.isOnTrack ? 'text-slate-500' : 'text-red-600'}>
                        <span className="font-medium">Est. completion:</span>{' '}
                        <span className={order.isOnTrack ? 'text-slate-700' : 'text-red-700 font-semibold'}>
                          {formatDate(order.estimatedCompletionDate) || 'Calculating...'}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Top Workers */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-6">
            Top Performers {selectedPeriod === "today" ? "Today" : "Last Business Day"}
          </h2>

          {data.topWorkers.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No activity {selectedPeriod === "today" ? "yet today" : "that day"}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {data.topWorkers.map((worker, index) => (
                <Link key={worker.id} href={`/workers/${worker.id}`} className="flex items-center gap-4 hover:bg-slate-50 -mx-2 px-2 py-1 rounded-lg transition-colors">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    index === 0 ? 'bg-yellow-100 text-yellow-700' :
                    index === 1 ? 'bg-slate-100 text-slate-600' :
                    index === 2 ? 'bg-orange-100 text-orange-700' :
                    'bg-slate-50 text-slate-500'
                  }`}>
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 truncate">{worker.name}</p>
                    <p className="text-sm text-slate-500">{worker.unitsToday} step completions</p>
                  </div>
                  <div className={`text-sm font-medium px-2 py-1 rounded ${
                    worker.efficiency >= 100 ? 'bg-green-100 text-green-700' :
                    worker.efficiency >= 80 ? 'bg-orange-100 text-orange-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {worker.efficiency}%
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Production Chart */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-6">7-Day Production <span className="text-sm font-normal text-slate-500">(step completions)</span></h2>
        <ProductionChart
          data={data.dailyProduction.map(d => ({ date: d.date, value: d.units, dayName: d.dayName }))}
        />
      </div>
    </div>
  );
}

function OrderStatusBadge({ order }: { order: DashboardOrder }) {
  if (order.progressPercent >= 100) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <CheckCircle className="w-3 h-3" />
        Complete
      </span>
    );
  }

  if (order.daysUntilDue < 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
        <AlertTriangle className="w-3 h-3" />
        Overdue
      </span>
    );
  }

  if (order.daysUntilDue <= 3 && order.progressPercent < 80) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
        <AlertTriangle className="w-3 h-3" />
        At Risk
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
      Due {order.daysUntilDue === 0 ? 'Today' : order.daysUntilDue === 1 ? 'Tomorrow' : `in ${order.daysUntilDue}d`}
    </span>
  );
}
