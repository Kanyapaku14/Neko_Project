import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, { Line, Circle, Path, Text as SvgText, LinearGradient as SvgGradient, Stop, Defs } from 'react-native-svg';

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
            path += ` C ${controlPointX + (next.x - current.x) / 4} ${current.y}, ${controlPointX - (next.x - current.x) / 4} ${next.y}, ${next.x} ${next.y}`;
        }
        return path;
    };

    const createAreaPath = (dataPoints) => {
        if (dataPoints.length === 0) return '';
        const points = dataPoints.map((value, index) => ({
            x: PADDING_LEFT + index * xStep,
            y: PADDING_TOP + chartHeight - (value / maxValue) * chartHeight
        }));

        let path = `M ${points[0].x} ${points[0].y}`;
        for (let i = 0; i < points.length - 1; i++) {
            const current = points[i];
            const next = points[i + 1];
            const controlPointX = (current.x + next.x) / 2;
            path += ` C ${controlPointX + (next.x - current.x) / 4} ${current.y}, ${controlPointX - (next.x - current.x) / 4} ${next.y}, ${next.x} ${next.y}`;
        }
        // Close the path to form an area
        path += ` L ${points[points.length - 1].x} ${PADDING_TOP + chartHeight}`;
        path += ` L ${points[0].x} ${PADDING_TOP + chartHeight} Z`;
        return path;
    };

    const activityLinePath = createSmoothPath(activity);
    const activityAreaPath = createAreaPath(activity);

    return (
        <View style={styles.container}>
            <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
                <Defs>
                    <SvgGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor="#FF9800" stopOpacity="0.4" />
                        <Stop offset="1" stopColor="#FF9800" stopOpacity="0.0" />
                    </SvgGradient>
                    <SvgGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                        <Stop offset="0" stopColor="#FF6D00" />
                        <Stop offset="1" stopColor="#FFAB40" />
                    </SvgGradient>
                </Defs>

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
                            stroke="rgba(255, 255, 255, 0.1)"
                            strokeWidth="1"
                            strokeDasharray="4,4"
                        />
                    );
                })}

                {/* Area Fill */}
                <Path d={activityAreaPath} fill="url(#areaGradient)" />

                {/* Activity line (Orange Vivid) */}
                <Path
                    d={activityLinePath}
                    stroke="url(#lineGradient)"
                    strokeWidth="4"
                    fill="none"
                    strokeLinecap="round"
                />

                {/* Data points and labels */}
                {activity.map((value, index) => {
                    const x = PADDING_LEFT + index * xStep;
                    const y = PADDING_TOP + chartHeight - (value / maxValue) * chartHeight;

                    // Paw proportions
                    const pr = 3.5; // pad radius
                    const tr = 1.8; // toe radius

                    return (
                        <React.Fragment key={`point-group-${index}`}>
                            {/* Paw Print SVG Shape */}
                            <Circle cx={x} cy={y + 1} r={pr} fill="#FF6D00" />
                            <Circle cx={x - 3.5} cy={y - 2.5} r={tr} fill="#FF6D00" />
                            <Circle cx={x - 1} cy={y - 4.5} r={tr} fill="#FF6D00" />
                            <Circle cx={x + 1} cy={y - 4.5} r={tr} fill="#FF6D00" />
                            <Circle cx={x + 3.5} cy={y - 2.5} r={tr} fill="#FF6D00" />

                            {/* Inner Highlight for Paw */}
                            <Circle cx={x} cy={y + 1} r={pr * 0.6} fill="#FFB74D" />

                            <SvgText
                                x={x}
                                y={y - 12}
                                fontSize="12"
                                fill="#FF6D00"
                                textAnchor="middle"
                                fontWeight="900"
                                stroke="#FFFFFF"
                                strokeWidth="0.5"
                            >
                                {value}
                            </SvgText>
                        </React.Fragment>
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
                            fontSize="11"
                            fill="#FF6D00"
                            textAnchor="middle"
                            fontWeight="800"
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
