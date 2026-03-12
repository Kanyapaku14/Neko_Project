import React, { useEffect } from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import Svg, { Circle, Path, Defs, LinearGradient, Stop, G } from "react-native-svg";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  withTiming,
  useAnimatedProps,
  useAnimatedStyle,
  Easing
} from "react-native-reanimated";
import { getHealthStatus } from "../utils/healthLogic";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const SIZE = 190;
const STROKE = 12;
const RADIUS = 64;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const tintHex = (hex, amount = 0) => {
  const raw = String(hex || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return hex;
  const r = Math.max(0, Math.min(255, parseInt(raw.slice(0, 2), 16) + amount));
  const g = Math.max(0, Math.min(255, parseInt(raw.slice(2, 4), 16) + amount));
  const b = Math.max(0, Math.min(255, parseInt(raw.slice(4, 6), 16) + amount));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
};

export default function CatHealthMeter({
  score = null,
  centerImageUri = null,
  centerMode = "dashboard",
  size = null,
  statusText = null,
  statusColor = null,
}) {
  // null/undefined score means no data yet – ring should show as neutral gray at zero
  const hasData = score !== null && score !== undefined;
  const safeScore = hasData ? Math.max(0, Math.min(100, Number(score) || 0)) : 0;
  const actualSize = size || (centerMode === "profile" ? 190 : 250);
  const scale = actualSize / 190;
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(safeScore / 100, {
      duration: 1500,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  }, [safeScore]);

  const animatedProps = useAnimatedProps(() => {
    const dashoffset = CIRCUMFERENCE * (1 - progress.value);
    return {
      strokeDashoffset: dashoffset,
    };
  });

  const pawOrbitStyle = useAnimatedStyle(() => {
    // We use Math.PI * 2 for full circle, - Math.PI / 2 to start at top (like the progress ring)
    const angle = progress.value * 2 * Math.PI - Math.PI / 2;
    const pawX = SIZE / 2 + RADIUS * Math.cos(angle);
    const pawY = SIZE / 2 + RADIUS * Math.sin(angle);

    return {
      position: "absolute",
      width: 32,
      height: 32,
      left: pawX - 16,
      top: pawY - 16,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 10,
    };
  });

  const health = getHealthStatus(safeScore);
  const resolvedLabel = (statusText ?? (hasData ? health.label : "") ?? "").toString();
  // When there is no data: force gray ring regardless of statusColor prop
  const resolvedColor = hasData ? (statusColor ?? health.color) : "#CBD5E1";
  const normalizedLabel = resolvedLabel.trim().toLowerCase();

  const moodByLabel =
    normalizedLabel === "normal" ? "happy" :
      normalizedLabel === "monitor" ? "normal" :
        normalizedLabel === "warning" ? "meh" :
          normalizedLabel === "critical" ? "sad" :
            null;

  const status = {
    text: resolvedLabel.toUpperCase(),
    color: resolvedColor,
    mood: moodByLabel || (safeScore >= 80 ? "happy" : safeScore >= 60 ? "normal" : safeScore >= 40 ? "meh" : "sad"),
  };
  // neutral gray gradient when no data
  const ringStart = hasData ? tintHex(status.color, 35) : "#E2E8F0";
  const ringEnd = hasData ? tintHex(status.color, -25) : "#CBD5E1";

  return (
    <View style={[styles.card, { width: actualSize, height: actualSize, justifyContent: "center", alignItems: "center" }]}>
      <View style={[styles.wrapper, { transform: [{ scale }] }]}>
        <Svg width={SIZE} height={SIZE}>
          <Defs>
            <LinearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={ringStart} />
              <Stop offset="100%" stopColor={ringEnd} />
            </LinearGradient>
          </Defs>

          {/* WHITE CAT SHAPE SHADOW */}
          <G y="8" x="0">
            {/* Extremely Strong Ear Shadows */}
            <Path d="M 48 50 Q 35 25 42 12 Q 45 8 48 12 Q 65 20 85 28 Z" fill="rgba(0,0,0,0.35)" />
            <Path d="M 142 50 Q 155 25 148 12 Q 146 8 142 12 Q 125 20 105 28 Z" fill="rgba(0,0,0,0.35)" />
            <Circle cx={SIZE / 2} cy={SIZE / 2} r="76" fill="rgba(0,0,0,0.12)" />

            {/* Very Faint Whisker Shadows */}
            <Path d="M 38 85 Q 15 70 -5 82" stroke="rgba(0,0,0,0.05)" strokeWidth="8" strokeLinecap="round" fill="none" />
            <Path d="M 35 105 Q 15 95 -8 102" stroke="rgba(0,0,0,0.05)" strokeWidth="8" strokeLinecap="round" fill="none" />
            <Path d="M 38 125 Q 15 115 -5 120" stroke="rgba(0,0,0,0.05)" strokeWidth="8" strokeLinecap="round" fill="none" />
            <Path d="M 152 85 Q 175 70 195 82" stroke="rgba(0,0,0,0.05)" strokeWidth="8" strokeLinecap="round" fill="none" />
            <Path d="M 155 105 Q 175 95 198 102" stroke="rgba(0,0,0,0.05)" strokeWidth="8" strokeLinecap="round" fill="none" />
            <Path d="M 152 125 Q 175 115 195 120" stroke="rgba(0,0,0,0.05)" strokeWidth="8" strokeLinecap="round" fill="none" />
          </G>

          {/* WHITE CAT SHAPE BASE */}
          <Path d="M 48 50 Q 35 25 42 12 Q 45 8 48 12 Q 65 20 85 28 Z" fill="#FFFFFF" stroke="#F1F5F9" strokeWidth="1" />
          <Path d="M 142 50 Q 155 25 148 12 Q 146 8 142 12 Q 125 20 105 28 Z" fill="#FFFFFF" stroke="#F1F5F9" strokeWidth="1" />

          {/* INNER EAR DETAILS */}
          <Path d="M 52 42 Q 42 22 50 16 Q 60 25 72 32" fill="#FFE4E6" opacity="0.6" />
          <Path d="M 138 42 Q 148 22 140 16 Q 130 25 118 32" fill="#FFE4E6" opacity="0.6" />

          <Path d="M 38 85 Q 15 70 -5 82" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" fill="none" />
          <Path d="M 35 105 Q 15 95 -8 102" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" fill="none" />
          <Path d="M 38 125 Q 15 115 -5 120" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" fill="none" />
          <Path d="M 152 85 Q 175 70 195 82" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" fill="none" />
          <Path d="M 155 105 Q 175 95 198 102" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" fill="none" />
          <Path d="M 152 125 Q 175 115 195 120" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" fill="none" />
          <Circle cx={SIZE / 2} cy={SIZE / 2} r="76" fill="#FFFFFF" />

          {/* PROGRESS RING BACKGROUND (Optional: for empty track) */}
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} stroke="#F1F5F9" fill="none" strokeWidth={STROKE} />

          {/* PROGRESS RING */}
          <AnimatedCircle
            stroke="url(#progressGrad)"
            fill="none"
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            strokeWidth={STROKE}
            strokeDasharray={CIRCUMFERENCE.toString()}
            animatedProps={animatedProps}
            strokeLinecap="round"
            rotation="-90"
            origin={`${SIZE / 2},${SIZE / 2}`}
          />
        </Svg>

        {/* CENTER SURFACE */}
        {centerMode === "profile" ? (
          <View style={styles.profileCenterWrap}>
            {centerImageUri ? (
              <Image source={{ uri: centerImageUri }} style={styles.profileCenterImage} />
            ) : (
              <MaterialCommunityIcons name="cat" size={56} color="#CBD5E1" />
            )}
          </View>
        ) : (
          <View style={styles.dashboardCenter}>
            <MaterialCommunityIcons name="cat" size={44} color={status.color} />
            <Text style={[styles.status, { color: status.color }]}>{status.text}</Text>
          </View>
        )}

        {/* HEART BADGE ON PROGRESS */}
        <Animated.View style={pawOrbitStyle}>
          <View style={[styles.paw, { borderColor: "#DCE6EB" }]}>
            <MaterialCommunityIcons name="heart" size={18} color={status.color} />
          </View>
        </Animated.View>
      </View>

      {/* Note text moved to HealthDashboard.js, so not rendered here to avoid duplicate! */}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "transparent",
    alignItems: "center",
  },
  wrapper: {
    width: SIZE,
    height: SIZE,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  dashboardCenter: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    top: 55,
    width: 120,
    alignSelf: "center",
  },
  profileCenterWrap: {
    position: "absolute",
    top: 38,
    left: 38,
    width: 114,
    height: 114,
    borderRadius: 57,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    overflow: 'hidden',
  },
  profileCenterImage: {
    width: '100%',
    height: '100%',
    resizeMode: "cover",
  },
  status: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: 2,
    marginBottom: 0,
  },
  paw: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    borderWidth: 2,
    borderColor: "#DCE6EB",
    zIndex: 2,
  },
});
