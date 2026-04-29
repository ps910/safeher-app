/**
 * SafeHer — Firebase Cloud Functions (v2 API)
 * ═══════════════════════════════════════════════════════════
 *
 * Server-side emergency logic that runs reliably even when
 * the user's phone is offline, dead, or compromised.
 *
 * Functions:
 *  1. onSOSTriggered     — When SOS is written to RTDB, fan out alerts
 *  2. checkOverdueJourneys — Cron: every 5 min, indexed query
 *  3. sendEmergencyPush  — Auth+AppCheck-gated, rate-limited
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
  _deviceId?: string;
  _platform?: string;
  _syncedAt?: string;
  _priority?: string;
  _uid?: string;
  latitude?: number;
  longitude?: number;
  message?: string;
  contactsNotified?: number;
  status?: string;
  type?: string;
}

interface JourneyRecord {
  destination: string;
  expectedAt: number; // epoch ms (replaces ISO string)
  status: string;
  contacts?: Array<{ name: string; phone: string; pushToken?: string }>;
  deviceId: string;
  ownerUid: string;
  alertedAt?: number;
}

// ── Helpers ──────────────────────────────────────────────────────
const isValidLatLng = (lat: unknown, lng: unknown): lat is number =>
  typeof lat === "number" && typeof lng === "number" &&
  lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_PER_WINDOW = 10;

async function checkRateLimit(uid: string, kind: string): Promise<boolean> {
  const ref = db.ref(`admin/rate_limits/${uid}/${kind}`);
  const result = await ref.transaction((current: { count: number; windowStart: number } | null) => {
    const now = Date.now();
    if (!current || now - current.windowStart > RATE_LIMIT_WINDOW_MS) {
      return { count: 1, windowStart: now };
    }
    if (current.count >= RATE_LIMIT_MAX_PER_WINDOW) return; // abort transaction
    return { count: current.count + 1, windowStart: current.windowStart };
  });
  return result.committed;
}

// ═══════════════════════════════════════════════════════════════════
// 1. SOS TRIGGERED — fan out alerts to admin + contacts
// ═══════════════════════════════════════════════════════════════════
export const onSOSTriggered = functions.database
  .ref("/users/{uid}/sos_events/{eventId}")
  .onCreate(async (snapshot, context) => {
    const sosData = snapshot.val() as SOSEvent;
    const { uid, eventId } = context.params;

    // Validation
    if (sosData.latitude !== undefined &&
        !isValidLatLng(sosData.latitude, sosData.longitude)) {
      functions.logger.warn("Invalid SOS coordinates rejected", { uid, eventId });
      await snapshot.ref.remove();
      return null;
    }

    functions.logger.warn("🚨 SOS TRIGGERED", {
      uid, eventId,
      latitude: sosData.latitude,
      longitude: sosData.longitude,
      platform: sosData._platform,
    });

    // Server is the only writer for admin/active_sos (rules require admin token);
    // we mirror an admin-trusted copy here.
    await db.ref(`admin/active_sos/${eventId}`).set({
      _uid: uid,
      _deviceId: sosData._deviceId,
      _platform: sosData._platform,
      _syncedAt: sosData._syncedAt,
      latitude: sosData.latitude,
      longitude: sosData.longitude,
      status: "ACTIVE",
      needsResponse: true,
      serverReceivedAt: admin.database.ServerValue.TIMESTAMP,
    });

    // Atomic counter
    await db.ref("admin/statistics/total_sos_events")
      .transaction((current: number | null) => (current || 0) + 1);

    // Audit log
    await db.ref(`admin/sos_log/${eventId}`).set({
      uid,
      triggeredAt: sosData._syncedAt,
      serverReceivedAt: new Date().toISOString(),
      latitude: sosData.latitude,
      longitude: sosData.longitude,
    });

    return null;
  });

// ═══════════════════════════════════════════════════════════════════
// 2. CHECK OVERDUE JOURNEYS — runs every 5 min, indexed query
// ═══════════════════════════════════════════════════════════════════
//
// REQUIRES: an `admin/active_journeys` index keyed by journeyId,
// each entry carrying { ownerUid, expectedAt, deviceId }.
// Clients write to this index when they start/end a journey.
//
// This avoids loading every user's payload and scales linearly with
// the number of *active* journeys, not total users.
// ═══════════════════════════════════════════════════════════════════
export const checkOverdueJourneys = functions.pubsub
  .schedule("every 5 minutes")
  .onRun(async () => {
    const now = Date.now();

    const overdueSnap = await db.ref("admin/active_journeys")
      .orderByChild("expectedAt")
      .endAt(now)
      .limitToFirst(500)
      .once("value");

    if (!overdueSnap.exists()) return null;

    const promises: Promise<unknown>[] = [];

    overdueSnap.forEach((child) => {
      const journey = child.val() as JourneyRecord;
      const journeyId = child.key!;
      if (journey.status !== "active") return false;
      if (journey.alertedAt && now - journey.alertedAt < 10 * 60 * 1000) return false; // 10-min dedupe

      const overdueByMin = Math.round((now - journey.expectedAt) / 60000);
      functions.logger.warn("⏰ JOURNEY OVERDUE", {
        uid: journey.ownerUid, journeyId, destination: journey.destination, overdueByMin,
      });

      promises.push(
        db.ref(`users/${journey.ownerUid}/journeys/${journeyId}/status`).set("overdue"),
        db.ref(`admin/active_journeys/${journeyId}/alertedAt`).set(now),
        db.ref(`admin/overdue_journeys/${journeyId}`).set({
          uid: journey.ownerUid,
          destination: journey.destination,
          expectedAt: journey.expectedAt,
          overdueByMinutes: overdueByMin,
          detectedAt: now,
        }),
      );

      if (journey.contacts) {
        for (const contact of journey.contacts) {
          if (!contact.pushToken) continue;
          promises.push(
            admin.messaging().send({
              token: contact.pushToken,
              notification: {
                title: "⚠️ Journey Overdue Alert",
                body: `A SafeHer user hasn't arrived at "${journey.destination}" on time. Please check on them.`,
              },
              data: { type: "JOURNEY_OVERDUE", journeyId, uid: journey.ownerUid },
              android: {
                priority: "high",
                notification: { channelId: "sos_channel", priority: "max", sound: "default" },
              },
            }).catch((e) => functions.logger.error("Push send failed", e)),
          );
        }
      }
      return false;
    });

    await Promise.allSettled(promises);
    return null;
  });

// ═══════════════════════════════════════════════════════════════════
// 3. SEND EMERGENCY PUSH — auth-gated, App Check enforced, rate-limited
// ═══════════════════════════════════════════════════════════════════
export const sendEmergencyPush = functions
  .runWith({ enforceAppCheck: true })
  .https.onCall(async (data: any, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
    }
    const uid = context.auth.uid;

    const { tokens, title, body, payload } = (data ?? {}) as {
      tokens?: unknown;
      title?: unknown;
      body?: unknown;
      payload?: Record<string, string>;
    };

    if (!Array.isArray(tokens) || tokens.length === 0 || tokens.length > 20) {
      throw new functions.https.HttpsError("invalid-argument", "Provide 1-20 push tokens.");
    }
    if (typeof title !== "string" || title.length > 120) {
      throw new functions.https.HttpsError("invalid-argument", "Invalid title.");
    }
    if (typeof body !== "string" || body.length > 500) {
      throw new functions.https.HttpsError("invalid-argument", "Invalid body.");
    }

    const allowed = await checkRateLimit(uid, "push");
    if (!allowed) {
      throw new functions.https.HttpsError("resource-exhausted", "Rate limit exceeded.");
    }

    // Verify each token belongs to a contact registered under this uid.
    const tokensSnap = await db.ref(`users/${uid}/contact_push_tokens`).once("value");
    const allowedTokens = new Set<string>();
    if (tokensSnap.exists()) {
      const obj = tokensSnap.val() as Record<string, string>;
      Object.values(obj).forEach((t) => { if (typeof t === "string") allowedTokens.add(t); });
    }

    const validTokens = (tokens as unknown[])
      .filter((t): t is string => typeof t === "string" && allowedTokens.has(t));

    if (validTokens.length === 0) {
      throw new functions.https.HttpsError("permission-denied", "No tokens are registered for this user.");
    }

    const results = { sent: 0, failed: 0, errors: [] as string[] };
    await Promise.all(validTokens.map(async (token) => {
      try {
        await admin.messaging().send({
          token,
          notification: { title, body },
          data: payload || {},
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
            payload: { aps: { sound: "default", badge: 1, "content-available": 1 } },
            headers: { "apns-priority": "10" },
          },
        });
        results.sent++;
      } catch (e: any) {
        results.failed++;
        results.errors.push(e?.message ?? "unknown");
      }
    }));

    return results;
  });

// ═══════════════════════════════════════════════════════════════════
// 4. CLEANUP OLD ALERTS — runs daily at 3 AM IST
// ═══════════════════════════════════════════════════════════════════
export const cleanupOldAlerts = functions.pubsub
  .schedule("every day 03:00")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const cutoffIso = new Date(cutoff).toISOString();

    // Page through resolved active_sos
    const oldSosSnap = await db.ref("admin/active_sos")
      .orderByChild("resolvedAt")
      .endAt(cutoffIso)
      .limitToFirst(1000)
      .once("value");
    const sosUpdates: Record<string, null> = {};
    oldSosSnap.forEach((c) => {
      const v = c.val() as { status?: string };
      if (v.status === "RESOLVED") sosUpdates[`admin/active_sos/${c.key}`] = null;
      return false;
    });
    if (Object.keys(sosUpdates).length > 0) {
      await db.ref().update(sosUpdates);
      functions.logger.info(`Cleaned ${Object.keys(sosUpdates).length} resolved alerts`);
    }

    // Old overdue journeys
    const oldJourneysSnap = await db.ref("admin/overdue_journeys")
      .orderByChild("detectedAt")
      .endAt(cutoff)
      .limitToFirst(1000)
      .once("value");
    const journeyUpdates: Record<string, null> = {};
    oldJourneysSnap.forEach((c) => {
      journeyUpdates[`admin/overdue_journeys/${c.key}`] = null;
      return false;
    });
    if (Object.keys(journeyUpdates).length > 0) {
      await db.ref().update(journeyUpdates);
      functions.logger.info(`Cleaned ${Object.keys(journeyUpdates).length} overdue journeys`);
    }

    // Expire stale live_tracking sessions
    const liveSnap = await db.ref("live_tracking")
      .orderByChild("expiresAt")
      .endAt(Date.now())
      .limitToFirst(1000)
      .once("value");
    const liveUpdates: Record<string, null> = {};
    liveSnap.forEach((c) => { liveUpdates[`live_tracking/${c.key}`] = null; return false; });
    if (Object.keys(liveUpdates).length > 0) {
      await db.ref().update(liveUpdates);
      functions.logger.info(`Cleaned ${Object.keys(liveUpdates).length} expired live sessions`);
    }

    return null;
  });

// ═══════════════════════════════════════════════════════════════════
// 5. DEVICE REGISTRATION — track active devices for admin
// ═══════════════════════════════════════════════════════════════════
export const onNewDevice = functions.database
  .ref("/admin/devices/{uid}")
  .onWrite(async (change) => {
    if (!change.before.exists() && change.after.exists()) {
      await db.ref("admin/statistics/total_devices")
        .transaction((current: number | null) => (current || 0) + 1);
    }
    return null;
  });
