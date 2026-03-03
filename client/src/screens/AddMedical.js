import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    SafeAreaView,
    ScrollView,
    TextInput,
    Dimensions,
    Alert,
    ActivityIndicator,
    Platform,
    Image,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import supabase from './config/supabaseClient';

const { width } = Dimensions.get('window');

const AddMedical = ({ navigation, onBack, initialDate }) => {
    const [eventType, setEventType] = useState('Vet Visit');
    const [notes, setNotes] = useState('');
    const [eventDate, setEventDate] = useState(initialDate ? new Date(initialDate) : new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [image, setImage] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [catId, setCatId] = useState(null);

    useEffect(() => {
        fetchCatId();
    }, []);

    const fetchCatId = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase
                .from('cats')
                .select('id')
                .eq('owner_id', user.id)
                .limit(1)
                .single();

            if (data) setCatId(data.id);
        } catch (error) {
            console.error('Error fetching catId:', error);
        }
    };

    const formatDate = (date) => {
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const eventTypes = [
        { id: 'Vet Visit', label: 'Vet Visit', icon: 'chatbubbles-outline', plus: true },
        { id: 'Vaccine', label: 'Vaccine', icon: 'needle', type: 'material' },
        { id: 'Medicine', label: 'Medicine', icon: 'pill', type: 'material' },
    ];

    const normalizeEventType = (value) => {
        const key = String(value || '').trim().toLowerCase();
        if (['vet visit', 'vet_visit'].includes(key)) return 'vet_visit';
        if (['vaccine', 'vaccination'].includes(key)) return 'vaccination';
        if (['medicine', 'medication'].includes(key)) return 'medication';
        if (['surgery'].includes(key)) return 'surgery';
        return 'other';
    };

    const pickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission Required', 'We need camera roll permissions to upload photos.');
            return;
        }

        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.8,
        });

        if (!result.canceled) {
            setImage(result.assets[0].uri);
        }
    };

    const onDateChange = (event, selectedDate) => {
        const currentDate = selectedDate || eventDate;
        setShowDatePicker(Platform.OS === 'ios');
        setEventDate(currentDate);
    };

    const saveEvent = async () => {
        if (!catId) {
            Alert.alert('Error', 'No cat profile found.');
            return;
        }

        setUploading(true);
        try {
            let imageUrl = null;

            // 1. Upload Image to Supabase Storage
            if (image) {
                const fileName = `${catId}/${Date.now()}.jpg`;
                const formData = new FormData();
                formData.append('file', {
                    uri: image,
                    name: fileName,
                    type: 'image/jpeg',
                });

                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('medical_attachments')
                    .upload(fileName, formData, { contentType: 'image/jpeg' });

                if (uploadError) throw uploadError;

                const { data: publicUrlData } = supabase.storage
                    .from('medical_attachments')
                    .getPublicUrl(fileName);

                imageUrl = publicUrlData.publicUrl;
            }

            // 2. Insert into medical_events table
            const formattedEventType = normalizeEventType(eventType);

            const { error: insertError } = await supabase
                .from('medical_events')
                .insert({
                    cat_id: catId,
                    event_type: formattedEventType,
                    event_date: eventDate.toISOString().split('T')[0],
                    notes: notes,
                    attachment_url: imageUrl,
                });

            if (insertError) throw insertError;

            Alert.alert('Success', 'Medical event saved successfully!', [
                { text: 'OK', onPress: () => handleBack() }
            ]);
        } catch (error) {
            console.error('Error saving event:', error);
            Alert.alert('Error', error.message || 'Failed to save event.');
        } finally {
            setUploading(false);
        }
    };

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

    const handleBack = () => {
        if (onBack) {
            onBack();
        } else if (navigation?.goBack) {
            navigation.goBack();
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
                    <TouchableOpacity onPress={handleBack} style={styles.backButton}>
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
                    <TouchableOpacity style={styles.datePicker} onPress={() => setShowDatePicker(true)}>
                        <Text style={styles.dateText}>{formatDate(eventDate)}</Text>
                        <Ionicons name="calendar" size={24} color="#000" />
                    </TouchableOpacity>

                    {showDatePicker && (
                        <DateTimePicker
                            value={eventDate}
                            mode="date"
                            display="default"
                            onChange={onDateChange}
                        />
                    )}

                    {/* Notes section */}
                    <Text style={styles.labelTitle}>NOTES</Text>
                    <View style={styles.notesContainer}>
                        <MaterialCommunityIcons name="paw" size={100} color="rgba(255, 255, 255, 0.4)" style={styles.pawIcon1} />
                        <MaterialCommunityIcons name="paw" size={80} color="rgba(255, 255, 255, 0.4)" style={styles.pawIcon2} />
                        <TextInput
                            style={styles.notesInput}
                            multiline
                            placeholder="Describe what happened..."
                            value={notes}
                            onChangeText={setNotes}
                            textAlignVertical="top"
                        />
                    </View>

                    {/* Upload section */}
                    <Text style={styles.labelTitle}>Upload</Text>
                    <TouchableOpacity style={styles.uploadBox} onPress={pickImage}>
                        {image ? (
                            <Image source={{ uri: image }} style={styles.previewImage} resizeMode="cover" />
                        ) : (
                            <>
                                <View style={styles.cameraIconCircle}>
                                    <Ionicons name="camera" size={30} color="#2D6A64" />
                                </View>
                                <Text style={styles.uploadText}>Add Photo or Receipt</Text>
                            </>
                        )}
                    </TouchableOpacity>

                    {/* Save Button */}
                    <TouchableOpacity
                        style={[styles.saveButton, uploading && { opacity: 0.7 }]}
                        onPress={saveEvent}
                        disabled={uploading}
                    >
                        {uploading ? (
                            <ActivityIndicator color="#FFF" />
                        ) : (
                            <>
                                <Text style={styles.saveButtonText}>Save Event</Text>
                                <Ionicons name="checkmark-circle-outline" size={24} color="#FFF" style={{ marginLeft: 8 }} />
                            </>
                        )}
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
        color: '#2D6A64',
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
        overflow: 'hidden',
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
    previewImage: {
        width: '100%',
        height: '100%',
    },
    saveButton: {
        backgroundColor: '#39A39A',
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
