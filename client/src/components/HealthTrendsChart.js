import React, { useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions, TouchableWithoutFeedback } from 'react-native';
import Svg, { Line, Circle, Path, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';

const CHART_HEIGHT = 208;
const PADDING = 24;

export default function HealthTrendsChart({ data, selectedSeries, onSelectSeries }) {
  const { width: windowWidth } = useWindowDimensions();
  const chartOuterWidth = Math.max(280, windowWidth - 52);

  if (!data || data.labels.length === 0) {
    return (
      <View style={styles.noDataContainer}>
        <Text style={styles.noDataText}>No data</Text>
      </View>
    );
  }

  const { labels, foodData, waterData } = data;

  const visibleFood = foodData;
  const visibleWater = waterData;
  const maxFood = visibleFood.length ? Math.max(...visibleFood, 1) : 1;
  const maxWater = visibleWater.length ? Math.max(...visibleWater, 1) : 1;
  const maxValue = Math.max(maxFood, maxWater, 1);

  const chartWidth = chartOuterWidth - PADDING * 2;
  const chartHeight = CHART_HEIGHT - PADDING * 2;
  const xStep = chartWidth / (labels.length - 1 || 1);
  const maxLabelCount = Math.max(4, Math.floor(chartWidth / 50));
  const labelStep = Math.max(1, Math.ceil(labels.length / maxLabelCount));

  const createSmoothPath = (dataPoints) => {
    if (dataPoints.length === 0) return '';
    const points = dataPoints.map((value, index) => ({
      x: PADDING + index * xStep,
      y: PADDING + chartHeight - (value / maxValue) * chartHeight,
    }));
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i += 1) {
      const current = points[i];
      const next = points[i + 1];
      const controlPointX = (current.x + next.x) / 2;
      path += ` Q ${controlPointX} ${current.y}, ${controlPointX} ${(current.y + next.y) / 2}`;
      path += ` Q ${controlPointX} ${next.y}, ${next.x} ${next.y}`;
    }
    return path;
  };

  const foodPath = useMemo(() => createSmoothPath(foodData), [foodData, maxValue, xStep, chartHeight]);
  const waterPath = useMemo(() => createSmoothPath(waterData), [waterData, maxValue, xStep, chartHeight]);

  const isBoth = !selectedSeries || selectedSeries === 'both';
  const showFood = isBoth || selectedSeries === 'food';
  const showWater = isBoth || selectedSeries === 'water';
  const foodOpacity = showFood ? 1 : 0.18;
  const waterOpacity = showWater ? 1 : 0.18;
  const foodStrokeWidth = showFood ? 4.6 : 2.4;
  const waterStrokeWidth = showWater ? 4.6 : 2.4;
  const foodAreaOpacity = foodOpacity * 0.22;
  const waterAreaOpacity = waterOpacity * 0.22;

  const handleChartTap = () => {
    if (onSelectSeries) {
      onSelectSeries('both');
    }
  };

  const handleSeriesTap = (series, e) => {
    if (onSelectSeries) {
      onSelectSeries(series);
    }
    if (e) e.stopPropagation();
  };

  return (
    <TouchableWithoutFeedback onPress={handleChartTap}>
      <View style={styles.container}>
        <Svg width={chartOuterWidth} height={CHART_HEIGHT}>
          <Defs>
            <LinearGradient id="foodGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor="rgba(255, 106, 0, 1)" />
              <Stop offset="100%" stopColor="rgba(255, 106, 0, 0.25)" />
            </LinearGradient>
            <LinearGradient id="waterGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor="rgba(0, 122, 255, 1)" />
              <Stop offset="100%" stopColor="rgba(0, 122, 255, 0.25)" />
            </LinearGradient>
          </Defs>

          {[0, 1, 2, 3, 4].map((i) => {
            const y = PADDING + (chartHeight / 4) * i;
            return (
              <Line
                key={`grid-${i}`}
                x1={PADDING}
                y1={y}
                x2={chartOuterWidth - PADDING}
                y2={y}
                stroke="#E2E8F0"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
            );
          })}

          {/* WATER Background Fill & Stroke */}
          <Path
            d={`${waterPath} L ${chartOuterWidth - PADDING} ${CHART_HEIGHT - PADDING} L ${PADDING} ${CHART_HEIGHT - PADDING} Z`}
            fill="url(#waterGrad)"
            opacity={waterAreaOpacity}
            onPress={(e) => handleSeriesTap('water', e)}
          />
          <Path
            d={waterPath}
            stroke="#007AFF"
            fill="none"
            opacity={waterOpacity}
            strokeWidth={waterStrokeWidth}
            onPress={(e) => handleSeriesTap('water', e)}
          />
          <Path
            d={waterPath}
            stroke="rgba(0,0,0,0.001)"
            fill="none"
            strokeWidth={18}
            onPress={(e) => handleSeriesTap('water', e)}
          />

          {/* FOOD Background Fill & Stroke */}
          <Path
            d={`${foodPath} L ${chartOuterWidth - PADDING} ${CHART_HEIGHT - PADDING} L ${PADDING} ${CHART_HEIGHT - PADDING} Z`}
            fill="url(#foodGrad)"
            opacity={foodAreaOpacity}
            onPress={(e) => handleSeriesTap('food', e)}
          />
          <Path
            d={foodPath}
            stroke="#FF6A00"
            fill="none"
            opacity={foodOpacity}
            strokeWidth={foodStrokeWidth}
            onPress={(e) => handleSeriesTap('food', e)}
          />
          <Path
            d={foodPath}
            stroke="rgba(0,0,0,0.001)"
            fill="none"
            strokeWidth={18}
            onPress={(e) => handleSeriesTap('food', e)}
          />

          {/* WATER DATA POINTS */}
          {waterData.map((value, index) => {
            const x = PADDING + index * xStep;
            const y = PADDING + chartHeight - (value / maxValue) * chartHeight;
            return (
              <Circle
                key={`water-dot-${index}`}
                cx={x}
                cy={y}
                r={5}
                fill="#007AFF"
                stroke="#FFFFFF"
                strokeWidth="2"
                opacity={waterOpacity}
                onPress={(e) => handleSeriesTap('water', e)}
              />
            );
          })}

          {/* FOOD DATA POINTS */}
          {foodData.map((value, index) => {
            const x = PADDING + index * xStep;
            const y = PADDING + chartHeight - (value / maxValue) * chartHeight;
            return (
              <Circle
                key={`food-dot-${index}`}
                cx={x}
                cy={y}
                r={5}
                fill="#FF6A00"
                stroke="#FFFFFF"
                strokeWidth="2"
                opacity={foodOpacity}
                onPress={(e) => handleSeriesTap('food', e)}
              />
            );
          })}

          {/* X-AXIS LABELS */}
          {labels.map((label, index) => {
            const shouldShow = index === 0 || index === labels.length - 1 || index % labelStep === 0;
            if (!shouldShow) return null;
            const x = PADDING + index * xStep;
            return (
              <SvgText key={`label-${index}`} x={x} y={CHART_HEIGHT - 5} fontSize="11" fontWeight="600" fill="#94A3B8" textAnchor="middle">
                {label}
              </SvgText>
            );
          })}
        </Svg>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  noDataContainer: {
    height: CHART_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noDataText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '700',
  },
});
