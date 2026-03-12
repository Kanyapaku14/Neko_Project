import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Image,
    SafeAreaView,
    Dimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Paw from '../components/Paw';

const { width, height } = Dimensions.get('window');

// Precise Paw print positions based on the screenshot
const PAW_PRINTS = [
    // Top Section (over mint)
    { top: 100, left: 40, size: 28, rotate: '-15deg', opacity: 0.15, color: '#00796B' },
    { top: 80, right: 60, size: 24, rotate: '20deg', opacity: 0.12, color: '#00796B' },
    { top: 180, right: 30, size: 20, rotate: '-10deg', opacity: 0.10, color: '#00796B' },

    // Bottom Section (over white)
    { bottom: 180, right: 40, size: 34, rotate: '25deg', opacity: 0.15, color: '#B2DFDB' },
    { bottom: 100, left: 30, size: 30, rotate: '-20deg', opacity: 0.18, color: '#B2DFDB' },
    { bottom: 60, right: 60, size: 28, rotate: '-15deg', opacity: 0.20, color: '#B2DFDB' },
];

export default function Nekocare({ onSignUp, onSignIn }) {
    return (
        <View style={styles.container}>
            {/* 1. The Mint Background (Top half of the screen) */}
            <View style={styles.topMintSection}>
                {/* Paw prints on mint */}
                {PAW_PRINTS.filter(p => p.top).map((paw, index) => (
                    <MaterialCommunityIcons
                        key={index}
                        name="paw"
                        size={paw.size}
                        color={paw.color}
                        style={{
                            position: 'absolute',
                            top: paw.top,
                            left: paw.left,
                            right: paw.right,
                            opacity: paw.opacity,
                            transform: [{ rotate: paw.rotate }],
                        }}
                    />
                ))}

                <SafeAreaView style={styles.headerSafe}>
                    <View style={styles.header}>
                        <Text style={styles.headerText}>NEK</Text>
                        <MaterialCommunityIcons name="paw" size={36} color="#0C5A58" style={styles.headerPaw} />
                        <Text style={styles.headerText}>CARE</Text>
                    </View>
                </SafeAreaView>
            </View>

            {/* 2. The White Section (Bottom half of the screen) */}
            <View style={styles.bottomWhiteSection}>
                {/* Big White Hill Shape overlapping the top section */}
                <View style={styles.hillOverlay}>
                    <View style={styles.hillCircle} />

                    {/* The Cats sitting on top of the white curve */}
                    <View style={styles.catWrapper}>
                        <Image
                            source={require('../../assets/nekocare_cats.png')}
                            style={styles.catImage}
                            resizeMode="contain"
                        />
                    </View>
                </View>

                {/* Use the shared Paw component for decorations on the white section */}
                <Paw style={{
                    top: 150
                }} />

                {/* Content Area */}
                <View style={styles.contentContainer}>
                    <Text style={styles.headline}>
                        <Text style={styles.boldTeal}>Smarter Cat Care{'\n'}</Text>
                        <Text style={styles.thinTeal}>with </Text>
                        <Text style={styles.boldGrey}>Neko Care</Text>
                    </Text>

                    <Text style={styles.description}>
                        AI-Powered Cat Health {'&'} Disease Risk Assessment{'\n'}
                        Take better care of your cat with confidence.{'\n'}
                        Neko Care uses AI to analyze behavior, symptoms,{'\n'}
                        and health data to assess disease risks{'\n'}
                        and support early prevention.
                    </Text>

                    {/* Buttons */}
                    <View style={styles.buttonRow}>
                        <TouchableOpacity style={styles.signUpBtn} onPress={onSignUp} activeOpacity={0.8}>
                            <Text style={styles.btnText}>Sign-up</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.signInBtn} onPress={onSignIn} activeOpacity={0.8}>
                            <Text style={styles.btnText}>Sign-in</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Footer Logo */}
                    <View style={styles.miniFooter}>
                        <Text style={styles.miniText}>NEK</Text>
                        <MaterialCommunityIcons name="paw" size={14} color="#B0BEC5" style={styles.miniPaw} />
                        <Text style={styles.miniText}>CARE</Text>
                    </View>
                </View>
            </View>
        </View >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFF',
    },
    // --- TOP SECTION ---
    topMintSection: {
        height: height * 0.5,
        backgroundColor: '#B2EBE6', // Light Mint Teal
        width: '100%',
        alignItems: 'center',
    },
    headerSafe: {
        marginTop: 100,
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
    },
    headerText: {
        fontSize: 42,
        fontWeight: '900',
        color: '#FFF',
        letterSpacing: 2,
        textAlign: 'center',
    },
    headerPaw: {
        marginHorizontal: 8,
    },

    // --- BOTTOM SECTION ---
    bottomWhiteSection: {
        flex: 1,
        backgroundColor: '#FFF',
        width: '100%',
        position: 'relative',
    },
    hillOverlay: {
        position: 'absolute',
        top: -100, // Moved down slightly (was -120)
        width: '100%',
        alignItems: 'center',
    },
    hillCircle: {
        width: width * 2,
        height: width * 2,
        backgroundColor: '#FFF',
        borderRadius: width,
        position: 'absolute',
        top: 0,
    },
    catWrapper: {
        marginTop: -230, // Slightly adjusted to keep cats well-positioned
        alignItems: 'center',
    },
    catImage: {
        width: width * 1.4,
        height: 420,
        alignSelf: 'center', // Ensure centering of oversized image
    },

    // --- CONTENT ---
    contentContainer: {
        marginTop: 30, // Extremely lifted (was 70)
        alignItems: 'center',
        paddingHorizontal: 20,
        flex: 1,
    },
    headline: {
        textAlign: 'center',
        marginBottom: 25, // Increased from 10 to move description down
    },
    boldTeal: {
        fontSize: 30,
        fontWeight: '800',
        color: '#008B86',
        lineHeight: 36,
    },
    thinTeal: {
        fontSize: 27,
        color: '#008B86',
        fontWeight: '800',
    },
    boldGrey: {
        fontSize: 27,
        fontWeight: '800',
        color: '#78909C',
    },
    description: {
        fontSize: 13,
        color: '#607D8B',
        textAlign: 'center',
        lineHeight: 18,
        marginBottom: 60, // Increased from 25 to move buttons down
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 15,
        marginBottom: 10,
    },
    signUpBtn: {
        backgroundColor: '#008B86',
        paddingVertical: 14,
        paddingHorizontal: 38,
        borderRadius: 40,
        minWidth: 150,
        alignItems: 'center',
    },
    signInBtn: {
        backgroundColor: '#B0BEC5',
        paddingVertical: 14,
        paddingHorizontal: 38,
        borderRadius: 40,
        minWidth: 150,
        alignItems: 'center',
    },
    btnText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
    miniFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 'auto', // Push to the very bottom
        marginBottom: 20,   // Almost touching the edge
    },
    miniText: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#B0BEC5',
        letterSpacing: 1,
    },
    miniPaw: {
        marginHorizontal: 4,
    },
});
