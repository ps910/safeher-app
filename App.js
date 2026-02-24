/**
 * Girl Safety App v4.0 — Next-Gen Women's Safety Application
 * AI-Powered distress detection, evidence vault, journey tracking,
 * predictive anomaly detection, offline SOS, and more.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { EmergencyProvider, useEmergency } from './src/context/EmergencyContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AuthScreen from './src/screens/AuthScreen';
import { sendSOSToContacts } from './src/utils/helpers';

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
          <Text style={ebStyles.subtitle}>The app encountered an error</Text>
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

// ── Main App Content ──
function AppInner() {
  const { isAuthenticated, isLoading } = useAuth();
  const emergency = useEmergency();

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

  // Show loading spinner while auth state is being loaded from storage
  if (isLoading) {
    return (
      <View style={loadStyles.container}>
        <ActivityIndicator size="large" color="#E91E63" />
        <Text style={loadStyles.text}>Loading SafeHer...</Text>
      </View>
    );
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

const loadStyles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FEF0F5' },
  text: { fontSize: 16, color: '#C2185B', marginTop: 16, fontWeight: '600' },
});

const App = () => {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          <EmergencyProvider>
            <AppInner />
          </EmergencyProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
};

export default App;
