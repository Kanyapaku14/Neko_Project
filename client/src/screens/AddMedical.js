import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    SafeAreaView,
    ScrollView,
    TextInput,
    Dimensions,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

const AddMedical = ({ navigation }) => {
    const [eventType, setEventType] = useState('Vet Visit');
    const [notes, setNotes] = useState('');

    const eventTypes = [
        { id: 'Vet Visit', label: 'Vet Visit', icon: 'chatbubbles-outline', plus: true },
        { id: 'Vaccine', label: 'Vaccine', icon: 'needle', type: 'material' },
        { id: 'Medicine', label: 'Medicine', icon: 'pill', type: 'material' },
    ];

    const renderIcon = (event) => {
        if (event.id === 'Vet Visit') {
            return (
                <View style={styles.iconWrapper}>
                    <Ionicons name="chatbubbles-outline" size={32} color={eventType === event.id ? '#FFF' : '#2D6A64'} />
                    <View style={styles.plusIcon}>
                        <Ionicons name="add-circle" size={16} color="#8BC34A" />
                    </View>
                </View>
            );
        } else if (event.type === 'material') {
            return <MaterialCommunityIcons name={event.icon} size={40} color={eventType === event.id ? '#FFF' : '#111'} />;
        } else {
            return <FontAwesome5 name={event.icon} size={32} color={eventType === event.id ? '#FFF' : '#111'} />;
        }
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <LinearGradient
                colors={['#F5FAF9', '#C8E6E2']}
                style={styles.container}
            >
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={28} color="#2D6A64" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Add Medical Event</Text>
                    <View style={{ width: 28 }} />
                </View>

                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                    {/* What happened section */}
                    <Text style={styles.sectionTitle}>What happened 🐈‍⬛</Text>
                    <View style={styles.eventToggleContainer}>
                        {eventTypes.map((item) => (
                            <TouchableOpacity
                                key={item.id}
                                style={[
                                    styles.eventCard,
                                    eventType === item.id ? styles.eventCardActive : styles.eventCardInactive,
                                ]}
                                onPress={() => setEventType(item.id)}
                            >
                                {renderIcon(item)}
                                <Text style={[styles.eventLabel, eventType === item.id ? styles.textWhite : styles.textDark]}>
                                    {item.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Date section */}
                    <Text style={styles.labelTitle}>DATE</Text>
                    <TouchableOpacity style={styles.datePicker}>
                        <Text style={styles.dateText}>Today, Jan 17, 2026</Text>
                        <Ionicons name="calendar" size={24} color="#000" />
                    </TouchableOpacity>

                    {/* Notes section */}
                    <Text style={styles.labelTitle}>NOTES</Text>
                    <View style={styles.notesContainer}>
                        <MaterialCommunityIcons name="paw" size={100} color="rgba(255, 255, 255, 0.4)" style={styles.pawIcon1} />
                        <MaterialCommunityIcons name="paw" size={80} color="rgba(255, 255, 255, 0.4)" style={styles.pawIcon2} />
                        <TextInput
                            style={styles.notesInput}
                            multiline
                            placeholder=""
                            value={notes}
                            onChangeText={setNotes}
                            textAlignVertical="top"
                        />
                    </View>

                    {/* Upload section */}
                    <Text style={styles.labelTitle}>Upload</Text>
                    <TouchableOpacity style={styles.uploadBox}>
                        <View style={styles.cameraIconCircle}>
                            <Ionicons name="camera" size={30} color="#2D6A64" />
                        </View>
                        <Text style={styles.uploadText}>Add Photo or Receipt</Text>
                    </TouchableOpacity>

                    {/* Save Button */}
                    <TouchableOpacity style={styles.saveButton}>
                        <Text style={styles.saveButtonText}>Save Event</Text>
                        <Ionicons name="checkmark-circle-outline" size={24} color="#FFF" style={{ marginLeft: 8 }} />
                    </TouchableOpacity>
                </ScrollView>
            </LinearGradient>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#F5FAF9',
    },
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 15,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#2D6A64',
    },
    backButton: {
        padding: 5,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingBottom: 40,
    },
    sectionTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#2D6A64',
        marginBottom: 20,
        marginTop: 10,
    },
    eventToggleContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 30,
    },
    eventCard: {
        width: (width - 60) / 3,
        height: 90,
        borderRadius: 15,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
    },
    eventCardActive: {
        backgroundColor: '#39A39A',
    },
    eventCardInactive: {
        backgroundColor: '#4E7F78', // Medium teal/grayish teal
    },
    iconWrapper: {
        position: 'relative',
    },
    plusIcon: {
        position: 'absolute',
        top: -5,
        left: -5,
    },
    eventLabel: {
        fontSize: 14,
        fontWeight: '600',
        marginTop: 5,
        textAlign: 'center',
    },
    textWhite: {
        color: '#FFF',
    },
    textDark: {
        color: '#FFF',
    },
    labelTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#2D6A64',
        marginBottom: 10,
    },
    datePicker: {
        backgroundColor: '#B2D0CD',
        height: 55,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 15,
        marginBottom: 25,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    dateText: {
        fontSize: 16,
        color: '#80A4A0',
        fontWeight: '500',
    },
    notesContainer: {
        backgroundColor: '#B2D0CD',
        height: 150,
        borderRadius: 15,
        padding: 15,
        marginBottom: 25,
        position: 'relative',
        overflow: 'hidden',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    pawIcon1: {
        position: 'absolute',
        top: 5,
        right: 10,
    },
    pawIcon2: {
        position: 'absolute',
        bottom: -10,
        left: 100,
    },
    notesInput: {
        flex: 1,
        fontSize: 16,
        color: '#2D6A64',
    },
    uploadBox: {
        backgroundColor: '#B2D0CD',
        height: 120,
        borderRadius: 15,
        borderStyle: 'dashed',
        borderWidth: 1.5,
        borderColor: '#80A4A0',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 40,
    },
    cameraIconCircle: {
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10,
    },
    uploadText: {
        fontSize: 16,
        color: '#FFF',
        fontWeight: 'bold',
    },
    saveButton: {
        backgroundColor: '#8AB7B2',
        height: 55,
        borderRadius: 15,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
    },
    saveButtonText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
});

export default AddMedical;
