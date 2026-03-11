/**
 * NotificationService — TypeScript — Push Notifications + SOS Delivery
 */
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Types ────────────────────────────────────────────────────────
interface InitOptions {
  onSOSTrigger?: (() => void) | null;
  onNotification?: ((notification: Notifications.Notification) => void) | null;
}

interface InitResult {
  success: boolean;
  pushToken?: string | null;
  error?: string;
}

interface PushResult {
  success: boolean;
  sent?: number;
  total?: number;
  receipts?: DeliveryReceipt[];
  reason?: string;
  error?: string;
}

interface DeliveryReceipt {
  contact: string;
  status: string;
  id: string;
  timestamp: number;
}

interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  [key: string]: any;
}

interface LocationInput {
  coords?: {
    latitude: number;
    longitude: number;
  };
}

// ── Constants ────────────────────────────────────────────────────
const FCM_TOKENS_KEY = '@gs_fcm_tokens';
const NOTIFICATION_CHANNEL_SOS = 'sos-alerts';
const NOTIFICATION_CHANNEL_SAFETY = 'safety-alerts';

// ── Notification Handler ─────────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data || {};

    if (data.type === 'sos') {
      return {
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
      };
    }

    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
});

// ── State ────────────────────────────────────────────────────────
let _notificationListener: Notifications.Subscription | null = null;
let _responseListener: Notifications.Subscription | null = null;
let _onSOSTrigger: (() => void) | null = null;
let _pushToken: string | null = null;

const NotificationService = {
  async initialize(options: InitOptions = {}): Promise<InitResult> {
    const { onSOSTrigger = null, onNotification = null } = options;
    _onSOSTrigger = onSOSTrigger;

    try {
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

      try {
        const projectId = Constants.expoConfig?.extra?.eas?.projectId || (Constants as any).easConfig?.projectId;
        if (projectId) {
          const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
          _pushToken = tokenData.data;
          console.log('[Notifications] Push token:', _pushToken);
        }
      } catch (e: any) {
        console.log('[Notifications] Push token error (expected in dev):', e.message);
      }

      _notificationListener = Notifications.addNotificationReceivedListener((notification) => {
        console.log('[Notifications] Received:', notification.request.content.title);
        if (onNotification) onNotification(notification);
      });

      _responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data || {};
        const actionId = response.actionIdentifier;

        if (data.type === 'sos_trigger' || actionId === 'SOS_ACTIVATE') {
          if (_onSOSTrigger) _onSOSTrigger();
        }
      });

      console.log('[Notifications] Initialized successfully');
      return { success: true, pushToken: _pushToken };
    } catch (e: any) {
      console.error('[Notifications] Init error:', e);
      return { success: false, error: e.message };
    }
  },

  async showPersistentSOSNotification(): Promise<void> {
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
            priority: 'max' as any,
            color: '#E91E63',
          }),
        },
        trigger: null,
        identifier: 'persistent-sos',
      });
    } catch (e) {
      console.error('[Notifications] Persistent notification error:', e);
    }
  },

  async hidePersistentSOSNotification(): Promise<void> {
    try {
      await Notifications.dismissNotificationAsync('persistent-sos');
    } catch {}
  },

  async sendSOSActiveNotification(location?: LocationInput): Promise<void> {
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
            priority: 'max' as any,
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

  async sendSOSPushToContacts(
    contacts: EmergencyContact[],
    message: string,
    location?: LocationInput
  ): Promise<PushResult> {
    try {
      const storedTokens = await AsyncStorage.getItem(FCM_TOKENS_KEY);
      const tokenMap: Record<string, string> = storedTokens ? JSON.parse(storedTokens) : {};

      const locationText = location?.coords
        ? `https://maps.google.com/?q=${location.coords.latitude},${location.coords.longitude}`
        : '';

      const pushMessages: Record<string, any>[] = [];

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
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(pushMessages),
        });

        const result = await response.json();
        const receipts: DeliveryReceipt[] = result.data?.map((r: any, i: number) => ({
          contact: contacts[i]?.name,
          status: r.status,
          id: r.id,
          timestamp: Date.now(),
        })) || [];

        await AsyncStorage.setItem('@gs_sos_delivery_receipts', JSON.stringify(receipts));

        return { success: true, sent: pushMessages.length, total: contacts.length, receipts };
      }

      return { success: false, sent: 0, total: contacts.length, reason: 'no_tokens' };
    } catch (e: any) {
      console.error('[Notifications] Push send error:', e);
      return { success: false, error: e.message };
    }
  },

  async showCheckInReminder(minutesSinceLastCheckIn: number): Promise<void> {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '⏰ Safety Check-In Required',
          body: `You haven't checked in for ${minutesSinceLastCheckIn} minutes. Tap to confirm you're safe.`,
          data: { type: 'checkin_reminder' },
          sound: 'default',
          ...(Platform.OS === 'android' && {
            channelId: NOTIFICATION_CHANNEL_SAFETY,
            priority: 'high' as any,
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

  async showJourneyOverdueNotification(destination: string): Promise<void> {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '⚠️ Journey Overdue!',
          body: `You haven't arrived at "${destination}" on time. Open SafeHer to confirm you're safe.`,
          data: { type: 'journey_overdue', destination },
          sound: 'default',
          ...(Platform.OS === 'android' && {
            channelId: NOTIFICATION_CHANNEL_SOS,
            priority: 'max' as any,
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

  async registerContactToken(contactId: string, pushToken: string): Promise<boolean> {
    try {
      const stored = await AsyncStorage.getItem(FCM_TOKENS_KEY);
      const tokenMap: Record<string, string> = stored ? JSON.parse(stored) : {};
      tokenMap[contactId] = pushToken;
      await AsyncStorage.setItem(FCM_TOKENS_KEY, JSON.stringify(tokenMap));
      return true;
    } catch {
      return false;
    }
  },

  async getDeliveryReceipts(): Promise<DeliveryReceipt[]> {
    try {
      const stored = await AsyncStorage.getItem('@gs_sos_delivery_receipts');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  },

  getPushToken(): string | null {
    return _pushToken;
  },

  async scheduleNotification(
    title: string,
    body: string,
    data: Record<string, any> = {},
    delaySeconds = 0
  ): Promise<void> {
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
        trigger: delaySeconds > 0 ? { seconds: delaySeconds } as any : null,
      });
    } catch (e) {
      console.error('[Notifications] Schedule error:', e);
    }
  },

  async cancelAll(): Promise<void> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch (e) {
      console.error('[Notifications] Cancel error:', e);
    }
  },

  cleanup(): void {
    if (_notificationListener) {
      _notificationListener.remove();
      _notificationListener = null;
    }
    if (_responseListener) {
      _responseListener.remove();
      _responseListener = null;
    }
  },
};

export default NotificationService;
