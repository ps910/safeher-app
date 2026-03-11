/**
 * App Navigator v6.0 - Bottom Tabs + Stack screens for all features
 * Supports dark mode via useTheme hook
 *
 * TypeScript — type-safe navigation params
 */
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { COLORS, useTheme } from '../constants/theme';
import { useEmergency } from '../context/EmergencyContext';

import type { RootStackParamList, TabParamList } from '../types';

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

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const getTabIcon = (routeName: string, focused: boolean): keyof typeof Ionicons.glyphMap => {
  const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
    Home: focused ? 'shield-checkmark' : 'shield-checkmark-outline',
    Contacts: focused ? 'people' : 'people-outline',
    Location: focused ? 'location' : 'location-outline',
    Tips: focused ? 'book' : 'book-outline',
  };
  return icons[routeName] || 'ellipse';
};

function TabNavigator(): React.JSX.Element {
  const { isSOSActive, stealthMode } = useEmergency();
  const { colors, isDark } = useTheme();

  const homeLabel = stealthMode ? 'Calculator' : 'Home';

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }: { focused: boolean; color: string; size: number }) => (
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
          fontWeight: '700' as const,
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

export default function AppNavigator(): React.JSX.Element {
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
