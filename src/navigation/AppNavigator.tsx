/**
 * App Navigator v7.0 — Dark luxury bottom tabs + stack
 * TypeScript — type-safe navigation params
 */
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Platform, View, Text, StyleSheet } from 'react-native';
import { useEmergency } from '../context/EmergencyContext';
import { T } from '../components/ui';

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

const TAB_ICONS: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
  Home:     ['shield-checkmark', 'shield-checkmark-outline'],
  Contacts: ['people',           'people-outline'],
  Location: ['location',         'location-outline'],
  Tips:     ['bulb',             'bulb-outline'],
};

function CustomTabIcon({ name, focused, color }: { name: string; focused: boolean; color: string }) {
  const [active, inactive] = TAB_ICONS[name] || ['ellipse', 'ellipse-outline'];
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <Ionicons name={focused ? active : inactive} size={focused ? 22 : 20} color={color} />
    </View>
  );
}

function TabNavigator(): React.JSX.Element {
  const { isSOSActive, stealthMode } = useEmergency();
  const homeLabel = stealthMode ? 'Calculator' : 'Home';

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color }) => (
          <CustomTabIcon name={route.name} focused={focused} color={color} />
        ),
        tabBarActiveTintColor:   isSOSActive ? T.danger : T.primary,
        tabBarInactiveTintColor: T.textHint,
        tabBarStyle: {
          backgroundColor: '#0A0A12',
          borderTopWidth: 1,
          borderTopColor: T.border,
          height: Platform.OS === 'ios' ? 88 : 70,
          paddingBottom: Platform.OS === 'ios' ? 24 : 10,
          paddingTop: 8,
          elevation: 24,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -8 },
          shadowOpacity: 0.5,
          shadowRadius: 14,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4, marginTop: 2 },
      })}
    >
      <Tab.Screen name="Home"     component={HomeScreen}        options={{ tabBarLabel: homeLabel }} />
      <Tab.Screen name="Contacts" component={ContactsScreen}    options={{ tabBarLabel: 'Contacts' }} />
      <Tab.Screen name="Location" component={LocationScreen}    options={{ tabBarLabel: 'Location' }} />
      <Tab.Screen name="Tips"     component={SafetyTipsScreen}  options={{ tabBarLabel: 'Tips' }} />
    </Tab.Navigator>
  );
}

export default function AppNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: T.bg },
      }}
    >
      <Stack.Screen name="MainTabs"       component={TabNavigator} />
      <Stack.Screen name="FakeCall"       component={FakeCallScreen} />
      <Stack.Screen name="Settings"       component={SettingsScreen} />
      <Stack.Screen name="SelfDefense"    component={SelfDefenseScreen} />
      <Stack.Screen name="NearbyHelp"     component={NearbyHelpScreen} />
      <Stack.Screen name="Profile"        component={ProfileScreen} />
      <Stack.Screen name="EvidenceVault"  component={EvidenceVaultScreen} />
      <Stack.Screen name="GuardianMode"   component={GuardianModeScreen} />
      <Stack.Screen name="JourneyTracker" component={JourneyTrackerScreen} />
      <Stack.Screen name="IncidentReport" component={IncidentReportScreen} />
      <Stack.Screen name="HiddenCamera"   component={HiddenCameraScreen} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: 'rgba(255,42,112,0.12)',
  },
});
