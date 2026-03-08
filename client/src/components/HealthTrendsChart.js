import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableWithoutFeedback } from 'react-native';
import Svg, { Line, Circle, Path, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, { useSharedValue, withTiming, useAnimatedProps, Easing } from 'react-native-reanimated';

const { width } = Dimensions.get('window');
const CHART_WIDTH = width - 80;
const CHART_HEIGHT = 180;
const PADDING = 30;

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function HealthTrendsChart({ data, selectedSeries, onSelectSeries }) {
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

  const chartWidth = CHART_WIDTH - PADDING * 2;
  const chartHeight = CHART_HEIGHT - PADDING * 2;
  const xStep = chartWidth / (labels.length - 1 || 1);

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

  // Reanimated Hooks for opacity fading
  const foodOpacity = useSharedValue(1);
  const waterOpacity = useSharedValue(1);

  useEffect(() => {
    // Treat null, undefined, or 'both' as showing both graphs
    const isBoth = !selectedSeries || selectedSeries === 'both';
    const showFood = isBoth || selectedSeries === 'food';
    const showWater = isBoth || selectedSeries === 'water';

    foodOpacity.value = withTiming(showFood ? 1 : 0.15, { duration: 350, easing: Easing.out(Easing.quad) });
    waterOpacity.value = withTiming(showWater ? 1 : 0.15, { duration: 350, easing: Easing.out(Easing.quad) });
  }, [selectedSeries]);

  const foodProps = useAnimatedProps(() => ({
    opacity: foodOpacity.value,
    strokeWidth: foodOpacity.value > 0.8 ? 4 : 2,
  }));

  const waterProps = useAnimatedProps(() => ({
    opacity: waterOpacity.value,
    strokeWidth: waterOpacity.value > 0.8 ? 4 : 2,
  }));

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
        <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
          <Defs>
            <LinearGradient id="foodGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor="rgba(249, 115, 22, 1)" />
              <Stop offset="100%" stopColor="rgba(249, 115, 22, 0.05)" />
            </LinearGradient>
            <LinearGradient id="waterGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor="rgba(59, 130, 246, 0.9)" />
              <Stop offset="100%" stopColor="rgba(59, 130, 246, 0.05)" />
            </LinearGradient>
          </Defs>

          {[0, 1, 2, 3, 4].map((i) => {
            const y = PADDING + (chartHeight / 4) * i;
            return (
              <Line
                key={`grid-${i}`}
                x1={PADDING}
                y1={y}
                x2={CHART_WIDTH - PADDING}
                y2={y}
                stroke="#E2E8F0"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
            );
          })}

          {/* WATER Background Fill & Stroke */}
          <AnimatedPath
            d={`${waterPath} L ${CHART_WIDTH - PADDING} ${CHART_HEIGHT - PADDING} L ${PADDING} ${CHART_HEIGHT - PADDING} Z`}
            fill="url(#waterGrad)"
            animatedProps={waterProps}
            onPress={(e) => handleSeriesTap('water', e)}
          />
          <AnimatedPath
            d={waterPath}
            stroke="#3B82F6"
            fill="none"
            animatedProps={waterProps}
            onPress={(e) => handleSeriesTap('water', e)}
          />

          {/* FOOD Background Fill & Stroke */}
          <AnimatedPath
            d={`${foodPath} L ${CHART_WIDTH - PADDING} ${CHART_HEIGHT - PADDING} L ${PADDING} ${CHART_HEIGHT - PADDING} Z`}
            fill="url(#foodGrad)"
            animatedProps={foodProps}
            onPress={(e) => handleSeriesTap('food', e)}
          />
          <AnimatedPath
            d={foodPath}
            stroke="#F97316"
            fill="none"
            animatedProps={foodProps}
            onPress={(e) => handleSeriesTap('food', e)}
          />

          {/* WATER DATA POINTS */}
          {waterData.map((value, index) => {
            const x = PADDING + index * xStep;
            const y = PADDING + chartHeight - (value / maxValue) * chartHeight;
            return (
              <AnimatedCircle
                key={`water-dot-${index}`}
                cx={x}
                cy={y}
                r={5}
                fill="#3B82F6"
                stroke="#FFFFFF"
                strokeWidth="2"
                animatedProps={waterProps}
                onPress={(e) => handleSeriesTap('water', e)}
              />
            );
          })}

          {/* FOOD DATA POINTS */}
          {foodData.map((value, index) => {
            const x = PADDING + index * xStep;
            const y = PADDING + chartHeight - (value / maxValue) * chartHeight;
            return (
              <AnimatedCircle
                key={`food-dot-${index}`}
                cx={x}
                cy={y}
                r={5}
                fill="#F97316"
                stroke="#FFFFFF"
                strokeWidth="2"
                animatedProps={foodProps}
                onPress={(e) => handleSeriesTap('food', e)}
              />
            );
          })}

          {/* X-AXIS LABELS */}
          {labels.map((label, index) => {
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
