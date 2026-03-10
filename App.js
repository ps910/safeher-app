/**
 * Girl Safety App v6.0 — Next-Gen Women's Safety Application
 * AI-Powered distress detection, evidence vault, journey tracking,
 * predictive anomaly detection, offline SOS, background location,
 * push notifications, live sharing, encrypted storage, dark mode.
 * 
 * v6.0: Onboarding flow, dark mode, background services, encrypted storage
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, useColorScheme, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Error Boundary — prevents white-screen crashes in production ──
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('App Crash Caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={ebStyles.container}>
          <Text style={ebStyles.icon}>⚠️</Text>
          <Text style={ebStyles.title}>Something went wrong</Text>
          <Text style={ebStyles.subtitle}>{String(this.state.error?.message || 'Unknown error')}</Text>
          <TouchableOpacity
            style={ebStyles.btn}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={ebStyles.btnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const ebStyles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF0F5', padding: 30 },
  icon: { fontSize: 60, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', color: '#C2185B', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 24, textAlign: 'center' },
  btn: { backgroundColor: '#E91E63', borderRadius: 12, paddingHorizontal: 30, paddingVertical: 14 },
  btnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});

// ── Boot loader — loads all modules dynamically for crash safety ──
function AppBootstrap() {
  const [phase, setPhase] = useState('loading');
  const [error, setError] = useState(null);
  const [modules, setModules] = useState(null);

  useEffect(() => {
    loadModules();
  }, []);

  const loadModules = async () => {
    try {
      setPhase('Loading core...');
      const navModule = await import('@react-navigation/native');
      const safeAreaModule = await import('react-native-safe-area-context');

      setPhase('Loading auth...');
      const authCtxModule = await import('./src/context/AuthContext');
      const emergencyCtxModule = await import('./src/context/EmergencyContext');
      const authScreenModule = await import('./src/screens/AuthScreen');

      setPhase('Loading helpers...');
      const helpersModule = await import('./src/utils/helpers');

      setPhase('Loading navigator...');
      const navigatorModule = await import('./src/navigation/AppNavigator');

      setPhase('Loading onboarding...');
      const onboardingModule = await import('./src/screens/OnboardingScreen');

      setModules({
        NavigationContainer: navModule.NavigationContainer,
        SafeAreaProvider: safeAreaModule.SafeAreaProvider,
        AuthProvider: authCtxModule.AuthProvider,
        useAuth: authCtxModule.useAuth,
        EmergencyProvider: emergencyCtxModule.EmergencyProvider,
        useEmergency: emergencyCtxModule.useEmergency,
        AuthScreen: authScreenModule.default,
        sendSOSToContacts: helpersModule.sendSOSToContacts,
        AppNavigator: navigatorModule.default,
        OnboardingScreen: onboardingModule.default,
        isOnboardingComplete: onboardingModule.isOnboardingComplete,
      });
      setPhase('ready');
    } catch (e) {
      console.error('Module load error:', e);
      setError(`Failed at: ${phase}\n\n${e.message}`);
      setPhase('error');
    }
  };

  if (phase === 'error') {
    return (
      <ScrollView contentContainerStyle={diagStyles.container}>
        <Text style={diagStyles.icon}>🔧</Text>
        <Text style={diagStyles.title}>SafeHer Diagnostic</Text>
        <Text style={diagStyles.errorText}>{error}</Text>
        <TouchableOpacity style={diagStyles.btn} onPress={() => { setError(null); setPhase('loading'); loadModules(); }}>
          <Text style={diagStyles.btnText}>Retry</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (phase !== 'ready' || !modules) {
    return (
      <View style={loadStyles.container}>
        <ActivityIndicator size="large" color="#E91E63" />
        <Text style={loadStyles.text}>{phase}</Text>
      </View>
    );
  }

  return <AppWithModules modules={modules} />;
}

// ── Main App Content (only rendered after all modules load) ──
function AppWithModules({ modules }) {
  const { SafeAreaProvider, AuthProvider, EmergencyProvider } = modules;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <EmergencyProvider>
          <AppInner modules={modules} />
        </EmergencyProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function AppInner({ modules }) {
  const { NavigationContainer, AuthScreen, AppNavigator, OnboardingScreen, isOnboardingComplete,
    useAuth, useEmergency, sendSOSToContacts } = modules;
  const { isAuthenticated, isLoading, lock } = useAuth();
  const emergency = useEmergency();
  const [onboardingDone, setOnboardingDone] = useState(null); // null = checking

  // Check onboarding status
  useEffect(() => {
    checkOnboarding();
  }, []);

  const checkOnboarding = async () => {
    try {
      const done = await isOnboardingComplete();
      setOnboardingDone(done);
    } catch (e) {
      setOnboardingDone(true); // Skip if error
    }
  };

  // App state change — lock on background (security)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' && isAuthenticated && lock) {
        // Auto-lock when going to background for security
        // Only if biometric is enabled
        // lock(); // Uncomment to enable auto-lock on background
      }
    });
    return () => subscription?.remove();
  }, [isAuthenticated, lock]);

  // Initialize services when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      initServices();
    }
  }, [isAuthenticated]);

  const initServices = async () => {
    try {
      const { default: OfflineLocationService } = await import('./src/services/OfflineLocationService');
      const { SessionsDB, UserDB, DatabaseUtils } = await import('./src/services/Database');
      const { default: CloudSyncService } = await import('./src/services/CloudSyncService');
      const { default: RootDetectionService } = await import('./src/services/RootDetectionService');

      // Security: Check for rooted/jailbroken device (Vuln #18)
      await RootDetectionService.warnIfRooted();

      // Start session + warm DB cache
      await SessionsDB.start();
      await DatabaseUtils.warmCache();

      // Init cloud sync with device ID
      const deviceId = await UserDB.getDeviceId();
      await CloudSyncService.init(deviceId);

      // Start offline location service
      await OfflineLocationService.init();

      console.log('[App] ✅ All services initialized');
    } catch (e) {
      console.log('Service init error (non-fatal):', e);
    }
  };

  const handleDuress = () => {
    try {
      emergency.triggerSOS();
      if (emergency.emergencyContacts && emergency.emergencyContacts.length > 0) {
        sendSOSToContacts(
          emergency.emergencyContacts,
          '🆘 DURESS ALERT — I may be forced to unlock my phone. Please send help immediately!',
          emergency.currentLocation
        );
      }
    } catch (e) {
      console.error('Duress handler error:', e);
    }
  };

  if (isLoading) {
    return (
      <View style={loadStyles.container}>
        <ActivityIndicator size="large" color="#E91E63" />
        <Text style={loadStyles.text}>Loading SafeHer...</Text>
      </View>
    );
  }

  // Show onboarding for first-time users
  if (onboardingDone === null) {
    return (
      <View style={loadStyles.container}>
        <ActivityIndicator size="large" color="#E91E63" />
        <Text style={loadStyles.text}>Checking setup...</Text>
      </View>
    );
  }

  if (!onboardingDone) {
    return <OnboardingScreen onComplete={() => setOnboardingDone(true)} />;
  }

  if (!isAuthenticated) {
    return <AuthScreen onDuressTriggered={handleDuress} />;
  }

  return (
    <NavigationContainer>
      <AppNavigator />
    </NavigationContainer>
  );
}

const diagStyles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF0F5', padding: 30 },
  icon: { fontSize: 60, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', color: '#C2185B', marginBottom: 16 },
  errorText: { fontSize: 13, color: '#333', marginBottom: 24, textAlign: 'left', fontFamily: 'monospace', backgroundColor: '#FFF', padding: 16, borderRadius: 8, width: '100%' },
  btn: { backgroundColor: '#E91E63', borderRadius: 12, paddingHorizontal: 30, paddingVertical: 14 },
  btnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});

const loadStyles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FEF0F5' },
  text: { fontSize: 16, color: '#C2185B', marginTop: 16, fontWeight: '600' },
});

const App = () => {
  return (
    <ErrorBoundary>
      <AppBootstrap />
    </ErrorBoundary>
  );
};

export default App;
