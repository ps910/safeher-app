/**
 * HiddenCameraScreen — Professional Hidden Camera & EMF Detector
 *
 * Working Detection Methods:
 * 1. LENS FINDER  – Stealthy camera scan with zoom to spot hidden lenses (no flash/torch)
 * 2. IR SCANNER   – Camera detects IR LEDs in darkness (night-vision cameras)
 * 3. EMF DETECTOR – Magnetometer + Light-sensor detect electronic devices
 * 4. SWEEP GUIDE  – Systematic room-inspection checklist
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert,
  Dimensions, Animated, Platform, StatusBar, Modal, Vibration,
  ActivityIndicator, Image,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Magnetometer, LightSensor } from 'expo-sensors';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';
import { EvidenceDB } from '../services/Database';

const windowDims = Dimensions.get('window') || {};
const SCREEN_W = windowDims.width || 400;
const SCREEN_H = windowDims.height || 800;

// ─── Thresholds ──────────────────────────────────────────────────
const MAG_THRESHOLD_LOW = 80;     // µT deviation — mild anomaly
const MAG_THRESHOLD_MED = 160;    // µT deviation — electronic device nearby
const MAG_THRESHOLD_HIGH = 280;   // µT deviation — very close or strong emitter
const LIGHT_SPIKE_THRESHOLD = 40; // lux sudden increase
const EMF_HISTORY_MAX = 60;       // rolling history points for graph
const EVIDENCE_DIR = `${FileSystem.documentDirectory}camera_scans/`;

// ─── Room Sweep Checklist ────────────────────────────────────────
const COMMON_HIDING_SPOTS = [
  { name: 'Smoke Detectors',    icon: 'alert-circle',       checked: false },
  { name: 'Wall Clocks',        icon: 'time',               checked: false },
  { name: 'Air Vents / AC',     icon: 'snow',               checked: false },
  { name: 'Wall Outlets / Chargers', icon: 'flash',         checked: false },
  { name: 'Picture Frames',     icon: 'image',              checked: false },
  { name: 'TV / Monitor',       icon: 'tv',                 checked: false },
  { name: 'Bathroom Mirror',    icon: 'water',              checked: false },
  { name: 'Shower Head / Taps', icon: 'rainy',              checked: false },
  { name: 'Tissue Box',         icon: 'cube',               checked: false },
  { name: 'USB Chargers / Adapters', icon: 'battery-charging', checked: false },
  { name: 'Desk Lamp / Night Lamp',  icon: 'bulb',          checked: false },
  { name: 'Stuffed Animals / Toys',   icon: 'heart',        checked: false },
  { name: 'Ceiling Tiles',      icon: 'grid',               checked: false },
  { name: 'Screw Holes / Small Holes', icon: 'build',       checked: false },
  { name: 'Books / Shelves',    icon: 'book',               checked: false },
  { name: 'Potted Plants',      icon: 'leaf',               checked: false },
];

// ─── Detection Guide ─────────────────────────────────────────────
const DETECTION_TIPS = [
  { icon: 'search',       title: 'Lens Finder (Stealth Method)',
    desc: 'Use the camera with zoom to carefully inspect walls, objects, and fixtures for tiny camera lenses (1-3mm glass circles). DO NOT use flashlight — it can alert the person who planted the camera. Look for small dark circles, pinholes, or reflective glass surfaces on everyday objects.' },
  { icon: 'eye',          title: 'IR Detection (Darkness Method)',
    desc: 'Turn off ALL lights in the room. Open the camera without flash. Night-vision cameras emit invisible IR light that appears as faint purple or red glowing dots through your phone camera.' },
  { icon: 'camera-reverse', title: 'Use Front Camera for IR',
    desc: 'Many front cameras lack IR filters, making them much better at detecting IR LEDs. Switch to front camera in a dark room for the best IR detection results.' },
  { icon: 'magnet',       title: 'EMF / Magnetic Scan',
    desc: 'Hidden cameras contain electronics that emit electromagnetic fields. Move your phone slowly near objects — the magnetometer detects magnetic field spikes from circuits, motors, and wireless transmitters.' },
  { icon: 'wifi',         title: 'Check Your WiFi',
    desc: 'Many hidden cameras create WiFi hotspots with names like "IP Camera", "IPCAM", or random strings. Check your WiFi list for suspicious networks you don\'t recognize.' },
  { icon: 'alert-circle', title: 'Stay Discreet',
    desc: 'Never use a flashlight or torch during your sweep — it can alert the person who planted the camera. Pretend to use your phone normally. If you find a device, do NOT touch it — capture evidence and contact authorities.' },
];

export default function HiddenCameraScreen({ navigation }) {
  // ─── State ────────────────────────────────────────────────────
  const [permission, requestPermission] = useCameraPermissions();
  const [scanMode, setScanMode] = useState('lens');     // lens | ir | emf | guide
  const [isScanning, setIsScanning] = useState(false);
  const [cameraFacing, setCameraFacing] = useState('back');
  const [zoomLevel, setZoomLevel] = useState(0);

  // EMF / Magnetometer
  const [magneticField, setMagneticField] = useState(0);
  const [magneticBaseline, setMagneticBaseline] = useState(null);
  const [emfHistory, setEmfHistory] = useState([]);
  const [emfDetections, setEmfDetections] = useState([]);
  const [emfPeakValue, setEmfPeakValue] = useState(0);
  const [emfSensitivity, setEmfSensitivity] = useState('normal'); // low | normal | high

  // Light Sensor
  const [lightLevel, setLightLevel] = useState(null);
  const [lightBaseline, setLightBaseline] = useState(null);
  const [lightSensorAvailable, setLightSensorAvailable] = useState(false);
  const [lightSpikeDetected, setLightSpikeDetected] = useState(false);

  // Evidence capture
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [showCapturePreview, setShowCapturePreview] = useState(false);
  const [captureCount, setCaptureCount] = useState(0);

  // Checklist
  const [checklist, setChecklist] = useState(COMMON_HIDING_SPOTS);
  const [showTips, setShowTips] = useState(false);

  // ─── Refs ─────────────────────────────────────────────────────
  const cameraRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const alertAnim = useRef(new Animated.Value(0)).current;
  const magnetRef = useRef(null);
  const lightRef = useRef(null);
  const magneticBaselineRef = useRef(null);
  const lightBaselineRef = useRef(null);
  const emfPeakRef = useRef(0);

  // ─── Ensure evidence directory exists ──────────────────────────
  useEffect(() => {
    (async () => {
      const dirInfo = await FileSystem.getInfoAsync(EVIDENCE_DIR);
      if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(EVIDENCE_DIR, { intermediates: true });
    })();
  }, []);

  // ─── Pulse animation ──────────────────────────────────────────
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);



  // ─── Check light-sensor availability ───────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const avail = await LightSensor.isAvailableAsync();
        setLightSensorAvailable(avail);
      } catch (_) {
        setLightSensorAvailable(false);
      }
    })();
  }, []);

  // ─── Magnetometer (EMF Detection) ─────────────────────────────
  useEffect(() => {
    if (scanMode === 'emf' && isScanning) {
      startMagnetometer();
      if (lightSensorAvailable) startLightSensor();
    } else {
      stopMagnetometer();
      stopLightSensor();
    }
    return () => { stopMagnetometer(); stopLightSensor(); };
  }, [scanMode, isScanning]);

  const getSensitivityMultiplier = () => {
    if (emfSensitivity === 'high') return 0.5;   // halved thresholds = more sensitive
    if (emfSensitivity === 'low') return 2.0;     // doubled thresholds
    return 1.0;
  };

  const startMagnetometer = () => {
    Magnetometer.setUpdateInterval(150);
    magneticBaselineRef.current = null;
    setMagneticBaseline(null);
    emfPeakRef.current = 0;
    setEmfPeakValue(0);

    magnetRef.current = Magnetometer.addListener(data => {
      const magnitude = Math.sqrt(data.x ** 2 + data.y ** 2 + data.z ** 2);
      const rounded = Math.round(magnitude);
      setMagneticField(rounded);

      // Establish baseline from first 5 readings average
      if (magneticBaselineRef.current === null) {
        magneticBaselineRef.current = magnitude;
        setMagneticBaseline(magnitude);
      } else {
        // Slow-moving baseline (adapts over time)
        magneticBaselineRef.current = magneticBaselineRef.current * 0.99 + magnitude * 0.01;
      }

      // Track peak
      if (rounded > emfPeakRef.current) {
        emfPeakRef.current = rounded;
        setEmfPeakValue(rounded);
      }

      // History for mini-graph
      setEmfHistory(prev => [...prev, rounded].slice(-EMF_HISTORY_MAX));

      // Deviation analysis
      const baseline = magneticBaselineRef.current;
      const deviation = Math.abs(magnitude - baseline);
      const mult = getSensitivityMultiplier();

      if (deviation > MAG_THRESHOLD_HIGH * mult) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Vibration.vibrate([0, 400, 150, 400, 150, 400]);
        Animated.timing(alertAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
        addEmfDetection('critical', rounded, Math.round(deviation));
      } else if (deviation > MAG_THRESHOLD_MED * mult) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Vibration.vibrate([0, 250, 100, 250]);
        Animated.timing(alertAnim, { toValue: 0.7, duration: 200, useNativeDriver: true }).start();
        addEmfDetection('high', rounded, Math.round(deviation));
      } else if (deviation > MAG_THRESHOLD_LOW * mult) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Animated.timing(alertAnim, { toValue: 0.35, duration: 300, useNativeDriver: true }).start();
        addEmfDetection('medium', rounded, Math.round(deviation));
      } else {
        Animated.timing(alertAnim, { toValue: 0, duration: 500, useNativeDriver: true }).start();
      }
    });
  };

  const stopMagnetometer = () => {
    if (magnetRef.current) { magnetRef.current.remove(); magnetRef.current = null; }
  };

  const addEmfDetection = (level, magnitude, deviation) => {
    setEmfDetections(prev => {
      // Throttle: 3s between entries
      if (prev.length > 0 && Date.now() - new Date(prev[0].timestamp).getTime() < 3000) return prev;
      return [{
        id: Date.now().toString(), level, magnitude, deviation,
        timestamp: new Date().toISOString(),
      }, ...prev].slice(0, 100);
    });
  };

  // ─── Light Sensor ──────────────────────────────────────────────
  const startLightSensor = () => {
    LightSensor.setUpdateInterval(200);
    lightBaselineRef.current = null;
    setLightBaseline(null);

    lightRef.current = LightSensor.addListener(data => {
      const lux = Math.round(data.illuminance);
      setLightLevel(lux);

      if (lightBaselineRef.current === null) {
        lightBaselineRef.current = lux;
        setLightBaseline(lux);
      }

      const spike = lux - lightBaselineRef.current;
      if (spike > LIGHT_SPIKE_THRESHOLD) {
        setLightSpikeDetected(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        setTimeout(() => setLightSpikeDetected(false), 2000);
      }

      // Slow baseline update
      lightBaselineRef.current = lightBaselineRef.current * 0.95 + lux * 0.05;
    });
  };

  const stopLightSensor = () => {
    if (lightRef.current) { lightRef.current.remove(); lightRef.current = null; }
    setLightSpikeDetected(false);
  };

  // ─── Recalibrate baseline ──────────────────────────────────────
  const recalibrateEMF = () => {
    magneticBaselineRef.current = null;
    setMagneticBaseline(null);
    emfPeakRef.current = 0;
    setEmfPeakValue(0);
    setEmfHistory([]);
    setEmfDetections([]);
    if (lightSensorAvailable) {
      lightBaselineRef.current = null;
      setLightBaseline(null);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Recalibrated', 'Hold your phone in the air away from electronics for 3 seconds to set an accurate baseline.');
  };

  // ─── Toggle scanning ──────────────────────────────────────────
  const toggleScanning = () => {
    setIsScanning(prev => !prev);
    if (isScanning && scanMode === 'emf') {
      // Stopping — reset
    } else if (!isScanning && scanMode === 'emf') {
      setEmfHistory([]);
      setEmfDetections([]);
      emfPeakRef.current = 0;
      setEmfPeakValue(0);
      magneticBaselineRef.current = null;
      setMagneticBaseline(null);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  // ─── Capture Evidence Photo ────────────────────────────────────
  const captureEvidence = async () => {
    if (!cameraRef.current) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (!photo || !photo.uri) {
        Alert.alert('Error', 'Failed to capture photo');
        return;
      }

      // Copy to persistent storage
      const filename = `scan_${Date.now()}.jpg`;
      const dest = EVIDENCE_DIR + filename;
      await FileSystem.copyAsync({ from: photo.uri, to: dest });

      setCapturedPhoto({ uri: dest, filename, mode: scanMode, timestamp: new Date().toISOString() });
      setCaptureCount(prev => prev + 1);
      setShowCapturePreview(true);
    } catch (e) {
      console.log('Capture error:', e);
      Alert.alert('Capture Failed', 'Could not take photo. Please try again.');
    }
  };

  // ─── Save captured evidence to vault ───────────────────────────
  const saveEvidenceToVault = async (withNote = '') => {
    if (!capturedPhoto) return;
    try {
      const modeLabel = scanMode === 'lens' ? 'Stealth Lens Scan' : scanMode === 'ir' ? 'IR Scanner' : 'EMF Detector';
      await EvidenceDB.addFile({
        uri: capturedPhoto.uri,
        name: capturedPhoto.filename,
        type: 'image/jpeg',
        size: 0,
        category: 'camera_scan',
        description: `${modeLabel} scan capture${withNote ? ': ' + withNote : ''}`,
      });
      await EvidenceDB.add({
        type: 'camera_scan',
        scanMode,
        photoUri: capturedPhoto.uri,
        timestamp: capturedPhoto.timestamp,
        emfDetections: emfDetections.length,
        description: `Suspicious area captured via ${modeLabel}${withNote ? ' — ' + withNote : ''}`,
      });
      Alert.alert('Saved to Vault', 'Evidence photo saved securely to your Evidence Vault.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowCapturePreview(false);
      setCapturedPhoto(null);
    } catch (e) {
      Alert.alert('Error', 'Failed to save evidence');
    }
  };

  // ─── Save EMF scan results ─────────────────────────────────────
  const saveEMFResults = async () => {
    try {
      await EvidenceDB.add({
        type: 'emf_scan',
        scanMode: 'emf',
        detectionCount: emfDetections.length,
        peakValue: emfPeakValue,
        baseline: magneticBaseline ? Math.round(magneticBaseline) : 0,
        sensitivity: emfSensitivity,
        timestamp: new Date().toISOString(),
        description: emfDetections.length > 0
          ? `EMF scan: ${emfDetections.length} anomalies detected. Peak: ${emfPeakValue}µT.`
          : `EMF scan completed. No anomalies. Peak: ${emfPeakValue}µT.`,
      });
      Alert.alert('Saved', 'EMF scan results saved to Evidence Vault');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('Error', 'Failed to save results');
    }
  };

  // ─── Save checklist results ────────────────────────────────────
  const saveChecklistResults = async () => {
    try {
      const checked = checklist.filter(c => c.checked);
      const unchecked = checklist.filter(c => !c.checked);
      await EvidenceDB.add({
        type: 'room_sweep',
        scanMode: 'checklist',
        checkedCount: checked.length,
        totalCount: checklist.length,
        uncheckedSpots: unchecked.map(c => c.name),
        timestamp: new Date().toISOString(),
        description: `Room sweep: ${checked.length}/${checklist.length} spots inspected.`,
      });
      Alert.alert('Saved', 'Room sweep results saved to Evidence Vault');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('Error', 'Failed to save results');
    }
  };

  const toggleChecklistItem = (index) => {
    const updated = [...checklist];
    updated[index] = { ...updated[index], checked: !updated[index].checked };
    setChecklist(updated);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ─── EMF color & label helpers ─────────────────────────────────
  const getEmfColor = () => {
    if (!magneticBaseline) return '#2196F3';
    const dev = Math.abs(magneticField - magneticBaseline);
    const m = getSensitivityMultiplier();
    if (dev > MAG_THRESHOLD_HIGH * m) return '#FF1744';
    if (dev > MAG_THRESHOLD_MED * m) return '#FF9800';
    if (dev > MAG_THRESHOLD_LOW * m) return '#FFD600';
    return '#00C853';
  };

  const getEmfLabel = () => {
    if (!magneticBaseline) return 'Calibrating…';
    const dev = Math.abs(magneticField - magneticBaseline);
    const m = getSensitivityMultiplier();
    if (dev > MAG_THRESHOLD_HIGH * m) return 'DEVICE DETECTED — Very Strong Signal';
    if (dev > MAG_THRESHOLD_MED * m) return 'SUSPICIOUS — Strong Magnetic Field';
    if (dev > MAG_THRESHOLD_LOW * m) return 'Mild Anomaly — Move Closer to Confirm';
    return 'Clear — No Electronic Devices Nearby';
  };

  const getEmfDeviation = () => {
    if (!magneticBaseline) return 0;
    return Math.round(Math.abs(magneticField - magneticBaseline));
  };

  // ─── Zoom helpers ──────────────────────────────────────────────
  const zoomIn = () => setZoomLevel(prev => Math.min(prev + 0.1, 1));
  const zoomOut = () => setZoomLevel(prev => Math.max(prev - 0.1, 0));

  // ═══════════════════════════════════════════════════════════════
  //  PERMISSION SCREENS
  // ═══════════════════════════════════════════════════════════════
  if (!permission) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={{ marginTop: 12, color: COLORS.textSecondary }}>Loading camera…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permContainer}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
        <Ionicons name="camera-outline" size={80} color={COLORS.textLight} />
        <Text style={styles.permTitle}>Camera Access Needed</Text>
        <Text style={styles.permDesc}>
          Camera access is needed to visually scan for hidden cameras and detect
          IR signals in dark rooms.
        </Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBackBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.navBackText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  MINI-GRAPH for EMF history
  // ═══════════════════════════════════════════════════════════════
  const renderEmfGraph = () => {
    if (emfHistory.length < 2) return null;
    const maxVal = Math.max(...emfHistory, 100);
    const barW = Math.max(2, (SCREEN_W - 64) / EMF_HISTORY_MAX);
    return (
      <View style={styles.graphContainer}>
        <Text style={styles.graphTitle}>Real-Time EMF Graph</Text>
        <View style={styles.graphArea}>
          {emfHistory.map((val, i) => {
            const h = Math.max(2, (val / maxVal) * 80);
            const dev = magneticBaseline ? Math.abs(val - magneticBaseline) : 0;
            const m = getSensitivityMultiplier();
            let color = '#00C853';
            if (dev > MAG_THRESHOLD_HIGH * m) color = '#FF1744';
            else if (dev > MAG_THRESHOLD_MED * m) color = '#FF9800';
            else if (dev > MAG_THRESHOLD_LOW * m) color = '#FFD600';
            return (
              <View key={i} style={[styles.graphBar, { height: h, width: barW, backgroundColor: color }]} />
            );
          })}
        </View>
        <View style={styles.graphLabels}>
          <Text style={styles.graphLabel}>Oldest</Text>
          <Text style={styles.graphLabel}>Now</Text>
        </View>
      </View>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {scanMode === 'lens'  ? 'Lens Finder'
            : scanMode === 'ir' ? 'IR Scanner'
            : scanMode === 'emf' ? 'EMF Detector'
            : 'Room Sweep'}
        </Text>
        <TouchableOpacity onPress={() => setShowTips(true)} style={styles.headerBtn}>
          <Ionicons name="help-circle-outline" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* ── Mode Tabs ── */}
      <View style={styles.modeTabs}>
        {[
          { key: 'lens',  label: 'Lens',    icon: 'search' },
          { key: 'ir',    label: 'IR',       icon: 'eye' },
          { key: 'emf',   label: 'EMF',      icon: 'magnet' },
          { key: 'guide', label: 'Sweep',    icon: 'checkbox' },
        ].map(m => (
          <TouchableOpacity
            key={m.key}
            style={[styles.modeTab, scanMode === m.key && styles.modeTabActive]}
            onPress={() => {
              setScanMode(m.key);
              if (isScanning) setIsScanning(false);
            }}
          >
            <Ionicons name={m.icon} size={16} color={scanMode === m.key ? '#fff' : COLORS.textLight} />
            <Text style={[styles.modeTabText, scanMode === m.key && styles.modeTabTextActive]}>
              {m.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ════════════════════════════════════════════════════════ */}
      {/*   LENS FINDER MODE — Stealth visual scan (NO torch)    */}
      {/* ════════════════════════════════════════════════════════ */}
      {scanMode === 'lens' && (
        <View style={styles.scannerContainer}>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing={cameraFacing}
            enableTorch={false}
            zoom={zoomLevel}
          >
            {/* Corner guides */}
            <View style={styles.cornerGuides}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>

            {/* Top instruction banner */}
            <View style={styles.instructionBanner}>
              <Ionicons name="eye" size={16} color="#4FC3F7" />
              <Text style={styles.instructionText}>
                Zoom in on suspicious spots. Look for tiny dark circles, pinholes, or reflective glass. No flash used — stay discreet.
              </Text>
            </View>

            {/* Stealth mode badge */}
            <View style={styles.stealthBadge}>
              <Ionicons name="eye-off" size={14} color="#4FC3F7" />
              <Text style={styles.stealthBadgeText}>STEALTH MODE — No Flash</Text>
            </View>

            {/* What to look for overlay */}
            <View style={styles.lensHintOverlay}>
              <Text style={styles.lensHintTitle}>Look for:</Text>
              <Text style={styles.lensHintItem}>• Tiny dark pinholes (1-3mm)</Text>
              <Text style={styles.lensHintItem}>• Small reflective glass circles</Text>
              <Text style={styles.lensHintItem}>• Out-of-place objects</Text>
              <Text style={styles.lensHintItem}>• Wires or small LEDs</Text>
            </View>

            {/* Zoom indicator */}
            {zoomLevel > 0 && (
              <View style={styles.zoomBadge}>
                <Text style={styles.zoomBadgeText}>{(1 + zoomLevel * 9).toFixed(1)}x</Text>
              </View>
            )}
          </CameraView>

          {/* Camera Controls */}
          <View style={styles.cameraControls}>
            <Text style={styles.controlHint}>
              Use zoom to inspect suspicious objects closely — no flash to stay undetected
            </Text>

            <View style={styles.actionRow}>
              {/* Zoom out */}
              <TouchableOpacity style={styles.sideActionBtn} onPress={zoomOut}>
                <Ionicons name="remove-circle-outline" size={26} color="#fff" />
                <Text style={styles.sideActionLabel}>Zoom-</Text>
              </TouchableOpacity>

              {/* Flip camera */}
              <TouchableOpacity
                style={styles.sideActionBtn}
                onPress={() => setCameraFacing(f => f === 'back' ? 'front' : 'back')}
              >
                <Ionicons name="camera-reverse-outline" size={26} color="#fff" />
                <Text style={styles.sideActionLabel}>Flip</Text>
              </TouchableOpacity>

              {/* Capture */}
              <TouchableOpacity style={styles.captureBtn} onPress={captureEvidence}>
                <View style={styles.captureBtnInner}>
                  <Ionicons name="camera" size={28} color="#fff" />
                </View>
              </TouchableOpacity>

              {/* Zoom in */}
              <TouchableOpacity style={styles.sideActionBtn} onPress={zoomIn}>
                <Ionicons name="add-circle-outline" size={26} color="#fff" />
                <Text style={styles.sideActionLabel}>Zoom+</Text>
              </TouchableOpacity>
            </View>

            {captureCount > 0 && (
              <Text style={styles.captureCountText}>{captureCount} photo(s) captured this session</Text>
            )}
          </View>
        </View>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/*   IR SCANNER MODE — Dark mode camera                   */}
      {/* ════════════════════════════════════════════════════════ */}
      {scanMode === 'ir' && (
        <View style={styles.scannerContainer}>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing={cameraFacing}
            enableTorch={false}
            zoom={zoomLevel}
          >
            {/* Corner guides */}
            <View style={styles.cornerGuides}>
              <View style={[styles.corner, { borderColor: '#FF004488' }, styles.cornerTL]} />
              <View style={[styles.corner, { borderColor: '#FF004488' }, styles.cornerTR]} />
              <View style={[styles.corner, { borderColor: '#FF004488' }, styles.cornerBL]} />
              <View style={[styles.corner, { borderColor: '#FF004488' }, styles.cornerBR]} />
            </View>

            {/* IR instruction */}
            <View style={[styles.instructionBanner, { backgroundColor: 'rgba(180,0,50,0.75)' }]}>
              <Ionicons name="moon" size={16} color="#FF8A80" />
              <Text style={styles.instructionText}>
                Turn OFF all room lights. IR cameras emit faint purple/red dots visible through your camera.
              </Text>
            </View>

            {/* IR tips overlay — top-right */}
            <View style={styles.irTipOverlay}>
              <Text style={styles.irTipText}>Look for:</Text>
              <Text style={styles.irTipItem}>• Faint red/purple dots</Text>
              <Text style={styles.irTipItem}>• Small glowing points</Text>
              <Text style={styles.irTipItem}>• Invisible to naked eye</Text>
            </View>

            {zoomLevel > 0 && (
              <View style={styles.zoomBadge}>
                <Text style={styles.zoomBadgeText}>{(1 + zoomLevel * 9).toFixed(1)}x</Text>
              </View>
            )}
          </CameraView>

          {/* IR Controls */}
          <View style={styles.cameraControls}>
            <Text style={styles.controlHint}>
              Front camera may detect IR better — try flipping the camera
            </Text>

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.sideActionBtn} onPress={zoomOut}>
                <Ionicons name="remove-circle-outline" size={26} color="#fff" />
                <Text style={styles.sideActionLabel}>Zoom-</Text>
              </TouchableOpacity>

              {/* Capture */}
              <TouchableOpacity style={styles.captureBtn} onPress={captureEvidence}>
                <View style={[styles.captureBtnInner, { backgroundColor: '#FF1744' }]}>
                  <Ionicons name="camera" size={28} color="#fff" />
                </View>
              </TouchableOpacity>

              {/* Flip — important for IR */}
              <TouchableOpacity
                style={[styles.sideActionBtn, { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 8 }]}
                onPress={() => setCameraFacing(f => f === 'back' ? 'front' : 'back')}
              >
                <Ionicons name="camera-reverse" size={26} color="#FF8A80" />
                <Text style={[styles.sideActionLabel, { color: '#FF8A80' }]}>
                  {cameraFacing === 'back' ? 'Front' : 'Back'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.sideActionBtn} onPress={zoomIn}>
                <Ionicons name="add-circle-outline" size={26} color="#fff" />
                <Text style={styles.sideActionLabel}>Zoom+</Text>
              </TouchableOpacity>
            </View>

            {captureCount > 0 && (
              <Text style={styles.captureCountText}>{captureCount} photo(s) captured</Text>
            )}
          </View>
        </View>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/*   EMF DETECTOR MODE — Magnetometer + Light sensor      */}
      {/* ════════════════════════════════════════════════════════ */}
      {scanMode === 'emf' && (
        <ScrollView style={styles.emfContainer} showsVerticalScrollIndicator={false}>
          {/* Main EMF Meter */}
          <View style={styles.emfMeter}>
            <Animated.View style={[styles.emfAlertBg, { opacity: alertAnim, backgroundColor: getEmfColor() }]} />
            <View style={styles.emfMeterContent}>
              <Text style={[styles.emfStatusLabel, { color: getEmfColor() }]}>{getEmfLabel()}</Text>
              <Text style={[styles.emfValueBig, { color: getEmfColor() }]}>{magneticField}</Text>
              <Text style={styles.emfUnit}>µT (micro-Tesla)</Text>
              {magneticBaseline !== null && (
                <View style={styles.emfMetaRow}>
                  <Text style={styles.emfMetaText}>Base: {Math.round(magneticBaseline)}µT</Text>
                  <Text style={styles.emfMetaSep}>|</Text>
                  <Text style={[styles.emfMetaText, { color: getEmfColor(), fontWeight: '700' }]}>
                    Δ {getEmfDeviation()}µT
                  </Text>
                  <Text style={styles.emfMetaSep}>|</Text>
                  <Text style={styles.emfMetaText}>Peak: {emfPeakValue}µT</Text>
                </View>
              )}
            </View>
          </View>

          {/* Gauge bar */}
          <View style={styles.gaugeContainer}>
            <View style={styles.gaugeBar}>
              <View style={[
                styles.gaugeFill,
                {
                  width: `${Math.min(100, (getEmfDeviation() / (MAG_THRESHOLD_HIGH * getSensitivityMultiplier() * 1.5)) * 100)}%`,
                  backgroundColor: getEmfColor(),
                },
              ]} />
            </View>
            <View style={styles.gaugeLabels}>
              <Text style={styles.gaugeLabel}>Clear</Text>
              <Text style={styles.gaugeLabel}>Mild</Text>
              <Text style={styles.gaugeLabel}>Strong</Text>
              <Text style={styles.gaugeLabel}>Device!</Text>
            </View>
          </View>

          {/* Start / Stop / Recalibrate */}
          <View style={styles.emfBtnRow}>
            <TouchableOpacity
              style={[styles.emfScanBtn, isScanning && styles.emfScanBtnActive]}
              onPress={toggleScanning}
            >
              <Ionicons name={isScanning ? 'stop-circle' : 'magnet'} size={24} color="#fff" />
              <Text style={styles.emfScanBtnText}>{isScanning ? 'Stop Scan' : 'Start EMF Scan'}</Text>
            </TouchableOpacity>
            {isScanning && (
              <TouchableOpacity style={styles.recalibrateBtn} onPress={recalibrateEMF}>
                <Ionicons name="refresh" size={20} color={COLORS.primary} />
                <Text style={styles.recalibrateBtnText}>Recalibrate</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Sensitivity picker */}
          <View style={styles.sensitivityCard}>
            <Text style={styles.sensitivityTitle}>Detection Sensitivity</Text>
            <View style={styles.sensitivityRow}>
              {[
                { key: 'low',    label: 'Low',    desc: 'Only strong signals' },
                { key: 'normal', label: 'Normal', desc: 'Balanced detection' },
                { key: 'high',   label: 'High',   desc: 'More sensitive' },
              ].map(s => (
                <TouchableOpacity
                  key={s.key}
                  style={[styles.sensitivityChip, emfSensitivity === s.key && styles.sensitivityChipActive]}
                  onPress={() => setEmfSensitivity(s.key)}
                >
                  <Text style={[styles.sensitivityChipText, emfSensitivity === s.key && { color: '#fff' }]}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Light Sensor (Android) */}
          {lightSensorAvailable && isScanning && (
            <View style={[styles.lightSensorCard, lightSpikeDetected && { borderColor: '#FF9800', borderWidth: 2 }]}>
              <View style={styles.lightSensorHeader}>
                <MaterialCommunityIcons name="lightbulb-on" size={20} color={lightSpikeDetected ? '#FF9800' : COLORS.textSecondary} />
                <Text style={styles.lightSensorTitle}>Light / IR Sensor</Text>
                {lightSpikeDetected && (
                  <View style={styles.lightSpikeBadge}>
                    <Text style={styles.lightSpikeText}>SPIKE!</Text>
                  </View>
                )}
              </View>
              <Text style={styles.lightSensorValue}>
                {lightLevel !== null ? `${lightLevel} lux` : 'Reading…'}
              </Text>
              {lightBaseline !== null && (
                <Text style={styles.lightSensorBaseline}>
                  Baseline: {Math.round(lightBaseline)} lux  |  Δ {lightLevel !== null ? Math.abs(lightLevel - Math.round(lightBaseline)) : 0} lux
                </Text>
              )}
              <Text style={styles.lightSensorHint}>
                Point your phone's top edge toward suspected camera. IR sources cause sudden lux spikes.
              </Text>
            </View>
          )}

          {/* EMF Graph */}
          {isScanning && renderEmfGraph()}

          {/* Detection log */}
          {emfDetections.length > 0 && (
            <View style={styles.detectionsCard}>
              <Text style={styles.detectionsTitle}>Anomalies Detected ({emfDetections.length})</Text>
              {emfDetections.slice(0, 15).map(d => (
                <View key={d.id} style={styles.detectionRow}>
                  <View style={[
                    styles.detectionDot,
                    {
                      backgroundColor: d.level === 'critical' ? '#FF1744'
                        : d.level === 'high' ? '#FF9800'
                        : '#FFD600',
                    },
                  ]} />
                  <Text style={styles.detectionText}>
                    {d.level === 'critical' ? 'CRITICAL' : d.level === 'high' ? 'Strong' : 'Mild'} — {d.magnitude}µT (Δ{d.deviation})
                  </Text>
                  <Text style={styles.detectionTime}>{new Date(d.timestamp).toLocaleTimeString()}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Save EMF results */}
          {(emfDetections.length > 0 || emfPeakValue > 0) && (
            <TouchableOpacity style={styles.saveResultsBtn} onPress={saveEMFResults}>
              <Ionicons name="shield-checkmark" size={20} color="#fff" />
              <Text style={styles.saveResultsText}>Save EMF Report to Vault</Text>
            </TouchableOpacity>
          )}

          {/* How EMF works */}
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>How EMF Detection Works</Text>
            <Text style={styles.infoText}>
              Every electronic device — cameras, transmitters, recorders — generates an electromagnetic field.
              Your phone's magnetometer measures these fields in micro-Tesla (µT).{'\n\n'}
              <Text style={{ fontWeight: '700' }}>How to use:</Text>{'\n'}
              1. Start scan in an open area away from electronics to calibrate.{'\n'}
              2. Slowly move your phone close to walls, objects, outlets, and fixtures.{'\n'}
              3. Watch for sudden spikes — consistent spikes near an object indicate hidden electronics.{'\n'}
              4. Normal items like speakers, motors, and large appliances also create fields — check unfamiliar objects.
            </Text>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/*   ROOM SWEEP CHECKLIST                                 */}
      {/* ════════════════════════════════════════════════════════ */}
      {scanMode === 'guide' && (
        <ScrollView style={styles.checklistContainer} showsVerticalScrollIndicator={false}>
          <View style={styles.checklistHeader}>
            <Text style={styles.checklistTitle}>Room Sweep Checklist</Text>
            <Text style={styles.checklistSubtitle}>
              Systematically inspect each common hiding spot. Tap to mark as inspected.
            </Text>
            <View style={styles.progressBar}>
              <View style={[
                styles.progressFill,
                { width: `${(checklist.filter(c => c.checked).length / checklist.length) * 100}%` },
              ]} />
            </View>
            <Text style={styles.progressText}>
              {checklist.filter(c => c.checked).length} / {checklist.length} inspected
            </Text>
          </View>

          {checklist.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.checkItem, item.checked && styles.checkItemDone]}
              onPress={() => toggleChecklistItem(index)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkBox, item.checked && styles.checkBoxDone]}>
                {item.checked && <Ionicons name="checkmark" size={16} color="#fff" />}
              </View>
              <Ionicons
                name={item.icon}
                size={22}
                color={item.checked ? '#00C853' : COLORS.textSecondary}
                style={{ marginRight: 12 }}
              />
              <Text style={[styles.checkText, item.checked && styles.checkTextDone]}>{item.name}</Text>
            </TouchableOpacity>
          ))}

          <View style={styles.checklistActions}>
            <TouchableOpacity
              style={styles.resetBtn}
              onPress={() => setChecklist(COMMON_HIDING_SPOTS.map(s => ({ ...s, checked: false })))}
            >
              <Ionicons name="refresh" size={18} color={COLORS.textSecondary} />
              <Text style={styles.resetText}>Reset All</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveChecklistBtn} onPress={saveChecklistResults}>
              <Ionicons name="save" size={18} color="#fff" />
              <Text style={styles.saveChecklistText}>Save Report</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/*   CAPTURED PHOTO PREVIEW MODAL                         */}
      {/* ════════════════════════════════════════════════════════ */}
      <Modal visible={showCapturePreview} transparent animationType="fade">
        <View style={styles.captureOverlay}>
          <View style={styles.capturePreviewCard}>
            <Text style={styles.capturePreviewTitle}>Evidence Captured</Text>
            {capturedPhoto && (
              <Image source={{ uri: capturedPhoto.uri }} style={styles.capturePreviewImage} resizeMode="cover" />
            )}
            <Text style={styles.capturePreviewHint}>
              {scanMode === 'lens'
                ? 'Did you spot a tiny pinhole, dark circle, or reflective glass? That could be a hidden camera lens.'
                : 'Did you spot a faint red/purple glow? That could be an IR LED from a night-vision camera.'}
            </Text>
            <View style={styles.captureActions}>
              <TouchableOpacity
                style={styles.captureDiscardBtn}
                onPress={() => { setShowCapturePreview(false); setCapturedPhoto(null); }}
              >
                <Ionicons name="trash-outline" size={18} color="#FF1744" />
                <Text style={styles.captureDiscardText}>Discard</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.captureSaveBtn}
                onPress={() => saveEvidenceToVault('Suspicious area detected')}
              >
                <Ionicons name="shield-checkmark" size={18} color="#fff" />
                <Text style={styles.captureSaveText}>Save to Vault</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ════════════════════════════════════════════════════════ */}
      {/*   DETECTION TIPS MODAL                                 */}
      {/* ════════════════════════════════════════════════════════ */}
      <Modal visible={showTips} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Detection Guide</Text>
              <TouchableOpacity onPress={() => setShowTips(false)}>
                <Ionicons name="close-circle" size={28} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {DETECTION_TIPS.map((tip, i) => (
                <View key={i} style={styles.tipItem}>
                  <View style={styles.tipIconWrap}>
                    <Ionicons name={tip.icon} size={22} color={COLORS.primary} />
                  </View>
                  <View style={styles.tipTextWrap}>
                    <Text style={styles.tipTitle}>{tip.title}</Text>
                    <Text style={styles.tipDesc}>{tip.desc}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════
//  STYLES
// ═════════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  // ── Permission ──
  permContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: COLORS.background, padding: 30,
  },
  permTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginTop: 20 },
  permDesc: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginTop: 12, lineHeight: 22 },
  permBtn: {
    backgroundColor: COLORS.primary, borderRadius: SIZES.radiusLg,
    paddingHorizontal: 40, paddingVertical: 14, marginTop: 30,
  },
  permBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  navBackBtn: { marginTop: 16, padding: 10 },
  navBackText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600' },

  // ── Header ──
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 54 : 36,
    paddingHorizontal: 16, paddingBottom: 10,
    backgroundColor: 'rgba(0,0,0,0.95)',
  },
  headerBtn: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },

  // ── Mode Tabs ──
  modeTabs: {
    flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.95)',
    paddingHorizontal: 12, paddingBottom: 10, gap: 6,
  },
  modeTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)', gap: 4,
  },
  modeTabActive: { backgroundColor: COLORS.primary },
  modeTabText: { fontSize: 11, fontWeight: '700', color: COLORS.textLight },
  modeTabTextActive: { color: '#fff' },

  // ── Camera View ──
  scannerContainer: { flex: 1 },
  camera: { flex: 1 },

  // ── Corner guides ──
  cornerGuides: { ...StyleSheet.absoluteFillObject, margin: 24 },
  corner: { position: 'absolute', width: 30, height: 30, borderColor: '#fff' },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },

  // ── Instruction banner ──
  instructionBanner: {
    position: 'absolute', top: 12, left: 12, right: 12,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  instructionText: { flex: 1, color: '#fff', fontSize: 12, fontWeight: '600', lineHeight: 17 },

  // ── Stealth badge ──
  stealthBadge: {
    position: 'absolute', bottom: 12, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(79,195,247,0.15)', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(79,195,247,0.3)',
  },
  stealthBadgeText: { color: '#4FC3F7', fontSize: 11, fontWeight: '700' },

  // ── Lens hint overlay ──
  lensHintOverlay: {
    position: 'absolute', bottom: 50, left: 12,
    backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 12,
    padding: 10, maxWidth: 200,
  },
  lensHintTitle: { color: '#4FC3F7', fontSize: 11, fontWeight: '700', marginBottom: 4 },
  lensHintItem: { color: 'rgba(255,255,255,0.8)', fontSize: 10, lineHeight: 16 },

  // ── Zoom badge ──
  zoomBadge: {
    position: 'absolute', top: 70, right: 16,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  zoomBadgeText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // ── IR tip overlay ──
  irTipOverlay: {
    position: 'absolute', bottom: 12, right: 12,
    backgroundColor: 'rgba(100,0,30,0.7)', borderRadius: 12,
    padding: 10, maxWidth: 160,
  },
  irTipText: { color: '#FF8A80', fontSize: 11, fontWeight: '700', marginBottom: 4 },
  irTipItem: { color: 'rgba(255,255,255,0.8)', fontSize: 10, lineHeight: 16 },

  // ── Camera Controls ──
  cameraControls: {
    backgroundColor: 'rgba(0,0,0,0.95)', paddingHorizontal: 16,
    paddingVertical: 14, paddingBottom: Platform.OS === 'ios' ? 34 : 14,
  },
  controlHint: { color: '#999', fontSize: 11, textAlign: 'center', marginBottom: 12, lineHeight: 15 },
  actionRow: {
    flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center',
  },
  sideActionBtn: { alignItems: 'center', gap: 3, paddingVertical: 4 },
  sideActionLabel: { color: COLORS.textLight, fontSize: 9, fontWeight: '600' },

  // Capture button
  captureBtn: { padding: 4 },
  captureBtnInner: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.4)',
  },
  captureCountText: {
    color: '#666', fontSize: 10, textAlign: 'center', marginTop: 8,
  },

  // ── EMF ──
  emfContainer: { flex: 1, backgroundColor: COLORS.background, padding: 16 },
  emfMeter: {
    borderRadius: 20, overflow: 'hidden', backgroundColor: '#fff',
    ...SHADOWS.medium, marginBottom: 16,
  },
  emfAlertBg: { ...StyleSheet.absoluteFillObject },
  emfMeterContent: { padding: 28, alignItems: 'center' },
  emfStatusLabel: { fontSize: 14, fontWeight: '800', textAlign: 'center', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  emfValueBig: { fontSize: 56, fontWeight: '900' },
  emfUnit: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  emfMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 6 },
  emfMetaText: { fontSize: 12, color: COLORS.textSecondary },
  emfMetaSep: { color: COLORS.border, fontSize: 12 },

  // Gauge
  gaugeContainer: { marginBottom: 16 },
  gaugeBar: { height: 14, borderRadius: 7, backgroundColor: '#E0E0E0', overflow: 'hidden' },
  gaugeFill: { height: '100%', borderRadius: 7 },
  gaugeLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingHorizontal: 2 },
  gaugeLabel: { fontSize: 10, color: COLORS.textLight },

  // EMF buttons
  emfBtnRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  emfScanBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 16, gap: 10,
    ...SHADOWS.medium,
  },
  emfScanBtnActive: { backgroundColor: '#FF1744' },
  emfScanBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  recalibrateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 16,
    borderWidth: 1.5, borderColor: COLORS.primary,
  },
  recalibrateBtnText: { color: COLORS.primary, fontSize: 13, fontWeight: '600' },

  // Sensitivity
  sensitivityCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16,
    ...SHADOWS.small,
  },
  sensitivityTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 10 },
  sensitivityRow: { flexDirection: 'row', gap: 8 },
  sensitivityChip: {
    flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
    borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.background,
  },
  sensitivityChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  sensitivityChipText: { fontSize: 13, fontWeight: '600', color: COLORS.text },

  // Light sensor
  lightSensorCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16,
    ...SHADOWS.small,
  },
  lightSensorHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  lightSensorTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: COLORS.text },
  lightSpikeBadge: {
    backgroundColor: '#FF980020', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  lightSpikeText: { color: '#FF9800', fontSize: 10, fontWeight: '800' },
  lightSensorValue: { fontSize: 32, fontWeight: '900', color: COLORS.text },
  lightSensorBaseline: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
  lightSensorHint: { fontSize: 11, color: COLORS.textLight, marginTop: 8, lineHeight: 16 },

  // Graph
  graphContainer: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16,
    ...SHADOWS.small,
  },
  graphTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 10 },
  graphArea: {
    flexDirection: 'row', alignItems: 'flex-end', height: 84,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 1,
  },
  graphBar: { borderTopLeftRadius: 2, borderTopRightRadius: 2, minHeight: 2 },
  graphLabels: {
    flexDirection: 'row', justifyContent: 'space-between', marginTop: 4,
  },
  graphLabel: { fontSize: 10, color: COLORS.textLight },

  // Detections
  detectionsCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16,
    ...SHADOWS.small,
  },
  detectionsTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 12 },
  detectionRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  detectionDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  detectionText: { flex: 1, fontSize: 13, color: COLORS.text },
  detectionTime: { fontSize: 11, color: COLORS.textLight },

  // Save results
  saveResultsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#00C853', borderRadius: 16, paddingVertical: 14, gap: 8,
    marginBottom: 16, ...SHADOWS.medium,
  },
  saveResultsText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Info card
  infoCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16,
    ...SHADOWS.small,
  },
  infoTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  infoText: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 21 },

  // ── Checklist ──
  checklistContainer: { flex: 1, backgroundColor: COLORS.background, padding: 16 },
  checklistHeader: { marginBottom: 16 },
  checklistTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  checklistSubtitle: { fontSize: 13, color: COLORS.textSecondary, marginTop: 6, lineHeight: 20 },
  progressBar: { height: 8, borderRadius: 4, backgroundColor: '#E0E0E0', marginTop: 16, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: '#00C853' },
  progressText: { fontSize: 12, color: COLORS.textSecondary, marginTop: 6, textAlign: 'right' },
  checkItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: SIZES.radiusMd,
    padding: 14, marginBottom: 8, ...SHADOWS.small,
  },
  checkItemDone: { backgroundColor: '#F0FFF4', borderWidth: 1, borderColor: '#C8E6C9' },
  checkBox: {
    width: 26, height: 26, borderRadius: 6,
    borderWidth: 2, borderColor: COLORS.border,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  checkBoxDone: { backgroundColor: '#00C853', borderColor: '#00C853' },
  checkText: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.text },
  checkTextDone: { color: '#2E7D32', textDecorationLine: 'line-through' },
  checklistActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  resetBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12 },
  resetText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600' },
  saveChecklistBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.primary, borderRadius: SIZES.radiusMd,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  saveChecklistText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // ── Capture Preview Modal ──
  captureOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  capturePreviewCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 20,
    width: '100%', maxWidth: 400,
  },
  capturePreviewTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 12 },
  capturePreviewImage: {
    width: '100%', height: 280, borderRadius: 14, marginBottom: 12,
    backgroundColor: '#000',
  },
  capturePreviewHint: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19, marginBottom: 16 },
  captureActions: { flexDirection: 'row', gap: 10 },
  captureDiscardBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 13, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#FF1744',
  },
  captureDiscardText: { color: '#FF1744', fontSize: 14, fontWeight: '600' },
  captureSaveBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 13, borderRadius: 12, backgroundColor: '#00C853',
  },
  captureSaveText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // ── Tips Modal ──
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: SCREEN_H * 0.75, padding: 20,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  tipItem: { flexDirection: 'row', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tipIconWrap: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary + '15',
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  tipTextWrap: { flex: 1 },
  tipTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  tipDesc: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },
});
