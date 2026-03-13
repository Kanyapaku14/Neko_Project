import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

const { width } = Dimensions.get("window");

export default function MainTabNavigator({ session, onNavigate, onBack }) {
    return (
        <View style={styles.container}>
            {/* 🔴 Background Decorative Blobs */}
            <View style={styles.blobTopRight} />
            <View style={styles.blobBottomLeft} />

            {/* ⬅️ Back Button */}
            <TouchableOpacity onPress={onBack} style={styles.backButton}>
                <Ionicons name="arrow-back" size={24} color="#37474F" />
            </TouchableOpacity>

            <View style={styles.content}>
                {/* 🏷️ Header Text */}
                <Text style={styles.subHeader}>COMMUNITY</Text>
                <Text style={styles.header}>Explore the{"\n"}World of Cats</Text>

                {/* 🃏 Cards Grid */}
                <View style={styles.cardsContainer}>
                    {/* 🟢 Community Card */}
                    <TouchableOpacity
                        style={[styles.card, styles.shadow]}
                        onPress={() => onNavigate("Community")}
                        activeOpacity={0.9}
                    >
                        <LinearGradient
                            colors={["#E0F2F1", "#B2DFDB"]} // Light Teal Gradient
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.cardGradient}
                        >
                            <View style={styles.cardContentTop}>
                                <View style={styles.iconContainer}>
                                    <Ionicons name="chatbubble-ellipses" size={28} color="#00695C" />
                                </View>
                            </View>

                            <View style={styles.cardContentBottom}>
                                <Text style={styles.cardTitle}>Community</Text>
                                <Text style={styles.cardSubtitle}>Join the Talk</Text>

                                <View style={styles.actionButton}>
                                    <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                                </View>
                            </View>
                        </LinearGradient>
                    </TouchableOpacity>

                    {/* 🟠 Ranking Card */}
                    <TouchableOpacity
                        style={[styles.card, styles.shadow]}
                        onPress={() => onNavigate("Ranking")}
                        activeOpacity={0.9}
                    >
                        <LinearGradient
                            colors={["#FFF3E0", "#FFE0B2"]} // Light Orange Gradient
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.cardGradient}
                        >
                            <View style={styles.cardContentTop}>
                                <View style={styles.iconContainer}>
                                    <Ionicons name="trophy" size={28} color="#E65100" />
                                </View>
                            </View>

                            <View style={styles.cardContentBottom}>
                                <Text style={[styles.cardTitle, { color: "#E65100" }]}>Ranking</Text>
                                <Text style={[styles.cardSubtitle, { color: "#FF8A65" }]}>Top Cats</Text>

                                <View style={[styles.actionButton, { backgroundColor: "#FFB74D" }]}>
                                    <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                                </View>
                            </View>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>

                {/* 💬 Quote Section */}
                <View style={styles.quoteContainer}>
                    <Text style={styles.quoteIcon}>“</Text>
                    <Text style={styles.quoteText}>"Time spent with cats is never wasted."</Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#FFFFFF", // Clean White Background
        paddingTop: Platform.OS === 'ios' ? 70 : 50, // Reduced from 80/60 to ground it
        paddingHorizontal: 24,
    },

    // 🔴 Background Blobs - Adjusted to be more subtle
    blobTopRight: {
        position: "absolute",
        top: -100, // Pulled in slightly
        right: -100,
        width: 350,
        height: 350,
        borderRadius: 175,
        backgroundColor: "#E0F7FA", // Very Light Cyan
        opacity: 0.5, // Slightly more transparent
    },
    blobBottomLeft: {
        position: "absolute",
        bottom: -80,
        left: -80,
        width: 300,
        height: 300,
        borderRadius: 150,
        backgroundColor: "#FFEBEE", // Very Light Pink
        opacity: 0.4,
    },

    // ⬅️ Back Button
    backButton: {
        width: 44,
        height: 44,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#FFFFFF",
        borderRadius: 22, // Full circle
        marginBottom: 32, // Reduced margin
        // Soft Shadow
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 3,
    },

    content: {
        flex: 1,
        justifyContent: "center", // Center everything vertically
    },

    // 🏷️ Header
    subHeader: {
        fontSize: 12,
        fontFamily: "Inter-Bold",
        color: "#B0BEC5", // Lighter gray
        letterSpacing: 2,
        marginBottom: 8, // Tighter spacing
        textTransform: "uppercase",
    },
    header: {
        fontSize: 32, // Slightly sharper
        fontFamily: "Inter-Bold",
        color: "#00695C", // Updated to specific teal color
        marginBottom: 32, // Reduced gap
        lineHeight: 40,
    },

    // 🃏 Cards
    cardsContainer: {
        flexDirection: "row",
        gap: 16, // Space between cards
        marginBottom: 32, // Reduced bottom margin
    },
    card: {
        flex: 1,
        height: 200, // Reduced height for better aspect ratio (less tall/floating)
        borderRadius: 24, // More rounded corners
        overflow: "hidden", // Contain gradient
    },
    shadow: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 }, // Tighter shadow
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 4,
    },
    cardGradient: {
        flex: 1,
        padding: 20, // Standard padding
    },

    // Card Layout
    cardContentTop: {
        alignItems: "flex-start",
    },
    cardContentBottom: {
        flex: 1, // Take up remaining space
        justifyContent: 'center', // Center vertically
        marginTop: 0,
        marginBottom: 20, // Offset for visual balance with icon
    },

    // Icons
    iconContainer: {
        width: 48, // Standard icon size
        height: 48,
        backgroundColor: "#FFFFFF",
        borderRadius: 16,
        justifyContent: "center",
        alignItems: "center",
        // Subtle shadow
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },

    // Typography
    cardTitle: {
        fontSize: 17, // Adjusted for balance
        fontFamily: "Inter-Bold",
        color: "#004D40",
        marginBottom: 4,
    },
    cardSubtitle: {
        fontSize: 13,
        fontFamily: "Inter-Medium",
        color: "#546E7A",
        opacity: 0.9,
    },

    // Action Button (Absolute Positioned)
    actionButton: {
        position: "absolute",
        bottom: -8, // Push to actual corner
        right: -8,
        width: 32, // Slightly smaller button
        height: 32,
        borderRadius: 16, // Full circle
        backgroundColor: "#4DB6AC", // Teal
        justifyContent: "center",
        alignItems: "center",
    },

    // 💬 Quote
    quoteContainer: {
        alignItems: "center",
        marginTop: 48, // Fixed margin instead of 'auto' to ensure proper centering
        marginBottom: 0,
        opacity: 0.7, // More visible
    },
    quoteIcon: {
        fontSize: 36, // Smaller quote mark
        color: "#CFD8DC",
        fontFamily: "serif",
        marginBottom: -4,
    },
    quoteText: {
        fontSize: 13,
        fontFamily: "Inter-Medium",
        color: "#90A4AE",
        textAlign: "center",
    },
});
