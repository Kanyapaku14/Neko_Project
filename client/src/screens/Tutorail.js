import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, SafeAreaView, TouchableOpacity, Image, StatusBar, FlatList, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from "@expo/vector-icons";

const { width, height } = Dimensions.get("window");

/* 
  NOTE: 
  Since the specific images (welcome.png, welcome1.png, ..., welcome6.png) are not yet in your assets folder,
  we use placeholder URIs. Once you add them to your `assets` folder, you can replace the `imageUri`
  properties with `image: require('../../assets/welcome.png')` etc.
*/

const TUTORIAL_SLIDES = [
    {
        id: "1",
        image: require('../../assets/Tutorial/welcome.png'),
        title: "Understand Your Cat's\nHealth Over Time",
        description: "We combine daily logs, photos, and\ncamera insights to help you spot long-term patterns and\nkeep your feline friend safe.",
    },
    {
        id: "2",
        image: require('../../assets/Tutorial/welcome1.jpg'),
        title: "Spot changes early",
        description: "Logging your cat's habits daily creates a\nhealth baseline. This helps us detect\nsubtle changes before they become big problems.",
        customWidth: width * 0.85,
        customHeight: width * 0.55 // Snug fit for horizontal layout
    },
    {
        id: "3",
        image: require('../../assets/Tutorial/welcome2.png'),
        title: "Photo Health Check",
        description: "Simply snap a photo to screen for skin\nissues, coat health, and visual signs of\ndistress. AI-powered peace of mind.\n\nⓘ Screening tool, not a medical diagnosis.",

    },
    {
        id: "4",
        image: require('../../assets/Tutorial/welcome3.jpg'),
        title: "Photo Health Check",
        description: "Simply snap a photo to screen for skin\nissues, coat health, and visual signs of\ndistress. AI-powered peace of mind.\n\nⓘ Screening tool, not a medical diagnosis.",
        customWidth: width * 0.70,
        customHeight: width * 0.65 // Snug fit for landscape camera
    },
    {
        id: "5",
        image: require('../../assets/Tutorial/welcome4.png'),
        title: "Smart Monitoring\nwith Camera",
        description: "Our AI-powered camera system\nautomatically tracks your cat's posture\nand litter box habits to detect early signs\nof health issues.",
        customWidth: width * 0.8,
        customHeight: width * 0.8 // 1:1 square fit
    },
    {
        id: "6",
        image: require('../../assets/Tutorial/welcome5.jpg'),
        title: "Track Your Progress",
        description: "Build healthy habits for your cat.\nConsistent logging unlocks advanced\nhealth trends and personalized vet tips.",
        customWidth: width * 0.89,
        customHeight: width * 0.48 // Matches welcome1.jpg
    },
    {
        id: "7",
        image: require('../../assets/Tutorial/welcome6.png'),
        title: "You're Ready to\nGet Started!",
        description: "Your cat's profile is set up.\nDive into your dashboard to start tracking\nweight, meals, and health milestones today.",
        customWidth: width * 0.7,
        customHeight: width * 0.7 // Snug fit for circular sleeping cat
    }
];

export default function Tutorail({ onFinish }) {
    const flatListRef = useRef(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const scrollX = useRef(new Animated.Value(0)).current;

    const handleNext = () => {
        if (currentIndex < TUTORIAL_SLIDES.length - 1) {
            flatListRef.current.scrollToIndex({
                index: currentIndex + 1,
                animated: true,
            });
            setCurrentIndex(currentIndex + 1);
        } else {
            // Finished tutorial
            if (onFinish) onFinish();
        }
    };

    const handleSkip = () => {
        if (onFinish) onFinish();
    };

    const onViewableItemsChanged = useRef(({ viewableItems }) => {
        if (viewableItems && viewableItems.length > 0) {
            setCurrentIndex(viewableItems[0].index);
        }
    }).current;

    const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

    const renderSlide = ({ item, index }) => {
        const dynamicStyle = {
            width: item.customWidth || width * 0.8,
            height: item.customHeight || width * 0.8
        };

        const inputRange = [
            (index - 1) * width,
            index * width,
            (index + 1) * width
        ];

        const scale = scrollX.interpolate({
            inputRange,
            outputRange: [0.8, 1, 0.8],
            extrapolate: 'clamp',
        });

        const opacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.4, 1, 0.4],
            extrapolate: 'clamp',
        });

        return (
            <View style={styles.slide}>
                <View style={styles.imageFrame}>
                    <Animated.View style={[styles.imageShadowWrapper, dynamicStyle, { transform: [{ scale }] }]}>
                        <View style={[styles.imageContainer, dynamicStyle]}>
                            {item.image ? (
                                <Image source={item.image} style={styles.image} resizeMode="contain" />
                            ) : (
                                <Image source={{ uri: item.imageUri }} style={styles.image} resizeMode="cover" />
                            )}
                        </View>
                    </Animated.View>
                </View>
                <Animated.View style={{ opacity, alignItems: 'center' }}>
                    <Text style={styles.title}>{item.title}</Text>
                    <Text style={styles.description}>{item.description}</Text>
                </Animated.View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Background Gradient */}
            <LinearGradient
                colors={['#FFFFFF', '#FFFFFF', '#A9D6CD']}
                locations={[0, 0.5, 1]}
                style={StyleSheet.absoluteFillObject}
            />

            <SafeAreaView style={{ flex: 1 }}>
                {/* Header (Skip Button) */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={handleSkip}>
                        <Text style={styles.skipText}>Skip</Text>
                    </TouchableOpacity>
                </View>

                {/* Carousel */}
                <View style={{ flex: 1 }}>
                    <Animated.FlatList
                        ref={flatListRef}
                        data={TUTORIAL_SLIDES}
                        keyExtractor={(item) => item.id}
                        renderItem={renderSlide}
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        bounces={false}
                        onScroll={Animated.event(
                            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                            { useNativeDriver: true }
                        )}
                        onViewableItemsChanged={onViewableItemsChanged}
                        viewabilityConfig={viewConfig}
                        scrollEventThrottle={16}
                    />
                </View>

                {/* Pagination Dots */}
                <View style={styles.paginationContainer}>
                    {TUTORIAL_SLIDES.map((_, index) => (
                        <View
                            key={index}
                            style={[
                                styles.dot,
                                currentIndex === index ? styles.activeDot : styles.inactiveDot
                            ]}
                        />
                    ))}
                </View>

                {/* Next Button */}
                <View style={styles.footer}>
                    <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
                        <Text style={styles.nextButtonText}>
                            {currentIndex === TUTORIAL_SLIDES.length - 1 ? "Get Started" : "Next"}
                        </Text>
                        <Ionicons name="arrow-forward" size={20} color="#000" style={{ marginLeft: 5 }} />
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    header: {
        paddingHorizontal: 24,
        paddingTop: 20,
        alignItems: 'flex-end',
        height: 60,
    },
    skipText: {
        fontSize: 16,
        color: '#90A4AE',
        fontFamily: 'Inter-Bold',
        fontWeight: '700',
    },
    slide: {
        width: width,
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: 0, // removed padding to help vertical centering
    },
    // Adding an outer wrapper to ensure the image is always centered vertically in a fixed height area
    imageFrame: {
        height: width * 0.95,
        width: width,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    imageShadowWrapper: {
        width: width * 0.8,
        height: width * 0.8, // Default fallback
        // Add shadow that won't be clipped
        shadowColor: '#1A3631',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
        elevation: 8,
        backgroundColor: 'transparent',
    },
    imageContainer: {
        width: '100%',
        height: '100%',
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        overflow: 'hidden',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    title: {
        fontSize: 26,
        fontFamily: 'Inter-Bold',
        fontWeight: '800',
        color: '#000000',
        textAlign: 'center',
        lineHeight: 34,
        marginBottom: 16,
    },
    description: {
        fontSize: 14,
        fontFamily: 'Inter-Regular',
        color: '#7C8B95',
        textAlign: 'center',
        lineHeight: 22,
        paddingHorizontal: 10,
    },
    paginationContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    dot: {
        height: 8,
        borderRadius: 4,
        marginHorizontal: 4,
    },
    activeDot: {
        width: 24,
        backgroundColor: '#63B5A5',
    },
    inactiveDot: {
        width: 8,
        backgroundColor: '#D1D9E0',
    },
    footer: {
        paddingHorizontal: 24,
        paddingBottom: 40,
        alignItems: 'center',
    },
    nextButton: {
        flexDirection: 'row',
        backgroundColor: '#63B5A5',
        width: '100%',
        height: 56,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    nextButtonText: {
        color: '#000',
        fontSize: 16,
        fontFamily: 'Inter-Bold',
        fontWeight: '600',
    }
});
