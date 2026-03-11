/**
 * SafetyAIService — TypeScript — AI-powered background safety services
 */
import { Accelerometer } from 'expo-sensors';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
const { documentDirectory, EncodingType, writeAsStringAsync, makeDirectoryAsync, moveAsync, copyAsync } = FileSystem as any;
import * as Haptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

// ── Types ────────────────────────────────────────────────────────
interface ServiceStatus {
  shake: string;
  scream: string;
  siren: string;
  recording: string;
  photos: string;
}

interface AIEvent {
  type: string;
  timestamp?: string;
  level?: number;
  uri?: string;
}

type AIListener = (event: AIEvent) => void;

interface ActivationSettings {
  sirenEnabled?: boolean;
  autoRecordAudio?: boolean;
  autoPhotoCapture?: boolean;
}

interface ActivationResult {
  siren: boolean;
  recording: boolean;
  photo: boolean;
}

interface DeactivationResult {
  siren?: string;
  recording?: string;
  evidenceUri?: string;
  photosCaptured?: number;
}

interface EvidenceFile {
  uri: string;
  fileName: string;
  duration?: string;
  type: string;
}

// ── Constants ────────────────────────────────────────────────────
const SHAKE_THRESHOLD = 2.5;
const SHAKE_COUNT_TRIGGER = 3;
const SHAKE_WINDOW_MS = 2000;
const SHAKE_COOLDOWN_MS = 5000;

const SCREAM_THRESHOLD_DB = -20;
const SCREAM_SUSTAINED_MS = 800;
const SCREAM_COOLDOWN_MS = 10000;
const SCREAM_CHECK_INTERVAL = 200;

class SafetyAIServiceClass {
  // ── Shake Detection ──
  private isShakeActive = false;
  private shakeSubscription: { remove: () => void } | null = null;
  private shakeTimes: number[] = [];
  private lastShakeTrigger = 0;
  private onShakeSOS: (() => void) | null = null;

  // ── Scream Detection ──
  private isScreamActive = false;
  private screamRecording: Audio.Recording | null = null;
  private screamCheckInterval: ReturnType<typeof setInterval> | null = null;
  private screamStartTime = 0;
  private lastScreamTrigger = 0;
  private onScreamDetected: ((level: number) => void) | null = null;
  private screamThreshold = SCREAM_THRESHOLD_DB;

  // ── Siren ──
  private sirenSound: Audio.Sound | null = null;
  private isSirenPlaying = false;

  // ── Auto Recording ──
  private evidenceRecording: Audio.Recording | null = null;
  private isRecordingEvidence = false;
  private recordingUri: string | null = null;

  // ── Auto Photo ──
  private isCapturingPhotos = false;
  private capturedPhotos: string[] = [];

  // ── Status ──
  private serviceStatus: ServiceStatus = {
    shake: 'off',
    scream: 'off',
    siren: 'off',
    recording: 'off',
    photos: 'off',
  };

  private listeners = new Set<AIListener>();

  // ── Event Listeners ────────────────────────────────────────────
  addListener(callback: AIListener): () => void {
    this.listeners.add(callback);
    return () => { this.listeners.delete(callback); };
  }

  private _notify(event: AIEvent): void {
    this.listeners.forEach(cb => { try { cb(event); } catch {} });
  }

  getStatus(): ServiceStatus {
    return { ...this.serviceStatus };
  }

  // ── Shake Detection ────────────────────────────────────────────
  async startShakeDetection(onSOS: () => void): Promise<boolean> {
    if (this.isShakeActive) return true;

    try {
      const isAvailable = await Accelerometer.isAvailableAsync();
      if (!isAvailable) {
        this.serviceStatus.shake = 'unavailable';
        return false;
      }

      this.onShakeSOS = onSOS;
      this.shakeTimes = [];
      this.lastShakeTrigger = 0;

      Accelerometer.setUpdateInterval(100);

      this.shakeSubscription = Accelerometer.addListener(({ x, y, z }) => {
        const totalForce = Math.sqrt(x * x + y * y + z * z);

        if (totalForce > SHAKE_THRESHOLD) {
          const now = Date.now();
          this.shakeTimes = this.shakeTimes.filter(t => now - t < SHAKE_WINDOW_MS);
          this.shakeTimes.push(now);

          if (
            this.shakeTimes.length >= SHAKE_COUNT_TRIGGER &&
            now - this.lastShakeTrigger > SHAKE_COOLDOWN_MS
          ) {
            this.lastShakeTrigger = now;
            this.shakeTimes = [];
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Vibration.vibrate([0, 300, 100, 300], false);
            this._notify({ type: 'shake_sos', timestamp: new Date().toISOString() });
            if (this.onShakeSOS) this.onShakeSOS();
          }
        }
      });

      this.isShakeActive = true;
      this.serviceStatus.shake = 'active';
      return true;
    } catch (e) {
      console.error('[ShakeDetect] Start error:', e);
      this.serviceStatus.shake = 'error';
      return false;
    }
  }

  stopShakeDetection(): void {
    if (this.shakeSubscription) {
      this.shakeSubscription.remove();
      this.shakeSubscription = null;
    }
    this.isShakeActive = false;
    this.onShakeSOS = null;
    this.shakeTimes = [];
    this.serviceStatus.shake = 'off';
  }

  // ── Scream Detection ───────────────────────────────────────────
  async startScreamDetection(onScream: (level: number) => void, threshold?: number): Promise<boolean> {
    if (this.isScreamActive) return true;

    if (threshold) this.screamThreshold = threshold;
    this.onScreamDetected = onScream;

    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        this.serviceStatus.scream = 'no_permission';
        return false;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      await recording.startAsync();
      this.screamRecording = recording;
      this.screamStartTime = 0;
      this.lastScreamTrigger = 0;

      this.screamCheckInterval = setInterval(async () => {
        try {
          const status = await this.screamRecording!.getStatusAsync();
          if (!status.isRecording) return;

          const metering = (status as any).metering as number | undefined;
          if (metering == null) return;

          const now = Date.now();

          if (metering > this.screamThreshold) {
            if (this.screamStartTime === 0) {
              this.screamStartTime = now;
            } else if (
              now - this.screamStartTime >= SCREAM_SUSTAINED_MS &&
              now - this.lastScreamTrigger > SCREAM_COOLDOWN_MS
            ) {
              this.lastScreamTrigger = now;
              this.screamStartTime = 0;
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              this._notify({
                type: 'scream_detected',
                level: metering,
                timestamp: new Date().toISOString(),
              });
              if (this.onScreamDetected) this.onScreamDetected(metering);
            }
          } else {
            this.screamStartTime = 0;
          }
        } catch {}
      }, SCREAM_CHECK_INTERVAL);

      this.isScreamActive = true;
      this.serviceStatus.scream = 'active';
      return true;
    } catch (e) {
      console.error('[ScreamDetect] Start error:', e);
      this.serviceStatus.scream = 'error';
      return false;
    }
  }

  async stopScreamDetection(): Promise<void> {
    if (this.screamCheckInterval) {
      clearInterval(this.screamCheckInterval);
      this.screamCheckInterval = null;
    }
    if (this.screamRecording) {
      try { await this.screamRecording.stopAndUnloadAsync(); } catch {}
      this.screamRecording = null;
    }
    this.isScreamActive = false;
    this.onScreamDetected = null;
    this.screamStartTime = 0;
    this.serviceStatus.scream = 'off';

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: false,
      });
    } catch {}
  }

  // ── Emergency Siren ────────────────────────────────────────────
  async startSiren(): Promise<boolean> {
    if (this.isSirenPlaying) return true;

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
      });

      const sirenUri = await this._generateAlarmTone();
      const { sound } = await Audio.Sound.createAsync(
        { uri: sirenUri },
        { shouldPlay: true, isLooping: true, volume: 1.0, rate: 1.0 }
      );

      this.sirenSound = sound;
      this.isSirenPlaying = true;
      this.serviceStatus.siren = 'playing';
      Vibration.vibrate([0, 500, 200, 500, 200, 500, 200, 500, 200, 500], true);
      this._notify({ type: 'siren_started', timestamp: new Date().toISOString() });
      return true;
    } catch (e) {
      console.error('[Siren] Start error:', e);
      Vibration.vibrate([0, 1000, 200, 1000, 200, 1000], true);
      this.isSirenPlaying = true;
      this.serviceStatus.siren = 'vibration_only';
      return true;
    }
  }

  async stopSiren(): Promise<void> {
    Vibration.cancel();
    if (this.sirenSound) {
      try {
        await this.sirenSound.stopAsync();
        await this.sirenSound.unloadAsync();
      } catch {}
      this.sirenSound = null;
    }
    this.isSirenPlaying = false;
    this.serviceStatus.siren = 'off';
    this._notify({ type: 'siren_stopped' });
  }

  private async _generateAlarmTone(): Promise<string> {
    const sampleRate = 22050;
    const durationSec = 2;
    const numSamples = sampleRate * durationSec;
    const bytesPerSample = 2;
    const dataSize = numSamples * bytesPerSample;

    const header = new ArrayBuffer(44);
    const view = new DataView(header);

    this._writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    this._writeString(view, 8, 'WAVE');
    this._writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * bytesPerSample, true);
    view.setUint16(32, bytesPerSample, true);
    view.setUint16(34, 16, true);
    this._writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    const samples = new Int16Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const phase = (t % 1.0);
      const freq = phase < 0.5
        ? 800 + (phase * 2) * 600
        : 1400 - ((phase - 0.5) * 2) * 600;
      const value = Math.sin(2 * Math.PI * freq * t) * 0.95;
      samples[i] = Math.round(value * 32767);
    }

    const headerBytes = new Uint8Array(header);
    const dataBytes = new Uint8Array(samples.buffer);
    const combined = new Uint8Array(headerBytes.length + dataBytes.length);
    combined.set(headerBytes, 0);
    combined.set(dataBytes, headerBytes.length);

    const base64 = this._uint8ToBase64(combined);
    const fileUri = documentDirectory + 'siren_alarm.wav';
    await writeAsStringAsync(fileUri, base64, {
      encoding: EncodingType.Base64,
    });
    return fileUri;
  }

  private _writeString(view: DataView, offset: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  private _uint8ToBase64(uint8: Uint8Array): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';
    const len = uint8.length;
    for (let i = 0; i < len; i += 3) {
      const a = uint8[i];
      const b = i + 1 < len ? uint8[i + 1] : 0;
      const c = i + 2 < len ? uint8[i + 2] : 0;
      result += chars[(a >> 2) & 0x3f];
      result += chars[((a & 3) << 4) | ((b >> 4) & 0xf)];
      result += i + 1 < len ? chars[((b & 0xf) << 2) | ((c >> 6) & 3)] : '=';
      result += i + 2 < len ? chars[c & 0x3f] : '=';
    }
    return result;
  }

  // ── Auto Evidence Recording ────────────────────────────────────
  async startEvidenceRecording(): Promise<Audio.Recording | null> {
    if (this.isRecordingEvidence) return null;

    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        this.serviceStatus.recording = 'no_permission';
        return null;
      }

      if (!this.isSirenPlaying) {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
        });
      }

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();

      this.evidenceRecording = recording;
      this.isRecordingEvidence = true;
      this.serviceStatus.recording = 'active';
      this._notify({ type: 'recording_started', timestamp: new Date().toISOString() });
      return recording;
    } catch (e) {
      console.error('[EvidenceRec] Start error:', e);
      this.serviceStatus.recording = 'error';
      return null;
    }
  }

  async stopEvidenceRecording(): Promise<EvidenceFile | null> {
    if (!this.evidenceRecording) return null;

    try {
      await this.evidenceRecording.stopAndUnloadAsync();
      const uri = this.evidenceRecording.getURI();
      this.recordingUri = uri;
      this.evidenceRecording = null;
      this.isRecordingEvidence = false;
      this.serviceStatus.recording = 'off';

      try {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: false });
      } catch {}

      this._notify({ type: 'recording_saved', uri: uri || undefined, timestamp: new Date().toISOString() });

      const fileName = `sos_evidence_${Date.now()}.m4a`;
      const destUri = documentDirectory + 'evidence/' + fileName;

      try {
        await makeDirectoryAsync(documentDirectory + 'evidence/', { intermediates: true });
        if (uri) await moveAsync({ from: uri, to: destUri });
        return { uri: destUri, fileName, duration: 'unknown', type: 'audio' };
      } catch {
        return { uri: uri || '', fileName: 'recording.m4a', duration: 'unknown', type: 'audio' };
      }
    } catch (e) {
      console.error('[EvidenceRec] Stop error:', e);
      this.isRecordingEvidence = false;
      this.serviceStatus.recording = 'error';
      return null;
    }
  }

  // ── Auto Photo Capture ─────────────────────────────────────────
  async captureEvidencePhoto(): Promise<EvidenceFile | null> {
    try {
      const Camera = require('expo-camera');
      const { status } = await Camera.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        this.serviceStatus.photos = 'no_permission';
        return null;
      }

      const ImagePicker = require('expo-image-picker');
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.5,
        base64: false,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        const photo = result.assets[0];
        const fileName = `sos_photo_${Date.now()}.jpg`;
        const destUri = documentDirectory + 'evidence/' + fileName;

        try {
          await makeDirectoryAsync(documentDirectory + 'evidence/', { intermediates: true });
          await copyAsync({ from: photo.uri, to: destUri });
          this.capturedPhotos.push(destUri);
          this._notify({ type: 'photo_captured', uri: destUri });
          return { uri: destUri, fileName, type: 'photo' };
        } catch {
          this.capturedPhotos.push(photo.uri);
          return { uri: photo.uri, fileName, type: 'photo' };
        }
      }
      return null;
    } catch (e) {
      this.serviceStatus.photos = 'error';
      return null;
    }
  }

  // ── Full SOS Activation ────────────────────────────────────────
  async activateSOSServices(settings: ActivationSettings = {}): Promise<ActivationResult> {
    const results: ActivationResult = { siren: false, recording: false, photo: false };

    if (settings.sirenEnabled) {
      results.siren = await this.startSiren();
    }

    if (settings.autoRecordAudio) {
      const rec = await this.startEvidenceRecording();
      results.recording = !!rec;
    }

    if (settings.autoPhotoCapture) {
      try {
        const photo = await this.captureEvidencePhoto();
        results.photo = !!photo;
      } catch {
        results.photo = false;
      }
    }

    return results;
  }

  async deactivateSOSServices(): Promise<DeactivationResult> {
    const results: DeactivationResult = {};

    if (this.isSirenPlaying) {
      await this.stopSiren();
      results.siren = 'stopped';
    }

    if (this.isRecordingEvidence) {
      const evidence = await this.stopEvidenceRecording();
      results.recording = evidence ? 'saved' : 'stopped';
      results.evidenceUri = evidence?.uri;
    }

    results.photosCaptured = this.capturedPhotos.length;
    this.capturedPhotos = [];
    return results;
  }

  // ── Cleanup ────────────────────────────────────────────────────
  async cleanup(): Promise<void> {
    this.stopShakeDetection();
    await this.stopScreamDetection();
    await this.stopSiren();
    await this.stopEvidenceRecording();
    this.listeners.clear();
  }
}

const SafetyAIService = new SafetyAIServiceClass();
export default SafetyAIService;
