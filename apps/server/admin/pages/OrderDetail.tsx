import React, { useState, useEffect } from "react";
import { Link, useParams } from "wouter";
import {
  ArrowLeft,
  Package,
  Clock,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronRight,
  Users,
  AlertCircle,
} from "lucide-react";

interface OrderDetailData {
  order: {
    id: number;
    productName: string;
    quantity: number;
    dueDate: string;
    status: string;
    startDate: string | null;
  };
  summary: {
    estimatedCompletionDate: string | null;
    daysUntilDue: number;
    isOnTrack: boolean;
    daysAheadOrBehind: number;
    overallEfficiency: number | null;
    totalHoursWorked: number;
    totalHoursNeeded: number;
  };
  insights: {
    overallStatus: 'ahead' | 'on_track' | 'behind' | 'at_risk';
    factors: {
      type: 'bottleneck_step' | 'fast_step' | 'worker_efficiency' | 'hours_deficit';
      impact: 'positive' | 'negative' | 'neutral';
      severity: number;
      title: string;
      description: string;
      stepId?: number;
      workerId?: number;
    }[];
    suggestions: string[];
  };
  steps: {
    stepId: number;
    stepName: string;
    sequence: number;
    completedUnits: number;
    totalUnits: number;
    progressPercent: number;
    expectedSecondsPerPiece: number;
    actualSecondsPerPiece: number | null;
    efficiency: number | null;
    hoursWorked: number;
    hoursRemaining: number;
    isBottleneck: boolean;
    workers: {
      workerId: number;
      workerName: string;
      proficiencyLevel: number | null;
      unitsProduced: number;
      hoursWorked: number;
      efficiency: number | null;
    }[];
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

export default function OrderDetail() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const [data, setData] = useState<OrderDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const response = await fetch(`/api/orders/${orderId}/detail`);
        if (!response.ok) throw new Error("Failed to fetch order details");
        const json = await response.json();
        setData(json);
        // Auto-expand bottleneck step
        const bottleneckStep = json.steps?.find((s: { isBottleneck: boolean }) => s.isBottleneck);
        if (bottleneckStep) {
          setExpandedSteps(new Set([bottleneckStep.stepId]));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [orderId]);

  const toggleStep = (stepId: number) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

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
        <p className="text-red-600">{error || "Order not found"}</p>
        <Link href="/" className="text-blue-500 hover:underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const { order, summary, insights, steps } = data;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year!, month! - 1, day!);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getStatusBadge = () => {
    if (summary.daysUntilDue < 0) {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium bg-red-100 text-red-700">
          <AlertTriangle className="w-4 h-4" />
          Overdue
        </span>
      );
    }
    if (insights.overallStatus === 'behind') {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium bg-red-100 text-red-700">
          <AlertTriangle className="w-4 h-4" />
          Behind Schedule
        </span>
      );
    }
    if (insights.overallStatus === 'at_risk') {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium bg-orange-100 text-orange-700">
          <AlertCircle className="w-4 h-4" />
          At Risk
        </span>
      );
    }
    if (insights.overallStatus === 'ahead') {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium bg-green-100 text-green-700">
          <CheckCircle className="w-4 h-4" />
          Ahead of Schedule
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium bg-blue-100 text-blue-700">
        <Clock className="w-4 h-4" />
        On Track
      </span>
    );
  };

  return (
    <div className="page space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/"
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <Package className="text-slate-400" size={28} />
            <h1 className="text-2xl font-bold text-slate-900">
              {order.productName}
            </h1>
            {getStatusBadge()}
          </div>
          <p className="text-slate-500 mt-1">
            Order #{order.id} · {order.quantity.toLocaleString()} units
            {order.startDate && ` · Started ${formatDate(order.startDate)}`}
            · Due {formatDate(order.dueDate)}
          </p>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-sm text-slate-500 mb-1">Est. Completion</div>
          <div className={`text-xl font-bold ${summary.isOnTrack ? 'text-slate-900' : 'text-red-600'}`}>
            {formatDate(summary.estimatedCompletionDate) || 'Calculating...'}
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-sm text-slate-500 mb-1">Days Until Due</div>
          <div className={`text-xl font-bold ${summary.daysUntilDue < 0 ? 'text-red-600' : 'text-slate-900'}`}>
            {summary.daysUntilDue < 0 ? `${Math.abs(summary.daysUntilDue)} overdue` : summary.daysUntilDue}
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-sm text-slate-500 mb-1">Schedule Status</div>
          <div className={`text-xl font-bold ${
            summary.daysAheadOrBehind >= 0 ? 'text-green-600' : 'text-red-600'
          }`}>
            {summary.daysAheadOrBehind === 0 ? 'On schedule' :
             summary.daysAheadOrBehind > 0 ? `${summary.daysAheadOrBehind}d ahead` :
             `${Math.abs(summary.daysAheadOrBehind)}d behind`}
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="text-sm text-slate-500 mb-1">Overall Efficiency</div>
          <div className={`text-xl font-bold ${
            summary.overallEfficiency === null ? 'text-slate-400' :
            summary.overallEfficiency >= 100 ? 'text-green-600' :
            summary.overallEfficiency >= 80 ? 'text-orange-600' :
            'text-red-600'
          }`}>
            {summary.overallEfficiency !== null ? `${summary.overallEfficiency}%` : '--'}
          </div>
        </div>
      </div>

      {/* Why Is This Order Behind/Ahead */}
      {insights.factors.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">
            {insights.overallStatus === 'behind' || insights.overallStatus === 'at_risk'
              ? 'Why Is This Order Behind?'
              : insights.overallStatus === 'ahead'
              ? 'Why Is This Order Ahead?'
              : 'Order Analysis'}
          </h2>

          <div className="space-y-4">
            {insights.factors.map((factor, index) => (
              <div
                key={index}
                className={`flex gap-3 p-4 rounded-lg ${
                  factor.impact === 'negative' ? 'bg-red-50' :
                  factor.impact === 'positive' ? 'bg-green-50' :
                  'bg-slate-50'
                }`}
              >
                <div className={`flex-shrink-0 ${
                  factor.impact === 'negative' ? 'text-red-500' :
                  factor.impact === 'positive' ? 'text-green-500' :
                  'text-slate-500'
                }`}>
                  {factor.impact === 'negative' ? (
                    <AlertTriangle size={20} />
                  ) : factor.impact === 'positive' ? (
                    <TrendingUp size={20} />
                  ) : (
                    <AlertCircle size={20} />
                  )}
                </div>
                <div>
                  <div className={`font-medium ${
                    factor.impact === 'negative' ? 'text-red-900' :
                    factor.impact === 'positive' ? 'text-green-900' :
                    'text-slate-900'
                  }`}>
                    {factor.title}
                  </div>
                  <div className={`text-sm mt-1 whitespace-pre-line ${
                    factor.impact === 'negative' ? 'text-red-700' :
                    factor.impact === 'positive' ? 'text-green-700' :
                    'text-slate-600'
                  }`}>
                    {factor.description}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggested Actions */}
      {insights.suggestions.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Users className="text-blue-500" size={20} />
            Suggested Actions
          </h2>
          <ul className="space-y-2">
            {insights.suggestions.map((suggestion, index) => (
              <li key={index} className="flex items-start gap-2 text-slate-700">
                <span className="text-blue-500 mt-1">•</span>
                {suggestion}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Step Progress - Detailed Breakdown */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Step Breakdown</h2>

        {steps.length === 0 ? (
          <p className="text-slate-500 text-center py-8">
            No steps scheduled yet. Schedule this order to track progress.
          </p>
        ) : (
          <div className="space-y-3">
            {steps.map((step) => (
              <div key={step.stepId} className="border border-slate-100 rounded-lg overflow-hidden">
                {/* Step Header - Clickable */}
                <button
                  onClick={() => toggleStep(step.stepId)}
                  className="w-full p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="text-slate-400">
                    {expandedSteps.has(step.stepId) ? (
                      <ChevronDown size={20} />
                    ) : (
                      <ChevronRight size={20} />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-slate-900">
                        Step {step.sequence}: {step.stepName}
                      </span>
                      {step.isBottleneck && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                          Bottleneck
                        </span>
                      )}
                    </div>

                    {/* Progress Bar */}
                    <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          step.progressPercent >= 100 ? 'bg-green-500' :
                          step.isBottleneck ? 'bg-red-500' :
                          step.efficiency && step.efficiency >= 100 ? 'bg-green-500' :
                          'bg-blue-500'
                        }`}
                        style={{ width: `${Math.min(step.progressPercent, 100)}%` }}
                      />
                      <span className={`absolute inset-0 flex items-center justify-center text-xs font-semibold ${
                        step.progressPercent > 50 ? 'text-white' : 'text-slate-600'
                      }`}>
                        {step.progressPercent}%
                      </span>
                    </div>
                  </div>

                  {/* Efficiency Badge */}
                  <div className="text-right">
                    {step.efficiency !== null ? (
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-sm font-medium ${
                        step.efficiency >= 100 ? 'bg-green-100 text-green-700' :
                        step.efficiency >= 80 ? 'bg-orange-100 text-orange-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {step.efficiency >= 100 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        {step.efficiency}% eff
                      </span>
                    ) : (
                      <span className="text-sm text-slate-400">-- eff</span>
                    )}
                  </div>
                </button>

                {/* Expanded Worker Details */}
                {expandedSteps.has(step.stepId) && (
                  <div className="px-4 pb-4 border-t border-slate-100 bg-slate-50">
                    <div className="pt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                      <div>
                        <span className="text-slate-500">Completed:</span>{' '}
                        <span className="font-medium">{step.completedUnits}/{step.totalUnits}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Hours worked:</span>{' '}
                        <span className="font-medium">{step.hoursWorked.toFixed(1)}h</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Hours remaining:</span>{' '}
                        <span className="font-medium">{step.hoursRemaining.toFixed(1)}h</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Avg time/piece:</span>{' '}
                        <span className="font-medium">
                          {step.actualSecondsPerPiece ? `${step.actualSecondsPerPiece}s` : '--'}
                          <span className="text-slate-400"> (target: {step.expectedSecondsPerPiece}s)</span>
                        </span>
                      </div>
                    </div>

                    {step.workers.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200">
                              <th className="text-left py-2 px-3 font-medium text-slate-600">Worker</th>
                              <th className="text-center py-2 px-3 font-medium text-slate-600">Proficiency</th>
                              <th className="text-right py-2 px-3 font-medium text-slate-600">Units</th>
                              <th className="text-right py-2 px-3 font-medium text-slate-600">Hours</th>
                              <th className="text-right py-2 px-3 font-medium text-slate-600">Efficiency</th>
                            </tr>
                          </thead>
                          <tbody>
                            {step.workers.map((worker) => (
                              <tr key={worker.workerId} className="border-b border-slate-100 hover:bg-white">
                                <td className="py-2 px-3">
                                  <Link
                                    href={`/workers/${worker.workerId}`}
                                    className="font-medium text-blue-600 hover:underline"
                                  >
                                    {worker.workerName}
                                  </Link>
                                </td>
                                <td className="py-2 px-3 text-center">
                                  {worker.proficiencyLevel !== null ? (
                                    <span
                                      className="inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold"
                                      style={{
                                        backgroundColor: LEVEL_COLORS[worker.proficiencyLevel],
                                        color: LEVEL_TEXT_COLORS[worker.proficiencyLevel],
                                      }}
                                    >
                                      {worker.proficiencyLevel}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">--</span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-right">{worker.unitsProduced}</td>
                                <td className="py-2 px-3 text-right">{worker.hoursWorked.toFixed(1)}h</td>
                                <td className="py-2 px-3 text-right">
                                  {worker.efficiency !== null ? (
                                    <span className={`font-medium ${
                                      worker.efficiency >= 100 ? 'text-green-600' :
                                      worker.efficiency >= 80 ? 'text-orange-600' :
                                      'text-red-600'
                                    }`}>
                                      {worker.efficiency}%
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">--</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-slate-500 text-sm">No worker data for this step yet</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
