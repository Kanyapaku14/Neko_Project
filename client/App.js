import 'react-native-gesture-handler';
import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
// Import SafeAreaProvider here
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SignInScreen from './src/screens/SignInScreen';
import SignUpScreen from './src/screens/SignUpScreen';
import ProfileScreen from './src/screens/profileScreen';
import CatProfile from './src/screens/catprofile';
import UserInfoScreen from './src/screens/UserInfoScreen';
import supabase from './src/screens/config/supabaseClient';
import Dashboard from './src/screens/Dashbord';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 1. Import the LogDailyNormal file
import LogDailyNormal from './src/screens/LogDailyNormal';
import HomeScreen from './src/screens/HomeScreen'; // อย่าลืม Import Home ด้วยถ้าจะใช้
import CalendarScreen from './src/screens/CalendarScreen';
import ResultScreen from './src/screens/ResultScreen';
import TimelineScreen from './src/screens/TimelineScreen'; // Import TimelineScreen
// import AssessmentScreen, HomeScreenOld... (Import หน้าอื่นๆ ตามที่มีในโปรเจกต์จริง)

import CameraScreen from './src/screens/CameraScreen';
import GalleryScreen from './src/screens/GalleryScreen';
import SetcameraScreen from './src/screens/SetcameraScreen';
import PhotoCheck from './src/screens/PhotoCheck';
import AnalysisResult from './src/screens/AnalysisResult';
import Phone from './src/screens/Phone';
import SettingScreen from './src/screens/SettingScreen';
import MainTabNavigator from './src/screens/MainTabNavigator';
import CommunityScreen from './src/screens/CommunityScreen';
import RankingScreen from './src/screens/RankingScreen';
import CommunityProfile from './src/screens/CommunityProfile';
import { GlobalAlertQueueProvider } from './src/services/GlobalAlertQueue';
import AlertScreen from './src/screens/AlertScreen';
import EventDetailScreen from './src/screens/EventDetailScreen';

import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_700Bold,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_300Light
} from '@expo-google-fonts/inter';
import { Poppins_400Regular } from '@expo-google-fonts/poppins';

export default function App() {
  const [fontsLoaded] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-Bold': Inter_700Bold,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Light': Inter_300Light,
    'Poppins-Regular': Poppins_400Regular,
  });

  const [currentScreen, setCurrentScreen] = useState('SignIn');
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authScreen, setAuthScreen] = useState('Home');
  const [catId, setCatId] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false); // ✅ Track if checking profile
  const [hasSeenCameraIntro, setHasSeenCameraIntro] = useState(null); // null until loaded

  // Fix Logout: Should actually sign out
  const handleSignOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setSession(null);
    setAuthScreen('Home'); // Reset for next login
    setCurrentScreen('SignIn');
    setLoading(false);
  };
  const navigateToSignIn = () => {
    handleSignOut(); // Logout if navigating to SignIn
  };
  const navigateToSignUp = () => setCurrentScreen('SignUp');

  const navigateToLogDaily = () => setAuthScreen('LogDaily');
  const navigateToHome = () => setAuthScreen('Home');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        supabase.auth.signOut();
        setSession(null);
      } else {
        setSession(session);
        if (session) checkUserProfileStatus(session); // Check if new user
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        checkUserProfileStatus(session);
      } else {
        setAuthScreen('Home'); // Reset
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // Load camera intro status
    const loadCameraStatus = async () => {
      try {
        const value = await AsyncStorage.getItem('hasSeenCameraIntro');
        setHasSeenCameraIntro(value === 'true');
      } catch (e) {
        setHasSeenCameraIntro(false);
      }
    };
    loadCameraStatus();
  }, []);

  // Check if user has profile and cat
  const checkUserProfileStatus = async (session) => {
    if (!session?.user) return;

    try {
      setProfileLoading(true); // Start check
      // 1. Check Profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (profileError || !profile || !profile.name) {
        setAuthScreen('Profile'); // Go to Profile fill
        return;
      }

      // 2. Check Cat
      const { data: cat, error: catError } = await supabase
        .from('cats')
        .select('id')
        .eq('owner_id', session.user.id)
        .limit(1)
        .single();

      if (catError || !cat) {
        setAuthScreen('CatProfile'); // Go to Cat Profile
        return;
      }

      setCatId(cat.id); // ✅ Save catId

      // If all good, explicitly set to Home
      setAuthScreen('Home');
    } catch (err) {
      console.log("Check status error:", err);
    } finally {
      setProfileLoading(false);
    }
  };


  if (!fontsLoaded || loading || (session && profileLoading)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#00695C" />
      </View>
    );
  }

  // --- Helper function to render screens ---
  const renderScreen = () => {
    // 1. Session based (if logged in)
    if (session) {
      // screen can be string or object { screen, params }
      const currentScreenName = typeof authScreen === 'object' ? authScreen.screen : authScreen;
      const screenParams = typeof authScreen === 'object' ? authScreen.params : {};

      if (currentScreenName === 'CatProfile') {
        return (
          <CatProfile
            session={session}
            catId={screenParams?.catId || null}
            onBack={() => setAuthScreen('Setting')}
            onNavigateToHome={() => setAuthScreen('Home')}
          />
        );
      }
      if (currentScreenName === 'Profile' || currentScreenName === 'EditProfile') {
        return (
          <ProfileScreen
            session={session}
            onBack={() => setAuthScreen('Setting')}
            onNavigateToCatProfile={() => setAuthScreen('CatProfile')}
          />
        );
      }
      if (currentScreenName === 'UserInfo') {
        return <UserInfoScreen
          session={session}
          catId={catId}
          onLogout={handleSignOut}
          onMissingProfile={() => setAuthScreen('Profile')}
          onBack={() => setAuthScreen('Home')}
        />;
      }
      if (currentScreenName === 'Setting') {
        return <SettingScreen
          session={session}
          onNavigate={(screen, params) => setAuthScreen(params ? { screen, params } : screen)}
          onLogout={handleSignOut}
          onBack={() => setAuthScreen('Home')}
        />;
      }
      if (currentScreenName === 'LogDaily') {
        return <LogDailyNormal
          session={session}
          onBack={() => setAuthScreen('Home')}
          initialDate={screenParams?.date || null}
        />;
      }
      if (currentScreenName === 'Calendar') {
        return <CalendarScreen
          session={session}
          onNavigate={(screen) => setAuthScreen(screen)}
        />;
      }
      if (currentScreenName === 'Result') {
        return <ResultScreen
          onBack={() => setAuthScreen('Home')}
          onSave={() => setAuthScreen('Home')}
          onNavigate={(screen) => setAuthScreen(screen)}
        />;
      }
      if (currentScreenName === 'Overview') {
        return <Dashboard
          session={session}
          onBack={() => setAuthScreen('Home')}
          onNavigate={(screen) => setAuthScreen(screen)}
        />;
      }
      if (currentScreenName === 'MainTabNavigator') {
        return <MainTabNavigator
          session={session}
          onBack={() => setAuthScreen('Home')}
          onNavigate={(screen) => setAuthScreen(screen)}
        />;
      }
      if (currentScreenName === 'Community') {
        return <CommunityScreen
          session={session}
          onBack={() => setAuthScreen('MainTabNavigator')}
          onNavigate={(screen, params) => setAuthScreen(params ? { screen, params } : screen)}
        />;
      }
      if (currentScreenName === 'Ranking') {
        return <RankingScreen
          session={session}
          onBack={() => setAuthScreen('MainTabNavigator')}
          onNavigate={(screen, params) => setAuthScreen(params ? { screen, params } : screen)}
        />;
      }
      if (currentScreenName === 'CommunityProfile') {
        return <CommunityProfile
          session={session}
          userId={screenParams?.userId}
          onBack={() => setAuthScreen('MainTabNavigator')}
          onNavigate={(screen, params) => setAuthScreen(params ? { screen, params } : screen)}
        />;
      }
      if (currentScreenName === 'Camera') {
        return <CameraScreen session={session} onNavigate={(screen, params) => setAuthScreen(params ? { screen, params } : screen)} />;
      }
      if (currentScreenName === 'Gallery') {
        return <GalleryScreen session={session} onBack={() => setAuthScreen('Camera')} onNavigate={(screen, params) => setAuthScreen(params ? { screen, params } : screen)} />;
      }
      if (currentScreenName === 'Setcamera') {
        return <SetcameraScreen session={session} onNavigate={(screen, params) => setAuthScreen(params ? { screen, params } : screen)} />;
      }
      if (currentScreenName === 'PhotoCheck') {
        return <PhotoCheck onNavigate={(screen) => setAuthScreen(screen)} />;
      }
      if (currentScreenName === 'AnalysisResult') {
        return <AnalysisResult onNavigate={(screen) => setAuthScreen(screen)} session={session} />;
      }
      if (currentScreenName === 'Alert') {
        return <AlertScreen onBack={() => setAuthScreen('Camera')} onNavigate={(screen, params) => setAuthScreen(params ? { screen, params } : screen)} />;
      }
      if (currentScreenName === 'EventDetail') {
        return <EventDetailScreen onBack={() => setAuthScreen('Alert')} alertData={screenParams?.alertData} />;
      }

      // Dashboard Screen
      if (authScreen === 'Dashboard') {
        return <Dashboard
          session={session}
          onBack={() => setAuthScreen('Home')}
          onNavigate={(screen) => setAuthScreen(screen)}
        />;
      }

      // Timeline Screen
      if (authScreen === 'Timeline') {
        return <TimelineScreen
          session={session}
          onBack={() => setAuthScreen('Dashboard')}
        />;
      }

      if (currentScreenName === 'Phone') {
        return (
          <Phone
            session={session}
            initialStep={screenParams?.initialStep}
            onBack={() => setAuthScreen('Setting')}
            onConfirm={() => setAuthScreen('Camera')}
          />
        );
      }
      // Default Home
      return <HomeScreen
        onLogout={handleSignOut}
        onLogDaily={() => setAuthScreen('LogDaily')}
        onAssess={() => setAuthScreen('Result')}
        onSetting={() => setAuthScreen('Setting')}
        onNavigate={(screen) => setAuthScreen(screen)}
      />;
    }

    // 2. Guest/SignIn flow
    return (
      <>
        {currentScreen === 'SignIn' && (
          <SignInScreen onNavigate={navigateToSignUp} />
        )}
        {currentScreen === 'SignUp' && (
          <SignUpScreen onNavigate={navigateToSignIn} />
        )}
      </>
    );
  };


  // Wrap everything with SafeAreaProvider here
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <GlobalAlertQueueProvider session={session}>
          {renderScreen()}
        </GlobalAlertQueueProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
