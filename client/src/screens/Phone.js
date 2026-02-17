import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, ScrollView, SafeAreaView, ActivityIndicator, TextInput, Alert, Dimensions } from 'react-native';
import { Ionicons, Feather, MaterialIcons } from '@expo/vector-icons';
import supabase from './config/supabaseClient';
import { StatusBar } from 'expo-status-bar';

// Steps enum
const STEPS = {
    INTRO: 'intro',
    CONNECT: 'connect',
    TEST_CONNECTION: 'test_connection',
    ZONE_INTRO: 'zone_intro',
    ZONE_SETUP: 'zone_setup',
    ASSIGN: 'assign',
    SUCCESS: 'success',
};

export default function Phone({ session, onBack, onConfirm }) {
    const [currentStep, setCurrentStep] = useState(STEPS.INTRO);
    const [loading, setLoading] = useState(false);
    const [cats, setCats] = useState([]);

    // Step Data
    const [cameraBrand, setCameraBrand] = useState('Xiaomi Home Security 360');
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
            case STEPS.INTRO: setCurrentStep(STEPS.CONNECT); break;
            case STEPS.CONNECT: setCurrentStep(STEPS.TEST_CONNECTION); break;
            case STEPS.TEST_CONNECTION: setCurrentStep(STEPS.ZONE_INTRO); break;
            case STEPS.ZONE_INTRO: setCurrentStep(STEPS.ZONE_SETUP); break;
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

    const handleBackStep = () => {
        switch (currentStep) {
            case STEPS.INTRO: if (onBack) onBack(); break;
            case STEPS.CONNECT: setCurrentStep(STEPS.INTRO); break;
            case STEPS.TEST_CONNECTION: setCurrentStep(STEPS.CONNECT); break;
            case STEPS.ZONE_INTRO: setCurrentStep(STEPS.TEST_CONNECTION); break;
            case STEPS.ZONE_SETUP: setCurrentStep(STEPS.ZONE_INTRO); break;
            case STEPS.ASSIGN: setCurrentStep(STEPS.ZONE_SETUP); break;
            case STEPS.SUCCESS: setCurrentStep(STEPS.ASSIGN); break; // Or go home
        }
    };

    // --- Render Functions for Each Step ---

    const { width, height } = Dimensions.get('window');

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

    const renderIntro = () => (
        <View style={styles.stepContainer}>
            {renderHeader('Camera')}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                <View style={[styles.heroImageContainer, { width: width * 0.7, height: width * 0.7 }]}>
                    {/* Placeholder for Hero Image */}
                    <Image source={{ uri: 'https://placekitten.com/300/300' }} style={styles.heroImage} />
                    <View style={styles.heroOverlay} />
                </View>

                <Text style={styles.mainTitle}>Unlock Behavioral Insights</Text>
                <Text style={styles.subTitle}>Connect a camera to track your cat's health through intelligent behavior analysis.</Text>

                <View style={styles.featureList}>
                    <FeatureItem icon="activity" title="Activity Trends" subtitle="Know exactly when they run, sleep, or play." />
                    <FeatureItem icon="grid" title="Zone Insights" subtitle="Know where they spend their time." />
                    <FeatureItem icon="wifi" title="Posture Signals" subtitle="Detect early indications of pain." />
                </View>

                {/* Stepper Indicator */}
                <View style={styles.stepperContainer}>
                    <View style={[styles.stepDot, styles.activeStep]} /><View style={styles.stepLine} />
                    <View style={styles.stepDot} /><View style={styles.stepLine} />
                    <View style={styles.stepDot} />
                </View>

                <TouchableOpacity style={styles.primaryButton} onPress={handleNext}>
                    <Text style={styles.primaryButtonText}>Connect Camera</Text>
                </TouchableOpacity>
                <View style={{ height: 20 }} />
            </ScrollView>
        </View>
    );

    const renderConnect = () => (
        <View style={styles.stepContainer}>
            {renderHeader('Connect Camera')}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                <Text style={styles.sectionTitle}>Select your camera brand</Text>
                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.input}
                        value={cameraBrand}
                        onChangeText={setCameraBrand}
                    />
                    <Feather name="chevron-down" size={20} color="#666" style={styles.inputIcon} />
                </View>

                <View style={styles.cameraBanner}>
                    <Image source={{ uri: 'https://placekitten.com/300/100' }} style={styles.cameraBannerImage} />
                </View>

                <Text style={styles.sectionTitle}>Webhook Configuration</Text>
                <Text style={styles.description}>Copy this URL to stream events from your camera to the app.</Text>

                <View style={[styles.inputContainer, { backgroundColor: '#E0F2F1' }]}>
                    <Text numberOfLines={1} style={styles.webhookUrl}>{webhookUrl}</Text>
                    <TouchableOpacity onPress={() => Alert.alert('Copied', 'Webhook URL copied to clipboard')}>
                        <Feather name="link" size={20} color="#2F6A62" />
                    </TouchableOpacity>
                </View>

                <View style={styles.howToContainer}>
                    <Text style={styles.howToTitle}>HOW TO SET UP</Text>
                    <StepItem number="1" text="Open Camera Settings: Login to your camera's app and find the notification settings." />
                    <StepItem number="2" text="Navigate to Webhook: Look for Network > Event Center > Webhook." />
                    <StepItem number="3" text="Paste & Save: Paste the URL from above into the 'Server URL' field and save your changes." />
                </View>

                <TouchableOpacity style={styles.primaryButton} onPress={handleNext}>
                    <Text style={styles.primaryButtonText}>Test Connection</Text>
                </TouchableOpacity>
                <View style={{ height: 20 }} />
            </ScrollView>
        </View>
    );

    const renderTestConnection = () => (
        <View style={styles.stepContainer}>
            {renderHeader('Test Camera Connection')}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                <View style={styles.statusBadge}>
                    <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                    <Text style={styles.statusText}>CONNECTED</Text>
                </View>

                <Text style={styles.mainTitle}>Connection successful!</Text>
                <Text style={styles.subTitle}>Your camera is online and sending data. We can see your cat's area clearly.</Text>

                <View style={styles.videoPlaceholder}>
                    <Image source={{ uri: 'https://placekitten.com/400/250' }} style={styles.videoImage} />
                    <View style={styles.liveBadge}>
                        <View style={styles.recordingDot} />
                        <Text style={{ color: '#FFF', fontSize: 12, fontWeight: 'bold' }}>Connected • 1080p</Text>
                    </View>
                </View>

                <View style={styles.infoRow}>
                    <Feather name="camera" size={20} color="#666" />
                    <Text style={styles.infoText}>Snapshot captured 10s ago</Text>
                </View>

                <View style={{ height: 40 }} />

                <TouchableOpacity style={styles.primaryButton} onPress={handleNext}>
                    <Text style={styles.primaryButtonText}>Zone Setup →</Text>
                </TouchableOpacity>
                <View style={{ height: 20 }} />
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
                            <Text style={styles.optionSubtitle}>Uses AI ID to track specific cats. Appropriate for the whole family.</Text>
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
        <SafeAreaView style={styles.container}>
            <StatusBar style="dark" />
            {currentStep === STEPS.INTRO && renderIntro()}
            {currentStep === STEPS.CONNECT && renderConnect()}
            {currentStep === STEPS.TEST_CONNECTION && renderTestConnection()}
            {currentStep === STEPS.ZONE_INTRO && renderZoneIntro()}
            {currentStep === STEPS.ZONE_SETUP && renderZoneSetup()}
            {currentStep === STEPS.ASSIGN && renderAssign()}
            {currentStep === STEPS.SUCCESS && renderSuccess()}
        </SafeAreaView>
    );
}

// Helpers
const FeatureItem = ({ icon, title, subtitle }) => (
    <View style={styles.featureItem}>
        <View style={styles.featureIcon}>
            <Feather name={icon} size={24} color="#2F6A62" />
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
        <Ionicons name="checkmark-circle" size={24} color="#2F6A62" />
        <Text style={styles.checkItemText}>{text}</Text>
    </View>
);

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#D1EFE9',
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
        color: '#2F6A62',
    },
    backButton: {
        padding: 5,
        backgroundColor: '#FFF',
        borderRadius: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    content: {
        flex: 1,
        // justifyContent: 'space-between'
    },
    // Intro
    heroImageContainer: {
        alignSelf: 'center',
        width: 250,
        height: 250,
        borderRadius: 20,
        overflow: 'hidden',
        marginBottom: 20,
        backgroundColor: '#A8D1CD'
    },
    heroImage: {
        width: '100%',
        height: '100%',
    },
    mainTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#2F6A62',
        textAlign: 'center',
        marginBottom: 10,
    },
    subTitle: {
        fontSize: 14,
        color: '#5F8883',
        textAlign: 'center',
        marginBottom: 20,
        lineHeight: 20,
    },
    featureList: {
        marginBottom: 30,
    },
    featureItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#C5E6E1',
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
    },
    featureIcon: {
        marginRight: 12,
    },
    featureTitle: {
        fontWeight: 'bold',
        color: '#2F6A62',
        fontSize: 14,
    },
    featureSubtitle: {
        color: '#5F8883',
        fontSize: 12,
    },
    stepperContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    stepDot: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: '#2F6A62',
        marginHorizontal: 4,
    },
    activeStep: {
        backgroundColor: '#2F6A62',
    },
    stepLine: {
        width: 40,
        height: 2,
        backgroundColor: '#2F6A62',
    },
    // Buttons
    primaryButton: {
        backgroundColor: '#2F6A62',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
    },
    primaryButtonText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    secondaryButton: {
        backgroundColor: '#FFF',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#2F6A62',
        width: '48%',
    },
    secondaryButtonText: {
        color: '#2F6A62',
        fontSize: 16,
        fontWeight: 'bold',
    },
    // Connect
    sectionTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#2F6A62',
        marginBottom: 10,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        borderRadius: 12,
        paddingHorizontal: 15,
        height: 50,
        marginBottom: 20,
    },
    input: {
        flex: 1,
        color: '#333',
    },
    cameraBanner: {
        height: 100,
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 20,
        backgroundColor: '#FFF'
    },
    cameraBannerImage: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover'
    },
    description: {
        color: '#666',
        marginBottom: 10,
        fontSize: 14,
    },
    webhookUrl: {
        flex: 1,
        color: '#555',
        marginRight: 10,
    },
    howToContainer: {
        marginBottom: 30,
    },
    howToTitle: {
        fontWeight: 'bold',
        color: '#666',
        marginBottom: 10,
    },
    stepItem: {
        flexDirection: 'row',
        marginBottom: 12,
    },
    stepNumberContainer: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#2F6A62',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
        marginTop: 2,
    },
    stepNumber: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 12,
    },
    stepText: {
        flex: 1,
        color: '#555',
        fontSize: 13,
        lineHeight: 18,
    },
    // Test
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#2F6A62',
        alignSelf: 'center',
        paddingHorizontal: 15,
        paddingVertical: 5,
        borderRadius: 20,
        marginBottom: 20,
    },
    statusText: {
        color: '#FFF',
        fontWeight: 'bold',
        marginLeft: 5,
    },
    videoPlaceholder: {
        width: '100%',
        height: 220,
        backgroundColor: '#000',
        borderRadius: 12,
        marginBottom: 15,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden'
    },
    videoImage: {
        width: '100%',
        height: '100%',
        opacity: 0.8
    },
    liveBadge: {
        position: 'absolute',
        top: 10,
        left: 10,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
        padding: 5,
        borderRadius: 5,
    },
    recordingDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: 'red',
        marginRight: 5,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    infoText: {
        marginLeft: 8,
        color: '#666',
    },
    // Zone Intro
    zoneIntroImageContainer: {
        width: 300,
        height: 300,
        alignSelf: 'center',
        marginBottom: 20,
    },
    zoneIntroImage: {
        width: '100%',
        height: '100%',
        resizeMode: 'contain'
    },
    // Zone Setup
    zoneEditorContainer: {
        alignSelf: 'center',
        width: 340,
        height: 260,
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 20,
        backgroundColor: '#000',
        position: 'relative'
    },
    zoneEditorImage: {
        width: '100%',
        height: '100%',
        opacity: 0.8
    },
    zoneBox: {
        position: 'absolute',
        borderWidth: 2,
        borderRadius: 4,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.1)'
    },
    zoneLabel: {
        backgroundColor: '#00E676',
        color: '#FFF',
        fontSize: 10,
        fontWeight: 'bold',
        paddingHorizontal: 4,
        borderRadius: 2,
    },
    zoneButtonsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginBottom: 15,
    },
    zoneButton: {
        backgroundColor: '#8d8d8d',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 20,
        marginHorizontal: 5,
    },
    zoneButtonText: {
        color: '#FFF',
        fontSize: 12,
    },
    addZoneButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#757575',
        paddingVertical: 12,
        borderRadius: 12,
        marginBottom: 10,
    },
    addZoneButtonText: {
        color: '#FFF',
        fontWeight: 'bold',
        marginLeft: 8,
    },
    // Assign Camera (from previous code)
    questionText: {
        fontSize: 16,
        color: '#333',
        marginBottom: 15,
        textAlign: 'center'
    },
    cameraTypeContainer: {
        marginBottom: 24,
    },
    cameraTypeOption: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#C5E6E1',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    cameraTypeActive: {
        backgroundColor: '#E0F2F1',
        borderColor: '#2F6A62',
    },
    radioContainer: {
        marginRight: 12,
    },
    radioOuter: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: '#5F8883',
        alignItems: 'center',
        justifyContent: 'center',
    },
    radioOuterActive: {
        borderColor: '#2F6A62',
    },
    radioInner: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#2F6A62',
    },
    optionTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#2F6A62',
        marginBottom: 4,
    },
    optionSubtitle: {
        fontSize: 12,
        color: '#5F8883',
        flexShrink: 1,
    },
    catCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    catCardActive: {
        borderColor: '#2F6A62',
        borderWidth: 1,
        backgroundColor: '#E0F2F1'
    },
    catAvatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        marginRight: 12,
    },
    catInfo: {
        flex: 1,
    },
    catName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333',
    },
    catDetails: {
        fontSize: 12,
        color: '#888',
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#DDD',
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxChecked: {
        backgroundColor: '#2F6A62',
        borderColor: '#2F6A62',
    },
    confirmButton: {
        backgroundColor: '#2F6A62',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 20,
    },
    confirmButtonText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
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
        backgroundColor: 'rgba(47, 106, 98, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    successIconInner: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: '#2F6A62',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: "#2F6A62",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 15,
        elevation: 10,
    },
    successTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#2F6A62',
        marginBottom: 8,
        textAlign: 'center',
    },
    successSubtitle: {
        fontSize: 16,
        color: '#5F8883',
        marginBottom: 40,
        textAlign: 'center',
    },
    premiumSuccessCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.5)',
        width: '100%',
        borderRadius: 24,
        padding: 24,
        marginBottom: 60,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.8)',
    },
    checkItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    checkItemText: {
        fontSize: 17,
        color: '#2F6A62',
        marginLeft: 12,
        fontWeight: '600'
    },
    premiumConnectorLine: {
        height: 16,
        width: 2,
        backgroundColor: '#B2DFDB',
        marginLeft: 11,
        marginVertical: 4,
    },
    launchButton: {
        backgroundColor: '#004D40',
        flexDirection: 'row',
        width: '100%',
        paddingVertical: 18,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 6,
    },
    launchButtonText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
    scrollContent: {
        paddingBottom: 40,
    }

});
