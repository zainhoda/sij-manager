import React, { useState, useEffect } from "react";
import { Link, useParams } from "wouter";
import {
  ArrowLeft,
  TrendingUp,
  Clock,
  Award,
  Wrench,
  BarChart3,
  User,
} from "lucide-react";

interface WorkerStats {
  worker: {
    id: number;
    name: string;
    employee_id: string | null;
    status: "active" | "inactive" | "on_leave";
    cost_per_hour: number;
  };
  stats: {
    total_tasks: number;
    total_output: number;
    total_hours: number;
    output_per_hour: number;
  };
  teamAverages: {
    avg_output: number;
    avg_hours: number;
    avg_tasks: number;
  };
  stepPerformance: {
    step_id: number;
    step_name: string;
    estimated_seconds: number;
    product_name: string;
    times_performed: number;
    total_output: number;
    total_seconds: number;
    avg_seconds_per_piece: number | null;
    efficiency: number | null;
  }[];
  proficiencies: {
    id: number;
    product_step_id: number;
    level: number;
    step_name: string;
    product_name: string;
  }[];
  certifications: {
    id: number;
    equipment_id: number;
    equipment_name: string;
  }[];
  dailyProduction: {
    date: string;
    output: number;
    hours: number;
  }[];
}

const LEVEL_COLORS: Record<number, string> = {
  1: "#fee2e2",
  2: "#fed7aa",
  3: "#fef08a",
  4: "#bbf7d0",
  5: "#86efac",
};

const LEVEL_TEXT_COLORS: Record<number, string> = {
  1: "#dc2626",
  2: "#ea580c",
  3: "#ca8a04",
  4: "#16a34a",
  5: "#15803d",
};

export default function WorkerDetail() {
  const params = useParams<{ id: string }>();
  const workerId = params.id;
  const [data, setData] = useState<WorkerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch(`/api/workers/${workerId}/stats`);
        if (!response.ok) throw new Error("Failed to fetch worker stats");
        const json = await response.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [workerId]);

  if (loading) {
    return (
      <div className="page">
        <p>Loading...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page">
        <p className="text-red-600">{error || "Worker not found"}</p>
        <Link href="/workers" className="text-blue-500 hover:underline">
          Back to Workers
        </Link>
      </div>
    );
  }

  const { worker, stats, teamAverages, stepPerformance, proficiencies, certifications, dailyProduction } =
    data;

  const outputVsTeam = teamAverages.avg_output > 0
    ? Math.round((stats.total_output / teamAverages.avg_output) * 100)
    : 100;

  const maxDailyOutput = Math.max(...dailyProduction.map((d) => d.output), 1);

  return (
    <div className="page">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/workers"
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <User className="text-slate-400" size={28} />
            {worker.name}
          </h1>
          <p className="text-slate-500">
            {worker.employee_id && `ID: ${worker.employee_id} · `}
            <span
              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                worker.status === "active"
                  ? "bg-green-100 text-green-700"
                  : worker.status === "on_leave"
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {worker.status.replace("_", " ")}
            </span>
            {worker.cost_per_hour > 0 && ` · $${worker.cost_per_hour.toFixed(2)}/hr`}
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-500">Total Output</span>
            <TrendingUp className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {stats.total_output.toLocaleString()}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            <span
              className={outputVsTeam >= 100 ? "text-green-600" : "text-orange-600"}
            >
              {outputVsTeam}%
            </span>{" "}
            of team average
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-500">Hours Worked</span>
            <Clock className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {stats.total_hours.toFixed(1)}h
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {stats.total_tasks} tasks completed
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-500">Output/Hour</span>
            <BarChart3 className="w-4 h-4 text-teal-500" />
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {stats.output_per_hour}
          </div>
          <p className="text-sm text-slate-500 mt-1">step completions</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-500">Certifications</span>
            <Wrench className="w-4 h-4 text-orange-500" />
          </div>
          <div className="text-3xl font-bold text-slate-900">
            {certifications.length}
          </div>
          <p className="text-sm text-slate-500 mt-1">equipment certified</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Production Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Recent Production
          </h2>
          {dailyProduction.length === 0 ? (
            <p className="text-slate-500 py-8 text-center">No production data</p>
          ) : (
            <div className="flex items-end justify-between gap-2 h-40">
              {dailyProduction.map((day) => {
                const height = (day.output / maxDailyOutput) * 100;
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-slate-500">{day.output}</span>
                    <div
                      className="w-full bg-blue-500 rounded-t"
                      style={{ height: `${Math.max(height, 4)}%` }}
                    />
                    <span className="text-[10px] text-slate-400">
                      {new Date(day.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Proficiencies */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Award className="w-5 h-5 text-yellow-500" />
            Proficiencies ({proficiencies.length})
          </h2>
          {proficiencies.length === 0 ? (
            <p className="text-slate-500 text-sm">No proficiencies set</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {proficiencies.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-700 truncate">
                      {p.step_name}
                    </div>
                    <div className="text-xs text-slate-400">{p.product_name}</div>
                  </div>
                  <div
                    className="w-7 h-7 rounded flex items-center justify-center text-sm font-bold"
                    style={{
                      backgroundColor: LEVEL_COLORS[p.level],
                      color: LEVEL_TEXT_COLORS[p.level],
                    }}
                  >
                    {p.level}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Step Performance Table */}
      <div className="mt-6 bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Step Performance
        </h2>
        {stepPerformance.length === 0 ? (
          <p className="text-slate-500 py-4 text-center">No performance data</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 px-3 font-medium text-slate-600">
                    Step
                  </th>
                  <th className="text-left py-2 px-3 font-medium text-slate-600">
                    Product
                  </th>
                  <th className="text-right py-2 px-3 font-medium text-slate-600">
                    Times
                  </th>
                  <th className="text-right py-2 px-3 font-medium text-slate-600">
                    Output
                  </th>
                  <th className="text-right py-2 px-3 font-medium text-slate-600">
                    Avg Sec/Piece
                  </th>
                  <th className="text-right py-2 px-3 font-medium text-slate-600">
                    Target
                  </th>
                  <th className="text-right py-2 px-3 font-medium text-slate-600">
                    Efficiency
                  </th>
                </tr>
              </thead>
              <tbody>
                {stepPerformance.map((step) => (
                  <tr key={step.step_id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 px-3 font-medium text-slate-800">
                      {step.step_name}
                    </td>
                    <td className="py-2 px-3 text-slate-500">{step.product_name}</td>
                    <td className="py-2 px-3 text-right text-slate-600">
                      {step.times_performed}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-600">
                      {step.total_output.toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-600">
                      {step.avg_seconds_per_piece
                        ? step.avg_seconds_per_piece.toFixed(1)
                        : "-"}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-500">
                      {step.estimated_seconds}s
                    </td>
                    <td className="py-2 px-3 text-right">
                      {step.efficiency !== null ? (
                        <span
                          className={`font-medium ${
                            step.efficiency >= 100
                              ? "text-green-600"
                              : step.efficiency >= 80
                              ? "text-yellow-600"
                              : "text-red-600"
                          }`}
                        >
                          {step.efficiency}%
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Certifications */}
      <div className="mt-6 bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Wrench className="w-5 h-5 text-orange-500" />
          Equipment Certifications ({certifications.length})
        </h2>
        {certifications.length === 0 ? (
          <p className="text-slate-500">No certifications</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {certifications.map((cert) => (
              <span
                key={cert.id}
                className="px-3 py-1.5 bg-orange-50 text-orange-700 rounded-full text-sm font-medium"
              >
                {cert.equipment_name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
