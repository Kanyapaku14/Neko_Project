import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, { Line, Circle, Path, Text as SvgText } from 'react-native-svg';

const { width } = Dimensions.get('window');
const CHART_WIDTH = width - 64; // Matching CameraScreen horizontal padding (16*2) + card padding (16*2)
const CHART_HEIGHT = 140;
const PADDING_TOP = 20;
const PADDING_BOTTOM = 25;
const PADDING_LEFT = 30;
const PADDING_RIGHT = 30;

export default function ActivityLevelChart({ data }) {
    if (!data || !data.activity || data.activity.length === 0) {
        return null;
    }

    const { labels, activity } = data;

    // Calculate scales
    const maxValue = Math.max(...activity, 100); // Normalize to 100 or higher if data exceeds it

    const chartWidth = CHART_WIDTH - PADDING_LEFT - PADDING_RIGHT;
    const chartHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

    const xStep = chartWidth / (labels.length - 1 || 1);

    // Create path strings for smooth curves
    const createSmoothPath = (dataPoints) => {
        if (dataPoints.length === 0) return '';

        const points = dataPoints.map((value, index) => ({
            x: PADDING_LEFT + index * xStep,
            y: PADDING_TOP + chartHeight - (value / maxValue) * chartHeight
        }));

        if (points.length === 1) {
            return `M ${points[0].x} ${points[0].y}`;
        }

        let path = `M ${points[0].x} ${points[0].y}`;

        for (let i = 0; i < points.length - 1; i++) {
            const current = points[i];
            const next = points[i + 1];
            const controlPointX = (current.x + next.x) / 2;

            path += ` Q ${controlPointX} ${current.y}, ${controlPointX} ${(current.y + next.y) / 2}`;
            path += ` Q ${controlPointX} ${next.y}, ${next.x} ${next.y}`;
        }

        return path;
    };

    const activityPath = createSmoothPath(activity);

    return (
        <View style={styles.container}>
            <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
                {/* Grid lines */}
                {[0, 1, 2].map((i) => {
                    const y = PADDING_TOP + (chartHeight / 2) * i;
                    return (
                        <Line
                            key={`grid-${i}`}
                            x1={PADDING_LEFT}
                            y1={y}
                            x2={CHART_WIDTH - PADDING_RIGHT}
                            y2={y}
                            stroke="rgba(255, 255, 255, 0.15)"
                            strokeWidth="1"
                        />
                    );
                })}

                {/* Activity line (Greenish like the bars) */}
                <Path
                    d={activityPath}
                    stroke="#A7F3D0"
                    strokeWidth="3"
                    fill="none"
                />

                {/* Data points */}
                {activity.map((value, index) => {
                    const x = PADDING_LEFT + index * xStep;
                    const y = PADDING_TOP + chartHeight - (value / maxValue) * chartHeight;
                    return (
                        <Circle
                            key={`dot-${index}`}
                            cx={x}
                            cy={y}
                            r="4"
                            fill="#A7F3D0"
                            stroke="rgba(0, 0, 0, 0.3)"
                            strokeWidth="1"
                        />
                    );
                })}

                {/* X-axis labels */}
                {labels.map((label, index) => {
                    const x = PADDING_LEFT + index * xStep;
                    return (
                        <SvgText
                            key={`label-${index}`}
                            x={x}
                            y={CHART_HEIGHT - 5}
                            fontSize="10"
                            fill="rgba(255, 255, 255, 0.6)"
                            textAnchor="middle"
                            fontWeight="bold"
                        >
                            {label}
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
        marginTop: 10,
    },
});
