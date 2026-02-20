/**
 * Girl Safety App
 * A React Native app for women/girl safety
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { EmergencyProvider } from './src/context/EmergencyContext';

const App = () => {
  return (
    <SafeAreaProvider>
      <EmergencyProvider>
        <NavigationContainer>
          <AppNavigator />
        </NavigationContainer>
      </EmergencyProvider>
    </SafeAreaProvider>
  );
};

export default App;
