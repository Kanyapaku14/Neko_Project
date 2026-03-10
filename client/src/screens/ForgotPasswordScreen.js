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
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import supabase from './config/supabaseClient';

export default function ForgotPasswordScreen({ onBack }) {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);

    const handleSendReset = async () => {
        const cleanEmail = email.trim().toLowerCase();

        if (!cleanEmail) {
            Alert.alert('แจ้งเตือน', 'กรุณากรอกอีเมล');
            return;
        }
        if (!cleanEmail.endsWith('@gmail.com') && !cleanEmail.endsWith('@hotmail.com')) {
            Alert.alert('แจ้งเตือน', 'กรุณาใช้อีเมลที่ลงท้ายด้วย @gmail.com หรือ @hotmail.com เท่านั้น');
            return;
        }

        setLoading(true);
        try {
            // Linking.createURL generates:
            //   Expo Go  → exp://192.168.x.x:8081/--/reset-password
            //   Standalone build → nekoapp://reset-password
            const redirectTo = Linking.createURL('reset-password');
            const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
                redirectTo,
            });

            if (error) {
                Alert.alert('Error', error.message);
                return;
            }

            setSent(true);
        } catch (err) {
            Alert.alert('Error', 'ไม่สามารถส่งอีเมลได้ กรุณาลองใหม่อีกครั้ง');
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar style="auto" />

            {/* Back Button */}
            <TouchableOpacity style={styles.backButton} onPress={onBack}>
                <Text style={styles.backText}>{'< ย้อนกลับ'}</Text>
            </TouchableOpacity>

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

                {!sent ? (
                    <>
                        <Text style={styles.title}>ลืมรหัสผ่าน?</Text>
                        <Text style={styles.subtitle}>
                            กรอกอีเมลของคุณ เราจะส่งลิงก์สำหรับรีเซ็ตรหัสผ่านให้
                        </Text>

                        <View style={styles.inputGroup}>
                            <View style={styles.labelRow}>
                                <Text style={styles.label}>Email</Text>
                                <Text style={styles.required}> *</Text>
                            </View>
                            <TextInput
                                style={styles.input}
                                value={email}
                                onChangeText={setEmail}
                                placeholder="กรอกอีเมลของคุณ"
                                autoCapitalize="none"
                                keyboardType="email-address"
                                autoFocus
                            />
                        </View>

                        <TouchableOpacity
                            style={[styles.button, loading && styles.buttonDisabled]}
                            onPress={handleSendReset}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.buttonText}>ส่งลิงก์รีเซ็ตรหัสผ่าน</Text>
                            )}
                        </TouchableOpacity>
                    </>
                ) : (
                    /* Success State */
                    <View style={styles.successContainer}>
                        <Text style={styles.successIcon}>📧</Text>
                        <Text style={styles.title}>ส่งอีเมลสำเร็จ!</Text>
                        <Text style={styles.subtitle}>
                            ระบบส่งลิงก์รีเซ็ตรหัสผ่านไปที่{'\n'}
                            <Text style={styles.emailHighlight}>{email}</Text>
                            {'\n\n'}กรุณาตรวจสอบอีเมลของคุณ แล้วกดลิงก์เพื่อตั้งรหัสผ่านใหม่
                        </Text>

                        <TouchableOpacity style={styles.button} onPress={onBack}>
                            <Text style={styles.buttonText}>กลับหน้า Sign In</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.resendButton}
                            onPress={() => setSent(false)}
                        >
                            <Text style={styles.resendText}>ส่งอีเมลอีกครั้ง</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
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
        marginTop: 20,
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
        marginBottom: 28,
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
    // Success State
    successContainer: {
        alignItems: 'center',
    },
    successIcon: {
        fontSize: 64,
        marginBottom: 16,
        alignSelf: 'center',
    },
    emailHighlight: {
        color: '#16A085',
        fontWeight: '600',
    },
    resendButton: {
        padding: 12,
    },
    resendText: {
        color: '#16A085',
        fontWeight: '500',
        textDecorationLine: 'underline',
        fontSize: 14,
    },
});
