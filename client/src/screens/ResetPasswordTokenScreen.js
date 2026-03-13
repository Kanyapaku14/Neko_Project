import React, { useEffect, useState } from 'react';
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

export default function ResetPasswordTokenScreen({ onVerified, onBack, initialEmail }) {
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!email && initialEmail) setEmail(String(initialEmail));
  }, [email, initialEmail]);

  const handleVerify = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanToken = token.trim();

    if (!cleanEmail || !cleanToken) {
      Alert.alert('Alert', 'Please enter both email and token.');
      return;
    }

    setLoading(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: cleanToken,
        type: 'recovery',
      });

      if (verifyError) {
        Alert.alert('Error', verifyError.message);
        return;
      }

      if (onVerified) onVerified(cleanEmail);
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to verify token');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="auto" />

      {onBack && (
        <TouchableOpacity style={styles.backButton} onPress={onBack} disabled={loading}>
          <Text style={styles.backText}>{'< ย้อนกลับ'}</Text>
        </TouchableOpacity>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.container}>
            <View style={styles.headerContainer}>
              <Image source={require('../../assets/cioncat.jpg')} style={styles.logoimage} />
              <Image source={require('../../assets/taxticoncat.jpg')} style={styles.textimage} />
            </View>

            <Text style={styles.title}>ยืนยัน Token</Text>
            <Text style={styles.subtitle}>กรอก Email และ Token ที่ได้รับจากอีเมล เพื่อไปตั้งรหัสผ่านใหม่</Text>

            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Email</Text>
                <Text style={styles.required}> *</Text>
              </View>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="กรอกอีเมลที่ใช้สมัคร"
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!loading}
                autoFocus
              />
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Token</Text>
                <Text style={styles.required}> *</Text>
              </View>
              <TextInput
                style={styles.input}
                value={token}
                onChangeText={setToken}
                placeholder="กรอก token จากอีเมล"
                autoCapitalize="none"
                keyboardType="default"
                textContentType="oneTimeCode"
                editable={!loading}
              />
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleVerify}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify</Text>}
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
    marginTop: 20,
    marginBottom: 28,
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
    marginBottom: 28,
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
