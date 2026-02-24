import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, ScrollView, SafeAreaView, ActivityIndicator, TextInput, Alert, Dimensions, Modal, Pressable } from 'react-native';
import { Ionicons, Feather, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import supabase from './config/supabaseClient';
import { StatusBar } from 'expo-status-bar';

const { width } = Dimensions.get('window');

// Steps enum
const STEPS = {
    CONNECT: 'connect',
    TEST_CONNECTION: 'test_connection',
    ZONE_INTRO: 'zone_intro',
    ZONE_SETUP: 'zone_setup',
    ASSIGN: 'assign',
    SUCCESS: 'success',
};

const CAMERA_BRANDS_DATA = [
    'TP-Link Tapo C200',
    'Reolink E1 Pro',
    'Hikvision DS-2CD',
    'Neko Cam Gen 1',
    'Other (Type manually)'
];

export default function Phone({ session, onBack, onConfirm, initialStep }) {
    const [currentStep, setCurrentStep] = useState(initialStep || STEPS.CONNECT);
    const [loading, setLoading] = useState(false);
    const [cats, setCats] = useState([]);

    // Step Data
    const [cameraBrand, setCameraBrand] = useState('TP-Link Tapo C200');
    const [isPickerVisible, setIsPickerVisible] = useState(false);

    const showCameraPicker = () => {
        setIsPickerVisible(true);
    };

    const handleSelectBrand = (brand) => {
        setCameraBrand(brand);
        setIsPickerVisible(false);
    };
    const [webhookUrl, setWebhookUrl] = useState('https://ap/70ac-222-123-456-789.ngrok-free.app');
    const [cameraType, setCameraType] = useState('single'); // 'single' or 'multi'
    const [selectedCats, setSelectedCats] = useState([]);

    useEffect(() => {
        if (session) {
            fetchCats();
        }
    }, [session]);

    const fetchCats = async () => {
        try {
            const { data, error } = await supabase
                .from('cats')
                .select('*')
                .eq('owner_id', session.user.id);

            if (error) throw error;
            setCats(data || []);
        } catch (error) {
            console.error('Error fetching cats:', error.message);
        }
    };

    const handleNext = () => {
        switch (currentStep) {
            case STEPS.CONNECT: setCurrentStep(STEPS.TEST_CONNECTION); break;
            case STEPS.TEST_CONNECTION: setCurrentStep(STEPS.ZONE_SETUP); break;
            case STEPS.ZONE_SETUP: setCurrentStep(STEPS.ASSIGN); break;
            case STEPS.ASSIGN:
                // Save logic here if needed, for now just move to success
                if (selectedCats.length === 0) {
                    Alert.alert('Selection Required', 'Please select at least one cat.');
                    return;
                }
                setCurrentStep(STEPS.SUCCESS);
                break;
            case STEPS.SUCCESS:
                if (onConfirm) onConfirm(); // Navigate away
                break;
        }
    };

    const renderPickerModal = () => (
        <Modal
            visible={isPickerVisible}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setIsPickerVisible(false)}
        >
            <Pressable
                style={styles.modalOverlay}
                onPress={() => setIsPickerVisible(false)}
            >
                <View style={styles.pickerContent}>
                    <ScrollView bounces={false}>
                        {CAMERA_BRANDS_DATA.map((brand, index) => (
                            <TouchableOpacity
                                key={index}
                                style={styles.pickerItem}
                                onPress={() => handleSelectBrand(brand)}
                            >
                                <Text style={styles.pickerItemText}>{brand}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            </Pressable>
        </Modal>
    );

    const handleBackStep = () => {
        switch (currentStep) {
            case STEPS.CONNECT: if (onBack) onBack(); break;
            case STEPS.TEST_CONNECTION: setCurrentStep(STEPS.CONNECT); break;
            case STEPS.ZONE_SETUP: setCurrentStep(STEPS.TEST_CONNECTION); break;
            case STEPS.ASSIGN: setCurrentStep(STEPS.ZONE_SETUP); break;
            case STEPS.SUCCESS: setCurrentStep(STEPS.ASSIGN); break; // Or go home
        }
    };

    // --- Render Functions for Each Step ---

    const height = Dimensions.get('window').height;

    // Responsive helper
    const rs = (size) => (size / 375) * width; // based on iPhone design width

    const renderHeader = (title) => (
        <View style={styles.header}>
            <TouchableOpacity onPress={handleBackStep} style={styles.backButton}>
                <Ionicons name="chevron-back" size={24} color="#2F6A62" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{title}</Text>
            <View style={{ width: 40 }} />
        </View>
    );


    const renderConnect = () => (
        <View style={styles.stepContainer}>
            {renderHeader('Connect Camera')}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                <Text style={styles.sectionTitle}>Select your camera brand</Text>
                <TouchableOpacity style={styles.inputContainer} onPress={showCameraPicker}>
                    <TextInput
                        style={styles.input}
                        value={cameraBrand}
                        editable={false}
                        pointerEvents="none"
                    />
                    <Feather name="chevron-down" size={20} color="#666" style={styles.inputIcon} />
                </TouchableOpacity>

                <View style={[styles.heroImageContainer, { width: width * 0.9, height: width * 0.4 }]}>
                    <Image
                        source={require('../../assets/cover-blog-3.jpg')}
                        style={[styles.heroImage, { borderRadius: 1 }]}
                        resizeMode="cover"
                    />
                </View>

                <Text style={styles.sectionTitle}>Webhook Configuration</Text>
                <Text style={styles.description}>Copy this URL to stream events from your camera to the app.</Text>

                <View style={[styles.inputContainer, { backgroundColor: '#E0F2F1' }]}>
                    <Text numberOfLines={1} style={styles.webhookUrl}>{webhookUrl}</Text>
                    <View>
                        <Feather name="link" size={20} color="#2F6A62" />
                    </View>
                </View>

                <View style={styles.howToContainer}>
                    <Text style={styles.howToTitle}>HOW TO SET UP</Text>
                    <StepItem number="1" text="Open Camera Settings: Login to your camera's app and find the notification settings." />
                    <StepItem number="2" text="Navigate to Webhook: Look for Network > Event Center > Webhook." />
                    <StepItem number="3" text="Paste & Save: Paste the URL from above into the 'Server URL' field and save your changes." />
                </View>

                <TouchableOpacity style={styles.primaryButton} onPress={handleNext}>
                    <Text style={styles.primaryButtonText}>Next</Text>
                </TouchableOpacity>
                <View style={{ height: 20 }} />
            </ScrollView>
        </View>
    );

    const renderTestConnection = () => (
        <View style={styles.stepContainer}>
            {renderHeader('Test Camera Connection')}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                <View style={{ alignItems: 'center', marginTop: 10 }}>
                    <View style={styles.statusBadge}>
                        <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                        <Text style={styles.statusText}>CONNECTED</Text>
                    </View>

                    <Text style={styles.mainTitle}>Connection successful!</Text>
                    <Text style={styles.subTitle}>Your camera is online and sending data. We can see your cat's area clearly.</Text>
                </View>

                <TouchableOpacity
                    style={styles.videoPlaceholder}
                    onPress={() => onConfirm && onConfirm()}
                    activeOpacity={0.9}
                >
                    <Image source={{ uri: 'https://placekitten.com/400/250' }} style={styles.videoImage} />
                    <View style={styles.liveBadge}>
                        <View style={styles.recordingDot} />
                        <Text style={{ color: '#FFF', fontSize: 12, fontWeight: 'bold' }}>Connected • 1080p</Text>
                    </View>
                </TouchableOpacity>

                <View style={styles.infoRow}>
                    <Feather name="camera" size={20} color="#666" />
                    <Text style={styles.infoText}>Snapshot captured 10s ago</Text>
                </View>

                {/* Duplicated Camera Hardware Card - Moved to bottom */}
                <View style={[styles.hardwareCard, { marginTop: 30 }]}>
                    <Text style={styles.cardTitle}>Camera Hardware Settings</Text>
                    <Text style={styles.hardwareLabel}>Camera brand (API compatible)</Text>
                    <TouchableOpacity style={styles.hardwareInputRow} onPress={showCameraPicker}>
                        <TextInput
                            style={styles.hardwareInput}
                            value={cameraBrand}
                            editable={false}
                            pointerEvents="none"
                        />
                        <Feather name="chevron-down" size={20} color="#666" style={{ marginRight: 8 }} />
                    </TouchableOpacity>

                    <View style={styles.hardwareInfoRow}>
                        <Ionicons name="link-outline" size={14} color="#555" />
                        <Text style={styles.hardwareInfoText}>API profile: Tapo Cloud API</Text>
                    </View>

                    <Text style={styles.hardwareLabel}>Webhook Configuration</Text>
                    <View style={styles.hardwareInputRow}>
                        <Ionicons name="lock-closed-outline" size={16} color="#aaa" style={{ marginRight: 8 }} />
                        <TextInput
                            style={styles.hardwareInput}
                            value={webhookUrl}
                            editable={false}
                        />
                        <TouchableOpacity style={styles.hardwareCopyButton}>
                            <Text style={styles.hardwareCopyText}>COPY</Text>
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity style={styles.hardwareActionButton}>
                        <Text style={styles.hardwareActionButtonText}>Update & Reconnect</Text>
                    </TouchableOpacity>

                    <View style={styles.hardwareInfoRow}>
                        <Ionicons name="information-circle" size={14} color="#555" />
                        <Text style={styles.hardwareInfoText}>Used for receiving camera events and AI detection signals</Text>
                    </View>
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );

    const renderZoneIntro = () => (
        <View style={styles.stepContainer}>
            {renderHeader('')}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                <View style={[styles.zoneIntroImageContainer, { width: width * 0.8, height: width * 0.8 }]}>
                    <Image source={{ uri: 'https://placekitten.com/300/300' }} style={styles.zoneIntroImage} />
                    {/* Overlay boxes mock */}
                    <View style={[styles.zoneBox, { top: '15%', left: '15%', width: '25%', height: '25%', borderColor: '#4CAF50' }]} />
                    <View style={[styles.zoneBox, { top: '50%', right: '20%', width: '30%', height: '20%', borderColor: '#2196F3' }]} />
                </View>

                <Text style={styles.mainTitle}>Smarter Insights with Zones</Text>
                <Text style={styles.subTitle}>Define specific areas like feeding stations or litter boxes to let our AI track your cat's daily habits accurately.</Text>

                <View style={styles.featureList}>
                    <FeatureItem icon="activity" title="Activity Tracking" subtitle="Know exactly when they eat or visit the litter box." />
                    <FeatureItem icon="shield" title="Health Alerts" subtitle="Get notified of unusual frequencies or prolonged visits." />
                    <FeatureItem icon="clock" title="History Logs" subtitle="Review detailed logs of their day." />
                </View>

                <TouchableOpacity style={styles.primaryButton} onPress={handleNext}>
                    <Text style={styles.primaryButtonText}>Choose Setup Image</Text>
                </TouchableOpacity>
                <View style={{ height: 20 }} />
            </ScrollView>
        </View>
    );

    const renderZoneSetup = () => (
        <View style={styles.stepContainer}>
            {renderHeader('Zone Setup')}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                <Text style={[styles.subTitle, { textAlign: 'center' }]}>Tap the 'Add Zone' button towards...</Text>

                <View style={[styles.zoneEditorContainer, { width: width * 0.9, height: (width * 0.9) * 0.75 }]}>
                    <Image source={{ uri: 'https://placekitten.com/400/300' }} style={styles.zoneEditorImage} />
                    {/* Mock Zones */}
                    <View style={[styles.zoneBox, { top: '15%', left: '15%', width: '30%', height: '30%', borderColor: '#00E676' }]}>
                        <Text style={styles.zoneLabel}>FOOD BOWL</Text>
                    </View>
                    <View style={[styles.zoneBox, { bottom: '15%', right: '15%', width: '35%', height: '40%', borderColor: '#d05ce3' }]}>
                        <Text style={[styles.zoneLabel, { backgroundColor: '#d05ce3' }]}>LITTERBOX</Text>
                    </View>
                </View>

                <View style={styles.zoneButtonsRow}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <TouchableOpacity style={styles.zoneButton}><Text style={styles.zoneButtonText}>Food Bowl</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.zoneButton}><Text style={styles.zoneButtonText}>Litterbox</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.zoneButton}><Text style={styles.zoneButtonText}>Bed</Text></TouchableOpacity>
                    </ScrollView>
                </View>

                <TouchableOpacity style={styles.addZoneButton}>
                    <Feather name="plus-square" size={20} color="#FFF" />
                    <Text style={styles.addZoneButtonText}>Add Zone</Text>
                </TouchableOpacity>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 }}>
                    <TouchableOpacity style={styles.secondaryButton}>
                        <Text style={styles.secondaryButtonText}>Test Detection</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.primaryButton, { width: '48%' }]} onPress={handleNext}>
                        <Text style={styles.primaryButtonText}>Confirm</Text>
                    </TouchableOpacity>
                </View>
                <View style={{ height: 20 }} />
            </ScrollView>
        </View>
    );

    const renderAssign = () => (
        <View style={styles.stepContainer}>
            {renderHeader('Assign Camera')}
            <ScrollView style={styles.scrollContent}>
                <Text style={styles.questionText}>Who does this camera watch?</Text>

                {/* Camera Type Selection */}
                <View style={styles.cameraTypeContainer}>
                    <TouchableOpacity
                        style={[styles.cameraTypeOption, cameraType === 'single' && styles.cameraTypeActive]}
                        onPress={() => setCameraType('single')}
                    >
                        <View style={styles.radioContainer}>
                            <View style={[styles.radioOuter, cameraType === 'single' && styles.radioOuterActive]}>
                                {cameraType === 'single' && <View style={styles.radioInner} />}
                            </View>
                        </View>
                        <View>
                            <Text style={styles.optionTitle}>Single cat camera</Text>
                            <Text style={styles.optionSubtitle}>Ideal for private spaces like a bedroom or crate.</Text>
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.cameraTypeOption, cameraType === 'multi' && styles.cameraTypeActive]}
                        onPress={() => setCameraType('multi')}
                    >
                        <View style={styles.radioContainer}>
                            <View style={[styles.radioOuter, cameraType === 'multi' && styles.radioOuterActive]}>
                                {cameraType === 'multi' && <View style={styles.radioInner} />}
                            </View>
                        </View>
                        <View>
                            <Text style={styles.optionTitle}>Multi cat camera</Text>
                            <Text style={styles.optionSubtitle}>Ideal for shared spaces. Aggregates data for the whole family.</Text>
                        </View>
                    </TouchableOpacity>
                </View>

                <Text style={styles.sectionTitle}>Select Cats</Text>
                {cats.map(cat => (
                    <TouchableOpacity
                        key={cat.id}
                        style={[styles.catCard, selectedCats.includes(cat.id) && styles.catCardActive]}
                        onPress={() => {
                            if (selectedCats.includes(cat.id)) {
                                setSelectedCats(selectedCats.filter(id => id !== cat.id));
                            } else {
                                if (cameraType === 'single' && selectedCats.length > 0) {
                                    setSelectedCats([cat.id]); // Switch selection
                                } else {
                                    setSelectedCats([...selectedCats, cat.id]);
                                }
                            }
                        }}
                    >
                        <Image
                            source={{ uri: cat.image_url || 'https://placekitten.com/100/100' }}
                            style={styles.catAvatar}
                        />
                        <View style={styles.catInfo}>
                            <Text style={styles.catName}>{cat.name}</Text>
                            <Text style={styles.catDetails}>{cat.status || 'Active now'}</Text>
                        </View>
                        <View style={[styles.checkbox, selectedCats.includes(cat.id) && styles.checkboxChecked]}>
                            {selectedCats.includes(cat.id) && <Ionicons name="checkmark" size={16} color="#FFF" />}
                        </View>
                    </TouchableOpacity>
                ))}
            </ScrollView>
            <TouchableOpacity style={styles.confirmButton} onPress={handleNext}>
                <Text style={styles.confirmButtonText}>Confirm</Text>
            </TouchableOpacity>
        </View>
    );

    const renderSuccess = () => (
        <View style={styles.successContainer}>
            <View style={styles.successContent}>
                <View style={styles.successIconOuter}>
                    <View style={styles.successIconInner}>
                        <Ionicons name="checkmark" size={60} color="#FFF" />
                    </View>
                </View>

                <Text style={styles.successTitle}>Camera Setup Ready</Text>
                <Text style={styles.successSubtitle}>Everything is connected and tracking correctly.</Text>

                <View style={styles.premiumSuccessCard}>
                    <CheckItem text="Camera Link Online" />
                    <View style={styles.premiumConnectorLine} />
                    <CheckItem text="Activity Zones Active" />
                    <View style={styles.premiumConnectorLine} />
                    <CheckItem text="Cats Identity Sync" />
                </View>

                <TouchableOpacity style={styles.launchButton} onPress={handleNext}>
                    <Text style={styles.launchButtonText}>Go to Camera Overview</Text>
                    <Feather name="arrow-right" size={20} color="#FFF" style={{ marginLeft: 8 }} />
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <LinearGradient colors={['#FFFFFF', '#95e4e4ff']} style={{ flex: 1 }}>
            <SafeAreaView style={styles.container}>
                <StatusBar style="dark" />
                {currentStep === STEPS.CONNECT && renderConnect()}
                {currentStep === STEPS.TEST_CONNECTION && renderTestConnection()}
                {currentStep === STEPS.ZONE_INTRO && renderZoneIntro()}
                {currentStep === STEPS.ZONE_SETUP && renderZoneSetup()}
                {currentStep === STEPS.ASSIGN && renderAssign()}
                {currentStep === STEPS.SUCCESS && renderSuccess()}

                {renderPickerModal()}
            </SafeAreaView>
        </LinearGradient>
    );
}

// Helpers
const FeatureItem = ({ icon, title, subtitle }) => (
    <View style={styles.featureItem}>
        <View style={styles.featureIcon}>
            <Feather name={icon} size={24} color="#0C5A58" />
        </View>
        <View style={{ flex: 1 }}>
            <Text style={styles.featureTitle}>{title}</Text>
            <Text style={styles.featureSubtitle}>{subtitle}</Text>
        </View>
    </View>
);

const StepItem = ({ number, text }) => (
    <View style={styles.stepItem}>
        <View style={styles.stepNumberContainer}>
            <Text style={styles.stepNumber}>{number}</Text>
        </View>
        <Text style={styles.stepText}>{text}</Text>
    </View>
);

const CheckItem = ({ text }) => (
    <View style={styles.checkItem}>
        <Ionicons name="checkmark-circle" size={24} color="#0C5A58" />
        <Text style={styles.checkItemText}>{text}</Text>
    </View>
);

const styles = StyleSheet.create({
    container: {
        flex: 1,
        // Removed background color for gradient
    },
    stepContainer: {
        flex: 1,
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 10,
        marginBottom: 20,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#0C5A58',
    },
    backButton: {
        padding: 5,
        backgroundColor: 'rgba(255,255,255,0.8)',
        borderRadius: 12,
    },
    content: {
        flex: 1,
    },
    // Intro
    heroImageContainer: {
        alignSelf: 'center',
        borderRadius: 32,
        overflow: 'hidden',
        marginBottom: 30,
        backgroundColor: '#FFF',
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
    },
    heroImage: {
        width: '100%',
        height: '100%',
    },
    mainTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#0C5A58',
        textAlign: 'center',
        marginBottom: 10,
    },
    subTitle: {
        fontSize: 14,
        color: '#285855',
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 20,
        paddingHorizontal: 10,
    },
    featureList: {
        marginBottom: 30,
    },
    featureItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.05)',
        borderWidth: 0.5,
        borderColor: '#898989',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
    },
    featureIcon: {
        marginRight: 16,
    },
    featureTitle: {
        fontWeight: 'bold',
        color: '#0C5A58',
        fontSize: 16,
    },
    featureSubtitle: {
        color: '#333',
        fontSize: 12,
        marginTop: 2,
    },
    stepperContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 30,
    },
    stepDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#0C5A58',
        marginHorizontal: 6,
    },
    activeStep: {
        backgroundColor: '#0C5A58',
        width: 20,
    },
    stepLine: {
        width: 30,
        height: 1,
        backgroundColor: '#0C5A58',
        opacity: 0.3,
    },
    // Buttons
    primaryButton: {
        backgroundColor: '#147C78',
        paddingVertical: 18,
        borderRadius: 16,
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 6,
    },
    primaryButtonText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
    secondaryButton: {
        backgroundColor: 'rgba(255,255,255,0.6)',
        paddingVertical: 18,
        borderRadius: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#147C78',
        width: '48%',
    },
    secondaryButtonText: {
        color: '#147C78',
        fontSize: 18,
        fontWeight: 'bold',
    },
    // Steps UI
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#0C5A58',
        marginBottom: 16,
        marginTop: 10,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.8)',
        borderRadius: 16,
        paddingHorizontal: 16,
        height: 56,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#E0F2F1',
    },
    input: {
        flex: 1,
        color: '#333',
        fontSize: 16,
    },
    cameraBanner: {
        height: 120,
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 24,
        backgroundColor: '#FFF',
        elevation: 3,
    },
    cameraBannerImage: {
        width: '100%',
        height: '100%',
    },
    description: {
        color: '#285855',
        marginBottom: 8,
        fontSize: 14,
    },
    webhookUrl: {
        flex: 1,
        color: '#0C5A58',
        fontWeight: '600',
        marginRight: 10,
    },
    howToContainer: {
        backgroundColor: 'rgba(0,0,0,0.03)',
        padding: 20,
        borderRadius: 20,
        marginBottom: 30,
    },
    howToTitle: {
        fontWeight: 'bold',
        color: '#0C5A58',
        marginBottom: 16,
        letterSpacing: 1,
    },
    stepItem: {
        flexDirection: 'row',
        marginBottom: 16,
    },
    stepNumberContainer: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#147C78',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        marginTop: 0,
    },
    stepNumber: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 14,
    },
    stepText: {
        flex: 1,
        color: '#333',
        fontSize: 14,
        lineHeight: 20,
    },
    // Test
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#4CAF50',
        alignSelf: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 24,
        marginBottom: 24,
        elevation: 4,
    },
    statusText: {
        color: '#FFF',
        fontWeight: 'bold',
        marginLeft: 8,
        letterSpacing: 1,
    },
    videoPlaceholder: {
        width: '100%',
        height: 220,
        backgroundColor: '#333',
        borderRadius: 20,
        marginBottom: 16,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
    },
    videoImage: {
        width: '100%',
        height: '100%',
    },
    liveBadge: {
        position: 'absolute',
        top: 16,
        left: 16,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
    },
    recordingDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#FF5252',
        marginRight: 8,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 8,
    },
    infoText: {
        marginLeft: 8,
        color: '#285855',
        fontSize: 14,
    },
    // Zone Setup
    zoneEditorContainer: {
        alignSelf: 'center',
        width: '100%',
        aspectRatio: 1.3,
        borderRadius: 20,
        overflow: 'hidden',
        marginBottom: 24,
        backgroundColor: '#333',
        elevation: 6,
    },
    zoneEditorImage: {
        width: '100%',
        height: '100%',
    },
    zoneBox: {
        position: 'absolute',
        borderWidth: 2,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.1)'
    },
    zoneLabel: {
        backgroundColor: '#4CAF50',
        color: '#FFF',
        fontSize: 10,
        fontWeight: 'bold',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        position: 'absolute',
        top: -10,
    },
    zoneButtonsRow: {
        flexDirection: 'row',
        marginBottom: 16,
    },
    zoneButton: {
        backgroundColor: 'rgba(0,0,0,0.05)',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 20,
        marginRight: 10,
        borderWidth: 1,
        borderColor: '#898989',
    },
    zoneButtonText: {
        color: '#0C5A58',
        fontSize: 14,
        fontWeight: '600',
    },
    addZoneButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(20, 124, 120, 0.1)',
        paddingVertical: 14,
        borderRadius: 16,
        marginBottom: 20,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: '#147C78',
    },
    addZoneButtonText: {
        color: '#147C78',
        fontWeight: 'bold',
        marginLeft: 8,
    },
    // Success
    successContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    successContent: {
        width: '100%',
        alignItems: 'center',
    },
    successIconOuter: {
        width: 140,
        height: 140,
        borderRadius: 70,
        backgroundColor: 'rgba(20, 124, 120, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 30,
    },
    successIconInner: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: '#147C78',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: "#147C78",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 15,
        elevation: 10,
    },
    successTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#0C5A58',
        marginBottom: 12,
        textAlign: 'center',
    },
    successSubtitle: {
        fontSize: 16,
        color: '#285855',
        marginBottom: 40,
        textAlign: 'center',
        lineHeight: 24,
    },
    premiumSuccessCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.4)',
        width: '100%',
        borderRadius: 32,
        padding: 24,
        marginBottom: 40,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.8)',
    },
    checkItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    checkItemText: {
        fontSize: 17,
        color: '#0C5A58',
        marginLeft: 16,
        fontWeight: '600'
    },
    premiumConnectorLine: {
        height: 16,
        width: 2,
        backgroundColor: '#147C78',
        opacity: 0.3,
        marginLeft: 11,
        marginVertical: 4,
    },
    launchButton: {
        backgroundColor: '#0C5A58',
        flexDirection: 'row',
        width: '100%',
        paddingVertical: 20,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
        elevation: 8,
    },
    launchButtonText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
    scrollContent: {
        paddingBottom: 40,
    },
    // Assign Camera specific styles
    questionText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#0C5A58',
        marginBottom: 20,
        marginTop: 10,
    },
    cameraTypeContainer: {
        marginBottom: 30,
    },
    cameraTypeOption: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(20, 124, 120, 0.1)',
        borderRadius: 20,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.3)',
    },
    cameraTypeActive: {
        backgroundColor: '#5F8883', // Matches the green in screenshot
    },
    radioContainer: {
        marginRight: 16,
    },
    radioOuter: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#0C5A58',
        alignItems: 'center',
        justifyContent: 'center',
    },
    radioOuterActive: {
        borderColor: '#FFF',
    },
    radioInner: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#FFF',
    },
    optionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#0C5A58',
    },
    optionSubtitle: {
        fontSize: 12,
        color: '#285855',
        marginTop: 4,
        paddingRight: 40,
    },
    catCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(20, 124, 120, 0.1)',
        borderRadius: 20,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.3)',
    },
    catCardActive: {
        backgroundColor: '#5F8883',
    },
    catAvatar: {
        width: 60,
        height: 60,
        borderRadius: 30,
        marginRight: 16,
        borderWidth: 2,
        borderColor: '#FFF',
    },
    catInfo: {
        flex: 1,
    },
    catName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#0C5A58',
    },
    catDetails: {
        fontSize: 12,
        color: '#285855',
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#0C5A58',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFF',
    },
    checkboxChecked: {
        backgroundColor: '#0C5A58',
        borderColor: '#0C5A58',
    },
    confirmButton: {
        backgroundColor: '#5F8883',
        paddingVertical: 20,
        borderRadius: 30,
        alignItems: 'center',
        marginTop: 10,
        marginBottom: 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 6,
    },
    confirmButtonText: {
        color: '#FFF',
        fontSize: 20,
        fontWeight: 'bold',
    },
    // Duplicated Hardware Card Styles
    hardwareCard: {
        backgroundColor: 'rgba(0, 0, 0, 0.25)',
        borderWidth: 0.5,
        borderColor: '#898989',
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
        overflow: 'hidden',
    },
    cardTitle: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 12,
    },
    hardwareLabel: {
        color: '#333',
        fontSize: 12,
        marginTop: 8,
        marginBottom: 4,
        fontWeight: '600'
    },
    hardwareInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 8,
        paddingHorizontal: 8,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#CFD8DC'
    },
    hardwareInput: {
        flex: 1,
        height: 40,
        color: '#333',
        fontSize: 12,
    },
    hardwareCopyButton: {
        backgroundColor: '#00695C',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    hardwareCopyText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
    },
    hardwareInfoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        marginBottom: 8,
    },
    hardwareInfoText: {
        color: '#555',
        fontSize: 10,
        marginLeft: 6,
    },
    hardwareActionButton: {
        backgroundColor: 'rgba(0,0,0,0.1)',
        paddingVertical: 12,
        borderRadius: 20,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#ddd',
        marginTop: 8,
        marginBottom: 8,
    },
    hardwareActionButtonText: {
        color: '#333',
        fontWeight: '600',
    },
    // Picker Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    pickerContent: {
        width: width * 0.85,
        backgroundColor: '#FFF',
        borderRadius: 4,
        paddingVertical: 8,
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
    },
    pickerItem: {
        paddingVertical: 18,
        paddingHorizontal: 20,
    },
    pickerItemText: {
        fontSize: 16,
        color: '#000',
        fontWeight: '500',
    },
});
