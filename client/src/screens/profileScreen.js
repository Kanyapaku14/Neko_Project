import { StatusBar } from 'expo-status-bar';
import React, { useState, useEffect } from 'react';
import { styles } from './Style/authstyle';
import supabase from './config/supabaseClient';
import { View, Text, TextInput, TouchableOpacity, Image, Alert, SafeAreaView, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { decode } from 'base64-arraybuffer';
// If you have icons, import them. For now using text placeholder or simple views for icons if needed.
export default function ProfileScreen({ session, onBack, onNavigateToCatProfile, onComplete }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [username, setUsername] = useState('');
    const [gender, setGender] = useState('');
    const [phone, setPhone] = useState('');
    const [birthDate, setBirthDate] = useState('');
    const [showDatePicker, setShowDatePicker] = useState(false);

    const [showGenderPicker, setShowGenderPicker] = useState(false);

    const [email, setEmail] = useState('');
    const [avatarUrl, setAvatarUrl] = useState(null);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);

    useEffect(() => {
        if (session) {
            setEmail(session.user.email);
            getProfile();
        }
    }, [session]);

    const getProfile = async () => {
        try {
            setLoading(true);
            if (!session?.user) throw new Error('No user on the session!');

            const { data, error, status } = await supabase
                .from('profiles')
                .select(`name, gender, phone_number, dob, avatar_url`)
                .eq('id', session.user.id)
                .single();

            if (error && status !== 406) {
                throw error;
            }

            if (data) {
                setUsername(data.name || '');
                setGender(data.gender || '');
                setPhone(data.phone_number || '');
                setBirthDate(data.dob || ''); // Changed dob to date_of_birth
                setAvatarUrl(data.avatar_url || null);
            }
        } catch (error) {
            if (error instanceof Error) {
                // If table doesn't exist or other error, we might just ignore for new users
                console.log('Error downloading profile: ', error.message);
            }
        } finally {
            setLoading(false);
        }
    };

    const updateProfile = async () => {
        setSaving(true);

        try {
            // 1. เช็คว่าล็อกอินอยู่ไหม
            if (!session?.user) throw new Error('No user on the session!');

            // 2. ตรวจรูปแบบวันที่
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (birthDate && !dateRegex.test(birthDate)) {
                throw new Error("Invalid date format. Please use YYYY-MM-DD (e.g., 1999-01-31).");
            }

            if (!username || !phone || !gender || !birthDate) {
                throw new Error("Please fill in all required fields.");
            }

            // 3. เตรียมข้อมูล (สร้างตัวแปร updates ตรงนี้ก่อน!)
            const updates = {
                id: session.user.id,
                name: username,
                email: session.user.email, // Add email to the update payload
                gender: gender,
                phone_number: phone,      // เช็คว่าใน DB ชื่อ phone_number แน่นอนนะ
                dob: birthDate || null, // เช็คว่าใน DB ชื่อ date_of_birth หรือ dob (เอาให้ตรง)
                created_at: new Date(),
            };

            // 4. ส่งข้อมูลเข้า Supabase (ใช้ Upsert ทีเดียวจบ)
            const { error } = await supabase
                .from('profiles')
                .upsert(updates);

            if (error) {
                throw error; // ถ้ามี error ให้เด้งไปที่ catch
            }

            // 5. ถ้าสำเร็จ ให้แจ้งเตือนและเปลี่ยนหน้า
            Alert.alert("Success", "Profile saved successfully!", [
                {
                    text: "OK",
                    onPress: () => {
                        // สั่งเปลี่ยนหน้าไป onComplete ถ้าออกแบบไว้ หรือกลับหน้าเดิม
                        if (onComplete) {
                            onComplete();
                        } else if (onBack) {
                            onBack();
                        }
                    }
                }
            ]);

        } catch (error) {
            // 6. ถ้าพัง ให้แจ้งเตือน
            Alert.alert("Error Saving Profile", error.message);
        } finally {
            // 7. หยุดหมุน
            setSaving(false);
        }
    };

    const pickAvatarImage = async () => {
        try {
            let result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
                base64: true,
            });

            if (!result.canceled) {
                handleSaveImage(result.assets[0].uri, result.assets[0].base64);
            }
        } catch (e) {
            console.log("Error picking avatar:", e);
            Alert.alert("Error", "Could not access image library.");
        }
    };

    const handleSaveImage = async (uri, base64) => {
        if (!session?.user?.id) return;

        setUploadingAvatar(true);

        try {
            let uploadedUrl = "";
            const fileName = `avatars/${session.user.id}_${Date.now()}.jpg`;

            if (base64) {
                const arrayBuffer = decode(base64);

                const { data, error: uploadError } = await supabase.storage
                    .from('posts') // Reusing 'posts' bucket as observed in CommunityProfile.js
                    .upload(fileName, arrayBuffer, {
                        contentType: 'image/jpeg',
                        upsert: true
                    });

                if (uploadError) throw uploadError;

                const { data: urlData } = supabase.storage
                    .from('posts')
                    .getPublicUrl(fileName);

                uploadedUrl = urlData.publicUrl;
            }

            const { error } = await supabase
                .from('profiles')
                .update({ avatar_url: uploadedUrl })
                .eq('id', session.user.id);

            if (error) {
                throw error;
            } else {
                setAvatarUrl(uploadedUrl);
                Alert.alert("Success", "Photo updated successfully! ✨");
            }
        } catch (e) {
            console.log(`Detailed Save Error:`, e);
            Alert.alert("Error", `Failed to save image. ${e.message}`);
        } finally {
            setUploadingAvatar(false);
        }
    };

    // ฟังก์ชันจัดรูปแบบวันที่อัตโนมัติขณะพิมพ์
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
                {onBack && (
                    <View style={styles.headerRow}>
                        <TouchableOpacity onPress={onBack} style={styles.backButton}>
                            <Ionicons name="chevron-back" size={28} color="#2F6A62" />
                        </TouchableOpacity>
                    </View>
                )}

                {/* Profile Header */}
                <View style={styles.profileHeader}>
                    <TouchableOpacity
                        style={styles.profileImageContainer}
                        onPress={pickAvatarImage}
                        disabled={uploadingAvatar}
                    >
                        {avatarUrl ? (
                            <Image
                                source={{ uri: avatarUrl }}
                                style={styles.profileImage}
                            />
                        ) : (
                            <Image
                                source={require('../../assets/cioncat.jpg')}
                                style={[styles.profileImage, { opacity: 0.8 }]}
                            />
                        )}
                        {uploadingAvatar && (
                            <View style={[styles.profileImage, { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }]}>
                                <ActivityIndicator color="#fff" />
                            </View>
                        )}
                        <View style={{ position: 'absolute', bottom: 0, right: 0, backgroundColor: '#2F6A62', padding: 5, borderRadius: 15 }}>
                            <Ionicons name="camera" size={16} color="#fff" />
                        </View>
                    </TouchableOpacity>
                    <Text style={styles.profileName}>{username || 'User Name'}</Text>

                    <View style={styles.caregiverBadge}>
                        <Text style={styles.caregiverText}>TOP CAREGIVER</Text>
                    </View>
                </View>

                <Text style={styles.sectionTitle}>GENERAL INFO</Text>

                <View style={styles.contentContainer}>

                    {/* Name Input */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.labelprofile}>Name</Text>
                        <TextInput
                            style={styles.input}
                            value={username}
                            onChangeText={setUsername}
                            placeholder="Your Name"
                        />
                    </View>

                    {/* Email Input (Read Only) */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.labelprofile}>Email</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: '#e0e0e0' }]}
                            value={email}
                            editable={false}
                        />
                    </View>

                    {/* Gender Selection */}
                    <View style={[styles.inputGroup, { zIndex: 3000 }]}>
                        <Text style={styles.labelprofile}>Gender</Text>
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => setShowGenderPicker(!showGenderPicker)}
                            style={[styles.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
                        >
                            <Text
                                style={{ fontSize: 16, color: gender ? '#333' : '#999', flexShrink: 1, paddingRight: 8 }}
                                numberOfLines={1}
                                ellipsizeMode="tail"
                            >
                                {gender || "Select Gender"}
                            </Text>
                            <Text style={{ fontSize: 12, color: '#666' }}>{showGenderPicker ? "▲" : "▼"}</Text>
                        </TouchableOpacity>

                        {showGenderPicker && (
                            <View style={{ backgroundColor: '#fff', borderRadius: 10, marginTop: 5, borderWidth: 1, borderColor: '#eee', overflow: 'hidden', position: 'absolute', top: 70, left: 0, right: 0, zIndex: 4000, elevation: 5 }}>
                                {[{ label: 'Male', value: 'Male' }, { label: 'Female', value: 'Female' }, { label: 'Other', value: 'Other' }].map((item, index) => (
                                    <TouchableOpacity
                                        key={index}
                                        style={{ padding: 12, borderBottomWidth: index === 2 ? 0 : 1, borderBottomColor: '#f0f0f0' }}
                                        onPress={() => {
                                            setGender(item.value);
                                            setShowGenderPicker(false);
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

                    {/* Phone Number */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.labelprofile}>Phone Number</Text>
                        <TextInput
                            style={styles.input}
                            value={phone}
                            onChangeText={(text) => {
                                const onlyNumbers = text.replace(/[^0-9]/g, "");
                                setPhone(onlyNumbers);
                            }}
                            placeholder="Phone Number"
                            keyboardType="numeric"
                            maxLength={10}
                        />
                    </View>

                    {/* Date of Birth */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.labelprofile}>Date of birth (YYYY-MM-DD)</Text>
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => setShowDatePicker(true)}
                            style={[styles.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
                        >
                            <Text style={{ fontSize: 16, color: birthDate ? '#333' : '#999' }}>
                                {birthDate || 'Select date of birth'}
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

                    {/* Save Button */}
                    <TouchableOpacity
                        style={styles.button}
                        onPress={updateProfile}
                        disabled={saving}
                    >
                        {saving ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.buttonText}>Save Profile</Text>
                        )}
                    </TouchableOpacity>

                </View>
            </ScrollView>
        </SafeAreaView>
    );
}


