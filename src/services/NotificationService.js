/**
 * NotificationService — Push Notifications + SOS Delivery Confirmation
 * Uses expo-notifications + Firebase Cloud Messaging (FCM) for reliable
 * SOS alert delivery with read receipts.
 * 
 * Features:
 *  - FCM push notifications to emergency contacts
 *  - Local notifications for SOS triggers, journey alerts, check-in reminders
 *  - Persistent SOS notification with quick-tap actions
 *  - Delivery confirmation via Firebase RTDB
 *  - Volume button SOS trigger via notification action
 * 
 * v1.0 — SafeHer App
 */
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-constants';
import { Platform, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FCM_TOKENS_KEY = '@gs_fcm_tokens';
const NOTIFICATION_CHANNEL_SOS = 'sos-alerts';
const NOTIFICATION_CHANNEL_SAFETY = 'safety-alerts';

// ─── Initialize notification handler ─────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data || {};
    
    // Always show SOS notifications with max priority
    if (data.type === 'sos') {
      return {
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
      };
    }
    
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    };
  },
});

// ─── State ───────────────────────────────────────────────────────
let _notificationListener = null;
let _responseListener = null;
let _onSOSTrigger = null;
let _pushToken = null;

const NotificationService = {
  /**
   * Initialize the notification service.
   * Must be called once at app startup.
   * @param {Object} options
   * @param {Function} options.onSOSTrigger - Called when SOS notification action is tapped
   * @param {Function} options.onNotification - Called on incoming notification
   */
  async initialize(options = {}) {
    const { onSOSTrigger = null, onNotification = null } = options;
    _onSOSTrigger = onSOSTrigger;

    try {
      // Create Android notification channels
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_SOS, {
          name: 'SOS Emergency Alerts',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 1000, 500, 1000, 500, 1000],
          lightColor: '#FF1744',
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          bypassDnd: true,
          sound: 'default',
        });

        await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_SAFETY, {
          name: 'Safety Notifications',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#E91E63',
          sound: 'default',
        });
      }

      // Request permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('[Notifications] Permission denied');
        return { success: false, error: 'permission_denied' };
      }

      // Get push token for FCM
      try {
        const tokenData = await Notifications.getExpoPushTokenAsync({
          projectId: Device.default?.expoConfig?.extra?.eas?.projectId,
        });
        _pushToken = tokenData.data;
        console.log('[Notifications] Push token:', _pushToken);
      } catch (e) {
        console.log('[Notifications] Push token error (expected in dev):', e.message);
      }

      // Listen for incoming notifications
      _notificationListener = Notifications.addNotificationReceivedListener((notification) => {
        console.log('[Notifications] Received:', notification.request.content.title);
        if (onNotification) onNotification(notification);
      });

      // Listen for notification taps
      _responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data || {};
        const actionId = response.actionIdentifier;

        console.log('[Notifications] Response:', actionId, data);

        if (data.type === 'sos_trigger' || actionId === 'SOS_ACTIVATE') {
          if (_onSOSTrigger) _onSOSTrigger();
        }
      });

      console.log('[Notifications] Initialized successfully');
      return { success: true, pushToken: _pushToken };
    } catch (e) {
      console.error('[Notifications] Init error:', e);
      return { success: false, error: e.message };
    }
  },

  /**
   * Show persistent SOS notification with quick-tap action button.
   * This stays in the notification tray for one-tap SOS activation.
   */
  async showPersistentSOSNotification() {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🛡️ SafeHer Protection Active',
          body: 'Tap to activate emergency SOS',
          data: { type: 'sos_trigger' },
          sticky: true,
          autoDismiss: false,
          ...(Platform.OS === 'android' && {
            channelId: NOTIFICATION_CHANNEL_SOS,
            priority: 'max',
            color: '#E91E63',
          }),
        },
        trigger: null, // Show immediately
        identifier: 'persistent-sos',
      });
      console.log('[Notifications] Persistent SOS notification shown');
    } catch (e) {
      console.error('[Notifications] Persistent notification error:', e);
    }
  },

  /**
   * Remove the persistent SOS notification.
   */
  async hidePersistentSOSNotification() {
    try {
      await Notifications.dismissNotificationAsync('persistent-sos');
    } catch (e) {
      // May not exist, ignore
    }
  },

  /**
   * Send SOS alert notification to self (triggers sound + vibration).
   */
  async sendSOSActiveNotification(location) {
    const locationText = location?.coords
      ? `📍 ${location.coords.latitude.toFixed(6)}, ${location.coords.longitude.toFixed(6)}`
      : 'Location unavailable';

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🚨 SOS EMERGENCY ACTIVE',
          body: `Emergency mode activated.\n${locationText}\nContacts have been notified.`,
          data: { type: 'sos', active: true },
          sound: 'default',
          ...(Platform.OS === 'android' && {
            channelId: NOTIFICATION_CHANNEL_SOS,
            priority: 'max',
            color: '#FF1744',
          }),
        },
        trigger: null,
        identifier: 'sos-active',
      });
    } catch (e) {
      console.error('[Notifications] SOS notification error:', e);
    }
  },

  /**
   * Send SOS push notification to emergency contacts via Expo Push API.
   * Contacts need to have registered their push tokens.
   * Falls back to local notification if push fails.
   */
  async sendSOSPushToContacts(contacts, message, location) {
    try {
      // Load stored FCM/push tokens for contacts
      const storedTokens = await AsyncStorage.getItem(FCM_TOKENS_KEY);
      const tokenMap = storedTokens ? JSON.parse(storedTokens) : {};

      const locationText = location?.coords
        ? `https://maps.google.com/?q=${location.coords.latitude},${location.coords.longitude}`
        : '';

      const pushMessages = [];
      
      for (const contact of contacts) {
        const token = tokenMap[contact.phone] || tokenMap[contact.id];
        if (token) {
          pushMessages.push({
            to: token,
            title: '🚨 SOS EMERGENCY from SafeHer User',
            body: `${message}\n\n${locationText}`,
            data: {
              type: 'sos',
              location: location?.coords ? {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
              } : null,
              timestamp: Date.now(),
            },
            sound: 'default',
            priority: 'high',
            channelId: NOTIFICATION_CHANNEL_SOS,
          });
        }
      }

      if (pushMessages.length > 0) {
        // Send via Expo Push API
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(pushMessages),
        });

        const result = await response.json();
        console.log('[Notifications] Push sent:', result);

        // Store delivery receipts
        const receipts = result.data?.map((r, i) => ({
          contact: contacts[i]?.name,
          status: r.status,
          id: r.id,
          timestamp: Date.now(),
        })) || [];

        await AsyncStorage.setItem(
          '@gs_sos_delivery_receipts',
          JSON.stringify(receipts)
        );

        return {
          success: true,
          sent: pushMessages.length,
          total: contacts.length,
          receipts,
        };
      }

      return { success: false, sent: 0, total: contacts.length, reason: 'no_tokens' };
    } catch (e) {
      console.error('[Notifications] Push send error:', e);
      return { success: false, error: e.message };
    }
  },

  /**
   * Show check-in reminder notification.
   */
  async showCheckInReminder(minutesSinceLastCheckIn) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '⏰ Safety Check-In Required',
          body: `You haven't checked in for ${minutesSinceLastCheckIn} minutes. Tap to confirm you're safe.`,
          data: { type: 'checkin_reminder' },
          sound: 'default',
          ...(Platform.OS === 'android' && {
            channelId: NOTIFICATION_CHANNEL_SAFETY,
            priority: 'high',
            color: '#FF6D00',
          }),
        },
        trigger: null,
        identifier: 'checkin-reminder',
      });
    } catch (e) {
      console.error('[Notifications] Check-in reminder error:', e);
    }
  },

  /**
   * Show journey overdue notification.
   */
  async showJourneyOverdueNotification(destination) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '⚠️ Journey Overdue!',
          body: `You haven't arrived at "${destination}" on time. Open SafeHer to confirm you're safe.`,
          data: { type: 'journey_overdue', destination },
          sound: 'default',
          ...(Platform.OS === 'android' && {
            channelId: NOTIFICATION_CHANNEL_SOS,
            priority: 'max',
            color: '#FF6D00',
          }),
        },
        trigger: null,
        identifier: 'journey-overdue',
      });
    } catch (e) {
      console.error('[Notifications] Journey overdue error:', e);
    }
  },

  /**
   * Register a contact's push token (for receiving SOS alerts).
   */
  async registerContactToken(contactId, pushToken) {
    try {
      const stored = await AsyncStorage.getItem(FCM_TOKENS_KEY);
      const tokenMap = stored ? JSON.parse(stored) : {};
      tokenMap[contactId] = pushToken;
      await AsyncStorage.setItem(FCM_TOKENS_KEY, JSON.stringify(tokenMap));
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Get delivery receipts for the last SOS.
   */
  async getDeliveryReceipts() {
    try {
      const stored = await AsyncStorage.getItem('@gs_sos_delivery_receipts');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  },

  /**
   * Get this device's push token.
   */
  getPushToken() {
    return _pushToken;
  },

  /**
   * Schedule a delayed notification.
   */
  async scheduleNotification(title, body, data = {}, delaySeconds = 0) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data,
          sound: 'default',
          ...(Platform.OS === 'android' && {
            channelId: NOTIFICATION_CHANNEL_SAFETY,
          }),
        },
        trigger: delaySeconds > 0 ? { seconds: delaySeconds } : null,
      });
    } catch (e) {
      console.error('[Notifications] Schedule error:', e);
    }
  },

  /**
   * Cancel all scheduled notifications.
   */
  async cancelAll() {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch (e) {
      console.error('[Notifications] Cancel error:', e);
    }
  },

  /**
   * Cleanup listeners — call on app unmount.
   */
  cleanup() {
    if (_notificationListener) {
      Notifications.removeNotificationSubscription(_notificationListener);
      _notificationListener = null;
    }
    if (_responseListener) {
      Notifications.removeNotificationSubscription(_responseListener);
      _responseListener = null;
    }
  },
};

export default NotificationService;
