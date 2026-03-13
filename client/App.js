import 'react-native-gesture-handler';
import React, { useState, useEffect, useRef } from 'react';
import { View, ActivityIndicator, AppState, Alert as RNAlert } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
// Import SafeAreaProvider here
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppAlertHost from './src/components/AppAlertHost';
import { alert as appAlert } from './src/services/AppAlert';

import SignInScreen from './src/screens/SignInScreen';
import SignUpScreen from './src/screens/SignUpScreen';
import ProfileScreen from './src/screens/profileScreen';
import CatProfile from './src/screens/catprofile';
import UserInfoScreen from './src/screens/UserInfoScreen';
import supabase from './src/screens/config/supabaseClient';
import Dashboard from './src/screens/Dashbord';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import ResetPasswordScreen from './src/screens/ResetPasswordScreen';
import ResetPasswordTokenScreen from './src/screens/ResetPasswordTokenScreen';
import Nekocare from './src/screens/Nekocare';

// 1. Import the LogDailyNormal file
import LogDailyNormal from './src/screens/LogDailyNormal';
import AddMedical from './src/screens/AddMedical';
import HomeScreen from './src/screens/HomeScreen';
import HomeScreenNew from './src/screens/HomeScreenNew';
import CalendarScreen from './src/screens/CalendarScreen';
import ResultScreen from './src/screens/ResultScreen';
import TimelineScreen from './src/screens/TimelineScreen'; // Import TimelineScreen
import Tutorail from './src/screens/Tutorail';
import AssessmentGallery from './src/screens/AssessmentGallery';
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
import AlertRepository from './src/services/AlertRepository';
import NotificationService from './src/services/NotificationService';
import AlertEngine from './src/services/AlertEngine';
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
import { Itim_400Regular } from '@expo-google-fonts/itim';

// Replace native Alert.alert with a custom minimal modal (global)
// หมายเหตุ: Alert.alert ของ RN ปรับ UI ไม่ได้ จึงครอบด้วย custom modal เพื่อให้สวยและคุมธีมทั้งแอป
RNAlert.alert = appAlert;

export default function App() {
  const [fontsLoaded] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-Bold': Inter_700Bold,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Light': Inter_300Light,
    'Poppins-Regular': Poppins_400Regular,
    'Itim-Regular': Itim_400Regular,
  });

  const [currentScreen, setCurrentScreen] = useState('Welcome');
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authScreen, setAuthScreen] = useState('Home');
  const [catId, setCatId] = useState(null);

  const [resetPasswordMode, setResetPasswordMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
<<<<<<< HEAD
=======
  const [resetPasswordStep, setResetPasswordStep] = useState('token'); // token -> new
  const [resetReturnTo, setResetReturnTo] = useState('SignIn');
>>>>>>> 4214cd69c179a9027f7487717ea782645aafbd56
  const [catName, setCatName] = useState(null); // ✅ เพิ่ม state สำหรับชื่อแมว
  const [profileLoading, setProfileLoading] = useState(false); // ✅ Track if checking profile
  const [hasSeenCameraIntro, setHasSeenCameraIntro] = useState(null); // null until loaded
  const notificationResponseSubRef = useRef(null);
  const resetPasswordModeRef = useRef(false);

  useEffect(() => {
    resetPasswordModeRef.current = resetPasswordMode;
  }, [resetPasswordMode]);

  const exitResetFlow = async (targetScreen = 'SignIn') => {
    setResetPasswordMode(false);
    setResetPasswordStep('token');
    setResetEmail('');
    setSession(null);
    try {
      await supabase.auth.signOut();
    } catch { }
    setCurrentScreen(targetScreen);
  };

  // Fix Logout: Should actually sign out
  const handleSignOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setSession(null);
    setAuthScreen('Home'); // Reset for next login
    setCurrentScreen('Welcome');
    setLoading(false);
  };
  const navigateToSignIn = () => {
    handleSignOut(); // Logout if navigating to SignIn
  };
  const navigateToSignUp = () => setCurrentScreen('SignUp');

  const navigateToLogDaily = () => setAuthScreen('LogDaily');
  const navigateToHome = () => setAuthScreen('Home');
  const getCurrentAuthScreenName = () => (typeof authScreen === 'object' ? authScreen.screen : authScreen);
  const navigateAuth = (screen, params) => {
    const targetScreen = typeof screen === 'object' ? screen?.screen : screen;
    const targetParams = typeof screen === 'object' ? (screen?.params || params) : params;
    if (!targetScreen) return;

    if (targetScreen === 'Alert') {
      const current = getCurrentAuthScreenName();
      const currentParams = typeof authScreen === 'object' ? authScreen.params : {};
      const baseReturnTo =
        targetParams?.returnTo ||
        (current === 'Alert' ? currentParams?.returnTo : current) ||
        'Camera';
      const computedReturnTo = baseReturnTo === 'Setcamera' ? 'Camera' : baseReturnTo;
      setAuthScreen({
        screen: 'Alert',
        params: { ...(targetParams || {}), returnTo: computedReturnTo },
      });
      return;
    }

    if (targetScreen === 'Setting') {
      const current = getCurrentAuthScreenName();
      const currentParams = typeof authScreen === 'object' ? authScreen.params : {};
      const baseReturnTo =
        targetParams?.returnTo ||
        (current === 'Setting' ? currentParams?.returnTo : current) ||
        'Home';
      const computedReturnTo = baseReturnTo === 'Setcamera' ? 'Camera' : baseReturnTo;
      setAuthScreen({
        screen: 'Setting',
        params: { ...(targetParams || {}), returnTo: computedReturnTo },
      });
      return;
    }

    setAuthScreen(targetParams ? { screen: targetScreen, params: targetParams } : targetScreen);
  };

  const clearStaleAuthSession = async () => {
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (_) { }
    try {
      const keys = await AsyncStorage.getAllKeys();
      const staleAuthKeys = keys.filter((k) => k.includes('supabase') || k.includes('-auth-token') || k.startsWith('sb-'));
      if (staleAuthKeys.length > 0) {
        await AsyncStorage.multiRemove(staleAuthKeys);
      }
    } catch (_) { }
    setSession(null);
    setAuthScreen('Home');
    setCurrentScreen('Welcome');
  };

  useEffect(() => {
    const handleSessionBootstrap = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          const msg = String(error?.message || '');
          if (msg.includes('Invalid Refresh Token') || msg.includes('Refresh Token Not Found')) {
            await clearStaleAuthSession();
          } else {
            setSession(null);
          }
        } else {
          setSession(session || null);
          if (session) checkUserProfileStatus(session);
        }
      } finally {
        setLoading(false);
      }
    };

    handleSessionBootstrap();

    const appStateSub = AppState.addEventListener('change', async (state) => {
      if (state === 'active') {
        supabase.auth.startAutoRefresh();
        await NotificationService.markUserActiveNow();
      } else {
        supabase.auth.stopAutoRefresh();
        await NotificationService.scheduleInactivityReminder();
      }
    });


    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Handle password recovery deep link
      if (_event === 'PASSWORD_RECOVERY') {
        setSession(session);
        setResetPasswordMode(true);
        setResetPasswordStep('new');
        setResetReturnTo('SignIn');
        setResetEmail(String(session?.user?.email || ''));
        setLoading(false);
        return;
      }

      setSession(session);
      if (resetPasswordModeRef.current) return;
      if (session) {
        checkUserProfileStatus(session);
      } else {
        setAuthScreen('Home'); // Reset
      }
    });

    return () => {
      subscription.unsubscribe();
      appStateSub?.remove?.();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribeNotification = () => { };
    const bootstrapNotifications = async () => {
      await NotificationService.init();
      if (session?.user?.id) {
        await NotificationService.setScope(session.user.id);
      } else {
        await NotificationService.setScope('anonymous');
      }
      await NotificationService.markUserActiveNow();
      await NotificationService.maybeSendCatchupReminder();

      const initialTarget = await NotificationService.getInitialNotificationTarget();
      if (!cancelled && initialTarget && session?.user?.id) {
        navigateAuth(String(initialTarget));
      }

      unsubscribeNotification = NotificationService.registerNavigationListener((target) => {
        if (!session?.user?.id) return;
        navigateAuth(target);
      });
      notificationResponseSubRef.current = { remove: unsubscribeNotification };
    };

    bootstrapNotifications();
    return () => {
      cancelled = true;
      notificationResponseSubRef.current?.remove?.();
      notificationResponseSubRef.current = null;
      NotificationService.dispose();
    };
  }, [session?.user?.id]);

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

  useEffect(() => {
    let cancelled = false;
    const syncAlerts = async () => {
      AlertRepository.init();
      const scope = session?.user?.id || 'anonymous';
      await AlertEngine.setScope(scope);
      if (cancelled) return;
      NotificationService.setScope(scope);
      if (session?.user?.id) {
        await AlertRepository.syncFromRemote();
      }
    };
    syncAlerts();
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  // Check if user has profile and cat
  const checkUserProfileStatus = async (session, skipNavigation = false) => {
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
        if (!skipNavigation) setAuthScreen({ screen: 'Profile', params: { isFirstTime: true } }); // Go to Profile fill first
        return;
      }

      // 2. Check Cat
      const { data: cat, error: catError } = await supabase
        .from('cats')
        .select('id, name') // ✅ ดึงชื่อแมวมาด้วย
        .eq('owner_id', session.user.id)
        .limit(1)
        .single();

      if (catError || !cat) {
        if (!skipNavigation) setAuthScreen({ screen: 'CatProfile', params: { isFirstTime: true } }); // Go to Cat Profile
        return;
      }

      setCatId(cat.id); // ✅ Save catId
      setCatName(cat.name); // ✅ Save catName

      // If all good, explicitly set to Home, unless skipping
      if (!skipNavigation) setAuthScreen('Home');
    } catch (err) {
      console.log("Check status error:", err);
    } finally {
      setProfileLoading(false);
    }
  };


  if (!fontsLoaded || loading || (session && profileLoading)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5fffdff' }}>
        <ActivityIndicator size="large" color="#00695C" />
      </View>
    );
  }

  const renderScreen = () => {
<<<<<<< HEAD
    // Reset password mode (arrived via deep link from email)
    // Note: in token-based reset flow, `verifyOtp` creates a session. We must keep showing this screen even if session exists.
    if (resetPasswordMode) {
      return (
        <ResetPasswordScreen
          initialEmail={resetEmail}
          onComplete={() => {
            setResetPasswordMode(false);
            setSession(null);
            supabase.auth.signOut();
            setCurrentScreen('SignIn');
          }}
        />
      );
    }

    if (currentScreen === 'ResetPassword') {
      return (
        <ResetPasswordScreen
          initialEmail={resetEmail}
          onBack={() => setCurrentScreen('ForgotPassword')}
          onComplete={() => {
            setResetPasswordMode(false);
            setResetEmail('');
            setSession(null);
            supabase.auth.signOut();
            setCurrentScreen('SignIn');
          }}
=======
    // Reset password flow (token-based OR arrived via deep link)
    // Note: in token-based reset flow, `verifyOtp` creates a session. Keep showing this flow even if session exists.
    if (resetPasswordMode) {
      if (resetPasswordStep === 'token') {
        return (
          <ResetPasswordTokenScreen
            initialEmail={resetEmail}
            onBack={() => exitResetFlow(resetReturnTo)}
            onVerified={(email) => {
              setResetEmail(String(email || ''));
              setResetPasswordStep('new');
            }}
          />
        );
      }

      return (
        <ResetPasswordScreen
          onBack={() => setResetPasswordStep('token')}
          onComplete={() => exitResetFlow('SignIn')}
>>>>>>> 4214cd69c179a9027f7487717ea782645aafbd56
        />
      );
    }

    // 1. Session based (if logged in)
    if (session) {
      // screen can be string or object { screen, params }
      const currentScreenName = typeof authScreen === 'object' ? authScreen.screen : authScreen;
      const screenParams = typeof authScreen === 'object' ? authScreen.params : {};

      if (currentScreenName === 'CatProfile') {
        const isFirstTime = screenParams?.isFirstTime;
        return (
          <CatProfile
            session={session}
            catId={screenParams?.catId || null}
            onBack={isFirstTime ? () => setAuthScreen({ screen: 'Profile', params: { isFirstTime: true } }) : () => setAuthScreen('Setting')}
            onNavigateToHome={async (newCatId) => {
              // Update local state early so checkUserProfileStatus doesn't fail later
              if (newCatId) setCatId(newCatId);
              // Run the check without navigation to update other local state
              await checkUserProfileStatus(session, true);

              if (isFirstTime) {
                setAuthScreen('Tutorail');
              } else {
                setAuthScreen('Home');
              }
            }}
          />
        );
      }
      if (currentScreenName === 'Profile' || currentScreenName === 'EditProfile') {
        const isFirstTime = screenParams?.isFirstTime;
        return (
          <ProfileScreen
            session={session}
            onBack={isFirstTime ? undefined : () => setAuthScreen('Setting')}
            onNavigateToCatProfile={() => setAuthScreen({ screen: 'CatProfile', params: { isFirstTime: true } })}
            onComplete={() => {
              if (isFirstTime) {
                setAuthScreen({ screen: 'CatProfile', params: { isFirstTime: true } });
              } else {
                setAuthScreen('Setting');
              }
            }}
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
          onNavigate={(screen, params) => navigateAuth(screen, params)}
          onLogout={handleSignOut}
          onBack={() => setAuthScreen(screenParams?.returnTo || 'Home')}
        />;
      }
      if (currentScreenName === 'LogDaily') {
        return <LogDailyNormal
          session={session}
          catId={screenParams?.catId || catId}
          catName={screenParams?.catName || catName}
          onBack={() => setAuthScreen('Calendar')}
          onNavigate={(screen, params) => navigateAuth(screen, params)}
          initialDate={screenParams?.date || null}
        />;
      }
      if (currentScreenName === 'AddMedical') {
        return <AddMedical
          navigation={{ goBack: () => setAuthScreen('Calendar') }}
          onBack={() => setAuthScreen('Calendar')}
          initialDate={screenParams?.initialDate}
        />;
      }
      if (currentScreenName === 'Calendar') {
        return <CalendarScreen
          session={session}
          onNavigate={(screen, params) => navigateAuth(screen, params)}
          initialDate={screenParams?.date || null}
        />;
      }
      if (currentScreenName === 'Result') {
        return <ResultScreen
<<<<<<< HEAD
          onBack={() => {
            if (screenParams?.source === 'db') {
              setAuthScreen('AssessmentGallery');
            } else {
              setAuthScreen('Home');
            }
          }}
=======
          onBack={() => setAuthScreen('Home')}
>>>>>>> 4214cd69c179a9027f7487717ea782645aafbd56
          onSave={() => setAuthScreen('Home')}
          onNavigate={(screen, params) => navigateAuth(screen, params)}
          route={{ params: screenParams }}
          session={session}
        />;
      }
      if (currentScreenName === 'Overview') {
        return <Dashboard
          session={session}
          onBack={() => setAuthScreen('Home')}
          onNavigate={(screen, params) => navigateAuth(screen, params)}
        />;
      }
      if (currentScreenName === 'MainTabNavigator') {
        return <MainTabNavigator
          session={session}
          onBack={() => setAuthScreen('Home')}
          onNavigate={(screen, params) => navigateAuth(screen, params)}
        />;
      }
      if (currentScreenName === 'Community') {
        return <CommunityScreen
          session={session}
          onBack={() => setAuthScreen('MainTabNavigator')}
          onNavigate={(screen, params) => navigateAuth(screen, params)}
        />;
      }
      if (currentScreenName === 'Ranking') {
        return <RankingScreen
          session={session}
          onBack={() => setAuthScreen('MainTabNavigator')}
          onNavigate={(screen, params) => navigateAuth(screen, params)}
        />;
      }
      if (currentScreenName === 'CommunityProfile') {
        return <CommunityProfile
          session={session}
          userId={screenParams?.userId}
          onBack={() => setAuthScreen('MainTabNavigator')}
          onNavigate={(screen, params) => navigateAuth(screen, params)}
        />;
      }
      if (currentScreenName === 'Camera') {
        return <CameraScreen session={session} onNavigate={(screen, params) => navigateAuth(screen, params)} />;
      }
      if (currentScreenName === 'AssessmentGallery') {
        return <AssessmentGallery session={session} onBack={() => setAuthScreen('Dashboard')} onNavigate={(screen, params) => navigateAuth(screen, params)} />;
      }
      if (currentScreenName === 'Gallery') {
        return <GalleryScreen session={session} onBack={() => setAuthScreen('Camera')} onNavigate={(screen, params) => navigateAuth(screen, params)} />;
      }
      if (currentScreenName === 'Setcamera') {
        return <SetcameraScreen session={session} params={screenParams} onNavigate={(screen, params) => navigateAuth(screen, params)} />;
      }
      if (currentScreenName === 'PhotoCheck') {
        return <PhotoCheck session={session} onNavigate={(screen, params) => setAuthScreen(params ? { screen, params } : screen)} />;
      }
      if (currentScreenName === 'AnalysisResult') {
        return <AnalysisResult onNavigate={(screen) => setAuthScreen(screen)} session={session} result={screenParams?.result} recordId={screenParams?.recordId} isHistory={screenParams?.isHistory} />;
      }
      if (currentScreenName === 'Alert') {
        return <AlertScreen
          onBack={() => setAuthScreen(screenParams?.returnTo || 'Camera')}
          onNavigate={(screen, params) => navigateAuth(screen, params)}
          returnTo={screenParams?.returnTo}
        />;
      }
      if (currentScreenName === 'EventDetail') {
        return <EventDetailScreen onBack={() => navigateAuth('Alert', { returnTo: screenParams?.returnTo || 'Camera' })} alertData={screenParams?.alertData} />;
      }

      if (currentScreenName === 'Tutorail') {
        return <Tutorail onFinish={() => setAuthScreen('HomeScreenNew')} />;
      }

      if (currentScreenName === 'HomeScreenNew') {
        return <HomeScreenNew
          session={session}
          onLogout={handleSignOut}
          onLogDaily={() => setAuthScreen('LogDaily')}
          onAssess={() => setAuthScreen('Result')}
          onSetting={() => setAuthScreen('Setting')}
          onNavigate={(screen, params) => navigateAuth(screen, params)}
        />;
      }

      // Dashboard Screen
      if (authScreen === 'Dashboard') {
        return <Dashboard
          session={session}
          onBack={() => setAuthScreen('Home')}
          onNavigate={(screen, params) => navigateAuth(screen, params)}
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
            brand={screenParams?.brand}
            returnTo={screenParams?.returnTo}
            confirmBackToPrevious={screenParams?.confirmBackToPrevious}
            mode={screenParams?.mode}
            isHideBackButton={screenParams?.isHideBackButton}
            isHideSkipButton={screenParams?.isHideSkipButton}
            onBack={() => {
              const target = screenParams?.returnTo || 'Setting';
              const params = screenParams?.returnParams;
              setAuthScreen(params ? { screen: target, params } : target);
            }}
            onConfirm={() => setAuthScreen(screenParams?.returnTo || 'Camera')}
          />
        );
      }
      // Default Home
      return <HomeScreen
        session={session}
        onLogout={handleSignOut}
        onLogDaily={() => setAuthScreen('LogDaily')}
        onAssess={() => setAuthScreen('Result')}
        onSetting={() => setAuthScreen('Setting')}
        onNavigate={(screen, params) => navigateAuth(screen, params)}
      />;
    }

    // 2. Guest/SignIn flow
    return (
      <>
<<<<<<< HEAD
        {currentScreen === 'SignIn' && (
          <SignInScreen
            onNavigate={navigateToSignUp}
            onForgotPassword={() => setCurrentScreen('ForgotPassword')}
          />
        )}
        {currentScreen === 'SignUp' && (
          <SignUpScreen onNavigate={navigateToSignIn} />
        )}
        {currentScreen === 'ForgotPassword' && (
          <ForgotPasswordScreen
            onBack={() => setCurrentScreen('SignIn')}
            onGoToResetPassword={(email) => {
              setResetEmail(String(email || ''));
              setCurrentScreen('ResetPassword');
=======
        {currentScreen === 'Welcome' && (
          <Nekocare
            onSignUp={() => setCurrentScreen('SignUp')}
            onSignIn={() => setCurrentScreen('SignIn')}
          />
        )}

        {currentScreen === 'SignIn' && (
          <SignInScreen
            onNavigate={() => setCurrentScreen('SignUp')}
            onForgotPassword={() => setCurrentScreen('ForgotPassword')}
          />
        )}

        {currentScreen === 'SignUp' && (
          <SignUpScreen onNavigate={() => setCurrentScreen('SignIn')} />
        )}

        {currentScreen === 'ForgotPassword' && (
          <ForgotPasswordScreen
            onBack={() => setCurrentScreen('Welcome')}
            onGoToResetPassword={(email) => {
              setResetReturnTo('ForgotPassword');
              setResetEmail(String(email || ''));
              setResetPasswordStep('token');
              setResetPasswordMode(true);
>>>>>>> 4214cd69c179a9027f7487717ea782645aafbd56
            }}
          />
        )}
      </>
    );
  };


  // Wrap everything with SafeAreaProvider here
  const activeScreenName = session ? getCurrentAuthScreenName() : currentScreen;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#f5fffdff' }}>
      <SafeAreaProvider>
        <GlobalAlertQueueProvider session={session} activeScreen={activeScreenName}>
          {renderScreen()}
          <AppAlertHost />
        </GlobalAlertQueueProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
