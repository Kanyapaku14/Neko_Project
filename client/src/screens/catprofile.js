import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, ScrollView, SafeAreaView, Alert, ActivityIndicator, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './Style/authstyle';
import supabase from './config/supabaseClient';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function CatProfile({ session, catId, onBack, onNavigateToHome }) { // Receiving session and callbacks
    const [catName, setCatName] = useState('');
    const [birthDate, setBirthDate] = useState('');
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [gender, setGender] = useState('Male'); // Male, Female
    const [isGenderDropdownOpen, setIsGenderDropdownOpen] = useState(false);
    const [isNeutered, setIsNeutered] = useState('Yes'); // Yes, No
    const [breed, setBreed] = useState('');
    const [isBreedDropdownOpen, setIsBreedDropdownOpen] = useState(false);
    const [breedSearchQuery, setBreedSearchQuery] = useState('');
    const [currentWeight, setCurrentWeight] = useState('');

    const catBreeds = [
        "British Shorthair: (บริติช ช็อตแฮร์)",
        "Persian: (เปอร์เซีย)",
        "Scottish Fold: (สกอตติช โฟลด์)",
        "Ragdoll: (แร็กดอลล์)",
        "American Shorthair: (อเมริกัน ช็อตแฮร์)",
        "Maine Coon: (เมนคูน)",
        "Sphynx: (สฟิงซ์)",
        "Exotic Shorthair: (เอ็กโซติก)",
        "Wichien Maat: (วิเชียรมาศ)",
        "Korat / Si Sawat: (โคราช หรือ สีสวาด)",
        "Khao Manee: (ขาวมณี)",
        "Suphalak: (ศุภลักษณ์)",
        "Konja: (โกนจา)",
        "Bengal: (เบงกอล)",
        "Munchkin: (มั้นช์กิน)",
        "Abyssinian: (อะบิสซิเนียน)",
        "Russian Blue: (รัสเซียนบลู)",
        "Mixed Breed: (พันธุ์ผสม)",
        "Domestic Shorthair (DSH): (แมวบ้านขนสั้น)",
        "Domestic Longhair (DLH): (แมวบ้านขนยาว)"
    ];

    const filteredBreeds = catBreeds.filter(b => b.toLowerCase().includes(breedSearchQuery.toLowerCase()));
    const [baselineWeight, setBaselineWeight] = useState('');
    const [activityLevel, setActivityLevel] = useState('Normal'); // Low, Normal, High
    const [loading, setLoading] = useState(false);
    const [imageUri, setImageUri] = useState(null);
    const [uploading, setUploading] = useState(false);

    React.useEffect(() => {
        if (catId) {
            fetchCatData();
        }
    }, [catId]);

    const fetchCatData = async () => {
        try {
            setLoading(true);
            // 1. Fetch Cat Info
            const { data: cat, error: catError } = await supabase
                .from('cats')
                .select('*')
                .eq('id', catId)
                .single();

            if (catError) throw catError;

            if (cat) {
                setCatName(cat.name || '');
                setBirthDate(cat.birthdate || '');
                setGender(cat.gender || 'Male');
                setBreed(cat.breed || '');
                if (cat.image_url) {
                    setImageUri(cat.image_url);
                }
            }

            // 2. Fetch Latest Weight
            const { data: weights, error: weightError } = await supabase
                .from('cat_weights')
                .select('weight_kg')
                .eq('cat_id', catId)
                .order('measured_at', { ascending: false })
                .limit(1);

            if (weightError) throw weightError;
            if (weights && weights.length > 0) {
                setCurrentWeight(weights[0].weight_kg.toString());
                setBaselineWeight(weights[0].weight_kg.toString()); // Default baseline to current if just one entry
            }

        } catch (error) {
            console.log("Error fetching cat data:", error.message);
        } finally {
            setLoading(false);
        }
    };

    const pickImage = async () => {
        try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Sorry, we need camera roll permissions to make this work!');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.7,
            });

            if (!result.canceled) {
                setImageUri(result.assets[0].uri);
            }
        } catch (error) {
            console.log("Error picking image:", error);
        }
    };

    const uploadImage = async (uri) => {
        if (!uri || uri.startsWith('http')) return uri;

        try {
            setUploading(true);
            const fileName = `${session.user.id}_cat_${Date.now()}.jpg`;
            const response = await fetch(uri);
            const arrayBuffer = await response.arrayBuffer();

            const { data, error: uploadError } = await supabase.storage
                .from('posts')
                .upload(fileName, arrayBuffer, {
                    contentType: 'image/jpeg',
                    upsert: true
                });

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage
                .from('posts')
                .getPublicUrl(fileName);

            return urlData.publicUrl;
        } catch (error) {
            console.log("Upload error:", error);
            throw error;
        } finally {
            setUploading(false);
        }
    };

    const handleSave = async () => {

        if (!catName || !breed || !birthDate || !currentWeight || !baselineWeight || !gender || !isNeutered || !activityLevel) {
            Alert.alert('Error', 'Please fill in all required fields.');
            return;
        }

        try {
            if (!session?.user?.id) throw new Error("No user logged in");

            let resultCatId = catId;

            if (catId) {
                // Update existing cat
                const { error: catError } = await supabase
                    .from('cats')
                    .update({
                        name: catName,
                        breed: breed,
                        gender: gender,
                        birthdate: birthDate || null,
                    })
                    .eq('id', catId);

                if (catError) throw catError;
            } else {
                // 1. Insert into cats table
                const { data: catData, error: catError } = await supabase
                    .from('cats')
                    .insert([
                        {
                            owner_id: session.user.id,
                            name: catName,
                            breed: breed,
                            gender: gender,
                            birthdate: birthDate || null,
                        }
                    ])
                    .select()
                    .single();

                if (catError) throw catError;
                resultCatId = catData.id;
            }

            // 1.5 Upload Image if picked
            let finalImageUrl = imageUri;
            if (imageUri && !imageUri.startsWith('http')) {
                finalImageUrl = await uploadImage(imageUri);

                // Update cat with image url
                const { error: imgUpdateError } = await supabase
                    .from('cats')
                    .update({ image_url: finalImageUrl })
                    .eq('id', resultCatId);

                if (imgUpdateError) throw imgUpdateError;
            }

            // 2. Insert into cat_weights table
            if (currentWeight) {
                const { error: weightError } = await supabase
                    .from('cat_weights')
                    .insert([
                        {
                            cat_id: resultCatId,
                            weight_kg: parseFloat(currentWeight),
                            measured_at: new Date(),
                        }
                    ]);

                if (weightError) throw weightError;
            }

            // Success
            Alert.alert('Success', 'Cat Profile Saved!', [
                { text: 'OK', onPress: () => (onBack ? onBack() : onNavigateToHome && onNavigateToHome(resultCatId)) }
            ]);

        } catch (error) {
            Alert.alert('Error Saving Cat Profile', error.message);
        }
    };

    const getPickerDateValue = () => {
        if (!birthDate) return new Date();
        const parts = birthDate.split('-').map((v) => parseInt(v, 10));
        if (parts.length !== 3 || parts.some((v) => Number.isNaN(v))) return new Date();
        const [year, month, day] = parts;
        return new Date(year, month - 1, day);
    };

    const handlePickerChange = (event, selectedDate) => {
        if (Platform.OS === 'android') {
            setShowDatePicker(false);
        }

        if (event?.type === 'dismissed' || !selectedDate) {
            return;
        }

        const yyyy = selectedDate.getFullYear();
        const mm = String(selectedDate.getMonth() + 1).padStart(2, '0');
        const dd = String(selectedDate.getDate()).padStart(2, '0');
        setBirthDate(`${yyyy}-${mm}-${dd}`);

        if (Platform.OS === 'ios') {
            setShowDatePicker(false);
        }
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
                <StatusBar style="auto" />

                {/* Header with Back Button */}
                <View style={styles.headerRow}>
                    <TouchableOpacity onPress={() => onBack ? onBack() : onNavigateToHome && onNavigateToHome()} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={28} color="#2F6A62" />
                    </TouchableOpacity>
                </View>

                <View style={styles.headerContainer}>
                    {/* Centered logo or text if needed */}
                </View>

                {/* Profile Image */}
                <View style={{ alignItems: 'center', marginBottom: 24 }}>
                    <TouchableOpacity onPress={pickImage} style={styles.profileImageContainer}>
                        {imageUri ? (
                            <Image
                                source={{ uri: imageUri }}
                                style={styles.profileImage}
                            />
                        ) : (
                            <Image
                                source={require('../../assets/cioncat.jpg')}
                                style={[styles.profileImage, { opacity: 0.8 }]}
                            />
                        )}
                        <View style={{ position: 'absolute', backgroundColor: 'rgba(0,0,0,0.3)', width: '100%', height: '100%', borderRadius: 100, justifyContent: 'center', alignItems: 'center' }}>
                            <Text style={{ fontSize: 30, color: '#fff', opacity: 0.8 }}>📷</Text>
                        </View>
                        {uploading && (
                            <ActivityIndicator size="large" color="#fff" style={{ position: 'absolute' }} />
                        )}
                    </TouchableOpacity>
                    <Text style={styles.title}>Upload Profile</Text>
                    <Text style={[styles.subtitle, { marginBottom: 10 }]}>Help us recognize your feline friend</Text>
                </View>


                <Text style={styles.sectionTitle}>GENERAL INFO</Text>
                <View style={styles.contentContainer}>
                    {/* Cat's Name */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.labelprofile}>Cat's Name</Text>
                        <TextInput
                            style={styles.input}
                            value={catName}
                            onChangeText={setCatName}
                            placeholder="Name"
                        />
                    </View>

                    {/* Birthdate */}
                    <View style={styles.inputGroup}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '80%', alignSelf: 'center' }}>
                            <Text style={[styles.label, { marginLeft: 0 }]}>Birthdate (YYYY-MM-DD)</Text>
                            <Text style={[styles.label, { color: '#2F6A62', fontWeight: 'bold' }]}></Text>
                        </View>
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => setShowDatePicker(true)}
                            style={[styles.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
                        >
                            <Text style={{ fontSize: 16, color: birthDate ? '#333' : '#999' }}>
                                {birthDate || 'Select birthdate'}
                            </Text>
                            <Ionicons name="calendar-outline" size={20} color="#666" />
                        </TouchableOpacity>

                        {showDatePicker && (
                            <DateTimePicker
                                value={getPickerDateValue()}
                                mode="date"
                                display="default"
                                onChange={handlePickerChange}
                                maximumDate={new Date()}
                            />
                        )}
                    </View>
                </View>

                <Text style={styles.sectionTitle}>ATTRIBUTES</Text>
                <View style={styles.contentContainer}>
                    {/* Gender Toggle */}
                    {/* Gender and Sterilization Row */}
                    <View style={styles.rowContainer}>
                        {/* Gender Column */}
                        <View style={{ width: '48%', zIndex: 3000 }}>
                            <Text style={[styles.label, { marginBottom: 5 }]}>Gender</Text>
                            <View style={{ width: '100%', position: 'relative' }}>
                                <TouchableOpacity
                                    activeOpacity={0.8}
                                    onPress={() => setIsGenderDropdownOpen(!isGenderDropdownOpen)}
                                    style={[styles.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' }]}
                                >
                                    <Text
                                        style={{ fontSize: 16, color: gender ? '#333' : '#999', flexShrink: 1, paddingRight: 8 }}
                                        numberOfLines={1}
                                        ellipsizeMode="tail"
                                    >
                                        {gender || "Select Gender"}
                                    </Text>
                                    <Text style={{ fontSize: 12, color: '#666' }}>{isGenderDropdownOpen ? "▲" : "▼"}</Text>
                                </TouchableOpacity>

                                {isGenderDropdownOpen && (
                                    <View style={{ backgroundColor: '#fff', borderRadius: 10, marginTop: 5, borderWidth: 1, borderColor: '#eee', overflow: 'hidden', position: 'absolute', top: 50, left: 0, right: 0, zIndex: 4000, elevation: 5 }}>
                                        {[{ label: 'Male', value: 'Male' }, { label: 'Female', value: 'Female' }].map((item, index) => (
                                            <TouchableOpacity
                                                key={index}
                                                style={{ padding: 12, borderBottomWidth: index === 1 ? 0 : 1, borderBottomColor: '#f0f0f0' }}
                                                onPress={() => {
                                                    setGender(item.value);
                                                    setIsGenderDropdownOpen(false);
                                                }}
                                            >
                                                <Text style={{ fontSize: 16, color: gender === item.value ? '#2F6A62' : '#333' }}>
                                                    {item.label}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )}
                            </View>
                        </View>

                        {/* Sterilization Column */}
                        <View style={{ width: '48%' }}>
                            <Text style={[styles.label, { marginBottom: 5 }]}>Sterilization</Text>
                            <View style={[styles.toggleContainer, { width: '100%' }]}>
                                <TouchableOpacity
                                    style={[styles.toggleButton, isNeutered === 'Yes' && styles.toggleButtonActive]}
                                    onPress={() => setIsNeutered('Yes')}
                                >
                                    <Text style={[styles.toggleText, isNeutered === 'Yes' && styles.toggleTextActive]}>Yes</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.toggleButton, isNeutered === 'No' && styles.toggleButtonActive]}
                                    onPress={() => setIsNeutered('No')}
                                >
                                    <Text style={[styles.toggleText, isNeutered === 'No' && styles.toggleTextActive]}>No</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>

                    {/* Breed */}
                    <View style={[styles.inputGroup, { zIndex: 2000 }]}>
                        <Text style={styles.labelprofile}>Breed</Text>
                        <View style={{ width: '100%', position: 'relative' }}>
                            <TouchableOpacity
                                activeOpacity={0.8}
                                onPress={() => setIsBreedDropdownOpen(!isBreedDropdownOpen)}
                                style={[styles.input, { 
                                    flexDirection: 'row',
                                     justifyContent: 'space-between',
                                      alignItems: 'center',
                                       width: '80%',
                                    paddingHorizontal: 15, 
                                    height: 50 }]}
                            >
                                <Text
                                    style={{ fontSize: 16, color: breed ? '#333' : '#999', flexShrink: 1, paddingRight: 8 }}
                                    numberOfLines={1}
                                    ellipsizeMode="tail"
                                >
                                    {breed || "Select Breed"}
                                </Text>
                                <Text style={{ fontSize: 12, color: '#666' }}>{isBreedDropdownOpen ? "▲" : "▼"}</Text>
                            </TouchableOpacity>

                            {isBreedDropdownOpen && (
                                <View style={{ backgroundColor: '#fff', borderRadius: 10, marginTop: 5, borderWidth: 1, borderColor: '#eee', position: 'absolute', top: 50, left: 0, right: 0, zIndex: 3000, elevation: 5, maxHeight: 250 }}>
                                    <View style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                                        <TextInput
                                            style={{ backgroundColor: '#f9f9f9', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8, fontSize: 14 }}
                                            placeholder="ค้นหาพันธุ์"
                                            value={breedSearchQuery}
                                            onChangeText={setBreedSearchQuery}
                                        />
                                    </View>
                                    <ScrollView nestedScrollEnabled={true} style={{ maxHeight: 200 }}>
                                        {filteredBreeds.map((item, index) => (
                                            <TouchableOpacity
                                                key={index}
                                                style={{ padding: 12, borderBottomWidth: index === filteredBreeds.length - 1 ? 0 : 1, borderBottomColor: '#f0f0f0' }}
                                                onPress={() => {
                                                    setBreed(item);
                                                    setIsBreedDropdownOpen(false);
                                                    setBreedSearchQuery('');
                                                }}
                                            >
                                                <Text style={{ fontSize: 14, color: breed === item ? '#2F6A62' : '#333' }}>
                                                    {item}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                        {filteredBreeds.length === 0 && (
                                            <Text style={{ padding: 12, color: '#999', textAlign: 'center' }}>ไม่พบสายพันธุ์</Text>
                                        )}
                                    </ScrollView>
                                </View>
                            )}
                        </View>
                    </View>
                </View>

                <Text style={styles.sectionTitle}>PHYSICAL METRICS</Text>
                <View style={styles.rowContainer}>
                    <View style={styles.weightContainer}>
                        <Text style={[styles.label, { marginBottom: 5 }]}>Current Weight</Text>
                        <View style={styles.weightInputContainer}>
                            <TextInput
                                style={styles.weightInput}
                                value={currentWeight}
                                onChangeText={setCurrentWeight}
                                placeholder="0.0"
                                keyboardType="numeric"
                            />
                            <Text style={styles.unitText}>Kg</Text>
                        </View>
                    </View>

                    <View style={styles.weightContainer}>
                        <Text style={[styles.label, { marginBottom: 5 }]}>Baseline Weight</Text>
                        <View style={styles.weightInputContainer}>
                            <TextInput
                                style={styles.weightInput}
                                value={baselineWeight}
                                onChangeText={setBaselineWeight}
                                placeholder="0.0"
                                keyboardType="numeric"
                            />
                            <Text style={styles.unitText}>Kg</Text>
                        </View>
                    </View>
                </View>

                <Text style={[styles.sectionTitle, { marginTop: 10 }]}>Daily Activity Level</Text>
                <View style={styles.activityContainer}>
                    <TouchableOpacity
                        style={[styles.activityButton, activityLevel === 'Low' && styles.activityButtonActive]}
                        onPress={() => setActivityLevel('Low')}
                    >
                        <Text style={styles.iconPlaceholder}>aaa</Text>
                        {/* Replace with Icon */}
                        <Text style={styles.activityText}>Low</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.activityButton, activityLevel === 'Normal' && styles.activityButtonActive]}
                        onPress={() => setActivityLevel('Normal')}
                    >
                        <Text style={styles.iconPlaceholder}>🔥</Text>
                        {/* Replace with Icon */}
                        <Text style={styles.activityText}>Normal</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.activityButton, activityLevel === 'High' && styles.activityButtonActive]}
                        onPress={() => setActivityLevel('High')}
                    >
                        <Text style={styles.iconPlaceholder}>⚡</Text>
                        {/* Replace with Icon */}
                        <Text style={styles.activityText}>High</Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.button} onPress={handleSave}>
                    <Text style={styles.buttonText}>Complete Profile</Text>
                </TouchableOpacity>

            </ScrollView>
        </SafeAreaView>
    );
}
