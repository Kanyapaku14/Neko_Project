import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './Style/authstyle';
import supabase from './config/supabaseClient'; 
import { View, Text, TextInput, TouchableOpacity, Image, Alert, ActivityIndicator, SafeAreaView, StyleSheet } from 'react-native'; 

export default function SignUpScreen({ onNavigate }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [agree, setAgree] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const handleSignUp = async () => {
        // 1. เช็คความถูกต้อง
        if(!agree) {
            Alert.alert("ข้อผิดพลาด", "กรุณายอมรับเงื่อนไข (Terms & Privacy)");
            return;
        }
        if (!email || !password) {
            Alert.alert("ข้อผิดพลาด", "กรุณากรอกข้อมูลให้ครบถ้วน");
            return;
        }

        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail.endsWith('@gmail.com') && !cleanEmail.endsWith('@hotmail.com')) {
            Alert.alert("ข้อผิดพลาด", "กรุณาใช้อีเมล @gmail.com หรือ @hotmail.com เท่านั้นในการสมัครสมาชิก");
            return;
        }

        setLoading(true); // เริ่มหมุน


        try {
            // 2. ส่งข้อมูลไป Supabase (ต้องอยู่ภายในฟังก์ชัน async นี้)
            if (!confirmPassword) {
                Alert.alert("Error", "Please confirm your password.");
                return;
            }
            if (password !== confirmPassword) {
                Alert.alert("Error", "Passwords do not match.");
                return;
            }

            const { data, error } = await supabase.auth.signUp({
                email: cleanEmail,
                password: password,
            });

            if (error) {
                Alert.alert("ERROR", error.message);
                return;
            }

            if (data?.user) {
                // 2.1 สร้าง record ในตาราง profiles
                const { error: profileError } = await supabase
                    .from('profiles')
                    .insert([
                        { 
                            id: data.user.id,
                            email: cleanEmail,
                            // other fields will be null/default strictly based on DB schema defaults 
                            // or we can add empty strings if needed, but null is usually better for "not set"
                        }
                    ]);

                if (profileError) {
                    console.log('Error creating profile:', profileError);
                    // เราอาจจะไม่ block user ตรงนี้ แต่เเจ้งเตือนหรือ log ไว้
                }

                Alert.alert("SUCCESS", "Registration Success! Please login.");
            }
        } catch (err) {
            Alert.alert("ERROR", "Something went wrong.");
        } finally {
            setLoading(false); // หยุดหมุนไม่ว่าจะสำเร็จหรือล้มเหลว
        }
    };




    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                <StatusBar style="auto" />

                <View style={styles.headerContainer}>
                    <Image
                        source={require('../../assets/cioncat.jpg')}
                        style={styles.logoimage} />
                    <Image
                        source={require('../../assets/taxticoncat.jpg')}
                        style={styles.textimage} />
                </View>

                <View style={styles.contentContainer}>
                    <Text style={styles.title}>Create an account</Text>
                    <Text style={styles.subtitle}>Enter your personal data to create your account</Text>

                    {/* Email Input */}
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

                    {/* Password Input */}
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
                                textContentType="newPassword"
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

                    {/* Confirm Password Input */}
                    <View style={styles.inputGroup}>
                        <View style={styles.labelRow}>
                            <Text style={styles.label}>Confirm Password</Text>
                            <Text style={styles.required}> *</Text>
                        </View>
                        <View style={localStyles.inputWithIconContainer}>
                            <TextInput
                                style={[styles.input, localStyles.inputWithRightIcon]}
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                placeholder="Confirm your password"
                                secureTextEntry={!showConfirmPassword}
                                autoCapitalize="none"
                                textContentType="newPassword"
                            />
                            <TouchableOpacity
                                style={localStyles.eyeButton}
                                onPress={() => setShowConfirmPassword((prev) => !prev)}
                                accessibilityRole="button"
                                accessibilityLabel={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                                <Ionicons
                                    name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                                    size={20}
                                    color="#607D8B"
                                />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Terms Checkbox */}
                    <View style={styles.checkboxContainer}>
                        <TouchableOpacity
                            style={[styles.checkbox, agree && styles.checkboxChecked]}
                            onPress={() => setAgree(!agree)}
                        >
                            {agree && <View style={styles.checkboxInner} />}
                        </TouchableOpacity>
                        <Text style={styles.checkboxLabel}>
                            I agree to the <Text style={styles.linkText}>Terms</Text> and <Text style={styles.linkText}>Privacy policy</Text>
                        </Text>
                    </View>

                    {/* Sign Up Button */}
                    <TouchableOpacity 
                        style={styles.button} 
                        onPress={handleSignUp}
                        disabled={loading} // ป้องกันการกดซ้ำ
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.buttonText}>Sign up</Text>
                        )}
                    </TouchableOpacity>

                    {/* Login Link */}
                    <View style={styles.footer}>
                        <Text style={styles.footerText}>Already have an account? </Text>
                        <TouchableOpacity onPress={onNavigate}>
                            <Text style={styles.linkText}>Login</Text>
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

