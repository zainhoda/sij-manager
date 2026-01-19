import React from "react";
import { TrendingUp } from "lucide-react";

interface ProductionDay {
  date: string;
  value: number;
  dayName?: string;
}

interface ProductionChartProps {
  data: ProductionDay[];
  emptyMessage?: string;
}

export default function ProductionChart({ data, emptyMessage = "No production data" }: ProductionChartProps) {
  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>{emptyMessage}</p>
      </div>
    );
  }

  const maxValue = Math.max(...data.map(d => d.value), 1);

  return (
    <div className="flex items-end justify-between gap-3">
      {data.map((day, index) => {
        const height = maxValue > 0 ? (day.value / maxValue) * 100 : 0;
        const isLatest = index === data.length - 1;
        const barHeight = Math.max(height, 4) * 1.4; // Scale to max ~140px

        // Get day name - use provided dayName or compute from date
        let dayLabel = day.dayName;
        if (!dayLabel) {
          const [year, month, dayNum] = day.date.split('-').map(Number);
          const dateObj = new Date(year!, month! - 1, dayNum!);
          dayLabel = dateObj.toLocaleDateString("en-US", { weekday: "short" });
        }

        return (
          <div key={day.date} className="flex-1 flex flex-col items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">
              {day.value.toLocaleString()}
            </span>
            <div
              className={`w-full rounded-t-lg transition-all duration-500 ${
                isLatest ? 'bg-blue-500' : 'bg-slate-200 hover:bg-slate-300'
              }`}
              style={{ height: barHeight }}
            />
            <span className={`text-xs font-medium ${isLatest ? 'text-blue-600' : 'text-slate-500'}`}>
              {dayLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
}
