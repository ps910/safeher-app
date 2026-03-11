/**
 * SafeHer — Firebase Cloud Functions
 * ═══════════════════════════════════════════════════════════
 *
 * Server-side emergency logic that runs reliably even when
 * the user's phone is offline, dead, or compromised.
 *
 * Functions:
 *  1. onSOSTriggered     — When SOS is written to RTDB, fan out alerts
 *  2. checkOverdueJourneys — Cron: every 5 min, check unresolved journeys
 *  3. sendEmergencyPush  — Push notification to emergency contacts
 *  4. cleanupOldAlerts   — Cron: daily, remove resolved alerts > 30 days
 *  5. onNewDevice        — Track active devices for admin dashboard
 *
 * Deploy: cd functions && npm run deploy
 */
import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";

admin.initializeApp();

const db = admin.database();

// ── Types ────────────────────────────────────────────────────────
interface SOSEvent {
  _deviceId: string;
  _platform: string;
  _syncedAt: string;
  _priority: string;
  latitude?: number;
  longitude?: number;
  message?: string;
  contactsNotified?: number;
  status?: string;
  type?: string;
}

interface JourneyRecord {
  destination: string;
  expectedArrivalTime: string;
  status: string;
  contacts?: Array<{ name: string; phone: string; pushToken?: string }>;
  deviceId: string;
}

// ═══════════════════════════════════════════════════════════════════
// 1. SOS TRIGGERED — fan out alerts to admin + contacts
// ═══════════════════════════════════════════════════════════════════
export const onSOSTriggered = functions.database
  .ref("/users/{deviceId}/sos_events/{eventId}")
  .onCreate(async (snapshot: any, context: any) => {
    const sosData = snapshot.val() as SOSEvent;
    const { deviceId, eventId } = context.params;

    functions.logger.warn("🚨 SOS TRIGGERED", {
      deviceId,
      eventId,
      latitude: sosData.latitude,
      longitude: sosData.longitude,
      platform: sosData._platform,
    });

    // Write to admin/active_sos for dashboard visibility
    await db.ref(`admin/active_sos/${eventId}`).set({
      ...sosData,
      status: "ACTIVE",
      needsResponse: true,
      serverReceivedAt: admin.database.ServerValue.TIMESTAMP,
    });

    // Increment global SOS counter
    await db.ref("admin/statistics/total_sos_events")
      .transaction((current: number | null) => (current || 0) + 1);

    // Log for audit trail
    await db.ref(`admin/sos_log/${eventId}`).set({
      deviceId,
      triggeredAt: sosData._syncedAt,
      serverReceivedAt: new Date().toISOString(),
      latitude: sosData.latitude,
      longitude: sosData.longitude,
    });

    functions.logger.info(`SOS ${eventId} processed for device ${deviceId}`);
    return null;
  });

// ═══════════════════════════════════════════════════════════════════
// 2. CHECK OVERDUE JOURNEYS — runs every 5 minutes
// ═══════════════════════════════════════════════════════════════════
export const checkOverdueJourneys = functions.pubsub
  .schedule("every 5 minutes")
  .onRun(async () => {
    const now = Date.now();
    const usersSnap = await db.ref("users").once("value");

    if (!usersSnap.exists()) return null;

    const users = usersSnap.val() as Record<string, Record<string, any>>;

    for (const [deviceId, userData] of Object.entries(users)) {
      const journeys = userData.journeys as Record<string, JourneyRecord> | undefined;
      if (!journeys) continue;

      for (const [journeyId, journey] of Object.entries(journeys)) {
        if (journey.status !== "active") continue;

        const expectedTime = new Date(journey.expectedArrivalTime).getTime();
        if (now > expectedTime) {
          functions.logger.warn("⏰ JOURNEY OVERDUE", {
            deviceId,
            journeyId,
            destination: journey.destination,
            expectedAt: journey.expectedArrivalTime,
            overdueByMin: Math.round((now - expectedTime) / 60000),
          });

          // Mark as overdue
          await db.ref(`users/${deviceId}/journeys/${journeyId}/status`).set("overdue");

          // Alert admin
          await db.ref(`admin/overdue_journeys/${journeyId}`).set({
            deviceId,
            destination: journey.destination,
            expectedArrivalTime: journey.expectedArrivalTime,
            overdueByMinutes: Math.round((now - expectedTime) / 60000),
            detectedAt: new Date().toISOString(),
          });

          // Send push notifications to emergency contacts (if tokens exist)
          if (journey.contacts) {
            for (const contact of journey.contacts) {
              if (contact.pushToken) {
                try {
                  await admin.messaging().send({
                    token: contact.pushToken,
                    notification: {
                      title: "⚠️ Journey Overdue Alert",
                      body: `A SafeHer user hasn't arrived at "${journey.destination}" on time. Please check on them.`,
                    },
                    data: {
                      type: "JOURNEY_OVERDUE",
                      journeyId,
                      deviceId,
                    },
                    android: {
                      priority: "high",
                      notification: {
                        channelId: "sos_channel",
                        priority: "max",
                        sound: "default",
                      },
                    },
                  });
                } catch (e) {
                  functions.logger.error("Push send failed:", e);
                }
              }
            }
          }
        }
      }
    }

    return null;
  });

// ═══════════════════════════════════════════════════════════════════
// 3. SEND EMERGENCY PUSH — callable function from app
// ═══════════════════════════════════════════════════════════════════
export const sendEmergencyPush = functions.https
  .onCall(async (request: any) => {
    const { tokens, title, body, data } = request.data as {
      tokens: string[];
      title: string;
      body: string;
      data?: Record<string, string>;
    };

    if (!tokens || tokens.length === 0) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "At least one push token is required"
      );
    }

    const results = { sent: 0, failed: 0, errors: [] as string[] };

    for (const token of tokens) {
      try {
        await admin.messaging().send({
          token,
          notification: { title, body },
          data: data || {},
          android: {
            priority: "high",
            notification: {
              channelId: "sos_channel",
              priority: "max",
              sound: "default",
              defaultVibrateTimings: false,
              vibrateTimingsMillis: [0, 500, 200, 500],
            },
          },
          apns: {
            payload: {
              aps: {
                sound: "default",
                badge: 1,
                "content-available": 1,
              },
            },
            headers: {
              "apns-priority": "10",
            },
          },
        });
        results.sent++;
      } catch (e: any) {
        results.failed++;
        results.errors.push(e.message);
      }
    }

    return results;
  });

// ═══════════════════════════════════════════════════════════════════
// 4. CLEANUP OLD ALERTS — runs daily at 3 AM
// ═══════════════════════════════════════════════════════════════════
export const cleanupOldAlerts = functions.pubsub
  .schedule("every day 03:00")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Clean resolved SOS events from admin
    const activeSOS = await db.ref("admin/active_sos").once("value");
    if (activeSOS.exists()) {
      const events = activeSOS.val() as Record<string, any>;
      const updates: Record<string, null> = {};

      for (const [eventId, event] of Object.entries(events)) {
        if (event.status === "RESOLVED" && event.resolvedAt < thirtyDaysAgo) {
          updates[`admin/active_sos/${eventId}`] = null;
        }
      }

      if (Object.keys(updates).length > 0) {
        await db.ref().update(updates);
        functions.logger.info(`Cleaned up ${Object.keys(updates).length} old resolved alerts`);
      }
    }

    // Clean resolved overdue journeys
    const overdueJourneys = await db.ref("admin/overdue_journeys").once("value");
    if (overdueJourneys.exists()) {
      const journeys = overdueJourneys.val() as Record<string, any>;
      const updates: Record<string, null> = {};

      for (const [journeyId, journey] of Object.entries(journeys)) {
        if (journey.detectedAt < thirtyDaysAgo) {
          updates[`admin/overdue_journeys/${journeyId}`] = null;
        }
      }

      if (Object.keys(updates).length > 0) {
        await db.ref().update(updates);
        functions.logger.info(`Cleaned up ${Object.keys(updates).length} old overdue journeys`);
      }
    }

    return null;
  });

// ═══════════════════════════════════════════════════════════════════
// 5. DEVICE REGISTRATION — track active devices for admin
// ═══════════════════════════════════════════════════════════════════
export const onNewDevice = functions.database
  .ref("/admin/devices/{deviceId}")
  .onWrite(async (change: any, context: any) => {
    const { deviceId } = context.params;

    // Increment device count on new registration
    if (!change.before.exists() && change.after.exists()) {
      await db.ref("admin/statistics/total_devices")
        .transaction((current: number | null) => (current || 0) + 1);

      functions.logger.info(`New device registered: ${deviceId}`);
    }

    return null;
  });
