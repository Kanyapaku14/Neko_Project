import React, { useState } from 'react';
import {
    SafeAreaView,
    View,
    Text,
    TextInput,
    TouchableOpacity,
    Alert,
    Image,
    StyleSheet,
    ActivityIndicator,
    KeyboardAvoidingView,
    ScrollView,
    Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import supabase from './config/supabaseClient';

export default function ResetPasswordScreen({ onComplete, onBack }) {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const handleReset = async () => {
        if (!password || !confirmPassword) {
            Alert.alert('Alert', 'Please fill in all password fields.');
            return;
        }
        if (password.length < 6) {
            Alert.alert('Alert', 'Password must be at least 6 characters.');
            return;
        }
        if (password !== confirmPassword) {
            Alert.alert('Alert', 'Passwords do not match. Please check again.');
            return;
        }

        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ password });

            if (error) {
                Alert.alert('Error', error.message);
                return;
            }

            Alert.alert(
                'Success! 🎉',
                'Your password has been reset. Please sign in with your new password.',
                [{ text: 'OK', onPress: onComplete }]
            );
        } catch (err) {
            Alert.alert('Error', 'Unable to reset password. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar style="auto" />

            {/* Back Button */}
            {onBack && (
                <TouchableOpacity style={styles.backButton} onPress={onBack}>
                    <Text style={styles.backText}>{'< ย้อนกลับ'}</Text>
                </TouchableOpacity>
            )}

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
            >
                <ScrollView
                    contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                >
                    <View style={styles.container}>
                {/* Logo */}
                <View style={styles.headerContainer}>
                    <Image
                        source={require('../../assets/cioncat.jpg')}
                        style={styles.logoimage}
                    />
                    <Image
                        source={require('../../assets/taxticoncat.jpg')}
                        style={styles.textimage}
                    />
                </View>

                <Text style={styles.title}>ตั้งรหัสผ่านใหม่</Text>
                <Text style={styles.subtitle}>กรอกรหัสผ่านใหม่ที่ต้องการ (อย่างน้อย 6 ตัวอักษร)</Text>

                {/* New Password */}
                <View style={styles.inputGroup}>
                    <View style={styles.labelRow}>
                        <Text style={styles.label}>รหัสผ่านใหม่</Text>
                        <Text style={styles.required}> *</Text>
                    </View>
                    <TextInput
                        style={styles.input}
                        value={password}
                        onChangeText={setPassword}
                        placeholder="กรอกรหัสผ่านใหม่"
                        secureTextEntry={!showPassword}
                        editable={!loading}
                    />
                </View>

                {/* Confirm Password */}
                <View style={styles.inputGroup}>
                    <View style={styles.labelRow}>
                        <Text style={styles.label}>ยืนยันรหัสผ่านใหม่</Text>
                        <Text style={styles.required}> *</Text>
                    </View>
                    <TextInput
                        style={styles.input}
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        placeholder="กรอกรหัสผ่านอีกครั้ง"
                        secureTextEntry={!showPassword}
                        editable={!loading}
                    />
                </View>

                {/* Show/Hide Password toggle */}
                <TouchableOpacity
                    style={styles.showPasswordRow}
                    onPress={() => setShowPassword(!showPassword)}
                >
                    <Text style={styles.showPasswordText}>
                        {showPassword ? '🙈 ซ่อนรหัสผ่าน' : '👁 แสดงรหัสผ่าน'}
                    </Text>
                </TouchableOpacity>

                {/* Submit */}
                <TouchableOpacity
                    style={[styles.button, loading && styles.buttonDisabled]}
                    onPress={handleReset}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.buttonText}>ยืนยันรหัสผ่านใหม่</Text>
                    )}
                </TouchableOpacity>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#fff',
    },
    backButton: {
        paddingHorizontal: 24,
        paddingTop: 16,
        paddingBottom: 8,
    },
    backText: {
        fontSize: 15,
        color: '#16A085',
        fontWeight: '500',
    },
    container: {
        flex: 1,
        backgroundColor: '#fff',
        paddingHorizontal: 24,
    },
    headerContainer: {
        alignItems: 'center',
        marginTop: 40,
        marginBottom: 32,
    },
    logoimage: {
        width: 100,
        height: 100,
        marginBottom: 1,
        resizeMode: 'contain',
    },
    textimage: {
        width: 120,
        height: 12,
        marginTop: 1,
        resizeMode: 'contain',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#000',
        marginBottom: 8,
        width: '80%',
        alignSelf: 'center',
    },
    subtitle: {
        fontSize: 14,
        color: '#666',
        marginBottom: 32,
        width: '80%',
        alignSelf: 'center',
        lineHeight: 22,
    },
    inputGroup: {
        marginBottom: 20,
    },
    labelRow: {
        flexDirection: 'row',
        marginBottom: 8,
        width: '80%',
        alignSelf: 'center',
    },
    label: {
        fontSize: 14,
        fontWeight: '500',
        color: '#333',
    },
    required: {
        color: '#ff0000',
        fontSize: 14,
    },
    input: {
        width: '80%',
        height: 50,
        borderWidth: 1,
        borderColor: '#E0E0E0',
        borderRadius: 12,
        paddingHorizontal: 16,
        fontSize: 16,
        backgroundColor: '#F9F9F9',
        color: '#333',
        alignSelf: 'center',
    },
    showPasswordRow: {
        width: '80%',
        alignSelf: 'center',
        marginBottom: 28,
    },
    showPasswordText: {
        fontSize: 13,
        color: '#16A085',
    },
    button: {
        backgroundColor: '#1E1E1E',
        height: 56,
        borderRadius: 160,
        alignItems: 'center',
        width: 300,
        justifyContent: 'center',
        marginBottom: 16,
        alignSelf: 'center',
    },
    buttonDisabled: {
        backgroundColor: '#999',
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
});
