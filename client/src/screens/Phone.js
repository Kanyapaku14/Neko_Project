import React, { useState, useRef, useEffect } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    SafeAreaView,
    ScrollView,
    Animated,
    Easing,
    Dimensions
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";

const { width } = Dimensions.get("window");

const BRANDS = [
    { id: "tapo", name: "TP-Link Tapo", icon: "link-variant" },
    { id: "xiaomi", name: "Xiaomi Mi Home", icon: "shield-home" },
    { id: "ezviz", name: "EZVIZ", icon: "video-check" },
];

export default function Phone({ onBack, onConfirm }) {
    const [selectedBrand, setSelectedBrand] = useState(null);
    const [connected, setConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);

    // Animation values
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(20)).current;
    const successAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 800,
                useNativeDriver: true,
            }),
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 800,
                useNativeDriver: true,
            })
        ]).start();
    }, []);

    const handleLogin = () => {
        setIsConnecting(true);
        // mock login animation
        setTimeout(() => {
            setIsConnecting(false);
            setConnected(true);
            Animated.spring(successAnim, {
                toValue: 1,
                tension: 50,
                friction: 7,
                useNativeDriver: true,
            }).start();
        }, 1500);
    };

    return (
        <LinearGradient colors={["#F4FAF9", "#E0F2F1"]} style={{ flex: 1 }}>
            <SafeAreaView style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={onBack} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={24} color="#00695C" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Connect Camera</Text>
                    <View style={{ width: 44 }} />
                </View>

                <ScrollView contentContainerStyle={{ paddingBottom: 60, paddingHorizontal: 20 }}>
                    {/* 🐾 HERO */}
                    <Animated.View style={[styles.hero, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                        <View style={styles.catIconContainer}>
                            <MaterialCommunityIcons name="cat" size={40} color="#00695C" />
                        </View>
                        <Text style={styles.title}>Neko Mint Setup</Text>
                        <Text style={styles.subtitle}>
                            Select your camera brand to start AI monitoring
                        </Text>
                    </Animated.View>

                    {/* 🟠 BRAND CARDS */}
                    <View style={styles.cardContainer}>
                        {BRANDS.map((brand) => {
                            const isSelected = selectedBrand === brand.id;

                            return (
                                <TouchableOpacity
                                    key={brand.id}
                                    activeOpacity={0.9}
                                    onPress={() => {
                                        setSelectedBrand(brand.id);
                                        setConnected(false);
                                        successAnim.setValue(0);
                                    }}
                                    style={[
                                        styles.brandCard,
                                        isSelected && styles.brandCardSelected,
                                    ]}
                                >
                                    <View style={styles.brandHeader}>
                                        <View style={[styles.brandIconBg, isSelected && { backgroundColor: '#E0F2F1' }]}>
                                            <MaterialCommunityIcons
                                                name={brand.icon}
                                                size={24}
                                                color={isSelected ? "#00695C" : "#90A4AE"}
                                            />
                                        </View>
                                        <View style={{ flex: 1, marginLeft: 12 }}>
                                            <Text style={[styles.brandName, isSelected && { color: '#00695C' }]}>
                                                {brand.name}
                                            </Text>
                                            <Text style={styles.cloudText}>Official Cloud Integration</Text>
                                        </View>
                                        {isSelected && (
                                            <Ionicons name="checkmark-circle" size={24} color="#00695C" />
                                        )}
                                    </View>

                                    {isSelected && !connected && (
                                        <TouchableOpacity
                                            style={styles.loginButton}
                                            onPress={handleLogin}
                                            disabled={isConnecting}
                                        >
                                            <LinearGradient
                                                colors={isConnecting ? ["#B0BEC5", "#90A4AE"] : ["#00897B", "#00695C"]}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 1 }}
                                                style={styles.gradientBtn}
                                            >
                                                <Text style={styles.loginText}>
                                                    {isConnecting ? "Connecting..." : `Login via ${brand.name}`}
                                                </Text>
                                            </LinearGradient>
                                        </TouchableOpacity>
                                    )}

                                    {isSelected && connected && (
                                        <Animated.View
                                            style={[
                                                styles.connectedBox,
                                                {
                                                    opacity: successAnim,
                                                    transform: [{
                                                        scale: successAnim.interpolate({
                                                            inputRange: [0, 1],
                                                            outputRange: [0.8, 1]
                                                        })
                                                    }]
                                                }
                                            ]}
                                        >
                                            <MaterialCommunityIcons name="check-decagram" size={20} color="#2E7D32" style={{ marginRight: 8 }} />
                                            <Text style={styles.connectedText}>
                                                Connected Successfully!
                                            </Text>
                                        </Animated.View>
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* 🎥 LIVE PREVIEW MOCK */}
                    {connected && (
                        <Animated.View
                            style={[
                                styles.previewCard,
                                {
                                    opacity: successAnim,
                                    transform: [{
                                        translateY: successAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [20, 0]
                                        })
                                    }]
                                }
                            ]}
                        >
                            <View style={styles.previewPlaceholder}>
                                <MaterialCommunityIcons name="camera-iris" size={48} color="rgba(255,255,255,0.2)" />
                                <Text style={styles.previewText}>Camera Feed Optimized for Cats</Text>
                            </View>
                            <View style={styles.previewBadge}>
                                <View style={styles.greenDot} />
                                <Text style={styles.previewBadgeText}>LIVE • AI ACTIVE</Text>
                            </View>
                        </Animated.View>
                    )}

                    {/* NEXT BUTTON */}
                    {connected && (
                        <TouchableOpacity style={styles.nextButton} onPress={onConfirm}>
                            <LinearGradient
                                colors={["#00897B", "#00695C"]}
                                style={styles.gradientNext}
                            >
                                <Text style={styles.nextText}>Complete Setup</Text>
                                <Ionicons name="arrow-forward" size={20} color="#FFF" style={{ marginLeft: 8 }} />
                            </LinearGradient>
                        </TouchableOpacity>
                    )}
                </ScrollView>
            </SafeAreaView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    backButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#FFF',
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#00695C',
    },
    hero: {
        alignItems: 'center',
        marginTop: 20,
        marginBottom: 30,
    },
    catIconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#FFF',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
        elevation: 4,
        shadowColor: '#00695C',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
    },
    title: {
        fontSize: 24,
        fontWeight: "800",
        color: "#004D40",
    },
    subtitle: {
        marginTop: 8,
        fontSize: 14,
        color: "#546E7A",
        textAlign: 'center',
        paddingHorizontal: 20,
    },
    cardContainer: {
        gap: 16,
    },
    brandCard: {
        backgroundColor: "#fff",
        borderRadius: 24,
        padding: 20,
        borderWidth: 1.5,
        borderColor: "rgba(0,0,0,0.05)",
        shadowColor: "#000",
        shadowOpacity: 0.03,
        shadowRadius: 10,
        elevation: 2,
    },
    brandCardSelected: {
        borderColor: "#00897B",
        elevation: 4,
        shadowColor: "#00695C",
        shadowOpacity: 0.1,
    },
    brandHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    brandIconBg: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: '#F5F7FA',
        justifyContent: 'center',
        alignItems: 'center',
    },
    brandName: {
        fontSize: 17,
        fontWeight: "700",
        color: "#37474F",
    },
    cloudText: {
        marginTop: 2,
        fontSize: 12,
        color: "#78909C",
    },
    loginButton: {
        marginTop: 20,
    },
    gradientBtn: {
        paddingVertical: 14,
        borderRadius: 16,
        alignItems: "center",
        flexDirection: 'row',
        justifyContent: 'center',
    },
    loginText: {
        color: "#fff",
        fontWeight: "700",
        fontSize: 15,
    },
    connectedBox: {
        marginTop: 20,
        padding: 16,
        borderRadius: 16,
        backgroundColor: "#E8F5E9",
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    connectedText: {
        color: "#1B5E20",
        fontWeight: "700",
        fontSize: 15,
    },
    previewCard: {
        marginTop: 30,
        height: 200,
        borderRadius: 30,
        backgroundColor: "#263238",
        overflow: "hidden",
        position: 'relative',
    },
    previewPlaceholder: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    previewText: {
        color: 'rgba(255,255,255,0.4)',
        marginTop: 12,
        fontSize: 12,
        fontWeight: '500',
    },
    previewBadge: {
        position: 'absolute',
        top: 16,
        left: 16,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "rgba(0,0,0,0.6)",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    greenDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: "#4CAF50",
        marginRight: 8,
    },
    previewBadgeText: {
        fontSize: 10,
        fontWeight: '800',
        color: "#fff",
        letterSpacing: 0.5,
    },
    nextButton: {
        marginTop: 30,
    },
    gradientNext: {
        paddingVertical: 18,
        borderRadius: 20,
        alignItems: "center",
        flexDirection: 'row',
        justifyContent: 'center',
    },
    nextText: {
        color: "#fff",
        fontSize: 18,
        fontWeight: "800",
    },
});