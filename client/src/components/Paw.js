import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

const Paw = () => {
    // Define paw positions and rotations to scatter them organically across the background
    const paws = [
        { id: 1, left: '5%', top: '60%', size: 36, rotation: '-15deg', opacity: 0.15 },
        { id: 2, left: '15%', top: '45%', size: 40, rotation: '10deg', opacity: 0.2 },
        { id: 3, left: '30%', top: '50%', size: 42, rotation: '25deg', opacity: 0.25 },
        { id: 4, left: '40%', top: '33%', size: 38, rotation: '15deg', opacity: 0.2 },
        { id: 5, left: '55%', top: '50%', size: 45, rotation: '5deg', opacity: 0.22 },
        { id: 6, left: '68%', top: '30%', size: 40, rotation: '-10deg', opacity: 0.18 },
        { id: 7, left: '85%', top: '35%', size: 38, rotation: '20deg', opacity: 0.2 },
        { id: 8, left: '88%', top: '17%', size: 44, rotation: '35deg', opacity: 0.25 },
    ];

    return (
        <View style={styles.container} pointerEvents="none">
            {paws.map((paw) => (
                <View
                    key={paw.id}
                    style={[
                        styles.pawWrapper,
                        {
                            left: paw.left,
                            top: paw.top,
                            transform: [{ rotate: paw.rotation }],
                            opacity: paw.opacity,
                        },
                    ]}
                >
                    <Ionicons name="paw" size={paw.size} color="#2D6A64" />
                </View>
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        overflow: 'hidden',
        zIndex: 0, // Ensure it stays behind the main content
    },
    pawWrapper: {
        position: 'absolute',
    },
});

export default Paw;
