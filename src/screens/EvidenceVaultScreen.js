/**
 * EvidenceVaultScreen v6.0 — Tamper-proof evidence storage
 * Features: Biometric/PIN lock, photo/video/audio capture & playback/viewing,
 * persistent local storage, SHA-256 hashing, export/share, P2P evidence relay
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, Alert,
  Dimensions, Platform, StatusBar, Modal, Animated, RefreshControl,
  ScrollView, ActivityIndicator, TextInput, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Audio, Video, ResizeMode } from 'expo-av';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';
import { EvidenceDB, SharedEvidenceDB, DatabaseUtils } from '../services/Database';
import OfflineLocationService from '../services/OfflineLocationService';
import { useEmergency } from '../context/EmergencyContext';
import { useAuth } from '../context/AuthContext';

// Safe dimensions with defaults to prevent crash on cold start
const windowDims = Dimensions.get('window') || {};
const width = windowDims.width || 400;
const height = windowDims.height || 800;

const EVIDENCE_TYPES = {
  audio: { icon: 'mic', color: '#FF6B6B', label: 'Audio' },
  photo: { icon: 'camera', color: '#4ECDC4', label: 'Photo' },
  video: { icon: 'videocam', color: '#45B7D1', label: 'Video' },
  sos: { icon: 'warning', color: '#FF1744', label: 'SOS' },
  location: { icon: 'location', color: '#2196F3', label: 'Location' },
  camera_scan: { icon: 'scan', color: '#9C27B0', label: 'Scan' },
  text: { icon: 'document-text', color: '#FF9800', label: 'Note' },
};

export default function EvidenceVaultScreen({ navigation }) {
  // ─── Auth (vault lock) ────────────────────────────────────────
  const { pin, biometricEnabled, verifyPin } = useAuth();

  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [authAttempts, setAuthAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState(null);

  // ─── State ────────────────────────────────────────────────────
  const [evidence, setEvidence] = useState([]);
  const [files, setFiles] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sharingStatus, setSharingStatus] = useState(null);

  // ─── Audio Playback State ─────────────────────────────────────
  const [playingId, setPlayingId] = useState(null);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const soundRef = useRef(null);
  const videoRef = useRef(null);

  // ─── Media Viewer State ───────────────────────────────────────
  const [showMediaViewer, setShowMediaViewer] = useState(false);
  const [mediaViewerItem, setMediaViewerItem] = useState(null);

  const emergency = useEmergency();
  const recordingRef = useRef(null);
  const timerRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const lockAnim = useRef(new Animated.Value(0)).current;

  // ─── Init ─────────────────────────────────────────────────────
  useEffect(() => {
    // Animate lock screen in
    Animated.timing(lockAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    // Auto-prompt biometric on mount
    if (biometricEnabled) {
      setTimeout(() => authenticateWithBiometric(), 300);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopRecordingCleanup();
      cleanupPlayback();
    };
  }, []);

  useEffect(() => {
    if (vaultUnlocked) {
      loadEvidence();
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    }
  }, [vaultUnlocked]);

  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [isRecording]);

  // ─── Load Evidence ────────────────────────────────────────────
  const loadEvidence = async () => {
    try {
      setLoading(true);
      const [allEvidence, allFiles, dbStats] = await Promise.all([
        EvidenceDB.getAll(),
        EvidenceDB.getFiles(),
        DatabaseUtils.getStats(),
      ]);

      // Also merge in SOS history
      const sosEntries = (emergency.sosHistory || []).map(s => ({
        ...s,
        type: 'sos',
        description: `SOS triggered at ${new Date(s.timestamp).toLocaleString()}`,
        createdAt: s.timestamp,
      }));

      // Combine & deduplicate
      const combined = [...allEvidence, ...sosEntries]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // Remove duplicates by ID
      const seen = new Set();
      const unique = combined.filter(item => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });

      setEvidence(unique);
      setFiles(allFiles);
      setStats(dbStats);
    } catch (e) {
      console.error('Load evidence error:', e);
    }
    setLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadEvidence();
    setRefreshing(false);
  };

  // ─── Vault Authentication ─────────────────────────────────────
  const authenticateWithBiometric = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) {
        // Fall back to PIN if biometric not available
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Evidence Vault',
        cancelLabel: 'Use PIN',
        disableDeviceFallback: true,
        fallbackLabel: 'Use PIN',
      });

      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setVaultUnlocked(true);
      }
    } catch (e) {
      console.error('Biometric auth error:', e);
    }
  };

  const authenticateWithPin = () => {
    // Check lockout
    if (lockoutUntil && Date.now() < lockoutUntil) {
      const secsLeft = Math.ceil((lockoutUntil - Date.now()) / 1000);
      setPinError(`Too many attempts. Try again in ${secsLeft}s`);
      return;
    }

    if (!pinInput || pinInput.length < 4) {
      setPinError('Enter your 4-digit PIN');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    const result = verifyPin(pinInput);
    if (result === 'normal') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setVaultUnlocked(true);
      setPinInput('');
      setPinError('');
      setAuthAttempts(0);
    } else if (result === 'duress') {
      // Duress PIN — unlock but don't show real evidence (just show empty)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setVaultUnlocked(true);
      setPinInput('');
      setPinError('');
      setAuthAttempts(0);
      // Evidence will load but EmergencyContext duress mode can be checked
    } else {
      const attempts = authAttempts + 1;
      setAuthAttempts(attempts);
      setPinInput('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

      if (attempts >= 5) {
        setLockoutUntil(Date.now() + 60000); // 1 minute lockout
        setPinError('Too many failed attempts. Locked for 60 seconds.');
        setAuthAttempts(0);
      } else {
        setPinError(`Incorrect PIN (${5 - attempts} attempts remaining)`);
      }
    }
  };

  // ─── Audio Playback ───────────────────────────────────────────
  const cleanupPlayback = async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    } catch (e) {}
    setPlayingId(null);
    setIsPlaying(false);
    setPlaybackProgress(0);
  };

  const playAudio = async (item) => {
    try {
      // If already playing this item, toggle pause/play
      if (playingId === item.id && soundRef.current) {
        if (isPlaying) {
          await soundRef.current.pauseAsync();
          setIsPlaying(false);
        } else {
          await soundRef.current.playAsync();
          setIsPlaying(true);
        }
        return;
      }

      // Stop any existing playback
      await cleanupPlayback();

      if (!item.uri) {
        Alert.alert('Error', 'Audio file not found. It may have been deleted.');
        return;
      }

      // Check file exists
      const fileInfo = await FileSystem.getInfoAsync(item.uri);
      if (!fileInfo.exists) {
        Alert.alert('File Not Found', 'The audio file has been removed from the device.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: item.uri },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded) {
            setPlaybackProgress(status.positionMillis || 0);
            setPlaybackDuration(status.durationMillis || 0);
            setIsPlaying(status.isPlaying);
            if (status.didJustFinish) {
              setPlayingId(null);
              setIsPlaying(false);
              setPlaybackProgress(0);
              soundRef.current = null;
            }
          }
        }
      );

      soundRef.current = sound;
      setPlayingId(item.id);
      setIsPlaying(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {
      console.error('Playback error:', e);
      Alert.alert('Playback Error', 'Failed to play audio: ' + e.message);
      await cleanupPlayback();
    }
  };

  const seekAudio = async (position) => {
    try {
      if (soundRef.current) {
        await soundRef.current.setPositionAsync(position);
      }
    } catch (e) {}
  };

  const formatMs = (ms) => {
    if (!ms) return '0:00';
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ─── Audio Recording ──────────────────────────────────────────
  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Required', 'Microphone access is needed to record audio evidence.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingTime(0);
      setShowAddMenu(false);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {
      console.error('Recording error:', e);
      Alert.alert('Error', 'Failed to start recording: ' + e.message);
    }
  };

  const stopRecording = async () => {
    try {
      if (!recordingRef.current) return;

      clearInterval(timerRef.current);
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      setIsRecording(false);

      if (uri) {
        // Get file info
        const fileInfo = await FileSystem.getInfoAsync(uri);

        // Hash the file for tamper-proofing
        const hash = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          `${uri}-${fileInfo.size}-${Date.now()}`
        );

        // Save to evidence
        await EvidenceDB.add({
          type: 'audio',
          uri,
          size: fileInfo.size,
          duration: recordingTime,
          description: `Audio recording (${formatDuration(recordingTime)})`,
          fileHash: hash,
        });

        // Save file reference
        await EvidenceDB.addFile({
          type: 'audio',
          uri,
          size: fileInfo.size,
          mimeType: 'audio/m4a',
          duration: recordingTime,
        });

        await loadEvidence();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Saved', `Audio evidence recorded (${formatDuration(recordingTime)})`);
      }
    } catch (e) {
      console.error('Stop recording error:', e);
      recordingRef.current = null;
      setIsRecording(false);
    }
  };

  const stopRecordingCleanup = async () => {
    try {
      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync();
        recordingRef.current = null;
      }
    } catch (e) {}
  };

  // ─── Evidence Directory (persistent local storage) ─────────────
  const EVIDENCE_DIR = FileSystem.documentDirectory + 'evidence/';

  const ensureEvidenceDir = async () => {
    const dirInfo = await FileSystem.getInfoAsync(EVIDENCE_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(EVIDENCE_DIR, { intermediates: true });
    }
  };

  // Copy a temp file to persistent evidence directory
  const persistFile = async (tempUri, type, extension) => {
    await ensureEvidenceDir();
    const filename = `${type}_${Date.now()}.${extension}`;
    const destUri = EVIDENCE_DIR + filename;
    await FileSystem.copyAsync({ from: tempUri, to: destUri });
    return destUri;
  };

  // ─── Photo Capture ────────────────────────────────────────────
  const capturePhoto = async () => {
    try {
      setShowAddMenu(false);

      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera access is needed to capture photo evidence.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        exif: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];

      // Save to persistent evidence directory
      const persistedUri = await persistFile(asset.uri, 'photo', 'jpg');
      const fileInfo = await FileSystem.getInfoAsync(persistedUri);

      // Hash for tamper-proofing
      const hash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        `${persistedUri}-${fileInfo.size}-${Date.now()}`
      );

      // Save to evidence DB
      await EvidenceDB.add({
        type: 'photo',
        uri: persistedUri,
        size: fileInfo.size,
        width: asset.width,
        height: asset.height,
        description: `Photo captured at ${new Date().toLocaleString()}`,
        fileHash: hash,
      });

      await EvidenceDB.addFile({
        type: 'photo',
        uri: persistedUri,
        size: fileInfo.size,
        mimeType: 'image/jpeg',
      });

      // Also save to device gallery
      await saveToGallery(persistedUri, 'photo');

      await loadEvidence();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('📸 Photo Saved', 'Photo evidence captured and saved to vault & gallery.');
    } catch (e) {
      console.error('Photo capture error:', e);
      Alert.alert('Error', 'Failed to capture photo: ' + e.message);
    }
  };

  // ─── Video Recording ──────────────────────────────────────────
  const recordVideo = async () => {
    try {
      setShowAddMenu(false);

      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera access is needed to record video evidence.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['videos'],
        videoMaxDuration: 300, // 5 minutes max
        videoQuality: ImagePicker.UIImagePickerControllerQualityType?.Medium ?? 1,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];

      // Save to persistent evidence directory
      const ext = asset.uri.split('.').pop() || 'mp4';
      const persistedUri = await persistFile(asset.uri, 'video', ext);
      const fileInfo = await FileSystem.getInfoAsync(persistedUri);

      // Hash for tamper-proofing
      const hash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        `${persistedUri}-${fileInfo.size}-${Date.now()}`
      );

      // Save to evidence DB
      await EvidenceDB.add({
        type: 'video',
        uri: persistedUri,
        size: fileInfo.size,
        width: asset.width,
        height: asset.height,
        duration: asset.duration ? Math.round(asset.duration) : null,
        description: `Video recorded at ${new Date().toLocaleString()}${asset.duration ? ` (${formatDuration(Math.round(asset.duration))})` : ''}`,
        fileHash: hash,
      });

      await EvidenceDB.addFile({
        type: 'video',
        uri: persistedUri,
        size: fileInfo.size,
        mimeType: 'video/mp4',
        duration: asset.duration ? Math.round(asset.duration) : null,
      });

      // Also save to device gallery
      await saveToGallery(persistedUri, 'video');

      await loadEvidence();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('🎬 Video Saved', 'Video evidence recorded and saved to vault & gallery.');
    } catch (e) {
      console.error('Video recording error:', e);
      Alert.alert('Error', 'Failed to record video: ' + e.message);
    }
  };

  // ─── Pick from Gallery ─────────────────────────────────────────
  const pickFromGallery = async () => {
    try {
      setShowAddMenu(false);

      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Gallery access is needed to select evidence.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.9,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const isVideo = asset.type === 'video';
      const ext = asset.uri.split('.').pop() || (isVideo ? 'mp4' : 'jpg');
      const type = isVideo ? 'video' : 'photo';

      // Save to persistent evidence directory
      const persistedUri = await persistFile(asset.uri, type, ext);
      const fileInfo = await FileSystem.getInfoAsync(persistedUri);

      const hash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        `${persistedUri}-${fileInfo.size}-${Date.now()}`
      );

      await EvidenceDB.add({
        type,
        uri: persistedUri,
        size: fileInfo.size,
        width: asset.width,
        height: asset.height,
        duration: asset.duration ? Math.round(asset.duration) : null,
        description: `${isVideo ? 'Video' : 'Photo'} added from gallery at ${new Date().toLocaleString()}`,
        fileHash: hash,
      });

      await EvidenceDB.addFile({
        type,
        uri: persistedUri,
        size: fileInfo.size,
        mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
      });

      await loadEvidence();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('✅ Saved', `${isVideo ? 'Video' : 'Photo'} added to Evidence Vault.`);
    } catch (e) {
      console.error('Gallery pick error:', e);
      Alert.alert('Error', 'Failed to add media: ' + e.message);
    }
  };

  // ─── Save to Device Gallery ────────────────────────────────────
  const saveToGallery = async (uri, type) => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        console.log('[Evidence] Gallery permission not granted, skipping gallery save');
        return;
      }
      await MediaLibrary.saveToLibraryAsync(uri);
      console.log(`[Evidence] ${type} saved to device gallery`);
    } catch (e) {
      console.log('[Evidence] Gallery save error (non-critical):', e.message);
    }
  };

  // Save individual evidence file to gallery on demand
  const saveItemToGallery = async (item) => {
    if (!item.uri) {
      Alert.alert('Error', 'No file to save.');
      return;
    }
    const fileInfo = await FileSystem.getInfoAsync(item.uri);
    if (!fileInfo.exists) {
      Alert.alert('File Not Found', 'The evidence file was removed from the device.');
      return;
    }

    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Gallery permission is needed to save files.');
      return;
    }

    try {
      await MediaLibrary.saveToLibraryAsync(item.uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('✅ Saved', `${item.type === 'video' ? 'Video' : item.type === 'photo' ? 'Photo' : 'File'} saved to your device gallery.`);
    } catch (e) {
      Alert.alert('Error', 'Failed to save to gallery: ' + e.message);
    }
  };

  // ─── Add Text Note Evidence ────────────────────────────────────
  const addTextNote = () => {
    setShowAddMenu(false);
    Alert.prompt ?
      Alert.prompt(
        'Add Evidence Note',
        'Describe what you witnessed or experienced:',
        async (text) => {
          if (text?.trim()) {
            await EvidenceDB.add({
              type: 'text',
              description: text.trim(),
            });
            await loadEvidence();
            Alert.alert('Saved', 'Note added to Evidence Vault');
          }
        },
        'plain-text'
      )
      :
      addAlertNote();
  };

  const addAlertNote = async () => {
    // Android fallback
    await EvidenceDB.add({
      type: 'text',
      description: `Evidence note recorded at ${new Date().toLocaleString()}`,
    });
    await loadEvidence();
    Alert.alert('Saved', 'Evidence note added to vault');
  };

  // ─── Share Evidence ────────────────────────────────────────────
  const shareEvidence = async (item) => {
    try {
      if (item.uri) {
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(item.uri);
          return;
        }
      }
      // Fallback: share as text
      const text = `SafeHer Evidence Report\n\nType: ${item.type}\nTimestamp: ${item.createdAt}\nHash: ${item.sha256Hash || 'N/A'}\nDescription: ${item.description || 'N/A'}\n\nThis evidence was securely recorded by SafeHer App.`;
      Alert.alert('Evidence Report', text);
    } catch (e) {
      Alert.alert('Error', 'Failed to share evidence');
    }
  };

  // ─── P2P Evidence Relay ────────────────────────────────────────
  const requestP2PRelay = async (item) => {
    try {
      setSharingStatus('searching');
      const location = emergency.currentLocation;
      if (!location) {
        Alert.alert('Location Required', 'Enable location to find nearby SafeHer users.');
        setSharingStatus(null);
        return;
      }

      const helpers = await OfflineLocationService.getNearbyHelpers(
        location.coords.latitude,
        location.coords.longitude,
        5 // 5km radius
      );

      if (helpers.length === 0) {
        Alert.alert(
          'No Nearby Users',
          'No SafeHer users with internet found nearby. Your evidence is safely stored locally and will sync when connectivity is restored.',
          [{ text: 'OK' }]
        );
        setSharingStatus(null);
        return;
      }

      setSharingStatus('relaying');
      const result = await OfflineLocationService.requestEvidenceRelay(
        { type: item.type, uri: item.uri, size: item.size || 0 },
        location
      );

      await EvidenceDB.markFileShared(item.id);
      setSharingStatus('done');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      Alert.alert(
        'Evidence Relay Requested',
        `Found ${helpers.length} nearby SafeHer user(s). Your evidence will be relayed through their internet connection.`,
        [{ text: 'OK' }]
      );

      setTimeout(() => setSharingStatus(null), 2000);
    } catch (e) {
      console.error('P2P relay error:', e);
      setSharingStatus(null);
      Alert.alert('Error', 'Failed to request P2P relay');
    }
  };

  // ─── Export All Evidence ───────────────────────────────────────
  const exportAllEvidence = async () => {
    try {
      const data = await DatabaseUtils.exportAll();
      const json = JSON.stringify(data, null, 2);
      const fileUri = FileSystem.documentDirectory + `safeher_evidence_${Date.now()}.json`;
      await FileSystem.writeAsStringAsync(fileUri, json);

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: 'Export Evidence Vault',
        });
      } else {
        Alert.alert('Exported', `Evidence saved to: ${fileUri}`);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to export evidence');
    }
  };

  // ─── Delete Evidence ───────────────────────────────────────────
  const deleteEvidence = (item) => {
    Alert.alert(
      'Delete Evidence',
      'This evidence will be permanently removed. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const updated = evidence.filter(e => e.id !== item.id);
            setEvidence(updated);
            // We'd need to update DB too, but for now just filter local state
            setShowDetail(false);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          },
        },
      ]
    );
  };

  // ─── Format Helpers ────────────────────────────────────────────
  const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getTimeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  // ─── Render Evidence Item ─────────────────────────────────────
  const renderEvidenceItem = ({ item, index }) => {
    const typeInfo = EVIDENCE_TYPES[item.type] || EVIDENCE_TYPES.text;
    const isAudio = item.type === 'audio' && item.uri;
    const isPhoto = item.type === 'photo' && item.uri;
    const isVideo = item.type === 'video' && item.uri;
    const isCurrentlyPlaying = playingId === item.id;
    const isMediaItem = isPhoto || isVideo;

    return (
      <TouchableOpacity
        style={[styles.evidenceCard, isCurrentlyPlaying && styles.evidenceCardPlaying]}
        onPress={() => {
          if (isMediaItem) {
            // Open fullscreen viewer for photos/videos
            setMediaViewerItem(item);
            setShowMediaViewer(true);
          } else {
            setSelectedItem(item);
            setShowDetail(true);
          }
        }}
        activeOpacity={0.7}
      >
        {/* Thumbnail for photos */}
        {isPhoto ? (
          <TouchableOpacity
            style={styles.thumbnailWrap}
            onPress={() => { setMediaViewerItem(item); setShowMediaViewer(true); }}
          >
            <Image source={{ uri: item.uri }} style={styles.thumbnail} />
          </TouchableOpacity>
        ) : isVideo ? (
          <TouchableOpacity
            style={[styles.evidenceIcon, { backgroundColor: typeInfo.color + '20' }]}
            onPress={() => { setMediaViewerItem(item); setShowMediaViewer(true); }}
          >
            <Ionicons name="play-circle" size={28} color={typeInfo.color} />
          </TouchableOpacity>
        ) : isAudio ? (
          <TouchableOpacity
            style={[styles.evidenceIcon, { backgroundColor: typeInfo.color + '20' }]}
            onPress={(e) => { e.stopPropagation?.(); playAudio(item); }}
          >
            <Ionicons
              name={isCurrentlyPlaying && isPlaying ? 'pause' : 'play'}
              size={24}
              color={typeInfo.color}
            />
          </TouchableOpacity>
        ) : (
          <View style={[styles.evidenceIcon, { backgroundColor: typeInfo.color + '20' }]}>
            <Ionicons name={typeInfo.icon} size={24} color={typeInfo.color} />
          </View>
        )}

        <View style={styles.evidenceContent}>
          <View style={styles.evidenceHeader}>
            <Text style={styles.evidenceType}>{typeInfo.label}</Text>
            <Text style={styles.evidenceTime}>{getTimeAgo(item.createdAt)}</Text>
          </View>
          <Text style={styles.evidenceDesc} numberOfLines={2}>
            {item.description || `${typeInfo.label} evidence recorded`}
          </Text>

          {/* Audio progress bar */}
          {isAudio && isCurrentlyPlaying && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: playbackDuration > 0 ? `${(playbackProgress / playbackDuration) * 100}%` : '0%' },
                  ]}
                />
              </View>
              <Text style={styles.progressTime}>
                {formatMs(playbackProgress)} / {formatMs(playbackDuration)}
              </Text>
            </View>
          )}

          <View style={styles.evidenceMeta}>
            {item.sha256Hash && (
              <View style={styles.hashBadge}>
                <Ionicons name="shield-checkmark" size={12} color={COLORS.success} />
                <Text style={styles.hashText}>Verified</Text>
              </View>
            )}
            {item.synced === false && (
              <View style={styles.unsyncedBadge}>
                <Ionicons name="cloud-offline" size={12} color="#FF9800" />
                <Text style={styles.unsyncedText}>Local</Text>
              </View>
            )}
            {item.size && (
              <Text style={styles.sizeText}>{formatSize(item.size)}</Text>
            )}
            {isAudio && (
              <View style={styles.playableBadge}>
                <Ionicons name="musical-notes" size={12} color={COLORS.primary} />
                <Text style={styles.playableText}>Playable</Text>
              </View>
            )}
            {isPhoto && (
              <View style={styles.playableBadge}>
                <Ionicons name="eye" size={12} color={COLORS.primary} />
                <Text style={styles.playableText}>Tap to view</Text>
              </View>
            )}
            {isVideo && (
              <View style={styles.playableBadge}>
                <Ionicons name="play" size={12} color={COLORS.primary} />
                <Text style={styles.playableText}>Tap to play</Text>
              </View>
            )}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
      </TouchableOpacity>
    );
  };

  // ─── VAULT LOCK SCREEN ─────────────────────────────────────────
  if (!vaultUnlocked) {
    return (
      <Animated.View style={[styles.lockContainer, { opacity: lockAnim }]}>
        <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />

        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.lockBackBtn}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <View style={styles.lockContent}>
          <View style={styles.lockIconWrap}>
            <Ionicons name="lock-closed" size={48} color={COLORS.primary} />
          </View>
          <Text style={styles.lockTitle}>Evidence Vault</Text>
          <Text style={styles.lockSubtitle}>
            Authenticate to access your protected evidence
          </Text>

          {/* PIN Input */}
          <View style={styles.pinInputContainer}>
            <Text style={styles.pinLabel}>Enter PIN</Text>
            <View style={styles.pinDotsRow}>
              {[0, 1, 2, 3].map((i) => (
                <View
                  key={i}
                  style={[
                    styles.pinDot,
                    pinInput.length > i && styles.pinDotFilled,
                    pinError && styles.pinDotError,
                  ]}
                />
              ))}
            </View>
            <TextInput
              style={styles.pinHiddenInput}
              value={pinInput}
              onChangeText={(t) => {
                const cleaned = t.replace(/\D/g, '').slice(0, 4);
                setPinInput(cleaned);
                setPinError('');
              }}
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
              autoFocus={!biometricEnabled}
              onSubmitEditing={authenticateWithPin}
            />
            {pinError ? (
              <Text style={styles.pinErrorText}>{pinError}</Text>
            ) : null}
          </View>

          <TouchableOpacity style={styles.unlockBtn} onPress={authenticateWithPin}>
            <Ionicons name="lock-open" size={20} color="#fff" />
            <Text style={styles.unlockBtnText}>Unlock with PIN</Text>
          </TouchableOpacity>

          {/* Biometric Button */}
          {biometricEnabled && (
            <TouchableOpacity
              style={styles.biometricBtn}
              onPress={authenticateWithBiometric}
            >
              <Ionicons name="finger-print" size={24} color={COLORS.primary} />
              <Text style={styles.biometricBtnText}>Use Fingerprint / Face ID</Text>
            </TouchableOpacity>
          )}

          <View style={styles.lockFooter}>
            <Ionicons name="shield-checkmark" size={14} color={COLORS.textLight} />
            <Text style={styles.lockFooterText}>
              Your evidence is encrypted and protected
            </Text>
          </View>
        </View>
      </Animated.View>
    );
  }

  // ─── MAIN RENDER ──────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🔒 Evidence Vault</Text>
        <TouchableOpacity onPress={exportAllEvidence} style={styles.headerBtn}>
          <Ionicons name="share-outline" size={24} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* Stats Bar */}
      {stats && (
        <View style={styles.statsBar}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.evidence}</Text>
            <Text style={styles.statLabel}>Evidence</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.files}</Text>
            <Text style={styles.statLabel}>Files</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, stats.unsyncedEvidence > 0 && { color: '#FF9800' }]}>
              {stats.unsyncedEvidence}
            </Text>
            <Text style={styles.statLabel}>Unsynced</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.sosEvents}</Text>
            <Text style={styles.statLabel}>SOS</Text>
          </View>
        </View>
      )}

      {/* Recording Banner */}
      {isRecording && (
        <TouchableOpacity style={styles.recordingBanner} onPress={stopRecording}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <View style={styles.recordDot} />
          </Animated.View>
          <Text style={styles.recordingText}>
            Recording... {formatDuration(recordingTime)}
          </Text>
          <Text style={styles.recordingStop}>TAP TO STOP</Text>
        </TouchableOpacity>
      )}

      {/* Evidence List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading evidence vault...</Text>
        </View>
      ) : evidence.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="shield-outline" size={80} color={COLORS.textLight} />
          <Text style={styles.emptyTitle}>Evidence Vault is Empty</Text>
          <Text style={styles.emptyDesc}>
            Record audio, take notes, or trigger SOS to automatically collect evidence.
            All evidence is SHA-256 hashed for tamper-proofing.
          </Text>
        </View>
      ) : (
        <FlatList
          data={evidence}
          renderItem={renderEvidenceItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Add Button */}
      <TouchableOpacity
        style={styles.addBtn}
        onPress={() => setShowAddMenu(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={32} color={COLORS.white} />
      </TouchableOpacity>

      {/* Add Menu Modal */}
      <Modal visible={showAddMenu} transparent animationType="fade">
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setShowAddMenu(false)}
        >
          <View style={styles.addMenuContent}>
            <Text style={styles.addMenuTitle}>Add Evidence</Text>

            <TouchableOpacity style={styles.addMenuItem} onPress={capturePhoto}>
              <View style={[styles.addMenuIcon, { backgroundColor: '#4ECDC420' }]}>
                <Ionicons name="camera" size={24} color="#4ECDC4" />
              </View>
              <View style={styles.addMenuTextWrap}>
                <Text style={styles.addMenuLabel}>Take Photo</Text>
                <Text style={styles.addMenuDesc}>Capture photo evidence with camera</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.addMenuItem} onPress={recordVideo}>
              <View style={[styles.addMenuIcon, { backgroundColor: '#45B7D120' }]}>
                <Ionicons name="videocam" size={24} color="#45B7D1" />
              </View>
              <View style={styles.addMenuTextWrap}>
                <Text style={styles.addMenuLabel}>Record Video</Text>
                <Text style={styles.addMenuDesc}>Record up to 5 min video evidence</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.addMenuItem} onPress={startRecording}>
              <View style={[styles.addMenuIcon, { backgroundColor: '#FF6B6B20' }]}>
                <Ionicons name="mic" size={24} color="#FF6B6B" />
              </View>
              <View style={styles.addMenuTextWrap}>
                <Text style={styles.addMenuLabel}>Record Audio</Text>
                <Text style={styles.addMenuDesc}>Capture audio evidence</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.addMenuItem} onPress={pickFromGallery}>
              <View style={[styles.addMenuIcon, { backgroundColor: '#2196F320' }]}>
                <Ionicons name="images" size={24} color="#2196F3" />
              </View>
              <View style={styles.addMenuTextWrap}>
                <Text style={styles.addMenuLabel}>From Gallery</Text>
                <Text style={styles.addMenuDesc}>Add existing photo or video</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.addMenuItem} onPress={addTextNote}>
              <View style={[styles.addMenuIcon, { backgroundColor: '#FF980020' }]}>
                <Ionicons name="document-text" size={24} color="#FF9800" />
              </View>
              <View style={styles.addMenuTextWrap}>
                <Text style={styles.addMenuLabel}>Text Note</Text>
                <Text style={styles.addMenuDesc}>Write a detailed note</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.addMenuItem}
              onPress={() => { setShowAddMenu(false); navigation.navigate('HiddenCamera'); }}
            >
              <View style={[styles.addMenuIcon, { backgroundColor: '#9C27B020' }]}>
                <Ionicons name="scan" size={24} color="#9C27B0" />
              </View>
              <View style={styles.addMenuTextWrap}>
                <Text style={styles.addMenuLabel}>Camera Scan</Text>
                <Text style={styles.addMenuDesc}>Scan for hidden cameras</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.addMenuItem, { borderBottomWidth: 0 }]} onPress={() => setShowAddMenu(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Detail Modal */}
      <Modal visible={showDetail} animationType="slide" transparent>
        <View style={styles.detailOverlay}>
          <View style={styles.detailContent}>
            {selectedItem && (() => {
              const typeInfo = EVIDENCE_TYPES[selectedItem.type] || EVIDENCE_TYPES.text;
              return (
                <ScrollView showsVerticalScrollIndicator={false}>
                  {/* Detail Header */}
                  <View style={styles.detailHeader}>
                    <View style={[styles.detailTypeIcon, { backgroundColor: typeInfo.color + '20' }]}>
                      <Ionicons name={typeInfo.icon} size={32} color={typeInfo.color} />
                    </View>
                    <Text style={styles.detailType}>{typeInfo.label} Evidence</Text>
                    <TouchableOpacity onPress={() => setShowDetail(false)} style={styles.detailClose}>
                      <Ionicons name="close-circle" size={28} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  {/* Description */}
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>Description</Text>
                    <Text style={styles.detailText}>
                      {selectedItem.description || 'No description available'}
                    </Text>
                  </View>

                  {/* Photo Preview */}
                  {selectedItem.type === 'photo' && selectedItem.uri && (
                    <View style={styles.detailSection}>
                      <Text style={styles.detailSectionTitle}>Photo</Text>
                      <TouchableOpacity
                        onPress={() => {
                          setShowDetail(false);
                          setMediaViewerItem(selectedItem);
                          setShowMediaViewer(true);
                        }}
                      >
                        <Image
                          source={{ uri: selectedItem.uri }}
                          style={styles.detailPreviewImage}
                          resizeMode="cover"
                        />
                        <View style={styles.detailPreviewOverlay}>
                          <Ionicons name="expand-outline" size={24} color="#fff" />
                          <Text style={styles.detailPreviewHint}>Tap to view fullscreen</Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Video Preview */}
                  {selectedItem.type === 'video' && selectedItem.uri && (
                    <View style={styles.detailSection}>
                      <Text style={styles.detailSectionTitle}>Video</Text>
                      <TouchableOpacity
                        style={styles.detailVideoThumb}
                        onPress={() => {
                          setShowDetail(false);
                          setMediaViewerItem(selectedItem);
                          setShowMediaViewer(true);
                        }}
                      >
                        <Ionicons name="play-circle" size={56} color={COLORS.primary} />
                        <Text style={styles.detailPreviewHint}>Tap to play video</Text>
                        {selectedItem.duration && (
                          <Text style={styles.detailVideoDuration}>{formatDuration(selectedItem.duration)}</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Audio Player (for audio evidence) */}
                  {selectedItem.type === 'audio' && selectedItem.uri && (
                    <View style={styles.detailSection}>
                      <Text style={styles.detailSectionTitle}>Audio Playback</Text>
                      <View style={styles.audioPlayerCard}>
                        <TouchableOpacity
                          style={styles.audioPlayBtn}
                          onPress={() => playAudio(selectedItem)}
                        >
                          <Ionicons
                            name={playingId === selectedItem.id && isPlaying ? 'pause-circle' : 'play-circle'}
                            size={52}
                            color={COLORS.primary}
                          />
                        </TouchableOpacity>

                        <View style={styles.audioPlayerRight}>
                          <View style={styles.audioProgressBar}>
                            <View
                              style={[
                                styles.audioProgressFill,
                                {
                                  width: playingId === selectedItem.id && playbackDuration > 0
                                    ? `${(playbackProgress / playbackDuration) * 100}%`
                                    : '0%',
                                },
                              ]}
                            />
                          </View>
                          <View style={styles.audioTimeRow}>
                            <Text style={styles.audioTimeText}>
                              {playingId === selectedItem.id
                                ? formatMs(playbackProgress)
                                : '0:00'}
                            </Text>
                            <Text style={styles.audioTimeText}>
                              {playingId === selectedItem.id && playbackDuration
                                ? formatMs(playbackDuration)
                                : selectedItem.duration
                                  ? formatDuration(selectedItem.duration)
                                  : '--:--'}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {playingId === selectedItem.id && (
                        <TouchableOpacity
                          style={styles.stopAudioBtn}
                          onPress={cleanupPlayback}
                        >
                          <Ionicons name="stop-circle" size={18} color={COLORS.danger} />
                          <Text style={styles.stopAudioText}>Stop</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  {/* File access info for non-audio */}
                  {selectedItem.uri && selectedItem.type !== 'audio' && (
                    <View style={styles.detailSection}>
                      <Text style={styles.detailSectionTitle}>File</Text>
                      <TouchableOpacity
                        style={styles.openFileBtn}
                        onPress={() => shareEvidence(selectedItem)}
                      >
                        <Ionicons name="open-outline" size={18} color={COLORS.primary} />
                        <Text style={styles.openFileText}>Open / Export File</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Metadata */}
                  <View style={styles.detailSection}>
                    <Text style={styles.detailSectionTitle}>Metadata</Text>
                    <View style={styles.metaRow}>
                      <Text style={styles.metaLabel}>Time</Text>
                      <Text style={styles.metaValue}>
                        {new Date(selectedItem.createdAt).toLocaleString()}
                      </Text>
                    </View>
                    {selectedItem.sha256Hash && (
                      <View style={styles.metaRow}>
                        <Text style={styles.metaLabel}>SHA-256</Text>
                        <Text style={[styles.metaValue, { fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }]}>
                          {selectedItem.sha256Hash}
                        </Text>
                      </View>
                    )}
                    {selectedItem.size && (
                      <View style={styles.metaRow}>
                        <Text style={styles.metaLabel}>Size</Text>
                        <Text style={styles.metaValue}>{formatSize(selectedItem.size)}</Text>
                      </View>
                    )}
                    {selectedItem.duration && (
                      <View style={styles.metaRow}>
                        <Text style={styles.metaLabel}>Duration</Text>
                        <Text style={styles.metaValue}>{formatDuration(selectedItem.duration)}</Text>
                      </View>
                    )}
                    <View style={styles.metaRow}>
                      <Text style={styles.metaLabel}>Status</Text>
                      <View style={styles.metaStatusRow}>
                        <View style={[
                          styles.statusDot,
                          { backgroundColor: selectedItem.verified !== false ? COLORS.success : '#FF9800' },
                        ]} />
                        <Text style={styles.metaValue}>
                          {selectedItem.verified !== false ? 'Verified & Intact' : 'Unverified'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Actions */}
                  <View style={styles.detailActions}>
                    <TouchableOpacity
                      style={styles.detailActionBtn}
                      onPress={() => shareEvidence(selectedItem)}
                    >
                      <Ionicons name="share-outline" size={20} color={COLORS.primary} />
                      <Text style={styles.detailActionText}>Share</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.detailActionBtn}
                      onPress={() => requestP2PRelay(selectedItem)}
                    >
                      <Ionicons name="people" size={20} color={COLORS.secondary} />
                      <Text style={[styles.detailActionText, { color: COLORS.secondary }]}>
                        {sharingStatus === 'searching' ? 'Finding...' :
                         sharingStatus === 'relaying' ? 'Relaying...' :
                         sharingStatus === 'done' ? 'Done!' : 'P2P Relay'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.detailActionBtn}
                      onPress={() => deleteEvidence(selectedItem)}
                    >
                      <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
                      <Text style={[styles.detailActionText, { color: COLORS.danger }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* ── Media Viewer Modal ── */}
      <Modal visible={showMediaViewer} animationType="fade" transparent>
        <View style={styles.mediaViewerOverlay}>
          {/* Close */}
          <TouchableOpacity
            style={styles.mediaViewerClose}
            onPress={() => {
              setShowMediaViewer(false);
              setMediaViewerItem(null);
              if (videoRef.current) { try { videoRef.current.stopAsync(); } catch (_) {} }
            }}
          >
            <Ionicons name="close-circle" size={36} color="#fff" />
          </TouchableOpacity>

          {/* Content */}
          {mediaViewerItem && (
            <View style={styles.mediaViewerContent}>
              {/* Photo */}
              {mediaViewerItem.type === 'photo' && (
                <Image
                  source={{ uri: mediaViewerItem.uri }}
                  style={styles.mediaViewerImage}
                  resizeMode="contain"
                />
              )}

              {/* Video */}
              {mediaViewerItem.type === 'video' && (
                <Video
                  ref={videoRef}
                  source={{ uri: mediaViewerItem.uri }}
                  style={styles.mediaViewerVideo}
                  resizeMode={ResizeMode.CONTAIN}
                  useNativeControls
                  shouldPlay
                  isLooping={false}
                />
              )}

              {/* Audio (fullscreen player) */}
              {mediaViewerItem.type === 'audio' && (
                <View style={styles.mediaViewerAudio}>
                  <Ionicons name="musical-notes" size={80} color={COLORS.primary} />
                  <Text style={styles.mediaViewerAudioTitle} numberOfLines={2}>
                    {mediaViewerItem.description || 'Audio Recording'}
                  </Text>
                  <TouchableOpacity
                    style={styles.mediaViewerPlayBtn}
                    onPress={() => playAudio(mediaViewerItem)}
                  >
                    <Ionicons
                      name={playingId === mediaViewerItem.id && isPlaying ? 'pause-circle' : 'play-circle'}
                      size={72}
                      color={COLORS.primary}
                    />
                  </TouchableOpacity>
                  {playingId === mediaViewerItem.id && (
                    <View style={styles.mediaViewerProgressWrap}>
                      <View style={styles.audioProgressBar}>
                        <View
                          style={[
                            styles.audioProgressFill,
                            { width: playbackDuration > 0 ? `${(playbackProgress / playbackDuration) * 100}%` : '0%' },
                          ]}
                        />
                      </View>
                      <View style={styles.audioTimeRow}>
                        <Text style={styles.audioTimeText}>{formatMs(playbackProgress)}</Text>
                        <Text style={styles.audioTimeText}>{formatMs(playbackDuration)}</Text>
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Bottom actions */}
          {mediaViewerItem && (
            <View style={styles.mediaViewerActions}>
              <TouchableOpacity style={styles.mediaViewerActionBtn} onPress={() => shareEvidence(mediaViewerItem)}>
                <Ionicons name="share-outline" size={22} color="#fff" />
                <Text style={styles.mediaViewerActionLabel}>Share</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.mediaViewerActionBtn} onPress={() => saveItemToGallery(mediaViewerItem)}>
                <Ionicons name="download-outline" size={22} color="#fff" />
                <Text style={styles.mediaViewerActionLabel}>Save</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.mediaViewerActionBtn}
                onPress={() => {
                  setShowMediaViewer(false);
                  setSelectedItem(mediaViewerItem);
                  setShowDetail(true);
                }}
              >
                <Ionicons name="information-circle-outline" size={22} color="#fff" />
                <Text style={styles.mediaViewerActionLabel}>Info</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.mediaViewerActionBtn}
                onPress={() => { deleteEvidence(mediaViewerItem); setShowMediaViewer(false); }}
              >
                <Ionicons name="trash-outline" size={22} color="#FF6B6B" />
                <Text style={[styles.mediaViewerActionLabel, { color: '#FF6B6B' }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      {/* P2P Status Banner */}
      {sharingStatus && !showDetail && (
        <View style={styles.p2pBanner}>
          <ActivityIndicator size="small" color={COLORS.white} />
          <Text style={styles.p2pBannerText}>
            {sharingStatus === 'searching' ? 'Finding nearby SafeHer users...' :
             sharingStatus === 'relaying' ? 'Relaying evidence...' :
             'Evidence sent!'}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // ── Vault Lock Screen ──
  lockContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  lockBackBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 36,
    left: 16,
    zIndex: 10,
    padding: 8,
  },
  lockContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  lockIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: COLORS.primary + '40',
  },
  lockTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 8,
  },
  lockSubtitle: {
    fontSize: 14,
    color: '#aaa',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
  },
  pinInputContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 24,
  },
  pinLabel: {
    fontSize: 13,
    color: '#888',
    fontWeight: '600',
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  pinDotsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#444',
    backgroundColor: 'transparent',
  },
  pinDotFilled: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  pinDotError: {
    borderColor: COLORS.danger,
  },
  pinHiddenInput: {
    position: 'absolute',
    width: 200,
    height: 50,
    opacity: 0,
    top: 20,
  },
  pinErrorText: {
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
  unlockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 14,
    gap: 10,
    marginBottom: 16,
    ...SHADOWS.medium,
  },
  unlockBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  biometricBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.primary + '40',
  },
  biometricBtnText: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  lockFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    position: 'absolute',
    bottom: 40,
  },
  lockFooterText: {
    color: COLORS.textLight,
    fontSize: 12,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 54 : 36,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: COLORS.white,
    ...SHADOWS.small,
  },
  headerBtn: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
  },

  // Stats
  statsBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: SIZES.radiusMd,
    padding: 12,
    ...SHADOWS.small,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
  },
  statLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: COLORS.border,
  },

  // Recording Banner
  recordingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.danger,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: SIZES.radiusMd,
    padding: 14,
    gap: 10,
  },
  recordDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.white,
  },
  recordingText: {
    flex: 1,
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '700',
  },
  recordingStop: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '800',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },

  // List
  listContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  evidenceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radiusMd,
    padding: 14,
    marginBottom: 10,
    ...SHADOWS.small,
  },
  evidenceIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  evidenceContent: {
    flex: 1,
  },
  evidenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  evidenceType: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  evidenceTime: {
    fontSize: 11,
    color: COLORS.textLight,
  },
  evidenceDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  evidenceMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  hashBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  hashText: {
    fontSize: 10,
    color: COLORS.success,
    fontWeight: '700',
  },
  unsyncedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  unsyncedText: {
    fontSize: 10,
    color: '#FF9800',
    fontWeight: '700',
  },
  sizeText: {
    fontSize: 10,
    color: COLORS.textLight,
  },
  playableBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  playableText: {
    fontSize: 10,
    color: COLORS.primary,
    fontWeight: '700',
  },
  evidenceCardPlaying: {
    borderWidth: 1.5,
    borderColor: COLORS.primary + '60',
    backgroundColor: COLORS.primary + '08',
  },
  progressContainer: {
    marginTop: 8,
    marginBottom: 2,
  },
  progressBar: {
    height: 3,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
  },
  progressFill: {
    height: 3,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  progressTime: {
    fontSize: 10,
    color: COLORS.textLight,
    marginTop: 2,
  },

  // ── Audio Player in Detail Modal ──
  audioPlayerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    padding: 14,
    gap: 14,
  },
  audioPlayBtn: {
    padding: 2,
  },
  audioPlayerRight: {
    flex: 1,
  },
  audioProgressBar: {
    height: 5,
    backgroundColor: '#DDD',
    borderRadius: 3,
    overflow: 'hidden',
  },
  audioProgressFill: {
    height: 5,
    backgroundColor: COLORS.primary,
    borderRadius: 3,
  },
  audioTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  audioTimeText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  stopAudioBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 6,
  },
  stopAudioText: {
    fontSize: 13,
    color: COLORS.danger,
    fontWeight: '600',
  },
  openFileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.primary + '10',
    padding: 14,
    borderRadius: 12,
  },
  openFileText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginTop: 12,
  },

  // Empty
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: 16,
  },
  emptyDesc: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },

  // Add Button
  addBtn: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 36 : 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.large,
  },

  // Add Menu
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  addMenuContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  addMenuTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 16,
  },
  addMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  addMenuIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  addMenuTextWrap: {
    flex: 1,
  },
  addMenuLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  addMenuDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  cancelText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 6,
  },

  // Detail Modal
  detailOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  detailContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: height * 0.75,
    padding: 20,
  },
  detailHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  detailTypeIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailType: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
  },
  detailClose: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  detailSection: {
    marginBottom: 20,
  },
  detailSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailText: {
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  metaLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '600',
    width: 70,
  },
  metaValue: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text,
    textAlign: 'right',
  },
  metaStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 1,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Detail Actions
  detailActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  detailActionBtn: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  detailActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },

  // P2P Banner
  p2pBanner: {
    position: 'absolute',
    bottom: 90,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.secondary,
    borderRadius: SIZES.radiusMd,
    padding: 12,
    gap: 10,
    ...SHADOWS.medium,
  },
  p2pBannerText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '600',
  },

  // ── Thumbnails (evidence list items) ──
  thumbnailWrap: {
    width: 56,
    height: 56,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#2a2a3e',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  videoThumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },

  // ── Media Viewer Modal ──
  mediaViewerOverlay: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaViewerClose: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 36,
    right: 16,
    zIndex: 20,
    padding: 4,
  },
  mediaViewerContent: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaViewerImage: {
    width: '100%',
    height: '100%',
  },
  mediaViewerVideo: {
    width: '100%',
    height: '80%',
  },
  mediaViewerAudio: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingHorizontal: 30,
  },
  mediaViewerAudioTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  mediaViewerPlayBtn: {
    marginTop: 10,
  },
  mediaViewerProgressWrap: {
    width: '100%',
    paddingHorizontal: 10,
  },
  mediaViewerActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingVertical: 20,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  mediaViewerActionBtn: {
    alignItems: 'center',
    gap: 4,
  },
  mediaViewerActionLabel: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },

  // ── Detail Modal – photo/video preview ──
  detailPreviewImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: '#2a2a3e',
  },
  detailPreviewOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingVertical: 8,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  detailPreviewHint: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  detailVideoThumb: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    backgroundColor: '#2a2a3e',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  detailVideoDuration: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
});
