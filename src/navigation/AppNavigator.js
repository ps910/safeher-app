/**
 * App Navigator v6.0 - Bottom Tabs + Stack screens for all features
 * Supports dark mode via useTheme hook
 */
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { COLORS, useTheme } from '../constants/theme';
import { useEmergency } from '../context/EmergencyContext';

import HomeScreen from '../screens/HomeScreen';
import ContactsScreen from '../screens/ContactsScreen';
import LocationScreen from '../screens/LocationScreen';
import SafetyTipsScreen from '../screens/SafetyTipsScreen';
import FakeCallScreen from '../screens/FakeCallScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SelfDefenseScreen from '../screens/SelfDefenseScreen';
import NearbyHelpScreen from '../screens/NearbyHelpScreen';
import ProfileScreen from '../screens/ProfileScreen';
import EvidenceVaultScreen from '../screens/EvidenceVaultScreen';
import GuardianModeScreen from '../screens/GuardianModeScreen';
import JourneyTrackerScreen from '../screens/JourneyTrackerScreen';
import IncidentReportScreen from '../screens/IncidentReportScreen';
import HiddenCameraScreen from '../screens/HiddenCameraScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const getTabIcon = (routeName, focused) => {
  const icons = {
    Home: focused ? 'shield-checkmark' : 'shield-checkmark-outline',
    Contacts: focused ? 'people' : 'people-outline',
    Location: focused ? 'location' : 'location-outline',
    Tips: focused ? 'book' : 'book-outline',
  };
  return icons[routeName] || 'ellipse';
};

function TabNavigator() {
  const { isSOSActive, stealthMode } = useEmergency();
  const { colors, isDark } = useTheme();

  // In stealth mode change labels to be innocuous
  const homeLabel = stealthMode ? 'Calculator' : 'Home';

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => (
          <Ionicons name={getTabIcon(route.name, focused)} size={size} color={color} />
        ),
        tabBarActiveTintColor: isSOSActive ? colors.danger : colors.primary,
        tabBarInactiveTintColor: colors.textLight,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 0,
          borderTopColor: 'transparent',
          height: Platform.OS === 'ios' ? 88 : 68,
          paddingBottom: Platform.OS === 'ios' ? 22 : 10,
          paddingTop: 10,
          elevation: 24,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: isDark ? 0.3 : 0.12,
          shadowRadius: 10,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 0.2,
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: homeLabel }} />
      <Tab.Screen name="Contacts" component={ContactsScreen} options={{ tabBarLabel: 'Contacts' }} />
      <Tab.Screen name="Location" component={LocationScreen} options={{ tabBarLabel: 'Location' }} />
      <Tab.Screen name="Tips" component={SafetyTipsScreen} options={{ tabBarLabel: 'Tips' }} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="MainTabs" component={TabNavigator} />
      <Stack.Screen name="FakeCall" component={FakeCallScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="SelfDefense" component={SelfDefenseScreen} />
      <Stack.Screen name="NearbyHelp" component={NearbyHelpScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="EvidenceVault" component={EvidenceVaultScreen} />
      <Stack.Screen name="GuardianMode" component={GuardianModeScreen} />
      <Stack.Screen name="JourneyTracker" component={JourneyTrackerScreen} />
      <Stack.Screen name="IncidentReport" component={IncidentReportScreen} />
      <Stack.Screen name="HiddenCamera" component={HiddenCameraScreen} />
    </Stack.Navigator>
  );
}
