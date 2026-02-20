/**
 * Location Screen - Share real-time location with emergency contacts
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Share,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';
import { useEmergency } from '../context/EmergencyContext';
import {
  requestLocationPermission,
  getCurrentPosition,
  shareLocation,
  sendSOSToContacts,
  openMap,
} from '../utils/helpers';

const LocationScreen = ({ navigation }) => {
  const { emergencyContacts, setCurrentLocation, sosMessage } = useEmergency();
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    getCurrentLocation();
  }, []);

  const getCurrentLocation = async () => {
    setLoading(true);
    try {
      const pos = await getCurrentPosition();
      if (!pos) {
        Alert.alert(
          'Permission Denied',
          'Location permission is required for this feature. Please enable it in settings.'
        );
        setLoading(false);
        return;
      }

      setLocation(pos);
      setCurrentLocation(pos);
      setLastUpdated(new Date());
      setLoading(false);
    } catch (error) {
      console.error('Location error:', error);
      Alert.alert('Error', 'Could not get your location. Please try again.');
      setLoading(false);
    }
  };

  const handleShareLocation = async () => {
    if (!location) {
      Alert.alert('Error', 'Location not available yet. Please wait...');
      return;
    }

    const url = shareLocation(location.latitude, location.longitude);

    try {
      await Share.share({
        message: `📍 Here's my current location:\n${url}\n\nShared via Girl Safety App`,
        title: 'My Location',
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const handleSendToContacts = () => {
    if (!location) {
      Alert.alert('Error', 'Location not available yet.');
      return;
    }

    if (emergencyContacts.length === 0) {
      Alert.alert(
        'No Contacts',
        'Please add emergency contacts first.',
        [{ text: 'Add Contacts', onPress: () => navigation.navigate('Contacts') }]
      );
      return;
    }

    sendSOSToContacts(
      emergencyContacts,
      '📍 Here is my current location. I\'m sharing this for safety. - Girl Safety App',
      location
    );

    Alert.alert('✅ Sent!', 'Your location has been shared with all emergency contacts.');
  };

  const handleOpenMap = () => {
    if (location) {
      openMap(location.latitude, location.longitude);
    }
  };

  const toggleTracking = () => {
    if (tracking) {
      setTracking(false);
      Alert.alert('Tracking Stopped', 'Live location sharing has been stopped.');
    } else {
      setTracking(true);
      Alert.alert(
        'Live Tracking Started',
        'Your location will be shared with emergency contacts every 30 seconds.'
      );
      // In production, set up interval to share location
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor={COLORS.success} barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>📍 Location</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Location Card */}
        <View style={[styles.locationCard, SHADOWS.medium]}>
          <Text style={styles.locationEmoji}>📍</Text>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Getting your location...</Text>
            </View>
          ) : location ? (
            <View style={styles.locationInfo}>
              <Text style={styles.locationTitle}>Your Current Location</Text>
              <Text style={styles.coordinates}>
                Lat: {location.latitude.toFixed(6)}
              </Text>
              <Text style={styles.coordinates}>
                Lng: {location.longitude.toFixed(6)}
              </Text>
              {lastUpdated && (
                <Text style={styles.updatedText}>
                  Last updated: {lastUpdated.toLocaleTimeString()}
                </Text>
              )}
            </View>
          ) : (
            <View style={styles.locationInfo}>
              <Text style={styles.locationTitle}>Location Unavailable</Text>
              <Text style={styles.errorText}>
                Could not determine your location.
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={getCurrentLocation}
          >
            <Text style={styles.refreshIcon}>🔄</Text>
            <Text style={styles.refreshText}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {/* Action Buttons */}
        <Text style={styles.sectionTitle}>Quick Share</Text>

        <TouchableOpacity
          style={[styles.actionCard, SHADOWS.small, { borderLeftColor: COLORS.primary }]}
          onPress={handleShareLocation}
        >
          <Text style={styles.actionEmoji}>📤</Text>
          <View style={styles.actionInfo}>
            <Text style={styles.actionTitle}>Share Location</Text>
            <Text style={styles.actionDesc}>
              Share via WhatsApp, SMS, or any app
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionCard, SHADOWS.small, { borderLeftColor: COLORS.danger }]}
          onPress={handleSendToContacts}
        >
          <Text style={styles.actionEmoji}>🆘</Text>
          <View style={styles.actionInfo}>
            <Text style={styles.actionTitle}>Send to Emergency Contacts</Text>
            <Text style={styles.actionDesc}>
              SMS location to {emergencyContacts.length} saved contacts
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionCard, SHADOWS.small, { borderLeftColor: COLORS.secondary }]}
          onPress={handleOpenMap}
        >
          <Text style={styles.actionEmoji}>🗺️</Text>
          <View style={styles.actionInfo}>
            <Text style={styles.actionTitle}>Open in Maps</Text>
            <Text style={styles.actionDesc}>
              View your current location in Google Maps
            </Text>
          </View>
        </TouchableOpacity>

        {/* Live Tracking Section */}
        <Text style={styles.sectionTitle}>Live Tracking</Text>

        <View style={[styles.trackingCard, SHADOWS.medium]}>
          <View style={styles.trackingHeader}>
            <Text style={styles.trackingEmoji}>🔴</Text>
            <View style={styles.trackingInfo}>
              <Text style={styles.trackingTitle}>Live Location Sharing</Text>
              <Text style={styles.trackingDesc}>
                Auto-share your location with emergency contacts every 30 seconds
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.trackingBtn,
              tracking ? styles.trackingBtnActive : styles.trackingBtnInactive,
              SHADOWS.small,
            ]}
            onPress={toggleTracking}
          >
            <Text style={styles.trackingBtnText}>
              {tracking ? '⏹️ Stop Tracking' : '▶️ Start Live Tracking'}
            </Text>
          </TouchableOpacity>

          {tracking && (
            <View style={styles.trackingStatus}>
              <View style={styles.liveIndicator} />
              <Text style={styles.liveText}>LIVE - Sharing location...</Text>
            </View>
          )}
        </View>

        {/* Safety Tips */}
        <View style={[styles.tipCard, SHADOWS.small]}>
          <Text style={styles.tipIcon}>💡</Text>
          <Text style={styles.tipText}>
            Always share your live location with a trusted person when traveling
            alone, especially at night.
          </Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: '#2E7D32',
    paddingHorizontal: SIZES.md,
    paddingTop: SIZES.xl + 10,
    paddingBottom: SIZES.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomLeftRadius: SIZES.radiusLg,
    borderBottomRightRadius: SIZES.radiusLg,
  },
  backBtn: {
    color: COLORS.white,
    fontSize: SIZES.body,
    fontWeight: '600',
  },
  headerTitle: {
    color: COLORS.white,
    fontSize: SIZES.h3,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: SIZES.md,
  },
  locationCard: {
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radiusLg,
    padding: SIZES.lg,
    alignItems: 'center',
    marginBottom: SIZES.lg,
  },
  locationEmoji: {
    fontSize: 48,
    marginBottom: SIZES.md,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: SIZES.md,
  },
  loadingText: {
    marginTop: SIZES.sm,
    color: COLORS.textSecondary,
    fontSize: SIZES.body,
  },
  locationInfo: {
    alignItems: 'center',
  },
  locationTitle: {
    fontSize: SIZES.h4,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SIZES.sm,
  },
  coordinates: {
    fontSize: SIZES.body,
    color: COLORS.textSecondary,
    fontFamily: 'monospace',
  },
  updatedText: {
    fontSize: SIZES.small,
    color: COLORS.textLight,
    marginTop: SIZES.sm,
  },
  errorText: {
    fontSize: SIZES.body,
    color: COLORS.danger,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SIZES.md,
    backgroundColor: COLORS.background,
    paddingHorizontal: SIZES.md,
    paddingVertical: SIZES.sm,
    borderRadius: SIZES.radiusFull,
  },
  refreshIcon: {
    fontSize: 16,
    marginRight: SIZES.xs,
  },
  refreshText: {
    fontSize: SIZES.small,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: SIZES.h4,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SIZES.md,
  },
  actionCard: {
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SIZES.sm,
    borderLeftWidth: 4,
  },
  actionEmoji: {
    fontSize: 28,
    marginRight: SIZES.md,
  },
  actionInfo: {
    flex: 1,
  },
  actionTitle: {
    fontSize: SIZES.body,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  actionDesc: {
    fontSize: SIZES.small,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  trackingCard: {
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radiusLg,
    padding: SIZES.lg,
    marginBottom: SIZES.lg,
  },
  trackingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SIZES.md,
  },
  trackingEmoji: {
    fontSize: 28,
    marginRight: SIZES.md,
  },
  trackingInfo: {
    flex: 1,
  },
  trackingTitle: {
    fontSize: SIZES.h4,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  trackingDesc: {
    fontSize: SIZES.small,
    color: COLORS.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  trackingBtn: {
    paddingVertical: SIZES.md,
    borderRadius: SIZES.radiusMd,
    alignItems: 'center',
  },
  trackingBtnActive: {
    backgroundColor: COLORS.danger,
  },
  trackingBtnInactive: {
    backgroundColor: '#2E7D32',
  },
  trackingBtnText: {
    color: COLORS.white,
    fontSize: SIZES.body,
    fontWeight: 'bold',
  },
  trackingStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SIZES.md,
  },
  liveIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.danger,
    marginRight: SIZES.sm,
  },
  liveText: {
    fontSize: SIZES.small,
    color: COLORS.danger,
    fontWeight: 'bold',
  },
  tipCard: {
    backgroundColor: '#FFF9C4',
    borderRadius: SIZES.radiusMd,
    padding: SIZES.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tipIcon: {
    fontSize: 24,
    marginRight: SIZES.sm,
  },
  tipText: {
    flex: 1,
    fontSize: SIZES.small,
    color: '#F57F17',
    lineHeight: 18,
  },
});

export default LocationScreen;
