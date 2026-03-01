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
    Dimensions,
    ActivityIndicator
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { PanResponder, Linking } from "react-native";
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get("window");

const BRANDS = [
    { id: "tapo", name: "TP-Link Tapo", icon: "link-variant" },
    { id: "xiaomi", name: "Xiaomi Mi Home", icon: "shield-home" },
    { id: "ezviz", name: "EZVIZ", icon: "video-check" },
];

export default function Phone({ onBack, onConfirm, initialStep, brand }) {
    const getStepNumber = (step) => {
        if (typeof step === 'number') return step;
        switch (step) {
            case 'intro': return 1;
            case 'login': return 1; // Merged with intro
            case 'live': return 2;
            case 'zone_setup': return 3;
            case 'ready': return 4;
            default: return 1;
        }
    };

    const [currentStep, setCurrentStep] = useState(getStepNumber(initialStep));
    const [selectedBrand, setSelectedBrand] = useState(brand || null);
    const [connected, setConnected] = useState(brand ? true : false); // Assume connected if brand passed from settings
    const [isConnecting, setIsConnecting] = useState(false);

    // Zone States (Step 4)
    const [feedingZone, setFeedingZone] = useState({ x: 0, y: 0, w: 0, h: 0 });
    const [litterZone, setLitterZone] = useState({ x: 0, y: 0, w: 0, h: 0 });
    const [activeZoneType, setActiveZoneType] = useState('feeding'); // 'feeding' | 'litter'
    const [isDrawing, setIsDrawing] = useState(false);
    const startPoint = useRef({ x: 0, y: 0 });

    // Animation values
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(20)).current;
    const successAnim = useRef(new Animated.Value(0)).current;
    const stepAnim = useRef(new Animated.Value(0)).current;

    // Scale animations for each brand
    const brandScales = useRef({
        tapo: new Animated.Value(1),
        xiaomi: new Animated.Value(1),
        ezviz: new Animated.Value(1),
    }).current;

    // Login button reveal animation
    const loginRevealAnim = useRef(new Animated.Value(brand ? 1 : 0)).current;

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

    // Animate login reveal when a brand is selected
    useEffect(() => {
        if (selectedBrand) {
            Animated.spring(loginRevealAnim, {
                toValue: 1,
                tension: 50,
                friction: 7,
                useNativeDriver: true,
            }).start();
        }
    }, [selectedBrand]);

    const handleLogin = async () => {
        setIsConnecting(true);
        // Step 2: Open OEM App logic
        const brandApps = {
            tapo: 'tp-link-tapo://',
            xiaomi: 'mihome://',
            ezviz: 'ezviz://',
        };

        const appUrl = brandApps[selectedBrand];

        // Mocking: Always assume success for now as requested
        console.log("Mocking connection for:", selectedBrand);

        setTimeout(async () => {
            setIsConnecting(false);
            setConnected(true);
            await AsyncStorage.setItem('camera_status', 'connected');
            await AsyncStorage.setItem('camera_brand', selectedBrand);
            setCurrentStep(2); // Move to Step 2: Live Feed

            Animated.sequence([
                Animated.spring(successAnim, {
                    toValue: 1,
                    tension: 50,
                    friction: 7,
                    useNativeDriver: true,
                }),
                Animated.delay(200),
                Animated.spring(successAnim, {
                    toValue: 1.05,
                    useNativeDriver: true,
                }),
                Animated.spring(successAnim, {
                    toValue: 1,
                    friction: 3,
                    useNativeDriver: true,
                })
            ]).start();
        }, 1500);
    };

    const handleSkip = async () => {
        await AsyncStorage.setItem('camera_status', 'disconnected');
        await AsyncStorage.setItem('camera_brand', '');
        await AsyncStorage.setItem('camera_setup_complete', 'true');
        onConfirm();
    };

    const handleNextStep = () => {
        Animated.timing(stepAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
        }).start(() => {
            setCurrentStep(prev => Math.min(prev + 1, 4));
            stepAnim.setValue(0);
        });
    };

    const handlePrevStep = () => {
        if (currentStep === 1) onBack();
        else setCurrentStep(prev => prev - 1);
    };

    const drawPanResponder = PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
            const { locationX, locationY } = evt.nativeEvent;
            startPoint.current = { x: locationX, y: locationY };
            setIsDrawing(true);
            const setZone = activeZoneType === 'feeding' ? setFeedingZone : setLitterZone;
            setZone({ x: locationX, y: locationY, w: 0, h: 0 });
        },
        onPanResponderMove: (evt) => {
            const { locationX, locationY } = evt.nativeEvent;
            const setZone = activeZoneType === 'feeding' ? setFeedingZone : setLitterZone;
            setZone(prev => {
                const newW = locationX - startPoint.current.x;
                const newH = locationY - startPoint.current.y;
                return {
                    x: newW > 0 ? startPoint.current.x : locationX,
                    y: newH > 0 ? startPoint.current.y : locationY,
                    w: Math.abs(newW),
                    h: Math.abs(newH),
                };
            });
        },
        onPanResponderRelease: () => {
            setIsDrawing(false);
        },
    }).panHandlers;

    const animateSelection = (brandId) => {
        // Reset others, scale up selected
        Object.keys(brandScales).forEach(id => {
            Animated.spring(brandScales[id], {
                toValue: id === brandId ? 1.03 : 1,
                useNativeDriver: true,
                friction: 8,
            }).start();
        });
    };

    return (
        <LinearGradient colors={["#F4FAF9", "#E0F2F1"]} style={{ flex: 1 }}>
            <SafeAreaView style={styles.container}>
                {/* Header with Logo */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={handlePrevStep} style={styles.backBtnStyle} activeOpacity={0.85}>
                        <Ionicons name="chevron-back" size={22} color="#1C1C1E" />
                    </TouchableOpacity>

                    <View style={styles.titleContainer}>
                        <Text style={styles.titleLogo}>NEK</Text>
                        <Ionicons name="paw" size={18} color="#4FD1C5" />
                        <Text style={styles.titleLogo}>CARE</Text>
                    </View>

                    <View style={styles.headerIconBtn} />
                </View>

                {/* Step Indicator Below Header */}
                <View style={styles.stepBar}>
                    {[1, 2, 3, 4].map((s) => (
                        <View key={s} style={[styles.stepDot, currentStep >= s && styles.stepDotActive]} />
                    ))}
                </View>

                <Animated.View style={{ flex: 1, opacity: stepAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }}>
                    <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 60, paddingHorizontal: 20 }}>

                        {currentStep === 1 && (
                            <View>
                                <View style={styles.hero}>
                                    <View style={styles.catIconContainer}>
                                        <MaterialCommunityIcons name="cat" size={40} color="#00695C" />
                                    </View>
                                    <Text style={styles.title}>Choose Camera Brand</Text>
                                    <Text style={styles.subtitle}>Select the brand you are currently using</Text>
                                </View>
                                <View style={styles.cardContainer}>
                                    {BRANDS.map((brand) => {
                                        const isSelected = selectedBrand === brand.id;
                                        return (
                                            <Animated.View key={brand.id} style={{ transform: [{ scale: brandScales[brand.id] || 1 }] }}>
                                                <TouchableOpacity
                                                    activeOpacity={0.9}
                                                    onPress={() => {
                                                        setSelectedBrand(brand.id);
                                                        animateSelection(brand.id);
                                                    }}
                                                    style={[styles.brandCard, isSelected && styles.brandCardSelected]}
                                                >
                                                    <View style={styles.brandHeader}>
                                                        <View style={[styles.brandIconBg, isSelected && { backgroundColor: '#E0F2F1' }]}>
                                                            <MaterialCommunityIcons name={brand.icon} size={24} color={isSelected ? "#00695C" : "#90A4AE"} />
                                                        </View>
                                                        <View style={{ flex: 1, marginLeft: 12 }}>
                                                            <Text style={[styles.brandName, isSelected && { color: '#00695C' }]}>{brand.name}</Text>
                                                        </View>
                                                    </View>
                                                </TouchableOpacity>
                                            </Animated.View>
                                        );
                                    })}
                                </View>

                                {/* Animated Login Reveal */}
                                <Animated.View style={{
                                    opacity: loginRevealAnim,
                                    transform: [
                                        {
                                            translateY: loginRevealAnim.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [20, 0]
                                            })
                                        }
                                    ]
                                }}>
                                    {selectedBrand && !isConnecting && (
                                        <View style={{ marginTop: 30 }}>
                                            <Text style={[styles.subtitle, { marginBottom: 12 }]}>
                                                Log in to {BRANDS.find(b => b.id === selectedBrand)?.name} to link your camera feed.
                                            </Text>
                                            <TouchableOpacity style={styles.loginButton} onPress={handleLogin} disabled={isConnecting}>
                                                <LinearGradient colors={["#00BFA5", "#00897B"]} style={styles.gradientBtn}>
                                                    <Text style={styles.loginText}>Connect Account</Text>
                                                </LinearGradient>
                                            </TouchableOpacity>
                                        </View>
                                    )}

                                    {/* Minimal Connecting State */}
                                    {isConnecting && (
                                        <View style={{ marginTop: 40, alignItems: 'center', justifyContent: 'center' }}>
                                            <ActivityIndicator size="large" color="#00897B" />
                                            <Text style={[styles.subtitle, { marginTop: 12, color: '#00695C', fontWeight: '600' }]}>
                                                Connecting to your camera...
                                            </Text>
                                        </View>
                                    )}
                                </Animated.View>

                                {/* Skip button moved outside ScrollView to be fixed at the bottom */}
                            </View>
                        )}

                        {currentStep === 2 && (
                            <View style={{ flex: 1, justifyContent: 'space-between' }}>
                                <View>
                                    <View style={styles.hero}>
                                        <View style={styles.liveBadge}><Text style={styles.liveText}>LIVE STREAM</Text></View>
                                        <Text style={styles.title}>Test Live Feed</Text>
                                        <Text style={styles.subtitle}>Verify the camera feed is working correctly.</Text>
                                    </View>
                                    <View style={styles.previewCard}>
                                        <View style={styles.previewPlaceholder}>
                                            <MaterialCommunityIcons name="cat" size={48} color="rgba(255,255,255,0.2)" />
                                            <Text style={styles.previewText}>Camera Feed Optimized for Cats</Text>
                                        </View>
                                    </View>
                                </View>
                                <TouchableOpacity style={[styles.nextButton, { marginTop: 20 }]} onPress={() => setCurrentStep(3)}>
                                    <LinearGradient colors={["#00897B", "#00695C"]} style={styles.gradientNext}>
                                        <Text style={styles.nextText}>Next: Set Zones</Text>
                                    </LinearGradient>
                                </TouchableOpacity>
                            </View>
                        )}

                        {currentStep === 3 && (
                            <View style={{ flex: 1, justifyContent: 'space-between' }}>
                                <View>
                                    <View style={styles.hero}>
                                        <Text style={styles.title}>Set Detection Zones</Text>
                                        <Text style={styles.subtitle}>1. Choose a label 2. Tap and drag on the screen to draw the zone.</Text>
                                    </View>

                                    <View style={styles.tabContainer}>
                                        <View style={styles.tabWrapper}>
                                            <TouchableOpacity
                                                style={[styles.tabBtn, activeZoneType === 'feeding' && styles.tabActive]}
                                                onPress={() => setActiveZoneType('feeding')}
                                            >
                                                <MaterialCommunityIcons name="food-apple" size={18} color={activeZoneType === 'feeding' ? '#00695C' : '#90A4AE'} />
                                                <Text style={[styles.tabText, activeZoneType === 'feeding' && styles.tabTextActive]}>Feeding</Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                style={[styles.tabBtn, activeZoneType === 'litter' && styles.tabActive]}
                                                onPress={() => setActiveZoneType('litter')}
                                            >
                                                <MaterialCommunityIcons name="delete-outline" size={18} color={activeZoneType === 'litter' ? '#00695C' : '#90A4AE'} />
                                                <Text style={[styles.tabText, activeZoneType === 'litter' && styles.tabTextActive]}>Litter Box</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>

                                    <View style={styles.minimalWorkspace}>
                                        {/* Universal Draw Responder on Background */}
                                        <View style={styles.minimalPreviewBg} {...drawPanResponder}>
                                            {/* Grid Helper (Subtle) */}
                                            <View style={styles.gridOverlay} pointerEvents="none" />

                                            {/* Feeding Zone Display */}
                                            {feedingZone.w > 0 && (
                                                <View style={[styles.zoneFeedingMinimal, { top: feedingZone.y, left: feedingZone.x, width: feedingZone.w, height: feedingZone.h, borderColor: '#26A69A', borderStyle: 'dashed' }]}>
                                                    <View style={[styles.zoneTagMinimal, { backgroundColor: '#26A69A' }]}>
                                                        <MaterialCommunityIcons name="paw" size={10} color="#FFF" style={{ marginRight: 2 }} />
                                                        <Text style={styles.zoneTagText}>Feeding</Text>
                                                    </View>
                                                </View>
                                            )}

                                            {/* Litter Zone Display */}
                                            {litterZone.w > 0 && (
                                                <View style={[styles.zoneLitterMinimal, { top: litterZone.y, left: litterZone.x, width: litterZone.w, height: litterZone.h, borderColor: '#00897B', borderStyle: 'dashed' }]}>
                                                    <View style={[styles.zoneTagMinimal, { backgroundColor: '#00897B' }]}>
                                                        <MaterialCommunityIcons name="paw" size={10} color="#FFF" style={{ marginRight: 2 }} />
                                                        <Text style={styles.zoneTagText}>Litter</Text>
                                                    </View>
                                                </View>
                                            )}

                                            {isDrawing && (
                                                <View style={styles.minimalDrawingBanner}>
                                                    <Text style={styles.minimalDrawingText}>Drawing {activeZoneType} area...</Text>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                </View>

                                <TouchableOpacity style={[styles.nextButton, { marginTop: 20 }]} onPress={handleNextStep}>
                                    <LinearGradient colors={["#00897B", "#00695C"]} style={styles.gradientNext}>
                                        <Text style={styles.nextText}>Next: Complete</Text>
                                    </LinearGradient>
                                </TouchableOpacity>
                            </View>
                        )}

                        {currentStep === 4 && (
                            <View style={{ flex: 1, justifyContent: 'space-between', paddingTop: 20 }}>
                                <View style={{ alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                                    <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
                                        <MaterialCommunityIcons name="check-circle" size={50} color="#4CAF50" />
                                    </View>
                                    <Text style={[styles.title, { fontSize: 28, marginBottom: 10 }]}>Ready to Monitor!</Text>
                                    <Text style={[styles.subtitle, { textAlign: 'center', paddingHorizontal: 20, fontSize: 16 }]}>
                                        Your AI health monitoring system is active and ready to keep an eye on your cat 🐾
                                    </Text>
                                </View>
                                <TouchableOpacity style={[styles.nextButton, { width: '100%' }]} onPress={async () => {
                                    await AsyncStorage.setItem('camera_setup_complete', 'true');
                                    onConfirm();
                                }}>
                                    <LinearGradient colors={["#A5D6A7", "#4CAF50"]} style={styles.gradientNext}>
                                        <Text style={styles.nextText}>Start Monitoring</Text>
                                    </LinearGradient>
                                </TouchableOpacity>
                            </View>
                        )}
                    </ScrollView>
                </Animated.View>

                {/* Fixed Skip Button for Step 1 */}
                {currentStep === 1 && !isConnecting && (
                    <TouchableOpacity style={styles.fixedBottomButton} onPress={handleSkip}>
                        <Text style={styles.skipButtonText}>Skip for now</Text>
                    </TouchableOpacity>
                )}
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
    headerIconBtn: {
        width: 42,
        height: 42,
        justifyContent: 'center',
        alignItems: 'center',
    },
    backBtnStyle: {
        width: 42,
        height: 42,
        borderRadius: 21,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E5E5EA',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 2,
    },
    titleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    titleLogo: {
        fontSize: 20,
        fontWeight: '900',
        color: '#004D40', // Community dark teal
        marginHorizontal: 3,
    },
    stepBar: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
        paddingBottom: 10,
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
    stepIndicatorContainer: {
        flexDirection: 'row',
        gap: 8,
    },
    stepDot: {
        width: 12,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#CFD8DC',
    },
    stepDotActive: {
        backgroundColor: '#00897B',
        width: 24,
    },
    hero: {
        alignItems: 'center',
        marginTop: 20,
        marginBottom: 30,
    },
    // Minimal Zone Styles
    tabContainer: {
        paddingHorizontal: 16,
        marginBottom: 20,
    },
    tabWrapper: {
        flexDirection: 'row',
        backgroundColor: "#FFFFFF",
        borderRadius: 25,
        padding: 4,
        elevation: 2,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
    },
    tabBtn: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 22,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
    },
    tabActive: {
        backgroundColor: "#B2DFDB",
    },
    tabText: {
        fontSize: 14,
        fontWeight: "600",
        color: "#90A4AE",
    },
    tabTextActive: {
        color: "#00695C",
    },
    minimalWorkspace: {
        marginHorizontal: 16,
        borderRadius: 24,
        overflow: 'hidden',
        backgroundColor: '#FFFFFF',
        elevation: 2,
        shadowOpacity: 0.08,
        shadowRadius: 10,
        borderWidth: 1,
        borderColor: '#F0F4F8',
    },
    minimalPreviewBg: {
        height: 320,
        backgroundColor: '#F5FBFB', // Very light teal
        position: 'relative',
    },
    gridOverlay: {
        ...StyleSheet.absoluteFillObject,
        opacity: 0.05,
        borderWidth: 1,
        borderColor: '#00695C',
        borderStyle: 'dashed',
    },
    zoneFeedingMinimal: {
        position: 'absolute',
        borderWidth: 2,
        backgroundColor: 'rgba(38, 166, 154, 0.1)', // Teal tint
        borderRadius: 12,
    },
    zoneLitterMinimal: {
        position: 'absolute',
        borderWidth: 2,
        backgroundColor: 'rgba(0, 137, 123, 0.1)', // Dark teal tint
        borderRadius: 12,
    },
    zoneTagMinimal: {
        position: 'absolute',
        top: -12,
        left: 12,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        elevation: 2,
        shadowOpacity: 0.2,
        shadowRadius: 2,
        shadowOffset: { width: 0, height: 1 }
    },
    zoneTagText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '800',
    },
    minimalDrawingBanner: {
        position: 'absolute',
        top: 12,
        alignSelf: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        elevation: 3,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    minimalDrawingText: {
        color: '#37474F',
        fontSize: 12,
        fontWeight: '700',
    },
    liveBadge: {
        backgroundColor: '#F44336',
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 12,
        marginBottom: 8,
    },
    liveText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '900',
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
        shadowOpacity: 0.2,
        shadowRadius: 8,
    },
    title: {
        fontSize: 24,
        fontWeight: "800",
        color: "#004D40", // Community deep teal
        textAlign: 'center',
    },
    subtitle: {
        marginTop: 8,
        fontSize: 14,
        color: "#546E7A", // Cool gray
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
        shadowOpacity: 0.3,
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
    skipButton: {
        marginTop: 12,
        paddingVertical: 10,
        alignItems: "center",
    },
    skipButtonText: {
        color: "#90A4AE",
        fontSize: 14,
        fontWeight: "600",
        textDecorationLine: "underline",
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
        marginTop: 10,
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
        marginTop: 20,
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
    fixedBottomButton: {
        position: 'absolute',
        bottom: 40, // Adjust for safe area and visual preference
        left: 20,
        right: 20,
        paddingVertical: 10,
        alignItems: "center",
        zIndex: 10,
    },
});