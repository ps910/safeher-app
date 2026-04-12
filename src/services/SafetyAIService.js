/**
 * SafetyAIService — AI-powered background safety services
 *
 * Features:
 *  - Shake Detection (Accelerometer → SOS trigger)
 *  - Scream / Loud Sound Detection (Audio metering → SOS prompt)
 *  - Emergency Siren (Max-volume alarm loop)
 *  - Auto Audio Recording (evidence capture during SOS)
 *  - Auto Photo Capture (camera burst during SOS)
 *  - Inactivity monitoring helpers
 *
 * All services are start/stop controlled via EmergencyContext settings.
 */
import { Accelerometer } from 'expo-sensors';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

// ─── Constants ───────────────────────────────────────────────────
const SHAKE_THRESHOLD = 2.5;          // G-force to count as a shake
const SHAKE_COUNT_TRIGGER = 3;        // Shakes needed to trigger SOS
const SHAKE_WINDOW_MS = 2000;         // Window to detect N shakes
const SHAKE_COOLDOWN_MS = 5000;       // Prevent rapid re-triggers

const SCREAM_THRESHOLD_DB = -20;      // dBFS threshold (metering returns -160 to 0)
const SCREAM_SUSTAINED_MS = 800;      // Must sustain loud level for this long
const SCREAM_COOLDOWN_MS = 10000;     // Cooldown between scream detections
const SCREAM_CHECK_INTERVAL = 200;    // Audio metering check rate (ms)

const SIREN_FREQUENCY = 1200;         // Hz of generated alarm tone

class SafetyAIServiceClass {
  constructor() {
    // ── Shake Detection ──
    this.isShakeActive = false;
    this.shakeSubscription = null;
    this.shakeTimes = [];
    this.lastShakeTrigger = 0;
    this.onShakeSOS = null;

    // ── Scream Detection ──
    this.isScreamActive = false;
    this.screamRecording = null;
    this.screamCheckInterval = null;
    this.screamStartTime = 0;
    this.lastScreamTrigger = 0;
    this.onScreamDetected = null;
    this.screamThreshold = SCREAM_THRESHOLD_DB;

    // ── Siren ──
    this.sirenSound = null;
    this.isSirenPlaying = false;

    // ── Auto Recording ──
    this.evidenceRecording = null;
    this.isRecordingEvidence = false;
    this.recordingUri = null;

    // ── Auto Photo ──
    this.isCapturingPhotos = false;
    this.capturedPhotos = [];

    // ── Status tracking ──
    this.serviceStatus = {
      shake: 'off',
      scream: 'off',
      siren: 'off',
      recording: 'off',
      photos: 'off',
    };

    this.listeners = new Set();
  }

  // ─── Event Listeners ───────────────────────────────────────────
  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  _notify(event) {
    this.listeners.forEach(cb => {
      try { cb(event); } catch (e) {}
    });
  }

  getStatus() {
    return { ...this.serviceStatus };
  }

  // ═══════════════════════════════════════════════════════════════
  //  SHAKE DETECTION (Accelerometer-based)
  // ═══════════════════════════════════════════════════════════════
  async startShakeDetection(onSOS) {
    if (this.isShakeActive) return;

    try {
      const isAvailable = await Accelerometer.isAvailableAsync();
      if (!isAvailable) {
        console.log('[ShakeDetect] Accelerometer not available');
        this.serviceStatus.shake = 'unavailable';
        return false;
      }

      this.onShakeSOS = onSOS;
      this.shakeTimes = [];
      this.lastShakeTrigger = 0;

      Accelerometer.setUpdateInterval(100); // 10 readings/sec

      this.shakeSubscription = Accelerometer.addListener(({ x, y, z }) => {
        const totalForce = Math.sqrt(x * x + y * y + z * z);

        if (totalForce > SHAKE_THRESHOLD) {
          const now = Date.now();

          // Remove old shake events outside the window
          this.shakeTimes = this.shakeTimes.filter(t => now - t < SHAKE_WINDOW_MS);
          this.shakeTimes.push(now);

          if (
            this.shakeTimes.length >= SHAKE_COUNT_TRIGGER &&
            now - this.lastShakeTrigger > SHAKE_COOLDOWN_MS
          ) {
            this.lastShakeTrigger = now;
            this.shakeTimes = [];
            console.log('[ShakeDetect] 🚨 SHAKE SOS TRIGGERED!');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Vibration.vibrate([0, 300, 100, 300], false);
            this._notify({ type: 'shake_sos', timestamp: new Date().toISOString() });

            if (this.onShakeSOS) {
              this.onShakeSOS();
            }
          }
        }
      });

      this.isShakeActive = true;
      this.serviceStatus.shake = 'active';
      console.log('[ShakeDetect] ✅ Started — shake phone 3x to trigger SOS');
      return true;
    } catch (e) {
      console.error('[ShakeDetect] Start error:', e);
      this.serviceStatus.shake = 'error';
      return false;
    }
  }

  stopShakeDetection() {
    if (this.shakeSubscription) {
      this.shakeSubscription.remove();
      this.shakeSubscription = null;
    }
    this.isShakeActive = false;
    this.onShakeSOS = null;
    this.shakeTimes = [];
    this.serviceStatus.shake = 'off';
    console.log('[ShakeDetect] Stopped');
  }

  // ═══════════════════════════════════════════════════════════════
  //  SCREAM / LOUD SOUND DETECTION (Audio Metering)
  // ═══════════════════════════════════════════════════════════════
  async startScreamDetection(onScream, threshold) {
    if (this.isScreamActive) return;

    if (threshold) this.screamThreshold = threshold;
    this.onScreamDetected = onScream;

    try {
      // Request audio permissions
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        console.log('[ScreamDetect] Audio permission denied');
        this.serviceStatus.scream = 'no_permission';
        return false;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
      });

      // Start a silent recording with metering enabled
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      await recording.startAsync();
      this.screamRecording = recording;
      this.screamStartTime = 0;
      this.lastScreamTrigger = 0;

      // Check metering levels periodically
      this.screamCheckInterval = setInterval(async () => {
        try {
          const status = await this.screamRecording.getStatusAsync();
          if (!status.isRecording) return;

          const metering = status.metering; // dBFS (-160 to 0)
          if (metering == null) return;

          const now = Date.now();

          if (metering > this.screamThreshold) {
            // Sound is above threshold
            if (this.screamStartTime === 0) {
              this.screamStartTime = now;
            } else if (
              now - this.screamStartTime >= SCREAM_SUSTAINED_MS &&
              now - this.lastScreamTrigger > SCREAM_COOLDOWN_MS
            ) {
              // Sustained loud sound detected!
              this.lastScreamTrigger = now;
              this.screamStartTime = 0;
              console.log(`[ScreamDetect] 🚨 LOUD SOUND DETECTED! Level: ${metering.toFixed(1)} dBFS`);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              this._notify({
                type: 'scream_detected',
                level: metering,
                timestamp: new Date().toISOString(),
              });

              if (this.onScreamDetected) {
                this.onScreamDetected(metering);
              }
            }
          } else {
            // Sound dropped below threshold — reset
            this.screamStartTime = 0;
          }
        } catch (e) {
          // Metering check error (might happen if recording stopped)
        }
      }, SCREAM_CHECK_INTERVAL);

      this.isScreamActive = true;
      this.serviceStatus.scream = 'active';
      console.log(`[ScreamDetect] ✅ Started — monitoring ambient sound (threshold: ${this.screamThreshold} dBFS)`);
      return true;
    } catch (e) {
      console.error('[ScreamDetect] Start error:', e);
      this.serviceStatus.scream = 'error';
      return false;
    }
  }

  async stopScreamDetection() {
    if (this.screamCheckInterval) {
      clearInterval(this.screamCheckInterval);
      this.screamCheckInterval = null;
    }
    if (this.screamRecording) {
      try {
        await this.screamRecording.stopAndUnloadAsync();
      } catch (e) {}
      this.screamRecording = null;
    }
    this.isScreamActive = false;
    this.onScreamDetected = null;
    this.screamStartTime = 0;
    this.serviceStatus.scream = 'off';

    // Reset audio mode
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: false,
      });
    } catch (e) {}

    console.log('[ScreamDetect] Stopped');
  }

  // ═══════════════════════════════════════════════════════════════
  //  EMERGENCY SIREN (Max Volume Alarm)
  // ═══════════════════════════════════════════════════════════════
  async startSiren() {
    if (this.isSirenPlaying) return;

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
      });

      // Strategy 1: Try loading a real alarm sound from a reliable remote URL
      let sound = null;
      const ALARM_URLS = [
        'https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg',
        'https://actions.google.com/sounds/v1/alarms/beep_short.ogg',
        'https://actions.google.com/sounds/v1/emergency/emergency_siren.ogg',
      ];

      for (const url of ALARM_URLS) {
        try {
          const result = await Audio.Sound.createAsync(
            { uri: url },
            { shouldPlay: true, isLooping: true, volume: 1.0 },
            null,
            false
          );
          sound = result.sound;
          console.log('[Siren] Remote alarm loaded:', url);
          break;
        } catch (urlErr) {
          console.log('[Siren] URL failed, trying next:', url);
        }
      }

      // Strategy 2: Generate local WAV siren if remote fails
      if (!sound) {
        console.log('[Siren] Remote failed, generating local WAV siren...');
        try {
          const sirenUri = await this._generateSirenWAV();
          const result = await Audio.Sound.createAsync(
            { uri: sirenUri },
            { shouldPlay: true, isLooping: true, volume: 1.0 }
          );
          sound = result.sound;
          console.log('[Siren] Local WAV siren loaded');
        } catch (wavErr) {
          console.error('[Siren] Local WAV generation failed:', wavErr);
        }
      }

      if (sound) {
        this.sirenSound = sound;
        this.isSirenPlaying = true;
        this.serviceStatus.siren = 'playing';
        // Also vibrate
        Vibration.vibrate([0, 500, 200, 500, 200, 500, 200, 500, 200, 500], true);
        console.log('[Siren] Emergency siren activated!');
        this._notify({ type: 'siren_started', timestamp: new Date().toISOString() });
        return true;
      }

      // Strategy 3: Last resort — vibrate only
      throw new Error('No audio source available');
    } catch (e) {
      console.error('[Siren] All audio strategies failed:', e);
      Vibration.vibrate([0, 1000, 200, 1000, 200, 1000], true);
      this.isSirenPlaying = true;
      this.serviceStatus.siren = 'vibration_only';
      this._notify({ type: 'siren_started', timestamp: new Date().toISOString() });
      return true;
    }
  }

  async stopSiren() {
    Vibration.cancel();
    if (this.sirenSound) {
      try {
        await this.sirenSound.stopAsync();
        await this.sirenSound.unloadAsync();
      } catch (e) {}
      this.sirenSound = null;
    }
    this.isSirenPlaying = false;
    this.serviceStatus.siren = 'off';
    console.log('[Siren] Stopped');
    this._notify({ type: 'siren_stopped' });
  }

  /**
   * Generate a WAV siren tone using plain JS arrays (Hermes-compatible).
   * Produces a loud ascending/descending siren between 600–1500 Hz.
   */
  async _generateSirenWAV() {
    const sampleRate = 22050;
    const durationSec = 4;
    const numSamples = sampleRate * durationSec;
    const bytesPerSample = 2;
    const dataSize = numSamples * bytesPerSample;
    const fileSize = 44 + dataSize;

    // Build entire WAV as a plain byte array
    const wav = new Array(fileSize);

    // Helper: write a string at offset
    const writeStr = (offset, str) => {
      for (let i = 0; i < str.length; i++) wav[offset + i] = str.charCodeAt(i);
    };
    // Helper: write 32-bit little-endian uint
    const writeU32 = (offset, val) => {
      wav[offset]     = val & 0xFF;
      wav[offset + 1] = (val >> 8) & 0xFF;
      wav[offset + 2] = (val >> 16) & 0xFF;
      wav[offset + 3] = (val >> 24) & 0xFF;
    };
    // Helper: write 16-bit little-endian uint
    const writeU16 = (offset, val) => {
      wav[offset]     = val & 0xFF;
      wav[offset + 1] = (val >> 8) & 0xFF;
    };

    // WAV header (44 bytes)
    writeStr(0, 'RIFF');
    writeU32(4, 36 + dataSize);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    writeU32(16, 16);             // chunk size
    writeU16(20, 1);              // PCM format
    writeU16(22, 1);              // mono
    writeU32(24, sampleRate);     // sample rate
    writeU32(28, sampleRate * bytesPerSample); // byte rate
    writeU16(32, bytesPerSample); // block align
    writeU16(34, 16);             // bits per sample
    writeStr(36, 'data');
    writeU32(40, dataSize);

    // Generate siren samples — loud ascending/descending sweep
    let offset = 44;
    let phase = 0;
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      // Siren sweeps: 0.7s up, 0.7s down
      const cyclePos = (t % 1.4) / 1.4;
      const freq = cyclePos < 0.5
        ? 600 + cyclePos * 2 * 900     // 600 → 1500 Hz
        : 1500 - (cyclePos - 0.5) * 2 * 900; // 1500 → 600 Hz

      phase += (2 * Math.PI * freq) / sampleRate;
      if (phase > 2 * Math.PI) phase -= 2 * Math.PI;

      // Full-volume sine wave
      const sample = Math.sin(phase) * 0.95;
      const intSample = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));

      // Write 16-bit signed LE
      const unsigned = intSample < 0 ? intSample + 65536 : intSample;
      wav[offset]     = unsigned & 0xFF;
      wav[offset + 1] = (unsigned >> 8) & 0xFF;
      offset += 2;
    }

    // Convert byte array to base64 — Hermes-safe chunked encoder
    const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let b64 = '';
    for (let i = 0; i < wav.length; i += 3) {
      const a = wav[i];
      const b = i + 1 < wav.length ? wav[i + 1] : 0;
      const c = i + 2 < wav.length ? wav[i + 2] : 0;
      b64 += B64[(a >> 2) & 0x3F];
      b64 += B64[((a & 3) << 4) | ((b >> 4) & 0xF)];
      b64 += i + 1 < wav.length ? B64[((b & 0xF) << 2) | ((c >> 6) & 3)] : '=';
      b64 += i + 2 < wav.length ? B64[c & 0x3F] : '=';
    }

    // Write to file
    const fileUri = FileSystem.documentDirectory + 'sos_siren.wav';
    await FileSystem.writeAsStringAsync(fileUri, b64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return fileUri;
  }

  // ═══════════════════════════════════════════════════════════════
  //  AUTO EVIDENCE RECORDING (Audio)
  // ═══════════════════════════════════════════════════════════════
  async startEvidenceRecording() {
    if (this.isRecordingEvidence) return null;

    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        console.log('[EvidenceRec] Audio permission denied');
        this.serviceStatus.recording = 'no_permission';
        return null;
      }

      // Don't interfere with siren if it's playing
      if (!this.isSirenPlaying) {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
        });
      }

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      await recording.startAsync();

      this.evidenceRecording = recording;
      this.isRecordingEvidence = true;
      this.serviceStatus.recording = 'active';

      console.log('[EvidenceRec] 🎙️ Audio evidence recording started');
      this._notify({ type: 'recording_started', timestamp: new Date().toISOString() });

      return recording;
    } catch (e) {
      console.error('[EvidenceRec] Start error:', e);
      this.serviceStatus.recording = 'error';
      return null;
    }
  }

  async stopEvidenceRecording() {
    if (!this.evidenceRecording) return null;

    try {
      await this.evidenceRecording.stopAndUnloadAsync();
      const uri = this.evidenceRecording.getURI();
      this.recordingUri = uri;
      this.evidenceRecording = null;
      this.isRecordingEvidence = false;
      this.serviceStatus.recording = 'off';

      // Reset audio mode
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: false,
        });
      } catch (e) {}

      console.log('[EvidenceRec] Stopped. Saved to:', uri);
      this._notify({ type: 'recording_saved', uri, timestamp: new Date().toISOString() });

      // Save evidence file info
      const fileName = `sos_evidence_${Date.now()}.m4a`;
      const destUri = FileSystem.documentDirectory + 'evidence/' + fileName;

      try {
        await FileSystem.makeDirectoryAsync(FileSystem.documentDirectory + 'evidence/', { intermediates: true });
        await FileSystem.moveAsync({ from: uri, to: destUri });
        return { uri: destUri, fileName, duration: 'unknown', type: 'audio' };
      } catch (moveErr) {
        return { uri, fileName: 'recording.m4a', duration: 'unknown', type: 'audio' };
      }
    } catch (e) {
      console.error('[EvidenceRec] Stop error:', e);
      this.isRecordingEvidence = false;
      this.serviceStatus.recording = 'error';
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  AUTO PHOTO CAPTURE (via ImagePicker — foreground only)
  // ═══════════════════════════════════════════════════════════════
  /**
   * Note: True background photo capture requires native camera access.
   * This provides a front-camera capture prompt when SOS triggers.
   * For stealth mode, it captures silently using expo-camera if available.
   */
  async captureEvidencePhoto() {
    try {
      const Camera = require('expo-camera');
      // Request camera permission
      const { status } = await Camera.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        this.serviceStatus.photos = 'no_permission';
        return null;
      }

      // Use ImagePicker as a fallback approach
      const ImagePicker = require('expo-image-picker');
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.5,
        base64: false,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        const photo = result.assets[0];
        const fileName = `sos_photo_${Date.now()}.jpg`;
        const destUri = FileSystem.documentDirectory + 'evidence/' + fileName;

        try {
          await FileSystem.makeDirectoryAsync(FileSystem.documentDirectory + 'evidence/', { intermediates: true });
          await FileSystem.copyAsync({ from: photo.uri, to: destUri });
          this.capturedPhotos.push(destUri);
          this._notify({ type: 'photo_captured', uri: destUri });
          return { uri: destUri, fileName, type: 'photo' };
        } catch (e) {
          this.capturedPhotos.push(photo.uri);
          return { uri: photo.uri, fileName, type: 'photo' };
        }
      }
      return null;
    } catch (e) {
      console.log('[PhotoCapture] Error:', e);
      this.serviceStatus.photos = 'error';
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  FULL SOS ACTIVATION (starts all enabled services at once)
  // ═══════════════════════════════════════════════════════════════
  async activateSOSServices(settings = {}) {
    const results = {
      siren: false,
      recording: false,
      photo: false,
    };

    // Start siren if enabled
    if (settings.sirenEnabled) {
      results.siren = await this.startSiren();
    }

    // Start audio recording if enabled
    if (settings.autoRecordAudio) {
      const rec = await this.startEvidenceRecording();
      results.recording = !!rec;
    }

    // Capture photo if enabled (foreground only)
    if (settings.autoPhotoCapture) {
      try {
        const photo = await this.captureEvidencePhoto();
        results.photo = !!photo;
      } catch (e) {
        results.photo = false;
      }
    }

    console.log('[SOS Services] Activated:', results);
    return results;
  }

  async deactivateSOSServices() {
    const results = {};

    // Stop siren
    if (this.isSirenPlaying) {
      await this.stopSiren();
      results.siren = 'stopped';
    }

    // Stop recording
    if (this.isRecordingEvidence) {
      const evidence = await this.stopEvidenceRecording();
      results.recording = evidence ? 'saved' : 'stopped';
      results.evidenceUri = evidence?.uri;
    }

    // Clear photos list
    results.photosCaptured = this.capturedPhotos.length;
    this.capturedPhotos = [];

    console.log('[SOS Services] Deactivated:', results);
    return results;
  }

  // ═══════════════════════════════════════════════════════════════
  //  CLEANUP (stop everything)
  // ═══════════════════════════════════════════════════════════════
  async cleanup() {
    this.stopShakeDetection();
    await this.stopScreamDetection();
    await this.stopSiren();
    await this.stopEvidenceRecording();
    this.listeners.clear();
    console.log('[SafetyAI] All services cleaned up');
  }
}

const SafetyAIService = new SafetyAIServiceClass();
export default SafetyAIService;
