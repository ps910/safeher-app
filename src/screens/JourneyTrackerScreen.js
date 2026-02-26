/**
 * JourneyTrackerScreen v3.0 — Smart Trip Monitor
 *
 * Features:
 *  - Motion detection every 5 seconds (GPS-based)
 *  - Full journey breadcrumb recording (GPS trail saved to device)
 *  - Live movement status indicator (moving/stationary)
 *  - Journey statistics (distance, speed, duration, points)
 *  - Route trail display with breadcrumb list
 *  - SOS during journey → shares FULL journey data via WhatsApp + SMS
 *  - Journey history with saved routes
 *  - Auto-alert contacts when trip starts or becomes overdue
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Platform, Alert, Vibration, Animated, Dimensions,
  Linking as RNLinking,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEmergency } from '../context/EmergencyContext';
import { COLORS, SHADOWS } from '../constants/theme';
import {
  sendSOSToContacts, getCurrentPosition, sendSMS,
  sendWhatsAppMessage, sendWhatsAppToContacts,
  buildJourneySOSMessage, shareJourneySOSToContacts,
} from '../utils/helpers';

const { width: SCREEN_W } = Dimensions.get('window');
const TIME_OPTIONS = [15, 30, 45, 60, 90, 120];

export default function JourneyTrackerScreen() {
  const navigation = useNavigation();
  const {
    activeJourney, journeyOverdue,
    startJourney, completeJourney, extendJourney,
    emergencyContacts, currentLocation, setCurrentLocation,
    sosMessage, triggerSOS,
    journeyBreadcrumbs, isDeviceMoving, journeyStats,
    journeyHistory, getJourneyShareData,
  } = useEmergency();

  const [destination, setDestination] = useState('');
  const [selectedMinutes, setSelectedMinutes] = useState(30);
  const [timeLeft, setTimeLeft] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showTrail, setShowTrail] = useState(false);
  const [showHistoryDetail, setShowHistoryDetail] = useState(null);

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const movingDotAnim = useRef(new Animated.Value(0)).current;

  // Pulse animation for active journey
  useEffect(() => {
    if (activeJourney && isDeviceMoving) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [activeJourney, isDeviceMoving]);

  // Moving dot animation
  useEffect(() => {
    if (isDeviceMoving) {
      const loop = Animated.loop(
        Animated.timing(movingDotAnim, { toValue: 1, duration: 1500, useNativeDriver: false })
      );
      loop.start();
      return () => loop.stop();
    } else {
      movingDotAnim.setValue(0);
    }
  }, [isDeviceMoving]);

  // Countdown timer
  useEffect(() => {
    if (!activeJourney) { setTimeLeft(null); return; }
    const interval = setInterval(() => {
      const eta = new Date(activeJourney.expectedArrival).getTime();
      const remaining = Math.max(0, Math.floor((eta - Date.now()) / 1000));
      setTimeLeft(remaining);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeJourney]);

  const formatTime = (seconds) => {
    if (seconds === null) return '--:--';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  };

  const formatDuration = (startIso) => {
    const diff = Date.now() - new Date(startIso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return `${hrs}h ${rem}m`;
  };

  const formatDistance = (meters) => {
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(2)} km`;
  };

  const formatSpeed = (mps) => {
    return `${(mps * 3.6).toFixed(1)} km/h`;
  };

  // ── Start Journey ──
  const handleStartJourney = async () => {
    if (!destination.trim()) {
      Alert.alert('Required', 'Please enter your destination.');
      return;
    }

    await startJourney(destination.trim(), selectedMinutes);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Notify Tier 1 contacts via SMS about journey start
    if (emergencyContacts.length > 0) {
      const loc = currentLocation;
      const locText = loc
        ? `\n\nStarting from:\nhttps://maps.google.com/?q=${loc.coords.latitude},${loc.coords.longitude}`
        : '';
      const msg = `I've started a journey to "${destination.trim()}".\nExpected arrival in ${selectedMinutes} minutes.${locText}\n\nIf I don't check in by then, please try to reach me.\n\n-- SafeHer App`;

      const tier1 = emergencyContacts.filter(c => (c.tier || 1) === 1);
      for (const contact of tier1) {
        try {
          await sendSMS(contact.phone, msg);
          await new Promise(r => setTimeout(r, 500));
        } catch (e) {
          console.log('Journey SMS send error:', e);
        }
      }
    }

    Alert.alert(
      'Journey Started',
      `Tracking your trip to "${destination.trim()}".\nExpected time: ${selectedMinutes} min.\n\nGPS breadcrumbs are being recorded every 5 seconds. Your contacts have been notified.`
    );
    setDestination('');
  };

  // ── Complete Journey ──
  const handleComplete = async () => {
    const stats = journeyStats;
    await completeJourney();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Notify contacts
    if (emergencyContacts.length > 0) {
      const tier1 = emergencyContacts.filter(c => (c.tier || 1) === 1);
      const msg = `I've arrived safely at my destination.\nDistance: ${formatDistance(stats.distance)}\n\n-- SafeHer App`;
      for (const contact of tier1) {
        try { await sendSMS(contact.phone, msg); } catch (e) {}
      }
    }

    Alert.alert('Journey Complete', `Great, you arrived safely!\n\nDistance: ${formatDistance(stats.distance)}\nGPS points recorded: ${journeyBreadcrumbs.length}\n\nJourney saved to history.`);
  };

  // ── Extend Journey ──
  const handleExtend = async (minutes) => {
    await extendJourney(minutes);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Extended', `Journey extended by ${minutes} minutes.`);
  };

  // ── SOS with Journey Data (WhatsApp + SMS) ──
  const handleSOS = async () => {
    triggerSOS();
    Vibration.vibrate([0, 1000, 200, 1000], true);

    if (emergencyContacts.length === 0) {
      Alert.alert('No Contacts', 'Please add emergency contacts.');
      return;
    }

    const journeyData = getJourneyShareData();

    // Share via both WhatsApp + SMS
    try {
      const result = await shareJourneySOSToContacts(
        emergencyContacts,
        journeyData,
        `EMERGENCY during journey to "${activeJourney?.destination || 'unknown'}"! I need help NOW!`,
        currentLocation
      );

      if (result.success) {
        Alert.alert(
          'SOS Sent!',
          `Emergency alerts sent with your complete journey trail.\n\n` +
          `WhatsApp: ${result.whatsapp ? 'Sent' : 'Failed'}\n` +
          `SMS: ${result.sms ? 'Sent' : 'Failed'}\n\n` +
          `${journeyBreadcrumbs.length} GPS points shared.`
        );
      }
    } catch (e) {
      console.error('Journey SOS error:', e);
      // Fallback to basic SOS
      sendSOSToContacts(emergencyContacts, sosMessage, currentLocation);
      Alert.alert('SOS Sent', 'Emergency alerts sent to all contacts!');
    }
  };

  // ── Share Journey via WhatsApp (non-SOS) ──
  const handleShareWhatsApp = async () => {
    const journeyData = getJourneyShareData();
    if (!journeyData) return;

    const msg = buildJourneySOSMessage(journeyData, 'Sharing my journey details for safety.', currentLocation);
    const tier1 = emergencyContacts.filter(c => (c.tier || 1) === 1);

    if (tier1.length > 0) {
      await sendWhatsAppToContacts(tier1, msg);
    } else if (emergencyContacts.length > 0) {
      await sendWhatsAppMessage(emergencyContacts[0].phone, msg);
    } else {
      Alert.alert('No Contacts', 'Add emergency contacts first.');
    }
  };

  // ── Share Journey via SMS (non-SOS) ──
  const handleShareSMS = async () => {
    const journeyData = getJourneyShareData();
    if (!journeyData) return;

    const msg = buildJourneySOSMessage(journeyData, 'Sharing my current journey for safety.', currentLocation);
    const phones = emergencyContacts.map(c => c.phone).filter(Boolean);

    if (phones.length === 0) {
      Alert.alert('No Contacts', 'Add emergency contacts first.');
      return;
    }

    await sendSMS(phones, msg);
  };

  // ─── RENDER ──────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={styles.headerTitle}>Journey Tracker</Text>
          <Text style={styles.headerSub}>
            {activeJourney ? 'Live Tracking Active' : 'Smart Trip Monitor'}
          </Text>
        </View>
        {journeyHistory.length > 0 && (
          <TouchableOpacity
            style={[styles.historyToggle, showHistory && { backgroundColor: 'rgba(255,255,255,0.3)' }]}
            onPress={() => setShowHistory(!showHistory)}
          >
            <Ionicons name="time" size={20} color="#FFF" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <View style={styles.infoBannerIcon}>
            <Ionicons name="navigate" size={20} color="#1565C0" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.infoTitle}>Smart Trip Monitor</Text>
            <Text style={styles.infoText}>
              GPS tracks your route every 5 seconds. If SOS is triggered,
              your complete journey trail is shared via WhatsApp and SMS.
            </Text>
          </View>
        </View>

        {activeJourney ? (
          /* ─── ACTIVE JOURNEY ─── */
          <View>
            {/* Motion Status Banner */}
            <View style={[styles.motionBanner, isDeviceMoving ? styles.motionMoving : styles.motionStationary]}>
              <Animated.View style={[styles.motionDot, {
                backgroundColor: isDeviceMoving ? '#00C853' : '#FFD600',
                transform: [{ scale: isDeviceMoving ? pulseAnim : 1 }],
              }]} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.motionLabel}>
                  {isDeviceMoving ? 'Device Moving' : 'Stationary'}
                </Text>
                <Text style={styles.motionSub}>
                  GPS checked every 5 sec | {journeyBreadcrumbs.length} points recorded
                </Text>
              </View>
              {currentLocation?.coords?.speed > 0 && (
                <View style={styles.speedBadge}>
                  <Text style={styles.speedText}>
                    {Math.round((currentLocation.coords.speed || 0) * 3.6)}
                  </Text>
                  <Text style={styles.speedUnit}>km/h</Text>
                </View>
              )}
            </View>

            {/* Main Journey Card */}
            <View style={[styles.activeCard, journeyOverdue && styles.activeCardOverdue]}>
              <View style={styles.activeHeader}>
                <View style={[styles.activeIconWrap, {
                  backgroundColor: journeyOverdue ? '#FFEBEE' : '#E3F2FD',
                }]}>
                  <Ionicons
                    name={journeyOverdue ? 'warning' : 'navigate'}
                    size={26}
                    color={journeyOverdue ? '#FF1744' : '#1565C0'}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={[styles.activeTitle, journeyOverdue && { color: '#FF1744' }]}>
                    {journeyOverdue ? 'JOURNEY OVERDUE!' : 'Journey Active'}
                  </Text>
                  <Text style={styles.activeDestination}>
                    To: {activeJourney.destination}
                  </Text>
                </View>
              </View>

              {/* Timer */}
              <View style={[styles.timerBox, journeyOverdue && styles.timerBoxOverdue]}>
                <Text style={styles.timerLabel}>
                  {journeyOverdue ? 'OVERDUE BY' : 'TIME REMAINING'}
                </Text>
                <Text style={[styles.timerValue, journeyOverdue && { color: '#FF1744' }]}>
                  {journeyOverdue && timeLeft === 0
                    ? formatTime(Math.floor((Date.now() - new Date(activeJourney.expectedArrival).getTime()) / 1000))
                    : formatTime(timeLeft)}
                </Text>
              </View>

              {/* Journey Stats Grid */}
              <View style={styles.statsGrid}>
                <View style={styles.statItem}>
                  <View style={[styles.statIconWrap, { backgroundColor: '#1565C015' }]}>
                    <Ionicons name="navigate" size={16} color="#1565C0" />
                  </View>
                  <Text style={styles.statValue}>{formatDistance(journeyStats.distance)}</Text>
                  <Text style={styles.statLabel}>Distance</Text>
                </View>
                <View style={styles.statItem}>
                  <View style={[styles.statIconWrap, { backgroundColor: '#00C85315' }]}>
                    <Ionicons name="speedometer" size={16} color="#00C853" />
                  </View>
                  <Text style={styles.statValue}>{formatSpeed(journeyStats.avgSpeed)}</Text>
                  <Text style={styles.statLabel}>Avg Speed</Text>
                </View>
                <View style={styles.statItem}>
                  <View style={[styles.statIconWrap, { backgroundColor: '#FF6D0015' }]}>
                    <Ionicons name="time" size={16} color="#FF6D00" />
                  </View>
                  <Text style={styles.statValue}>{formatDuration(activeJourney.startTime)}</Text>
                  <Text style={styles.statLabel}>Duration</Text>
                </View>
                <View style={styles.statItem}>
                  <View style={[styles.statIconWrap, { backgroundColor: '#AA00FF15' }]}>
                    <Ionicons name="location" size={16} color="#AA00FF" />
                  </View>
                  <Text style={styles.statValue}>{journeyBreadcrumbs.length}</Text>
                  <Text style={styles.statLabel}>GPS Points</Text>
                </View>
              </View>

              {/* Detail Rows */}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Started</Text>
                <Text style={styles.detailValue}>
                  {new Date(activeJourney.startTime).toLocaleTimeString()}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Expected Arrival</Text>
                <Text style={styles.detailValue}>
                  {new Date(activeJourney.expectedArrival).toLocaleTimeString()}
                </Text>
              </View>
              {journeyStats.maxSpeed > 0 && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Max Speed</Text>
                  <Text style={styles.detailValue}>{formatSpeed(journeyStats.maxSpeed)}</Text>
                </View>
              )}
            </View>

            {/* GPS Trail Toggle */}
            <TouchableOpacity
              style={styles.trailToggle}
              onPress={() => setShowTrail(!showTrail)}
              activeOpacity={0.7}
            >
              <View style={styles.trailToggleIcon}>
                <MaterialCommunityIcons name="map-marker-path" size={18} color="#1565C0" />
              </View>
              <Text style={styles.trailToggleText}>
                {showTrail ? 'Hide' : 'Show'} GPS Trail ({journeyBreadcrumbs.length} points)
              </Text>
              <Ionicons name={showTrail ? 'chevron-up' : 'chevron-down'} size={18} color="#1565C0" />
            </TouchableOpacity>

            {/* GPS Trail List */}
            {showTrail && journeyBreadcrumbs.length > 0 && (
              <View style={styles.trailCard}>
                <ScrollView style={{ maxHeight: 260 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                  {[...journeyBreadcrumbs].reverse().slice(0, 50).map((crumb, i) => (
                    <TouchableOpacity
                      key={i}
                      style={styles.trailRow}
                      onPress={() => RNLinking.openURL(
                        `https://maps.google.com/?q=${crumb.latitude},${crumb.longitude}`
                      )}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.trailDot, {
                        backgroundColor: crumb.moving ? '#00C853' : '#FFD600',
                      }]} />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.trailTime}>
                          {new Date(crumb.timestamp).toLocaleTimeString()}
                        </Text>
                        <Text style={styles.trailCoords}>
                          {crumb.latitude.toFixed(6)}, {crumb.longitude.toFixed(6)}
                        </Text>
                      </View>
                      <View style={styles.trailMeta}>
                        {crumb.speed > 0 && (
                          <Text style={styles.trailSpeed}>
                            {Math.round(crumb.speed * 3.6)} km/h
                          </Text>
                        )}
                        <Text style={[styles.trailStatus, {
                          color: crumb.moving ? '#00C853' : '#FF6D00',
                        }]}>
                          {crumb.moving ? 'Moving' : 'Still'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Action Buttons */}
            <TouchableOpacity style={styles.completeBtn} onPress={handleComplete} activeOpacity={0.85}>
              <Ionicons name="checkmark-circle" size={22} color="#FFF" />
              <Text style={styles.completeBtnText}>I've Arrived Safely</Text>
            </TouchableOpacity>

            {/* Share Buttons */}
            <View style={styles.shareBtnRow}>
              <TouchableOpacity
                style={styles.whatsappBtn}
                onPress={handleShareWhatsApp}
                activeOpacity={0.85}
              >
                <MaterialCommunityIcons name="whatsapp" size={20} color="#FFF" />
                <Text style={styles.shareBtnText}>Share via WhatsApp</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.smsShareBtn}
                onPress={handleShareSMS}
                activeOpacity={0.85}
              >
                <Ionicons name="chatbubble" size={18} color="#1565C0" />
                <Text style={styles.smsBtnText}>SMS</Text>
              </TouchableOpacity>
            </View>

            {/* Extend Time */}
            <Text style={styles.extendTitle}>Need More Time?</Text>
            <View style={styles.extendRow}>
              {[10, 15, 30, 60].map((min) => (
                <TouchableOpacity
                  key={min}
                  style={styles.extendBtn}
                  onPress={() => handleExtend(min)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.extendBtnText}>+{min}m</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Emergency SOS */}
            <TouchableOpacity
              style={[styles.sosBtn, !journeyOverdue && { opacity: 0.8 }]}
              onPress={handleSOS}
              activeOpacity={0.85}
            >
              <Ionicons name="alert-circle" size={24} color="#FFF" />
              <Text style={styles.sosBtnText}>
                SEND SOS (WhatsApp + SMS)
              </Text>
              <Text style={styles.sosSub}>
                Shares full journey trail with contacts
              </Text>
            </TouchableOpacity>
          </View>
        ) : showHistory ? (
          /* ─── JOURNEY HISTORY ─── */
          <View>
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>Journey History</Text>
              <Text style={styles.historyCount}>{journeyHistory.length} trips</Text>
            </View>

            {journeyHistory.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="time-outline" size={48} color={COLORS.textLight} />
                <Text style={styles.emptyText}>No journey history yet</Text>
                <Text style={styles.emptySub}>Completed journeys will appear here</Text>
              </View>
            ) : (
              journeyHistory.map((trip, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.historyCard}
                  onPress={() => setShowHistoryDetail(showHistoryDetail === i ? null : i)}
                  activeOpacity={0.85}
                >
                  <View style={styles.historyTop}>
                    <View style={[styles.historyIconWrap, {
                      backgroundColor: trip.status === 'overdue' ? '#FFEBEE' : '#E8F5E9',
                    }]}>
                      <Ionicons
                        name={trip.status === 'overdue' ? 'warning' : 'checkmark-circle'}
                        size={18}
                        color={trip.status === 'overdue' ? '#FF1744' : '#00C853'}
                      />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.historyDest}>{trip.destination}</Text>
                      <Text style={styles.historyDate}>
                        {new Date(trip.startTime).toLocaleDateString('en-IN', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })} at {new Date(trip.startTime).toLocaleTimeString('en-IN', {
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </Text>
                    </View>
                    <View style={[styles.historyBadge, {
                      backgroundColor: trip.status === 'overdue' ? '#FF174415' : '#00C85315',
                    }]}>
                      <Text style={[styles.historyBadgeText, {
                        color: trip.status === 'overdue' ? '#FF1744' : '#00C853',
                      }]}>
                        {trip.status === 'overdue' ? 'Overdue' : 'Safe'}
                      </Text>
                    </View>
                  </View>

                  {/* Stats Row */}
                  <View style={styles.historyStatsRow}>
                    <View style={styles.historyStatItem}>
                      <Ionicons name="navigate" size={12} color="#1565C0" />
                      <Text style={styles.historyStat}>
                        {formatDistance(trip.stats?.distance || 0)}
                      </Text>
                    </View>
                    <View style={styles.historyStatItem}>
                      <Ionicons name="location" size={12} color="#AA00FF" />
                      <Text style={styles.historyStat}>
                        {trip.breadcrumbs?.length || 0} pts
                      </Text>
                    </View>
                    <View style={styles.historyStatItem}>
                      <Ionicons name="time" size={12} color="#FF6D00" />
                      <Text style={styles.historyStat}>
                        {trip.minutesToArrive} min ETA
                      </Text>
                    </View>
                  </View>

                  {/* Expanded Detail */}
                  {showHistoryDetail === i && trip.breadcrumbs?.length > 0 && (
                    <View style={styles.historyDetail}>
                      <Text style={styles.historyDetailTitle}>
                        Route Trail ({trip.breadcrumbs.length} GPS points)
                      </Text>
                      <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                        {trip.breadcrumbs.slice(0, 30).map((c, j) => (
                          <View key={j} style={styles.historyTrailRow}>
                            <View style={[styles.historyTrailDot, {
                              backgroundColor: c.moving ? '#00C853' : '#FFD600',
                            }]} />
                            <Text style={styles.historyTrailText}>
                              {new Date(c.timestamp).toLocaleTimeString()} — {c.latitude.toFixed(5)}, {c.longitude.toFixed(5)}
                              {c.speed > 0 ? ` (${Math.round(c.speed * 3.6)} km/h)` : ''}
                            </Text>
                          </View>
                        ))}
                        {trip.breadcrumbs.length > 30 && (
                          <Text style={styles.historyMore}>
                            + {trip.breadcrumbs.length - 30} more points
                          </Text>
                        )}
                      </ScrollView>
                    </View>
                  )}
                </TouchableOpacity>
              ))
            )}
          </View>
        ) : (
          /* ─── NEW JOURNEY SETUP ─── */
          <View>
            <View style={styles.setupCard}>
              <View style={styles.setupHeader}>
                <MaterialCommunityIcons name="map-marker-path" size={24} color="#1565C0" />
                <Text style={styles.setupTitle}>Start a New Journey</Text>
              </View>

              <Text style={styles.fieldLabel}>Where are you going?</Text>
              <TextInput
                style={styles.input}
                value={destination}
                onChangeText={setDestination}
                placeholder="e.g., Home, College, Office, Friend's house"
                placeholderTextColor={COLORS.textLight}
              />

              <Text style={styles.fieldLabel}>Expected travel time</Text>
              <View style={styles.timeGrid}>
                {TIME_OPTIONS.map((min) => (
                  <TouchableOpacity
                    key={min}
                    style={[styles.timeBtn, selectedMinutes === min && styles.timeBtnActive]}
                    onPress={() => setSelectedMinutes(min)}
                    activeOpacity={0.8}
                  >
                    <Text style={[
                      styles.timeBtnText,
                      selectedMinutes === min && styles.timeBtnTextActive,
                    ]}>
                      {min >= 60 ? `${min / 60}h` : `${min}m`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* What happens */}
              <View style={styles.trackingInfo}>
                <Text style={styles.trackingInfoTitle}>When you start:</Text>
                <View style={styles.trackingInfoRow}>
                  <Ionicons name="checkmark-circle" size={14} color="#00C853" />
                  <Text style={styles.trackingInfoText}>GPS records your position every 5 seconds</Text>
                </View>
                <View style={styles.trackingInfoRow}>
                  <Ionicons name="checkmark-circle" size={14} color="#00C853" />
                  <Text style={styles.trackingInfoText}>Motion detection tracks if you're moving</Text>
                </View>
                <View style={styles.trackingInfoRow}>
                  <Ionicons name="checkmark-circle" size={14} color="#00C853" />
                  <Text style={styles.trackingInfoText}>Full route saved to your device memory</Text>
                </View>
                <View style={styles.trackingInfoRow}>
                  <Ionicons name="checkmark-circle" size={14} color="#00C853" />
                  <Text style={styles.trackingInfoText}>SOS shares entire journey via WhatsApp + SMS</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.startBtn}
                onPress={handleStartJourney}
                activeOpacity={0.85}
              >
                <Ionicons name="navigate" size={22} color="#FFF" />
                <Text style={styles.startBtnText}>Start Journey Tracking</Text>
              </TouchableOpacity>
            </View>

            {/* How It Works */}
            <View style={styles.howItWorks}>
              <Text style={styles.howTitle}>How It Works</Text>
              {[
                { icon: 'location', text: 'Set destination and expected travel time', color: '#1565C0' },
                { icon: 'navigate', text: 'GPS records your route every 5 seconds', color: '#00C853' },
                { icon: 'pulse', text: 'Motion detection checks if device is moving', color: '#FF6D00' },
                { icon: 'save', text: 'Entire journey trail saved to device memory', color: '#AA00FF' },
                { icon: 'notifications', text: 'Auto-alert if you don\'t arrive on time', color: '#D50000' },
                { icon: 'logo-whatsapp', text: 'SOS shares trail via WhatsApp + SMS', color: '#25D366' },
              ].map((step, i) => (
                <View key={i} style={styles.howStep}>
                  <View style={[styles.howIcon, { backgroundColor: step.color + '12' }]}>
                    <Ionicons name={step.icon} size={18} color={step.color} />
                  </View>
                  <Text style={styles.howText}>{step.text}</Text>
                </View>
              ))}
            </View>

            {/* Quick Stats */}
            {journeyHistory.length > 0 && (
              <View style={styles.quickStats}>
                <View style={styles.qStatItem}>
                  <Text style={styles.qStatNum}>{journeyHistory.length}</Text>
                  <Text style={styles.qStatLabel}>Total Trips</Text>
                </View>
                <View style={styles.qStatItem}>
                  <Text style={styles.qStatNum}>
                    {journeyHistory.filter(j => j.status === 'completed').length}
                  </Text>
                  <Text style={styles.qStatLabel}>Safe Arrivals</Text>
                </View>
                <View style={styles.qStatItem}>
                  <Text style={styles.qStatNum}>
                    {formatDistance(
                      journeyHistory.reduce((sum, j) => sum + (j.stats?.distance || 0), 0)
                    )}
                  </Text>
                  <Text style={styles.qStatLabel}>Total Distance</Text>
                </View>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 56 : 40, paddingBottom: 18,
    backgroundColor: '#1565C0',
    borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
    ...SHADOWS.large,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#FFF', letterSpacing: 0.3 },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  historyToggle: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  content: { padding: 16, paddingTop: 14 },

  // Info Banner
  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#E3F2FD', borderRadius: 16, padding: 14,
    marginBottom: 14, borderWidth: 1, borderColor: '#90CAF9',
  },
  infoBannerIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#BBDEFB', justifyContent: 'center', alignItems: 'center',
  },
  infoTitle: { fontSize: 14, fontWeight: '800', color: '#1565C0' },
  infoText: { fontSize: 12, color: '#1976D2', marginTop: 4, lineHeight: 17 },

  // Motion Banner
  motionBanner: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 16,
    padding: 14, marginBottom: 14, borderWidth: 1.5,
  },
  motionMoving: { backgroundColor: '#E8F5E9', borderColor: '#A5D6A7' },
  motionStationary: { backgroundColor: '#FFFDE7', borderColor: '#FFF176' },
  motionDot: { width: 16, height: 16, borderRadius: 8 },
  motionLabel: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  motionSub: { fontSize: 11, color: COLORS.textLight, marginTop: 2 },
  speedBadge: {
    alignItems: 'center', backgroundColor: '#FFF',
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6,
    ...SHADOWS.small,
  },
  speedText: { fontSize: 22, fontWeight: '900', color: '#1565C0' },
  speedUnit: { fontSize: 9, fontWeight: '700', color: COLORS.textLight },

  // Active Journey Card
  activeCard: {
    backgroundColor: '#FFF', borderRadius: 20, padding: 18,
    ...SHADOWS.medium, borderWidth: 2, borderColor: '#90CAF9', marginBottom: 12,
  },
  activeCardOverdue: { borderColor: '#FF1744', backgroundColor: '#FFF5F5' },
  activeHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  activeIconWrap: {
    width: 48, height: 48, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  activeTitle: { fontSize: 18, fontWeight: '900', color: '#1565C0' },
  activeDestination: { fontSize: 13, color: COLORS.textLight, marginTop: 3 },

  timerBox: {
    backgroundColor: '#E3F2FD', borderRadius: 16, padding: 20,
    alignItems: 'center', marginBottom: 16,
  },
  timerBoxOverdue: { backgroundColor: '#FFEBEE' },
  timerLabel: { fontSize: 11, fontWeight: '800', color: '#666', letterSpacing: 1 },
  timerValue: { fontSize: 40, fontWeight: '900', color: '#1565C0', marginTop: 4 },

  // Stats Grid
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  statItem: {
    width: (SCREEN_W - 80) / 2, alignItems: 'center',
    backgroundColor: '#F8F9FA', borderRadius: 14, paddingVertical: 12,
  },
  statIconWrap: {
    width: 32, height: 32, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center', marginBottom: 6,
  },
  statValue: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  statLabel: { fontSize: 10, color: COLORS.textLight, marginTop: 2, fontWeight: '600' },

  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  detailLabel: { fontSize: 13, color: COLORS.textLight },
  detailValue: { fontSize: 13, fontWeight: '700', color: COLORS.text },

  // Trail Toggle
  trailToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#E3F2FD', borderRadius: 12, paddingVertical: 12, marginBottom: 10,
    gap: 8,
  },
  trailToggleIcon: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: '#BBDEFB', justifyContent: 'center', alignItems: 'center',
  },
  trailToggleText: { fontSize: 13, fontWeight: '700', color: '#1565C0' },

  // Trail Card
  trailCard: {
    backgroundColor: '#FFF', borderRadius: 16, padding: 12,
    marginBottom: 12, ...SHADOWS.small, borderWidth: 1, borderColor: COLORS.border,
  },
  trailRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: COLORS.border + '60',
  },
  trailDot: { width: 10, height: 10, borderRadius: 5 },
  trailTime: { fontSize: 12, fontWeight: '700', color: COLORS.text },
  trailCoords: { fontSize: 10, color: COLORS.textLight, marginTop: 1 },
  trailMeta: { alignItems: 'flex-end' },
  trailSpeed: { fontSize: 12, fontWeight: '700', color: '#1565C0' },
  trailStatus: { fontSize: 9, fontWeight: '700', marginTop: 2 },

  // Action Buttons
  completeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#00C853', borderRadius: 16, paddingVertical: 16,
    marginBottom: 10, gap: 8, ...SHADOWS.small,
  },
  completeBtnText: { fontSize: 16, fontWeight: '800', color: '#FFF' },

  shareBtnRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  whatsappBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#25D366', borderRadius: 14, paddingVertical: 14, gap: 8,
    ...SHADOWS.small,
  },
  shareBtnText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  smsShareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#E3F2FD', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 14,
    gap: 6, borderWidth: 1, borderColor: '#90CAF9',
  },
  smsBtnText: { fontSize: 13, fontWeight: '700', color: '#1565C0' },

  extendTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginTop: 8, marginBottom: 8 },
  extendRow: { flexDirection: 'row', gap: 8 },
  extendBtn: {
    flex: 1, backgroundColor: '#E3F2FD', borderRadius: 12,
    paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#90CAF9',
  },
  extendBtnText: { fontSize: 14, fontWeight: '700', color: '#1565C0' },

  // SOS Button
  sosBtn: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FF1744', borderRadius: 18, paddingVertical: 18,
    marginTop: 16, ...SHADOWS.medium,
  },
  sosBtnText: { fontSize: 17, fontWeight: '900', color: '#FFF', marginTop: 4 },
  sosSub: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 3 },

  // Setup Card
  setupCard: {
    backgroundColor: '#FFF', borderRadius: 20, padding: 20,
    ...SHADOWS.medium, borderWidth: 1, borderColor: COLORS.border,
  },
  setupHeader: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 18, gap: 10,
  },
  setupTitle: { fontSize: 20, fontWeight: '900', color: COLORS.text },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: COLORS.background, borderRadius: 14, padding: 14,
    fontSize: 15, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border,
  },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeBtn: {
    width: '30%', paddingVertical: 12, borderRadius: 12,
    backgroundColor: COLORS.background, alignItems: 'center',
    borderWidth: 1.5, borderColor: COLORS.border, marginBottom: 4,
  },
  timeBtnActive: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  timeBtnText: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  timeBtnTextActive: { color: '#FFF' },

  trackingInfo: {
    backgroundColor: '#F1F8E9', borderRadius: 14, padding: 14, marginTop: 16,
    borderWidth: 1, borderColor: '#C5E1A5',
  },
  trackingInfoTitle: { fontSize: 13, fontWeight: '800', color: '#33691E', marginBottom: 10 },
  trackingInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  trackingInfoText: { fontSize: 12, color: '#558B2F', flex: 1 },

  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#1565C0', borderRadius: 16, paddingVertical: 16,
    marginTop: 20, gap: 8, ...SHADOWS.small,
  },
  startBtnText: { fontSize: 16, fontWeight: '800', color: '#FFF' },

  // How it works
  howItWorks: {
    backgroundColor: '#FFF', borderRadius: 18, padding: 18,
    marginTop: 16, ...SHADOWS.small, borderWidth: 1, borderColor: COLORS.border,
  },
  howTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 14 },
  howStep: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  howIcon: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  howText: { fontSize: 13, color: COLORS.text, flex: 1, lineHeight: 18 },

  // Quick Stats
  quickStats: {
    flexDirection: 'row', gap: 10, marginTop: 16,
  },
  qStatItem: {
    flex: 1, backgroundColor: '#FFF', borderRadius: 16, paddingVertical: 16,
    alignItems: 'center', ...SHADOWS.small, borderWidth: 1, borderColor: COLORS.border,
  },
  qStatNum: { fontSize: 20, fontWeight: '900', color: COLORS.text },
  qStatLabel: { fontSize: 10, color: COLORS.textLight, marginTop: 3, fontWeight: '600' },

  // Journey History
  historyHeader: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 14,
  },
  historyTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, flex: 1 },
  historyCount: {
    fontSize: 12, fontWeight: '800', color: '#1565C0',
    backgroundColor: '#E3F2FD', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3,
  },

  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 16, fontWeight: '700', color: COLORS.textSecondary, marginTop: 14 },
  emptySub: { fontSize: 12, color: COLORS.textLight, marginTop: 4 },

  historyCard: {
    backgroundColor: '#FFF', borderRadius: 16, padding: 16,
    marginBottom: 10, ...SHADOWS.small, borderWidth: 1, borderColor: COLORS.border,
  },
  historyTop: { flexDirection: 'row', alignItems: 'center' },
  historyIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  historyDest: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  historyDate: { fontSize: 11, color: COLORS.textLight, marginTop: 2 },
  historyBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  historyBadgeText: { fontSize: 11, fontWeight: '800' },
  historyStatsRow: {
    flexDirection: 'row', gap: 12, marginTop: 10, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  historyStatItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  historyStat: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },

  historyDetail: {
    marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  historyDetailTitle: { fontSize: 12, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  historyTrailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 6 },
  historyTrailDot: { width: 6, height: 6, borderRadius: 3 },
  historyTrailText: { fontSize: 10, color: COLORS.textSecondary, flex: 1 },
  historyMore: { fontSize: 10, color: COLORS.textLight, fontStyle: 'italic', marginTop: 4 },
});
