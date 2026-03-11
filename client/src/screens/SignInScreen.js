import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { styles } from './Style/authstyle';
import supabase from './config/supabaseClient';
import { View, Text, TextInput, TouchableOpacity, Image, Alert, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native';

export default function SignInScreen({ onNavigate, onForgotPassword }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const handleSignIn = async () => {
        const cleanEmail = email.trim().toLowerCase();

        if (!cleanEmail.endsWith('@gmail.com') && !cleanEmail.endsWith('@hotmail.com')) {
            Alert.alert('ข้อผิดพลาด', 'กรุณาใช้อีเมล @gmail.com หรือ @hotmail.com เท่านั้นในการเข้าสู่ระบบ');
            return;
        }

        setLoading(true);
        try {
            const { error } = await supabase.auth.signInWithPassword({
                email: cleanEmail,
                password,
            });

            if (error) {
                Alert.alert('Error', error.message);
                return;
            }

            Alert.alert('Sign In Success', `Email: ${cleanEmail}`);
        } catch (err) {
            Alert.alert('Error', 'Unable to sign in right now. Please try again.');
        } finally {
            setLoading(false);
        }
    };



    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                <StatusBar style="auto" />

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

                <View style={styles.contentContainer}>
                    <Text style={styles.title}>Welcome Back</Text>
                    <Text style={styles.subtitle}>Login to your account</Text>

                    <View style={styles.inputGroup}>
                        <View style={styles.labelRow}>
                            <Text style={styles.label}>Email</Text>
                            <Text style={styles.required}> *</Text>
                        </View>
                        <TextInput
                            style={styles.input}
                            value={email}
                            onChangeText={setEmail}
                            placeholder="Enter your email"
                            autoCapitalize="none"
                            keyboardType="email-address"
                            
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <View style={styles.labelRow}>
                            <Text style={styles.label}>Password</Text>
                            <Text style={styles.required}> *</Text>
                        </View>
                        <View style={localStyles.inputWithIconContainer}>
                            <TextInput
                                style={[styles.input, localStyles.inputWithRightIcon]}
                                value={password}
                                onChangeText={setPassword}
                                placeholder="Enter your password"
                                secureTextEntry={!showPassword}
                                autoCapitalize="none"
                            />

                            <TouchableOpacity
                                style={localStyles.eyeButton}
                                onPress={() => setShowPassword((prev) => !prev)}
                                accessibilityRole="button"
                                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                                <Ionicons
                                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                                    size={20}
                                    color="#607D8B"
                                />
                            </TouchableOpacity>
                        </View>
                    </View>
                    

                    <TouchableOpacity
                        style={{ alignSelf: 'flex-end', marginTop: 8 }}
                        onPress={onForgotPassword}
                    >
                        <Text style={{ color: '#16A085', fontWeight: '500' }}>Forgot password?</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.button} onPress={handleSignIn} disabled={loading}>
                        <Text style={styles.buttonText}>{loading ? 'Signing in...' : 'Log in'}</Text>
                    </TouchableOpacity>

                    <View style={styles.footer}>
                        <Text style={styles.footerText}>Don't have an account? </Text>
                        <TouchableOpacity onPress={onNavigate}>
                            <Text style={styles.linkText}>Sign up</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </SafeAreaView>
    );
  
}
const localStyles = StyleSheet.create({
    inputWithIconContainer: {
        width: '80%',
        alignSelf: 'center',
        justifyContent: 'center',
    },
    inputWithRightIcon: {
        width: '100%',
        alignSelf: 'stretch',
        paddingRight: 44,
    },
    eyeButton: {
        position: 'absolute',
        right: 12,
        height: 50,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
