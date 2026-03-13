import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

const Paw = ({ style }) => {
    // Define paw positions and rotations to scatter them organically across the background
    const paws = [
        // Clusters and organic trails
        { id: 1, left: '10%', top: '15%', size: 32, rotation: '45deg', opacity: 0.08 },
        { id: 2, left: '25%', top: '25%', size: 38, rotation: '-20deg', opacity: 0.1 },
        { id: 3, left: '8%', top: '45%', size: 42, rotation: '15deg', opacity: 0.06 },
        { id: 4, left: '20%', top: '60%', size: 36, rotation: '-35deg', opacity: 0.09 },
        { id: 5, left: '45%', top: '10%', size: 40, rotation: '25deg', opacity: 0.07 },
        { id: 6, left: '60%', top: '22%', size: 34, rotation: '-15deg', opacity: 0.11 },
        { id: 7, left: '50%', top: '48%', size: 30, rotation: '40deg', opacity: 0.08 },
        { id: 8, left: '75%', top: '15%', size: 44, rotation: '-30deg', opacity: 0.12 },
        { id: 9, left: '88%', top: '40%', size: 38, rotation: '20deg', opacity: 0.09 },
        { id: 10, left: '70%', top: '65%', size: 42, rotation: '-45deg', opacity: 0.07 },
        { id: 11, left: '35%', top: '75%', size: 34, rotation: '10deg', opacity: 0.1 },
        { id: 12, left: '15%', top: '85%', size: 40, rotation: '-25deg', opacity: 0.08 },
        { id: 13, left: '82%', top: '80%', size: 32, rotation: '35deg', opacity: 0.06 },
        { id: 14, left: '92%', top: '60%', size: 36, rotation: '15deg', opacity: 0.09 },
    ];

    return (
        <View style={[styles.container, style]} pointerEvents="none">
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
                    <MaterialCommunityIcons name="paw" size={paw.size} color="#0C5A58" />
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
