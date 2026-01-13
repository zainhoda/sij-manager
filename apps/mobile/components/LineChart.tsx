import { StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';
import { colors, spacing, typography } from '@/theme';

interface DataPoint {
  x: number;
  y: number;
  label?: string;
}

interface LineChartProps {
  /** Data points to plot */
  data: DataPoint[];
  /** Chart width */
  width?: number;
  /** Chart height */
  height?: number;
  /** Line color */
  color?: string;
  /** Show data point circles */
  showPoints?: boolean;
  /** Show grid lines */
  showGrid?: boolean;
  /** Show X axis labels */
  showXLabels?: boolean;
  /** Show Y axis labels */
  showYLabels?: boolean;
  /** Y axis minimum value (auto if not provided) */
  yMin?: number;
  /** Y axis maximum value (auto if not provided) */
  yMax?: number;
  /** Format Y axis labels */
  formatYLabel?: (value: number) => string;
  /** Container style */
  style?: ViewStyle;
}

export function LineChart({
  data,
  width = 300,
  height = 200,
  color = colors.primary,
  showPoints = true,
  showGrid = true,
  showXLabels = false,
  showYLabels = false,
  yMin,
  yMax,
  formatYLabel = (v) => v.toFixed(1),
  style,
}: LineChartProps) {
  if (data.length === 0) {
    return (
      <View style={[styles.container, { width, height }, style]}>
        <View style={styles.emptyContainer}>
          {/* Empty state handled by parent */}
        </View>
      </View>
    );
  }

  // Calculate padding
  const padding = {
    top: showYLabels ? 20 : 10,
    right: 10,
    bottom: showXLabels ? 30 : 10,
    left: showYLabels ? 40 : 10,
  };

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Calculate Y axis range
  const yValues = data.map((d) => d.y);
  const minY = yMin ?? Math.min(...yValues);
  const maxY = yMax ?? Math.max(...yValues);
  const yRange = maxY - minY || 1; // Avoid division by zero

  // Calculate X axis range
  const xValues = data.map((d) => d.x);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const xRange = maxX - minX || 1;

  // Transform data points to SVG coordinates
  const points = data.map((point) => {
    const x = padding.left + ((point.x - minX) / xRange) * chartWidth;
    const y = padding.top + chartHeight - ((point.y - minY) / yRange) * chartHeight;
    return { x, y, original: point };
  });

  // Create polyline path
  const path = points.map((p) => `${p.x},${p.y}`).join(' ');

  // Generate grid lines (horizontal)
  const gridLines: number[] = [];
  if (showGrid && yRange > 0) {
    const numGridLines = 4;
    for (let i = 0; i <= numGridLines; i++) {
      const value = minY + (yRange / numGridLines) * i;
      gridLines.push(value);
    }
  }

  return (
    <View style={[styles.container, { width, height }, style]}>
      <Svg width={width} height={height}>
        {/* Grid lines */}
        {showGrid &&
          gridLines.map((value, index) => {
            const y = padding.top + chartHeight - ((value - minY) / yRange) * chartHeight;
            return (
              <Line
                key={`grid-${index}`}
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke={colors.gray[200]}
                strokeWidth={1}
                strokeDasharray="2,2"
              />
            );
          })}

        {/* Y axis labels */}
        {showYLabels &&
          gridLines.map((value, index) => {
            const y = padding.top + chartHeight - ((value - minY) / yRange) * chartHeight;
            return (
              <SvgText
                key={`y-label-${index}`}
                x={padding.left - 5}
                y={y + 4}
                fontSize={10}
                fill={colors.textSecondary}
                textAnchor="end"
              >
                {formatYLabel(value)}
              </SvgText>
            );
          })}

        {/* Line */}
        {points.length > 1 && (
          <Polyline
            points={path}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Data points */}
        {showPoints &&
          points.map((point, index) => (
            <Circle
              key={`point-${index}`}
              cx={point.x}
              cy={point.y}
              r={4}
              fill={color}
              stroke={colors.white}
              strokeWidth={2}
            />
          ))}

        {/* X axis labels */}
        {showXLabels &&
          points.map((point, index) => {
            if (index % Math.ceil(points.length / 5) !== 0 && index !== points.length - 1) {
              return null;
            }
            return (
              <SvgText
                key={`x-label-${index}`}
                x={point.x}
                y={height - padding.bottom + 15}
                fontSize={10}
                fill={colors.textSecondary}
                textAnchor="middle"
              >
                {point.original.label || `${point.original.x}`}
              </SvgText>
            );
          })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
  },
});
