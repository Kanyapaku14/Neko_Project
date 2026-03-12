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
    DeviceEventEmitter,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import supabase from './config/supabaseClient';
import AlertEngine from '../services/AlertEngine';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

const AddMedical = ({ navigation, onBack, initialDate }) => {
    const insets = useSafeAreaInsets();
    const [eventType, setEventType] = useState('vet_visit');
    const [notes, setNotes] = useState('');
    const [eventDate, setEventDate] = useState(initialDate ? new Date(initialDate) : new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [catId, setCatId] = useState(null);

    // Fetch Cat ID first
    useEffect(() => {
        const fetchInitialCat = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            const scopedKey = user?.id ? `selectedCatId:${user.id}` : 'selectedCatId';
            const storedCatId =
                (await AsyncStorage.getItem(scopedKey)) ||
                (await AsyncStorage.getItem('selectedCatId'));
            if (storedCatId) {
                setCatId(storedCatId);
            } else {
                // If not in storage, fetch the first one from DB
                try {
                    if (!user) return;
                    const { data } = await supabase
                        .from('cats')
                        .select('id')
                        .eq('owner_id', user.id)
                        .limit(1)
                        .single();
                    if (data) setCatId(data.id);
                } catch (err) {
                    console.error('Error fetching default cat:', err);
                }
            }
        };
        fetchInitialCat();

        // Listen for cat changes from other screens
        const subscription = DeviceEventEmitter.addListener('catChanged', (cat) => {
            setCatId(cat.id);
        });

        return () => subscription.remove();
    }, []);

    const formatDate = (date) => {
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const eventTypes = [
        { id: 'vet_visit', label: 'Vet Visit', icon: 'chatbubbles-outline', plus: true },
        { id: 'vaccination', label: 'Vaccine', icon: 'needle', type: 'material' },
        { id: 'medication', label: 'Medicine', icon: 'pill', type: 'material' },
        { id: 'surgery', label: 'Surgery', icon: 'heart-pulse', type: 'material' },
        { id: 'other', label: 'Other', icon: 'dots-horizontal', type: 'material' },
    ];

    const normalizeEventType = (value) => {
        const key = String(value || '').trim().toLowerCase();
        if (['vet visit', 'vet_visit'].includes(key)) return 'vet_visit';
        if (['vaccine', 'vaccination'].includes(key)) return 'vaccination';
        if (['medicine', 'medication'].includes(key)) return 'medication';
        if (['surgery'].includes(key)) return 'surgery';
        return 'other';
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
            // Insert into medical_events table
            const formattedEventType = normalizeEventType(eventType);
            const { error: insertError } = await supabase
                .from('medical_events')
                .insert({
                    cat_id: catId,
                    event_type: formattedEventType,
                    event_date: eventDate.toISOString().split('T')[0],
                    notes: notes,
                    attachment_url: null,
                });

            if (insertError) throw insertError;

            try {
                await AlertEngine.logEvent({
                    type: 'medical_event_saved',
                    severity: 'info',
                    title: 'Medical Event Added',
                    desc: `${eventType.replace('_', ' ')} saved for ${eventDate.toISOString().split('T')[0]}.`,
                    details: notes ? notes.slice(0, 120) : '',
                    dedupeKey: `medical_event_saved:${catId}:${eventDate.toISOString().split('T')[0]}:${eventType}`,
                    cooldownMs: 2 * 60 * 1000,
                });
            } catch (_) {
                // keep medical save success path unchanged
            }

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
        if (event.id === 'vet_visit') {
            return (
                <View style={styles.iconWrapper}>
                    <Ionicons name="chatbubbles-outline" size={32} color={eventType === event.id ? '#FFF' : '#2D6A64'} />
                    <View style={styles.plusIcon}>
                        <Ionicons name="add-circle" size={16} color="#8BC34A" />
                    </View>
                </View>
            );
        } else if (event.type === 'material') {
            return <MaterialCommunityIcons name={event.icon} size={40} color={eventType === event.id ? '#FFF' : '#2D6A64'} />;
        } else {
            return <FontAwesome5 name={event.icon} size={32} color={eventType === event.id ? '#FFF' : '#2D6A64'} />;
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
        <View style={styles.safeArea}>
            <StatusBar style="dark" translucent backgroundColor="transparent" />
            <LinearGradient
                colors={['#f5fffdff', '#f5fffdff']} // Match AlertScreen colors
                style={styles.container}
            >
                {/* Header */}
                <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                    <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={28} color="#333" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Add Medical Event</Text>
                    <TouchableOpacity style={[styles.backButton, { alignItems: 'flex-end' }]}>
                        <Ionicons name="ellipsis-vertical" size={24} color="transparent" />
                    </TouchableOpacity>
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
        </View>
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
        paddingTop: 8,
        paddingBottom: 12,
        backgroundColor: 'transparent',
    },
    headerTitle: {
        fontSize: 16,
        fontFamily: 'Inter-Bold',
        color: '#2F6A62',
        textAlign: 'center',
        flex: 1
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'flex-start'
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
        flexWrap: 'wrap',
        justifyContent: 'flex-start',
        gap: 10,
        marginBottom: 30,
    },
    eventCard: {
        width: (width - 60) / 3.3,
        height: 90,
        borderRadius: 15,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        marginBottom: 5,
    },
    eventCardActive: {
        backgroundColor: '#147C78',
    },
    eventCardInactive: {
        backgroundColor: '#FFFFFF',
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
        color: '#2D6A64',
    },
    labelTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#2D6A64',
        marginBottom: 10,
    },
    datePicker: {
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#B2DFDB',
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
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#B2DFDB',
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
    saveButton: {
        backgroundColor: '#147C78',
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
