import React, { useEffect, useRef } from "react";
import { View, Text, Image, TouchableOpacity, Modal, FlatList, StyleSheet, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function DropdownProfile({ visible, onClose, cats, activeCat, onSelectCat }) {
    const slideAnim = useRef(new Animated.Value(-15)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.timing(slideAnim, {
                    toValue: 0,
                    duration: 250,
                    useNativeDriver: true,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: true,
                })
            ]).start();
        } else {
            slideAnim.setValue(-15);
            fadeAnim.setValue(0);
        }
    }, [visible]);

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableOpacity
                style={styles.modalOverlay}
                activeOpacity={1}
                onPress={onClose}
            >
                <Animated.View style={[
                    styles.dropdownContainer,
                    {
                        transform: [{ translateY: slideAnim }],
                        opacity: fadeAnim
                    }
                ]}>
                    <Text style={styles.dropdownTitle}>Select Your Cat</Text>
                    <FlatList
                        data={cats}
                        keyExtractor={(item) => item.id.toString()}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={[
                                    styles.catItem,
                                    activeCat?.id === item.id && styles.activeCatItem
                                ]}
                                onPress={() => onSelectCat(item)}
                            >
                                <View style={styles.catItemAvatar}>
                                    {item.image_url ? (
                                        <Image source={{ uri: item.image_url }} style={{ width: '100%', height: '100%' }} />
                                    ) : (
                                        <Ionicons name="paw" size={20} color="#718096" />
                                    )}
                                </View>
                                <Text style={[
                                    styles.catItemName,
                                    activeCat?.id === item.id && styles.activeCatName
                                ]}>
                                    {item.name}
                                </Text>
                                {activeCat?.id === item.id && (
                                    <Ionicons name="checkmark-circle" size={20} color="#4FD1C5" />
                                )}
                            </TouchableOpacity>
                        )}
                    />
                </Animated.View>
            </TouchableOpacity>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.3)',
        justifyContent: 'flex-start',
        alignItems: 'flex-start',
    },
    dropdownContainer: {
        backgroundColor: 'white',
        marginTop: 85, // Safely below the 75px header
        marginLeft: 20,
        borderRadius: 16,
        width: 240, // Slightly narrower for IG feel
        maxHeight: 300,
        padding: 12, // More breathing room
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12, // Softer shadow
        shadowRadius: 16, // Larger blur
        elevation: 8,
    },
    dropdownTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#718096',
        marginBottom: 10,
        paddingHorizontal: 10,
    },
    catItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 10,
        borderRadius: 8,
    },
    activeCatItem: {
        backgroundColor: '#E6FFFA',
    },
    catItemAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#E2E8F0',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        marginRight: 12,
    },
    catItemName: {
        flex: 1,
        fontSize: 16,
        color: '#2D3748',
    },
    activeCatName: {
        fontWeight: 'bold',
        color: '#2C7A7B',
    }
});
