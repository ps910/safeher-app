package com.girlsafety.app.sos

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.telephony.SmsManager
import android.util.Log
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.sqrt

/**
 * NativeSOSModule — Kotlin native module for SafeHer
 * ═════════════════════════════════════════════════════
 *
 * Why native? JS bridge adds 50-200ms latency per SMS.
 * In an emergency, every millisecond counts.
 *
 * Features:
 *  1. Direct SMS sending — bypasses JS bridge entirely
 *  2. Hardware shake detection — reads accelerometer at native speed
 *  3. Emergency vibration patterns — direct hardware access
 *  4. Silent SMS — sends without opening any UI (requires SEND_SMS permission)
 */
class NativeSOSModule : Module() {

    companion object {
        private const val TAG = "NativeSOSModule"
        private const val SHAKE_THRESHOLD = 15.0   // m/s² for SOS trigger
        private const val SHAKE_TIME_WINDOW = 2000L // ms — 3 shakes within 2 seconds
        private const val MIN_SHAKES = 3
    }

    // Shake detection state
    private var sensorManager: SensorManager? = null
    private var accelerometer: Sensor? = null
    private var shakeListener: SensorEventListener? = null
    private var lastShakeTime = 0L
    private var shakeCount = 0
    private var isShakeDetectionActive = false

    override fun definition() = ModuleDefinition {
        Name("NativeSOSModule")

        // ── Send SOS SMS to multiple contacts silently ──────────────
        // Returns: { success: true, sent: 3, failed: 0, errors: [] }
        AsyncFunction("sendSOSSMS") { phones: List<String>, message: String ->
            val context = appContext.reactContext ?: return@AsyncFunction mapOf(
                "success" to false,
                "sent" to 0,
                "failed" to phones.size,
                "errors" to listOf("No context available")
            )

            // Check SEND_SMS permission
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS)
                != PackageManager.PERMISSION_GRANTED
            ) {
                return@AsyncFunction mapOf(
                    "success" to false,
                    "sent" to 0,
                    "failed" to phones.size,
                    "errors" to listOf("SEND_SMS permission not granted")
                )
            }

            val smsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                context.getSystemService(SmsManager::class.java)
            } else {
                @Suppress("DEPRECATION")
                SmsManager.getDefault()
            }

            var sentCount = 0
            var failedCount = 0
            val errors = mutableListOf<String>()

            for (phone in phones) {
                try {
                    val cleanPhone = phone.replace(Regex("[^0-9+]"), "")
                    if (cleanPhone.isBlank()) {
                        failedCount++
                        errors.add("Invalid phone: $phone")
                        continue
                    }

                    // Split long messages into parts (SMS limit is 160 chars)
                    val parts = smsManager.divideMessage(message)
                    if (parts.size > 1) {
                        smsManager.sendMultipartTextMessage(cleanPhone, null, parts, null, null)
                    } else {
                        smsManager.sendTextMessage(cleanPhone, null, message, null, null)
                    }

                    sentCount++
                    Log.d(TAG, "SMS sent to $cleanPhone")
                } catch (e: Exception) {
                    failedCount++
                    errors.add("${phone}: ${e.message}")
                    Log.e(TAG, "SMS failed for $phone", e)
                }
            }

            mapOf(
                "success" to (sentCount > 0),
                "sent" to sentCount,
                "failed" to failedCount,
                "errors" to errors
            )
        }

        // ── Start hardware shake detection ──────────────────────────
        // Emits 'onShakeDetected' event when shake SOS is triggered
        Function("startShakeDetection") {
            val context = appContext.reactContext ?: return@Function false

            if (isShakeDetectionActive) return@Function true

            sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
            accelerometer = sensorManager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)

            if (accelerometer == null) {
                Log.w(TAG, "No accelerometer available")
                return@Function false
            }

            shakeListener = object : SensorEventListener {
                override fun onSensorChanged(event: SensorEvent?) {
                    event ?: return
                    val x = event.values[0]
                    val y = event.values[1]
                    val z = event.values[2]

                    // Calculate acceleration magnitude minus gravity
                    val magnitude = sqrt((x * x + y * y + z * z).toDouble()) - SensorManager.GRAVITY_EARTH

                    if (magnitude > SHAKE_THRESHOLD) {
                        val now = System.currentTimeMillis()

                        if (now - lastShakeTime > SHAKE_TIME_WINDOW) {
                            shakeCount = 0
                        }

                        shakeCount++
                        lastShakeTime = now

                        if (shakeCount >= MIN_SHAKES) {
                            shakeCount = 0
                            Log.d(TAG, "SOS SHAKE DETECTED!")

                            // Emit event to JS
                            sendEvent("onShakeDetected", mapOf(
                                "timestamp" to now,
                                "magnitude" to magnitude
                            ))

                            // Vibrate immediately (native = zero bridge delay)
                            triggerSOSVibration(context)
                        }
                    }
                }

                override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
            }

            sensorManager?.registerListener(
                shakeListener,
                accelerometer,
                SensorManager.SENSOR_DELAY_GAME // Fastest polling for safety
            )

            isShakeDetectionActive = true
            Log.d(TAG, "Shake detection started")
            true
        }

        // ── Stop shake detection ────────────────────────────────────
        Function("stopShakeDetection") {
            if (shakeListener != null) {
                sensorManager?.unregisterListener(shakeListener)
                shakeListener = null
            }
            isShakeDetectionActive = false
            shakeCount = 0
            Log.d(TAG, "Shake detection stopped")
            true
        }

        // ── Trigger SOS vibration pattern ───────────────────────────
        Function("vibrateSOSPattern") {
            val context = appContext.reactContext ?: return@Function false
            triggerSOSVibration(context)
            true
        }

        // ── Check if SMS permission is granted ──────────────────────
        Function("hasSMSPermission") {
            val context = appContext.reactContext ?: return@Function false
            ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS) ==
                PackageManager.PERMISSION_GRANTED
        }

        // ── Events emitted to JS ────────────────────────────────────
        Events("onShakeDetected")

        // ── Cleanup ─────────────────────────────────────────────────
        OnDestroy {
            if (shakeListener != null) {
                sensorManager?.unregisterListener(shakeListener)
                shakeListener = null
            }
            isShakeDetectionActive = false
        }
    }

    private fun triggerSOSVibration(context: Context) {
        try {
            // SOS pattern: 3 short, 3 long, 3 short (... --- ...)
            val pattern = longArrayOf(
                0,    // Start immediately
                200, 100, 200, 100, 200, // ... (short × 3)
                300,                      // pause
                500, 100, 500, 100, 500, // --- (long × 3)
                300,                      // pause
                200, 100, 200, 100, 200  // ... (short × 3)
            )

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                vibratorManager?.defaultVibrator?.vibrate(
                    VibrationEffect.createWaveform(pattern, -1)
                )
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                @Suppress("DEPRECATION")
                val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                vibrator?.vibrate(VibrationEffect.createWaveform(pattern, -1))
            } else {
                @Suppress("DEPRECATION")
                val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                @Suppress("DEPRECATION")
                vibrator?.vibrate(pattern, -1)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Vibration error", e)
        }
    }
}
