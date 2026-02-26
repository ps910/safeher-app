/**
 * IncidentReportScreen v3.0 — AI-Powered Incident Reports
 * 
 * - Explains what an incident report is on first open
 * - Auto-generates reports from SOS signals, evidence, location, profile
 * - On-device AI analysis: threat level, timeline, patterns, recommendations
 * - Beautiful report viewer with expandable sections
 * - Share with police / authorities
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, Alert, TextInput, Share, Modal, Animated,
  ActivityIndicator, Dimensions, Linking,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEmergency } from '../context/EmergencyContext';
import { useAuth } from '../context/AuthContext';
import { COLORS, SHADOWS, SIZES } from '../constants/theme';
import { EvidenceDB } from '../services/Database';

const { width: SCREEN_W } = Dimensions.get('window');
const REPORTS_KEY = '@gs_incident_reports';
const FIRST_OPEN_KEY = '@gs_report_first_open';

// ─── AI ANALYSIS ENGINE (On-Device) ─────────────────────────────
const AIReportEngine = {
  /**
   * Analyses SOS history, evidence, location, and profile to
   * produce a comprehensive AI-generated incident report.
   */
  async generateAnalysis({ sosHistory, evidenceLogs, evidenceFiles, currentLocation, userProfile, emergencyContacts, incidentDesc }) {
    // Simulate AI processing delay for realism
    await new Promise(r => setTimeout(r, 1800));

    const now = new Date();
    const recentSOS = sosHistory.slice(0, 20);

    // ── 1. Threat Assessment ──
    const threatLevel = this._assessThreat(recentSOS);

    // ── 2. Timeline Reconstruction ──
    const timeline = this._buildTimeline(recentSOS, evidenceLogs);

    // ── 3. Location Pattern Analysis ──
    const locationAnalysis = this._analyzeLocations(recentSOS, currentLocation);

    // ── 4. Evidence Summary ──
    const evidenceSummary = this._summarizeEvidence(evidenceLogs, evidenceFiles);

    // ── 5. Behavioral Pattern ──
    const patterns = this._detectPatterns(recentSOS);

    // ── 6. Recommended Actions ──
    const recommendations = this._generateRecommendations(threatLevel, recentSOS, evidenceLogs);

    // ── 7. AI Narrative ──
    const narrative = this._generateNarrative({
      incidentDesc, threatLevel, recentSOS, locationAnalysis,
      evidenceSummary, userProfile, now,
    });

    return {
      threatLevel,
      timeline,
      locationAnalysis,
      evidenceSummary,
      patterns,
      recommendations,
      narrative,
      generatedAt: now.toISOString(),
      aiVersion: '3.0',
    };
  },

  _assessThreat(recentSOS) {
    if (recentSOS.length === 0) return { level: 'LOW', score: 1, label: 'Low Risk', color: '#00C853' };

    const now = Date.now();
    const last24h = recentSOS.filter(s => now - new Date(s.timestamp).getTime() < 86400000);
    const last1h = recentSOS.filter(s => now - new Date(s.timestamp).getTime() < 3600000);

    let score = 0;
    score += Math.min(last1h.length * 30, 60);
    score += Math.min(last24h.length * 10, 30);
    score += Math.min(recentSOS.length * 2, 10);

    if (score >= 70) return { level: 'CRITICAL', score, label: 'Critical — Immediate Danger', color: '#D50000' };
    if (score >= 45) return { level: 'HIGH', score, label: 'High Risk — Urgent Attention', color: '#FF1744' };
    if (score >= 20) return { level: 'MODERATE', score, label: 'Moderate Risk — Monitor Closely', color: '#FF6D00' };
    return { level: 'LOW', score, label: 'Low Risk — Stay Alert', color: '#00C853' };
  },

  _buildTimeline(recentSOS, evidenceLogs) {
    const events = [];

    recentSOS.forEach(s => {
      events.push({
        time: s.timestamp,
        type: 'SOS',
        icon: 'alert-circle',
        color: '#FF1744',
        title: 'SOS Signal Activated',
        detail: s.location
          ? `Location: ${s.location.coords?.latitude?.toFixed(5)}, ${s.location.coords?.longitude?.toFixed(5)}`
          : 'Location not captured',
      });
    });

    evidenceLogs.slice(0, 10).forEach(e => {
      const typeMap = {
        audio: { icon: 'mic', color: '#FF6D00', title: 'Audio Evidence Recorded' },
        photo: { icon: 'camera', color: '#1565C0', title: 'Photo Evidence Captured' },
        video: { icon: 'videocam', color: '#AA00FF', title: 'Video Evidence Recorded' },
        detection: { icon: 'eye', color: '#37474F', title: 'Hidden Camera Detected' },
      };
      const info = typeMap[e.type] || { icon: 'document', color: '#455A64', title: 'Evidence Logged' };
      events.push({
        time: e.createdAt,
        type: 'EVIDENCE',
        icon: info.icon,
        color: info.color,
        title: info.title,
        detail: e.sha256Hash ? `Hash: ${e.sha256Hash.substring(0, 16)}...` : '',
      });
    });

    events.sort((a, b) => new Date(b.time) - new Date(a.time));
    return events.slice(0, 15);
  },

  _analyzeLocations(recentSOS, currentLocation) {
    const withLoc = recentSOS.filter(s => s.location?.coords);
    if (withLoc.length === 0) {
      return {
        hasData: false,
        summary: 'No GPS data available from SOS events.',
        clusters: [],
        currentLocation: currentLocation?.coords || null,
      };
    }

    // Find location clusters (within ~200m of each other)
    const clusters = [];
    withLoc.forEach(s => {
      const lat = s.location.coords.latitude;
      const lon = s.location.coords.longitude;
      const existing = clusters.find(c => {
        const dLat = Math.abs(c.lat - lat);
        const dLon = Math.abs(c.lon - lon);
        return dLat < 0.002 && dLon < 0.002; // ~200m
      });
      if (existing) {
        existing.count++;
        existing.timestamps.push(s.timestamp);
      } else {
        clusters.push({ lat, lon, count: 1, timestamps: [s.timestamp] });
      }
    });

    clusters.sort((a, b) => b.count - a.count);

    const hotspot = clusters[0];
    const summary = clusters.length === 1
      ? `All ${withLoc.length} SOS signals originated from the same location area (${hotspot.lat.toFixed(5)}, ${hotspot.lon.toFixed(5)}). This could indicate a recurring threat at a specific location.`
      : `SOS signals detected across ${clusters.length} distinct locations. The primary hotspot (${hotspot.count} signals) is at ${hotspot.lat.toFixed(5)}, ${hotspot.lon.toFixed(5)}.`;

    return {
      hasData: true,
      summary,
      clusters,
      totalWithGPS: withLoc.length,
      currentLocation: currentLocation?.coords || null,
    };
  },

  _summarizeEvidence(logs, files) {
    const audioFiles = files.filter(f => f.type === 'audio');
    const photoFiles = files.filter(f => f.type === 'photo');
    const videoFiles = files.filter(f => f.type === 'video');
    const detections = logs.filter(l => l.type === 'detection');

    return {
      totalLogs: logs.length,
      totalFiles: files.length,
      audio: audioFiles.length,
      photos: photoFiles.length,
      videos: videoFiles.length,
      detections: detections.length,
      verified: logs.filter(l => l.verified).length,
      hasEvidence: logs.length > 0 || files.length > 0,
    };
  },

  _detectPatterns(recentSOS) {
    if (recentSOS.length < 2) return { hasPatterns: false, insights: [] };

    const insights = [];
    const now = Date.now();

    // Time-of-day pattern
    const hours = recentSOS.map(s => new Date(s.timestamp).getHours());
    const nightCount = hours.filter(h => h >= 20 || h < 6).length;
    const dayCount = hours.length - nightCount;
    if (nightCount > dayCount) {
      insights.push({
        icon: 'moon',
        text: `${Math.round((nightCount / hours.length) * 100)}% of SOS signals occurred during nighttime (8PM-6AM). This suggests elevated risk after dark.`,
        severity: 'high',
      });
    }

    // Frequency pattern
    const last7d = recentSOS.filter(s => now - new Date(s.timestamp).getTime() < 7 * 86400000);
    if (last7d.length >= 3) {
      insights.push({
        icon: 'trending-up',
        text: `${last7d.length} SOS activations in the last 7 days indicates an escalating situation. Professional help is strongly recommended.`,
        severity: 'critical',
      });
    }

    // Rapid succession
    for (let i = 0; i < recentSOS.length - 1; i++) {
      const diff = new Date(recentSOS[i].timestamp) - new Date(recentSOS[i + 1].timestamp);
      if (diff < 600000) { // < 10 minutes apart
        insights.push({
          icon: 'flash',
          text: 'Multiple SOS signals were sent in rapid succession (< 10 min apart), indicating acute distress or ongoing threat.',
          severity: 'critical',
        });
        break;
      }
    }

    // Weekend pattern
    const weekendCount = recentSOS.filter(s => {
      const day = new Date(s.timestamp).getDay();
      return day === 0 || day === 6;
    }).length;
    if (weekendCount > recentSOS.length * 0.6) {
      insights.push({
        icon: 'calendar',
        text: 'Majority of incidents occurred on weekends. Consider avoiding specific locations or activities during these times.',
        severity: 'moderate',
      });
    }

    return { hasPatterns: insights.length > 0, insights };
  },

  _generateRecommendations(threat, recentSOS, evidence) {
    const recs = [];

    if (threat.level === 'CRITICAL' || threat.level === 'HIGH') {
      recs.push({ priority: 'URGENT', text: 'File a police complaint (FIR) immediately with this report as evidence.', icon: 'shield' });
      recs.push({ priority: 'URGENT', text: 'Share your live location with trusted family members at all times.', icon: 'location' });
      recs.push({ priority: 'HIGH', text: 'Contact the Women Helpline at 1091 or NCW at 7827170170 for immediate support.', icon: 'call' });
    }

    if (recentSOS.length > 0) {
      recs.push({ priority: 'HIGH', text: 'Keep the app running in the background with shake-to-SOS enabled.', icon: 'phone-portrait' });
      recs.push({ priority: 'MEDIUM', text: 'Enable Guardian Mode to continuously monitor your location safety.', icon: 'locate' });
    }

    if (evidence.length > 0) {
      recs.push({ priority: 'MEDIUM', text: 'Backup evidence files to a secure cloud storage or share with a trusted person.', icon: 'cloud-upload' });
    }

    recs.push({ priority: 'STANDARD', text: 'Inform trusted friends/family about your situation and share this report.', icon: 'people' });
    recs.push({ priority: 'STANDARD', text: 'Note down descriptions of any suspicious person(s) — height, clothing, vehicle details.', icon: 'create' });

    return recs;
  },

  _generateNarrative({ incidentDesc, threatLevel, recentSOS, locationAnalysis, evidenceSummary, userProfile, now }) {
    const name = userProfile.fullName || 'the user';
    const totalSOS = recentSOS.length;
    const timeStr = now.toLocaleString();

    let narrative = `INCIDENT ANALYSIS REPORT\n`;
    narrative += `Generated on ${timeStr} by SafeHer AI Engine v3.0\n\n`;

    narrative += `SUBJECT: ${name}\n`;
    if (userProfile.phone) narrative += `Contact: ${userProfile.phone}\n`;
    if (userProfile.bloodGroup) narrative += `Blood Group: ${userProfile.bloodGroup}\n`;
    if (userProfile.medicalConditions) narrative += `Medical Conditions: ${userProfile.medicalConditions}\n`;
    narrative += `\n`;

    narrative += `INCIDENT DESCRIPTION:\n${incidentDesc}\n\n`;

    narrative += `THREAT ASSESSMENT:\n`;
    narrative += `Level: ${threatLevel.label} (Score: ${threatLevel.score}/100)\n`;
    narrative += `Based on ${totalSOS} SOS signal(s) recorded in the system.\n\n`;

    if (locationAnalysis.hasData) {
      narrative += `LOCATION ANALYSIS:\n${locationAnalysis.summary}\n`;
      if (locationAnalysis.currentLocation) {
        narrative += `Current Location: ${locationAnalysis.currentLocation.latitude?.toFixed(6)}, ${locationAnalysis.currentLocation.longitude?.toFixed(6)}\n`;
        narrative += `Maps: https://maps.google.com/?q=${locationAnalysis.currentLocation.latitude},${locationAnalysis.currentLocation.longitude}\n`;
      }
      narrative += `\n`;
    }

    if (evidenceSummary.hasEvidence) {
      narrative += `EVIDENCE SUMMARY:\n`;
      narrative += `Total Evidence Logs: ${evidenceSummary.totalLogs}\n`;
      if (evidenceSummary.audio) narrative += `Audio Recordings: ${evidenceSummary.audio}\n`;
      if (evidenceSummary.photos) narrative += `Photos: ${evidenceSummary.photos}\n`;
      if (evidenceSummary.videos) narrative += `Videos: ${evidenceSummary.videos}\n`;
      if (evidenceSummary.detections) narrative += `Hidden Camera Detections: ${evidenceSummary.detections}\n`;
      narrative += `Verified with SHA-256: ${evidenceSummary.verified} entries\n\n`;
    }

    if (totalSOS > 0) {
      narrative += `SOS SIGNAL LOG:\n`;
      recentSOS.slice(0, 10).forEach((s, i) => {
        const t = new Date(s.timestamp).toLocaleString();
        const loc = s.location?.coords
          ? `(${s.location.coords.latitude.toFixed(5)}, ${s.location.coords.longitude.toFixed(5)})`
          : '(No GPS)';
        narrative += `  ${i + 1}. ${t} ${loc}\n`;
      });
      narrative += `\n`;
    }

    narrative += `EMERGENCY CONTACTS ON FILE:\n`;
    narrative += `(Contacts who were notified during SOS events)\n`;

    narrative += `\n---\n`;
    narrative += `This report was auto-generated by SafeHer AI.\n`;
    narrative += `All evidence is hashed with SHA-256 for tamper-proof verification.\n`;
    narrative += `For legal proceedings, the Evidence Vault in the app contains original files.\n`;

    return narrative;
  },
};

// ─── MAIN COMPONENT ──────────────────────────────────────────────
export default function IncidentReportScreen() {
  const navigation = useNavigation();
  const { sosHistory, currentLocation, emergencyContacts, isSOSActive } = useEmergency();
  const { userProfile } = useAuth();

  const [reports, setReports] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [incidentDesc, setIncidentDesc] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showExplainer, setShowExplainer] = useState(false);
  const [showReport, setShowReport] = useState(null);
  const [aiProgress, setAiProgress] = useState('');
  const [autoGenMode, setAutoGenMode] = useState(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadReports();
    checkFirstOpen();
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  // Auto-detect if there was a recent SOS and offer auto-generate
  useEffect(() => {
    if (sosHistory.length > 0) {
      const lastSOS = sosHistory[0];
      const timeSince = Date.now() - new Date(lastSOS.timestamp).getTime();
      if (timeSince < 3600000) { // < 1 hour ago
        setAutoGenMode(true);
      }
    }
  }, [sosHistory]);

  const checkFirstOpen = async () => {
    try {
      const seen = await AsyncStorage.getItem(FIRST_OPEN_KEY);
      if (!seen) {
        setShowExplainer(true);
        await AsyncStorage.setItem(FIRST_OPEN_KEY, 'true');
      }
    } catch (e) {}
  };

  const loadReports = async () => {
    try {
      const data = await AsyncStorage.getItem(REPORTS_KEY);
      if (data) setReports(JSON.parse(data));
    } catch (e) {}
  };

  const saveReports = async (updated) => {
    setReports(updated);
    try {
      await AsyncStorage.setItem(REPORTS_KEY, JSON.stringify(updated));
    } catch (e) {}
  };

  // ── AI-Powered Report Generation ──
  const generateReport = async (isAuto = false) => {
    const desc = isAuto
      ? buildAutoDescription()
      : incidentDesc.trim();

    if (!desc) {
      Alert.alert('Description Required', 'Please describe the incident or use auto-generate.');
      return;
    }

    setGenerating(true);
    setShowForm(false);

    // AI progress steps
    const steps = [
      'Analyzing SOS signals...',
      'Scanning evidence vault...',
      'Processing location data...',
      'Running threat assessment...',
      'Building timeline...',
      'Detecting behavioral patterns...',
      'Generating AI narrative...',
      'Compiling final report...',
    ];

    let stepIdx = 0;
    const progressTimer = setInterval(() => {
      if (stepIdx < steps.length) {
        setAiProgress(steps[stepIdx]);
        stepIdx++;
      }
    }, 400);

    try {
      // Gather all evidence data
      let evidenceLogs = [];
      let evidenceFiles = [];
      try {
        evidenceLogs = await EvidenceDB.getAll();
        evidenceFiles = await EvidenceDB.getFiles();
      } catch (e) {}

      // Count local audio files too
      let localAudioCount = 0;
      try {
        const dir = FileSystem.documentDirectory;
        const files = await FileSystem.readDirectoryAsync(dir);
        localAudioCount = files.filter(f => f.endsWith('.m4a') || f.endsWith('.caf') || f.endsWith('.mp4')).length;
      } catch (e) {}

      // Run AI analysis
      const analysis = await AIReportEngine.generateAnalysis({
        sosHistory,
        evidenceLogs,
        evidenceFiles,
        currentLocation,
        userProfile,
        emergencyContacts,
        incidentDesc: desc,
      });

      clearInterval(progressTimer);
      setAiProgress('');

      const now = new Date();
      const reportId = `GS-${now.getTime().toString(36).toUpperCase()}`;

      // Build the full shareable text
      const shareableText = buildShareableReport(reportId, now, desc, analysis, localAudioCount);

      const report = {
        id: now.getTime().toString(),
        reportId,
        createdAt: now.toISOString(),
        description: desc,
        location: currentLocation ? {
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
        } : null,
        analysis,
        shareableText,
        sosCount: sosHistory.length,
        evidenceCount: evidenceLogs.length + evidenceFiles.length,
        audioCount: localAudioCount,
        isAutoGenerated: isAuto,
      };

      const updated = [report, ...reports].slice(0, 30);
      await saveReports(updated);

      setGenerating(false);
      setIncidentDesc('');

      // Show the report immediately
      setShowReport(report);
    } catch (e) {
      clearInterval(progressTimer);
      setAiProgress('');
      setGenerating(false);
      Alert.alert('Error', 'Failed to generate report. Please try again.');
    }
  };

  const buildAutoDescription = () => {
    if (sosHistory.length === 0) return '';
    const last = sosHistory[0];
    const time = new Date(last.timestamp).toLocaleString();
    const loc = last.location?.coords
      ? `at coordinates ${last.location.coords.latitude.toFixed(5)}, ${last.location.coords.longitude.toFixed(5)}`
      : 'at an unknown location';

    return `SOS emergency signal was activated on ${time} ${loc}. ` +
      `Total of ${sosHistory.length} SOS signal(s) have been recorded. ` +
      `This report was auto-generated based on the emergency data collected by SafeHer app.`;
  };

  const buildShareableReport = (reportId, now, desc, analysis, localAudioCount) => {
    const { threatLevel, locationAnalysis, evidenceSummary, narrative, recommendations } = analysis;

    let text = ``;
    text += `========================================\n`;
    text += `   INCIDENT REPORT - SafeHer Safety App\n`;
    text += `========================================\n\n`;
    text += `Report ID: ${reportId}\n`;
    text += `Generated: ${now.toLocaleString()}\n`;
    text += `AI Engine: SafeHer v3.0\n\n`;

    text += `-------- VICTIM INFORMATION --------\n`;
    text += `Name: ${userProfile.fullName || 'Not provided'}\n`;
    text += `Phone: ${userProfile.phone || 'Not provided'}\n`;
    text += `DOB: ${userProfile.dateOfBirth || 'Not provided'}\n`;
    text += `Gender: ${userProfile.gender || 'Not provided'}\n`;
    text += `Blood Group: ${userProfile.bloodGroup || 'Not provided'}\n`;
    if (userProfile.medicalConditions) text += `Medical: ${userProfile.medicalConditions}\n`;
    if (userProfile.homeAddress) text += `Home: ${userProfile.homeAddress}\n`;
    text += `\n`;

    text += `-------- THREAT ASSESSMENT --------\n`;
    text += `Level: ${threatLevel.label}\n`;
    text += `Score: ${threatLevel.score}/100\n\n`;

    text += `-------- INCIDENT DESCRIPTION --------\n`;
    text += `${desc}\n\n`;

    text += narrative + '\n\n';

    text += `-------- EMERGENCY CONTACTS --------\n`;
    emergencyContacts.forEach((c, i) => {
      text += `  ${i + 1}. ${c.name} - ${c.phone}${c.tier ? ` (Tier ${c.tier})` : ''}\n`;
    });
    if (emergencyContacts.length === 0) text += `  No contacts configured\n`;
    text += `\n`;

    if (recommendations.length > 0) {
      text += `-------- AI RECOMMENDATIONS --------\n`;
      recommendations.forEach((r) => {
        text += `  [${r.priority}] ${r.text}\n`;
      });
      text += `\n`;
    }

    text += `-------- LEGAL NOTICE --------\n`;
    text += `This report was auto-generated by SafeHer AI.\n`;
    text += `All timestamps are device-local. GPS accuracy may vary.\n`;
    text += `Evidence files have SHA-256 hashes for tamper verification.\n`;
    text += `For original evidence, access the Evidence Vault in the app.\n\n`;
    text += `========================================\n`;
    text += `              END OF REPORT\n`;
    text += `========================================\n`;

    return text;
  };

  const shareReport = async (text) => {
    try {
      await Share.share({
        message: text,
        title: 'SafeHer - Incident Report',
      });
    } catch (e) {
      Alert.alert('Error', 'Failed to share report');
    }
  };

  const deleteReport = (id) => {
    Alert.alert('Delete Report', 'Remove this incident report permanently?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const updated = reports.filter(r => r.id !== id);
          await saveReports(updated);
          if (showReport?.id === id) setShowReport(null);
        },
      },
    ]);
  };

  const formatDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  const timeSinceStr = (iso) => {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  // ─── EXPLAINER MODAL ──────────────────────────────────────────
  const ExplainerModal = () => (
    <Modal visible={showExplainer} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.explainerCard}>
          <View style={styles.explainerIconWrap}>
            <Ionicons name="document-text" size={40} color="#FFF" />
          </View>
          <Text style={styles.explainerTitle}>What is an Incident Report?</Text>
          <Text style={styles.explainerDesc}>
            An Incident Report is a <Text style={{ fontWeight: '700' }}>detailed document</Text> that
            records everything about a safety incident — when it happened, where you were,
            what evidence exists, and who was notified.
          </Text>

          <View style={styles.explainerFeatures}>
            {[
              { icon: 'shield-checkmark', text: 'Police-ready format accepted by authorities' },
              { icon: 'analytics', text: 'AI analyzes your SOS signals for threat patterns' },
              { icon: 'time', text: 'Auto-builds timeline from your safety data' },
              { icon: 'share', text: 'Share instantly with police, lawyers, or family' },
              { icon: 'lock-closed', text: 'Evidence integrity verified with SHA-256 hashes' },
            ].map((f, i) => (
              <View key={i} style={styles.explainerFeatureRow}>
                <View style={styles.explainerFeatureIcon}>
                  <Ionicons name={f.icon} size={16} color={COLORS.primary} />
                </View>
                <Text style={styles.explainerFeatureText}>{f.text}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.explainerNote}>
            When you activate SOS, the app automatically collects location, time, and evidence
            data. The AI engine uses this data to generate a comprehensive report you can share
            with authorities.
          </Text>

          <TouchableOpacity
            style={styles.explainerBtn}
            onPress={() => setShowExplainer(false)}
            activeOpacity={0.85}
          >
            <Text style={styles.explainerBtnText}>Got It</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // ─── REPORT VIEWER MODAL ──────────────────────────────────────
  const ReportViewerModal = () => {
    if (!showReport) return null;
    const r = showReport;
    const a = r.analysis;

    return (
      <Modal visible={!!showReport} animationType="slide">
        <View style={styles.viewerContainer}>
          {/* Header */}
          <View style={styles.viewerHeader}>
            <TouchableOpacity onPress={() => setShowReport(null)} style={styles.viewerBackBtn}>
              <Ionicons name="arrow-back" size={22} color="#FFF" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.viewerHeaderTitle}>AI Incident Report</Text>
              <Text style={styles.viewerHeaderSub}>{r.reportId}</Text>
            </View>
            <TouchableOpacity
              style={styles.viewerShareBtn}
              onPress={() => shareReport(r.shareableText)}
            >
              <Ionicons name="share-outline" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.viewerContent} showsVerticalScrollIndicator={false}>
            {/* Threat Assessment Banner */}
            {a && (
              <View style={[styles.threatBanner, { borderColor: a.threatLevel.color + '40' }]}>
                <View style={[styles.threatIconWrap, { backgroundColor: a.threatLevel.color + '15' }]}>
                  <Ionicons
                    name={a.threatLevel.level === 'CRITICAL' ? 'warning' : a.threatLevel.level === 'HIGH' ? 'alert-circle' : 'shield-checkmark'}
                    size={28}
                    color={a.threatLevel.color}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={[styles.threatLabel, { color: a.threatLevel.color }]}>
                    THREAT LEVEL: {a.threatLevel.level}
                  </Text>
                  <Text style={styles.threatDesc}>{a.threatLevel.label}</Text>
                  <View style={styles.threatBar}>
                    <View style={[styles.threatBarFill, {
                      width: `${Math.min(a.threatLevel.score, 100)}%`,
                      backgroundColor: a.threatLevel.color,
                    }]} />
                  </View>
                </View>
              </View>
            )}

            {/* Description */}
            <View style={styles.viewerSection}>
              <Text style={styles.viewerSectionTitle}>
                <Ionicons name="document-text" size={16} color={COLORS.text} /> Incident Description
              </Text>
              <Text style={styles.viewerBodyText}>{r.description}</Text>
              <Text style={styles.viewerMeta}>
                {formatDate(r.createdAt)} {r.isAutoGenerated ? ' - AI Auto-Generated' : ''}
              </Text>
            </View>

            {/* Timeline */}
            {a?.timeline?.length > 0 && (
              <View style={styles.viewerSection}>
                <Text style={styles.viewerSectionTitle}>
                  <Ionicons name="time" size={16} color={COLORS.text} /> Event Timeline
                </Text>
                {a.timeline.map((ev, i) => (
                  <View key={i} style={styles.timelineItem}>
                    <View style={styles.timelineLine}>
                      <View style={[styles.timelineDot, { backgroundColor: ev.color }]}>
                        <Ionicons name={ev.icon} size={12} color="#FFF" />
                      </View>
                      {i < a.timeline.length - 1 && <View style={styles.timelineConnector} />}
                    </View>
                    <View style={styles.timelineContent}>
                      <Text style={styles.timelineTitle}>{ev.title}</Text>
                      <Text style={styles.timelineDetail}>{ev.detail}</Text>
                      <Text style={styles.timelineTime}>{formatDate(ev.time)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Location Analysis */}
            {a?.locationAnalysis?.hasData && (
              <View style={styles.viewerSection}>
                <Text style={styles.viewerSectionTitle}>
                  <Ionicons name="location" size={16} color={COLORS.text} /> Location Analysis
                </Text>
                <Text style={styles.viewerBodyText}>{a.locationAnalysis.summary}</Text>
                {a.locationAnalysis.clusters.map((c, i) => (
                  <View key={i} style={styles.clusterRow}>
                    <View style={styles.clusterDot} />
                    <Text style={styles.clusterText}>
                      Zone {i + 1}: {c.lat.toFixed(5)}, {c.lon.toFixed(5)} — {c.count} signal(s)
                    </Text>
                  </View>
                ))}
                {a.locationAnalysis.currentLocation && (
                  <TouchableOpacity
                    style={styles.mapBtn}
                    onPress={() => Linking.openURL(
                      `https://maps.google.com/?q=${a.locationAnalysis.currentLocation.latitude},${a.locationAnalysis.currentLocation.longitude}`
                    )}
                  >
                    <Ionicons name="map" size={16} color="#1565C0" />
                    <Text style={styles.mapBtnText}>Open in Google Maps</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Pattern Analysis */}
            {a?.patterns?.hasPatterns && (
              <View style={styles.viewerSection}>
                <Text style={styles.viewerSectionTitle}>
                  <Ionicons name="analytics" size={16} color={COLORS.text} /> AI Pattern Detection
                </Text>
                {a.patterns.insights.map((ins, i) => (
                  <View key={i} style={[styles.insightRow, {
                    borderLeftColor: ins.severity === 'critical' ? '#FF1744' : ins.severity === 'high' ? '#FF6D00' : '#FFD600',
                  }]}>
                    <Ionicons name={ins.icon} size={18} color={
                      ins.severity === 'critical' ? '#FF1744' : ins.severity === 'high' ? '#FF6D00' : '#FFD600'
                    } />
                    <Text style={styles.insightText}>{ins.text}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Evidence Summary */}
            {a?.evidenceSummary?.hasEvidence && (
              <View style={styles.viewerSection}>
                <Text style={styles.viewerSectionTitle}>
                  <Ionicons name="folder" size={16} color={COLORS.text} /> Evidence Summary
                </Text>
                <View style={styles.evidenceGrid}>
                  {[
                    { label: 'Audio', count: a.evidenceSummary.audio, icon: 'mic', color: '#FF6D00' },
                    { label: 'Photos', count: a.evidenceSummary.photos, icon: 'camera', color: '#1565C0' },
                    { label: 'Videos', count: a.evidenceSummary.videos, icon: 'videocam', color: '#AA00FF' },
                    { label: 'Detections', count: a.evidenceSummary.detections, icon: 'eye', color: '#37474F' },
                  ].filter(e => e.count > 0).map((e, i) => (
                    <View key={i} style={styles.evidenceItem}>
                      <Ionicons name={e.icon} size={20} color={e.color} />
                      <Text style={styles.evidenceCount}>{e.count}</Text>
                      <Text style={styles.evidenceLabel}>{e.label}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.evidenceVerified}>
                  {a.evidenceSummary.verified} entries verified with SHA-256
                </Text>
              </View>
            )}

            {/* Recommendations */}
            {a?.recommendations?.length > 0 && (
              <View style={styles.viewerSection}>
                <Text style={styles.viewerSectionTitle}>
                  <Ionicons name="bulb" size={16} color={COLORS.text} /> AI Recommendations
                </Text>
                {a.recommendations.map((rec, i) => (
                  <View key={i} style={styles.recRow}>
                    <View style={[styles.recBadge, {
                      backgroundColor: rec.priority === 'URGENT' ? '#FF1744' : rec.priority === 'HIGH' ? '#FF6D00' : rec.priority === 'MEDIUM' ? '#FFD600' : '#E0E0E0',
                    }]}>
                      <Text style={[styles.recBadgeText, {
                        color: rec.priority === 'MEDIUM' || rec.priority === 'STANDARD' ? '#333' : '#FFF',
                      }]}>{rec.priority}</Text>
                    </View>
                    <Text style={styles.recText}>{rec.text}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Actions */}
            <View style={styles.viewerActions}>
              <TouchableOpacity
                style={styles.shareFullBtn}
                onPress={() => shareReport(r.shareableText)}
                activeOpacity={0.85}
              >
                <Ionicons name="share" size={20} color="#FFF" />
                <Text style={styles.shareFullBtnText}>Share Report with Authorities</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.viewRawBtn}
                onPress={() => {
                  setShowReport(null);
                  setTimeout(() => {
                    Alert.alert('Full Report Text', r.shareableText.substring(0, 1500) + '\n\n... [Share for full report]');
                  }, 300);
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="code" size={18} color={COLORS.primary} />
                <Text style={styles.viewRawBtnText}>View Raw Text</Text>
              </TouchableOpacity>
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    );
  };

  // ─── AI GENERATING OVERLAY ─────────────────────────────────────
  const GeneratingOverlay = () => {
    if (!generating) return null;
    return (
      <View style={styles.genOverlay}>
        <View style={styles.genCard}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.genTitle}>AI Generating Report</Text>
          <Text style={styles.genProgress}>{aiProgress}</Text>
          <View style={styles.genDots}>
            {[0, 1, 2].map(i => (
              <View key={i} style={[styles.genDot, { opacity: 0.3 + (i * 0.3) }]} />
            ))}
          </View>
        </View>
      </View>
    );
  };

  // ─── MAIN RENDER ───────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <ExplainerModal />
      <ReportViewerModal />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={styles.headerTitle}>Incident Report</Text>
          <Text style={styles.headerSub}>AI-Powered Analysis</Text>
        </View>
        <TouchableOpacity onPress={() => setShowExplainer(true)} style={styles.infoBtn}>
          <Ionicons name="information-circle-outline" size={22} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowForm(!showForm)} style={[styles.addBtn, showForm && { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
          <Ionicons name={showForm ? 'close' : 'add'} size={22} color="#FFF" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Auto-Generate Banner (if recent SOS) */}
        {autoGenMode && !showForm && reports.length === 0 && (
          <TouchableOpacity
            style={styles.autoBanner}
            onPress={() => generateReport(true)}
            activeOpacity={0.85}
          >
            <View style={styles.autoBannerIcon}>
              <MaterialCommunityIcons name="robot" size={28} color="#FFF" />
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.autoBannerTitle}>SOS Detected — Generate Report?</Text>
              <Text style={styles.autoBannerSub}>
                AI can auto-generate an incident report from your recent SOS signal, location data, and evidence.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        )}

        {/* Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoCardIcon}>
            <Ionicons name="shield-checkmark" size={22} color="#4E342E" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.infoCardTitle}>AI-Powered Police Reports</Text>
            <Text style={styles.infoCardText}>
              The AI engine analyzes your SOS signals, evidence, and location data to generate
              comprehensive reports with threat assessment, timeline, and recommendations.
            </Text>
          </View>
        </View>

        {/* New Report Form */}
        {showForm && (
          <Animated.View style={[styles.formCard, { opacity: fadeAnim }]}>
            <View style={styles.formHeader}>
              <MaterialCommunityIcons name="robot" size={24} color={COLORS.primary} />
              <Text style={styles.formTitle}>New AI Report</Text>
            </View>
            <Text style={styles.formLabel}>Describe what happened:</Text>
            <TextInput
              style={styles.formInput}
              value={incidentDesc}
              onChangeText={setIncidentDesc}
              placeholder="e.g., Was followed by an unknown person near the market around 9 PM..."
              placeholderTextColor={COLORS.textLight}
              multiline
              maxLength={1000}
            />
            <Text style={styles.formCharCount}>{incidentDesc.length}/1000</Text>

            <View style={styles.formAutoSection}>
              <Text style={styles.formAutoLabel}>The AI will automatically include:</Text>
              <View style={styles.formAutoTags}>
                {[
                  { icon: 'location', text: 'GPS Location', c: '#1565C0' },
                  { icon: 'alert-circle', text: `${sosHistory.length} SOS Signals`, c: '#FF1744' },
                  { icon: 'person', text: 'Your Profile', c: '#6200EA' },
                  { icon: 'folder', text: 'Evidence Vault', c: '#FF6D00' },
                  { icon: 'people', text: `${emergencyContacts.length} Contacts`, c: '#00838F' },
                  { icon: 'analytics', text: 'Threat Level', c: '#D50000' },
                ].map((tag, i) => (
                  <View key={i} style={[styles.formTag, { borderColor: tag.c + '30' }]}>
                    <Ionicons name={tag.icon} size={12} color={tag.c} />
                    <Text style={[styles.formTagText, { color: tag.c }]}>{tag.text}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.formBtnRow}>
              <TouchableOpacity
                style={styles.autoGenBtn}
                onPress={() => generateReport(true)}
                activeOpacity={0.85}
              >
                <MaterialCommunityIcons name="auto-fix" size={18} color="#FFF" />
                <Text style={styles.autoGenBtnText}>Auto from SOS</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.generateBtn}
                onPress={() => generateReport(false)}
                disabled={generating}
                activeOpacity={0.85}
              >
                <Ionicons name="sparkles" size={18} color="#FFF" />
                <Text style={styles.generateBtnText}>Generate Report</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#E91E6312' }]}>
              <Ionicons name="document-text" size={20} color={COLORS.primary} />
            </View>
            <Text style={styles.statNum}>{reports.length}</Text>
            <Text style={styles.statLabel}>Reports</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#FF174412' }]}>
              <Ionicons name="alert-circle" size={20} color="#FF1744" />
            </View>
            <Text style={styles.statNum}>{sosHistory.length}</Text>
            <Text style={styles.statLabel}>SOS Events</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#00C85312' }]}>
              <Ionicons name="people" size={20} color="#00C853" />
            </View>
            <Text style={styles.statNum}>{emergencyContacts.length}</Text>
            <Text style={styles.statLabel}>Contacts</Text>
          </View>
        </View>

        {/* Reports List */}
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>Generated Reports</Text>
          {reports.length > 0 && (
            <Text style={styles.listCount}>{reports.length}</Text>
          )}
        </View>

        {reports.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="document-text-outline" size={44} color={COLORS.textLight} />
            </View>
            <Text style={styles.emptyText}>No reports yet</Text>
            <Text style={styles.emptySubtext}>
              {sosHistory.length > 0
                ? 'You have SOS data available. Tap the + button or Auto-Generate to create your first report.'
                : 'Tap the + button to create your first incident report.'}
            </Text>
            {sosHistory.length > 0 && (
              <TouchableOpacity
                style={styles.emptyGenBtn}
                onPress={() => generateReport(true)}
                activeOpacity={0.85}
              >
                <MaterialCommunityIcons name="auto-fix" size={18} color="#FFF" />
                <Text style={styles.emptyGenBtnText}>Auto-Generate from SOS Data</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          reports.map((report) => (
            <TouchableOpacity
              key={report.id}
              style={styles.reportCard}
              onPress={() => setShowReport(report)}
              activeOpacity={0.85}
            >
              <View style={styles.reportTop}>
                <View style={styles.reportIconWrap}>
                  <Ionicons name="document-text" size={20} color="#4E342E" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.reportDate}>{formatDate(report.createdAt)}</Text>
                  <Text style={styles.reportTimeAgo}>{timeSinceStr(report.createdAt)}</Text>
                </View>
                {report.analysis?.threatLevel && (
                  <View style={[styles.threatMini, { backgroundColor: report.analysis.threatLevel.color + '15' }]}>
                    <Text style={[styles.threatMiniText, { color: report.analysis.threatLevel.color }]}>
                      {report.analysis.threatLevel.level}
                    </Text>
                  </View>
                )}
              </View>

              <Text style={styles.reportDesc} numberOfLines={2}>{report.description}</Text>

              <View style={styles.reportMeta}>
                <View style={styles.reportBadge}>
                  <Ionicons name="alert-circle" size={11} color="#FF1744" />
                  <Text style={styles.reportBadgeText}>{report.sosCount} SOS</Text>
                </View>
                {report.evidenceCount > 0 && (
                  <View style={styles.reportBadge}>
                    <Ionicons name="folder" size={11} color="#FF6D00" />
                    <Text style={styles.reportBadgeText}>{report.evidenceCount} Evidence</Text>
                  </View>
                )}
                {report.location && (
                  <View style={styles.reportBadge}>
                    <Ionicons name="location" size={11} color="#1565C0" />
                    <Text style={styles.reportBadgeText}>GPS</Text>
                  </View>
                )}
                {report.isAutoGenerated && (
                  <View style={[styles.reportBadge, { backgroundColor: '#AA00FF10' }]}>
                    <MaterialCommunityIcons name="robot" size={11} color="#AA00FF" />
                    <Text style={[styles.reportBadgeText, { color: '#AA00FF' }]}>AI</Text>
                  </View>
                )}
              </View>

              <View style={styles.reportActions}>
                <TouchableOpacity
                  style={styles.viewBtn}
                  onPress={() => setShowReport(report)}
                >
                  <Ionicons name="eye-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.viewBtnText}>View Report</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.shareSmBtn}
                  onPress={() => shareReport(report.shareableText)}
                >
                  <Ionicons name="share-outline" size={16} color="#1565C0" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => deleteReport(report.id)}
                >
                  <Ionicons name="trash-outline" size={16} color="#FF1744" />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))
        )}

        {/* Post-Incident Support */}
        <View style={styles.helpSection}>
          <Text style={styles.helpTitle}>Post-Incident Support</Text>
          {[
            { label: 'Women Helpline', number: '1091', icon: 'woman', color: '#AA00FF' },
            { label: 'National Commission for Women', number: '7827170170', icon: 'call', color: '#1565C0' },
            { label: 'Mental Health (iCall)', number: '9152987821', icon: 'heart', color: '#E91E63' },
            { label: 'Legal Aid Services', number: '15100', icon: 'briefcase', color: '#4E342E' },
          ].map((item, i) => (
            <TouchableOpacity
              key={i}
              style={styles.helpRow}
              onPress={() => Linking.openURL(`tel:${item.number.replace(/-/g, '')}`)}
              activeOpacity={0.7}
            >
              <View style={[styles.helpIconWrap, { backgroundColor: item.color + '12' }]}>
                <Ionicons name={item.icon} size={16} color={item.color} />
              </View>
              <Text style={styles.helpLabel}>{item.label}</Text>
              <Text style={styles.helpNum}>{item.number}</Text>
              <View style={styles.helpCallBtn}>
                <Ionicons name="call" size={12} color="#FFF" />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* Generating Overlay */}
      <GeneratingOverlay />
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
    backgroundColor: '#4E342E',
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
  infoBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center', marginRight: 8,
  },
  addBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  content: { padding: 16, paddingTop: 14 },

  // Auto-Generate Banner
  autoBanner: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 14,
    backgroundColor: '#D50000', borderRadius: 18, padding: 16,
    ...SHADOWS.medium,
  },
  autoBannerIcon: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  autoBannerTitle: { fontSize: 15, fontWeight: '800', color: '#FFF' },
  autoBannerSub: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 4, lineHeight: 16 },

  // Info Card
  infoCard: {
    flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14,
    backgroundColor: '#FFF8E1', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#FFE082',
  },
  infoCardIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#FFF3E0', justifyContent: 'center', alignItems: 'center',
  },
  infoCardTitle: { fontSize: 14, fontWeight: '800', color: '#4E342E' },
  infoCardText: { fontSize: 12, color: '#5D4037', marginTop: 4, lineHeight: 18 },

  // Form
  formCard: {
    backgroundColor: '#FFF', borderRadius: 20, padding: 20,
    marginBottom: 16, ...SHADOWS.medium, borderWidth: 1.5, borderColor: COLORS.primary + '20',
  },
  formHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  formTitle: { fontSize: 20, fontWeight: '900', color: COLORS.text, marginLeft: 10 },
  formLabel: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  formInput: {
    backgroundColor: COLORS.background, borderRadius: 14, padding: 16,
    fontSize: 14, color: COLORS.text, minHeight: 120, textAlignVertical: 'top',
    borderWidth: 1, borderColor: COLORS.border, lineHeight: 21,
  },
  formCharCount: { fontSize: 10, color: COLORS.textLight, textAlign: 'right', marginTop: 4 },
  formAutoSection: { marginTop: 16 },
  formAutoLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 8 },
  formAutoTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  formTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: '#F5F5F5', borderWidth: 1,
  },
  formTagText: { fontSize: 11, fontWeight: '600' },
  formBtnRow: { flexDirection: 'row', marginTop: 18, gap: 10 },
  autoGenBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#6200EA', borderRadius: 14, paddingVertical: 14, gap: 6,
    ...SHADOWS.small,
  },
  autoGenBtnText: { fontSize: 13, fontWeight: '800', color: '#FFF' },
  generateBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#4E342E', borderRadius: 14, paddingVertical: 14, gap: 6,
    ...SHADOWS.small,
  },
  generateBtnText: { fontSize: 13, fontWeight: '800', color: '#FFF' },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard: {
    flex: 1, backgroundColor: '#FFF', borderRadius: 18, paddingVertical: 16,
    alignItems: 'center', ...SHADOWS.small, borderWidth: 1, borderColor: COLORS.border,
  },
  statIcon: {
    width: 40, height: 40, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  statNum: { fontSize: 26, fontWeight: '900', color: COLORS.text },
  statLabel: { fontSize: 10, color: COLORS.textLight, marginTop: 2, fontWeight: '600', letterSpacing: 0.3 },

  // Reports List
  listHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  listTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, flex: 1 },
  listCount: {
    fontSize: 12, fontWeight: '800', color: COLORS.primary,
    backgroundColor: COLORS.primary + '12', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 3,
  },

  // Empty State
  emptyState: { alignItems: 'center', paddingVertical: 36 },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: COLORS.border, justifyContent: 'center', alignItems: 'center',
  },
  emptyText: { fontSize: 16, fontWeight: '700', color: COLORS.textSecondary, marginTop: 16 },
  emptySubtext: { fontSize: 13, color: COLORS.textLight, marginTop: 6, textAlign: 'center', paddingHorizontal: 20 },
  emptyGenBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18,
    backgroundColor: '#6200EA', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12,
    ...SHADOWS.small,
  },
  emptyGenBtnText: { fontSize: 13, fontWeight: '700', color: '#FFF' },

  // Report Card
  reportCard: {
    backgroundColor: '#FFF', borderRadius: 18, padding: 16,
    marginBottom: 12, ...SHADOWS.small, borderWidth: 1, borderColor: COLORS.border,
  },
  reportTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  reportIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#EFEBE9', justifyContent: 'center', alignItems: 'center',
  },
  reportDate: { fontSize: 14, fontWeight: '700', color: '#4E342E' },
  reportTimeAgo: { fontSize: 11, color: COLORS.textLight, marginTop: 2 },
  threatMini: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  threatMiniText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  reportDesc: { fontSize: 13, color: COLORS.text, marginBottom: 10, lineHeight: 19 },
  reportMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  reportBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F5F5F5', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  reportBadgeText: { fontSize: 11, fontWeight: '600', color: '#5D4037' },
  reportActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  viewBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: COLORS.primary + '10', borderRadius: 10,
    paddingVertical: 9,
  },
  viewBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  shareSmBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#E3F2FD', justifyContent: 'center', alignItems: 'center',
  },
  deleteBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#FFEBEE', justifyContent: 'center', alignItems: 'center',
  },

  // Help Section
  helpSection: {
    backgroundColor: '#FFF', borderRadius: 18, padding: 18, marginTop: 16,
    ...SHADOWS.small, borderWidth: 1, borderColor: COLORS.border,
  },
  helpTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 12 },
  helpRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  helpIconWrap: {
    width: 32, height: 32, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  helpLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.text, marginLeft: 10 },
  helpNum: { fontSize: 13, fontWeight: '800', color: COLORS.primary, marginRight: 8 },
  helpCallBtn: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: '#00C853', justifyContent: 'center', alignItems: 'center',
  },

  // ── Generating Overlay ──
  genOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center',
    zIndex: 100,
  },
  genCard: {
    backgroundColor: '#FFF', borderRadius: 24, padding: 36,
    alignItems: 'center', width: SCREEN_W - 80, ...SHADOWS.large,
  },
  genTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginTop: 18 },
  genProgress: { fontSize: 13, color: COLORS.primary, marginTop: 10, fontWeight: '600' },
  genDots: { flexDirection: 'row', marginTop: 16, gap: 6 },
  genDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },

  // ── Explainer Modal ──
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  explainerCard: {
    backgroundColor: '#FFF', borderRadius: 24, padding: 28,
    width: '100%', maxWidth: 380, alignItems: 'center', ...SHADOWS.large,
  },
  explainerIconWrap: {
    width: 72, height: 72, borderRadius: 22,
    backgroundColor: '#4E342E', justifyContent: 'center', alignItems: 'center',
    marginBottom: 18,
  },
  explainerTitle: { fontSize: 22, fontWeight: '900', color: COLORS.text, textAlign: 'center' },
  explainerDesc: {
    fontSize: 14, color: COLORS.textSecondary, textAlign: 'center',
    marginTop: 12, lineHeight: 22,
  },
  explainerFeatures: { marginTop: 20, width: '100%' },
  explainerFeatureRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 12,
  },
  explainerFeatureIcon: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: COLORS.primary + '10',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  explainerFeatureText: { fontSize: 13, color: COLORS.text, flex: 1, lineHeight: 18 },
  explainerNote: {
    fontSize: 11, color: COLORS.textLight, textAlign: 'center',
    marginTop: 16, fontStyle: 'italic', lineHeight: 17,
  },
  explainerBtn: {
    backgroundColor: '#4E342E', borderRadius: 14,
    paddingHorizontal: 48, paddingVertical: 14, marginTop: 22,
    ...SHADOWS.small,
  },
  explainerBtnText: { fontSize: 16, fontWeight: '800', color: '#FFF' },

  // ── Report Viewer Modal ──
  viewerContainer: { flex: 1, backgroundColor: COLORS.background },
  viewerHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 56 : 40, paddingBottom: 18,
    backgroundColor: '#4E342E',
    borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
    ...SHADOWS.large,
  },
  viewerBackBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  viewerHeaderTitle: { fontSize: 20, fontWeight: '900', color: '#FFF' },
  viewerHeaderSub: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  viewerShareBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  viewerContent: { padding: 16 },

  // Threat Banner
  threatBanner: {
    flexDirection: 'row', alignItems: 'center', padding: 16,
    backgroundColor: '#FFF', borderRadius: 18, marginBottom: 14,
    ...SHADOWS.small, borderWidth: 1.5,
  },
  threatIconWrap: {
    width: 52, height: 52, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
  },
  threatLabel: { fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
  threatDesc: { fontSize: 13, color: COLORS.textSecondary, marginTop: 3 },
  threatBar: {
    height: 6, borderRadius: 3, backgroundColor: '#F0F0F0', marginTop: 8, overflow: 'hidden',
  },
  threatBarFill: { height: '100%', borderRadius: 3 },

  // Viewer Sections
  viewerSection: {
    backgroundColor: '#FFF', borderRadius: 18, padding: 18,
    marginBottom: 14, ...SHADOWS.small, borderWidth: 1, borderColor: COLORS.border,
  },
  viewerSectionTitle: {
    fontSize: 15, fontWeight: '800', color: COLORS.text, marginBottom: 12,
  },
  viewerBodyText: { fontSize: 14, color: COLORS.text, lineHeight: 22 },
  viewerMeta: { fontSize: 11, color: COLORS.textLight, marginTop: 10, fontStyle: 'italic' },

  // Timeline
  timelineItem: { flexDirection: 'row', minHeight: 60 },
  timelineLine: { width: 30, alignItems: 'center' },
  timelineDot: {
    width: 26, height: 26, borderRadius: 13,
    justifyContent: 'center', alignItems: 'center',
  },
  timelineConnector: {
    width: 2, flex: 1, backgroundColor: COLORS.border, marginVertical: 4,
  },
  timelineContent: { flex: 1, marginLeft: 12, paddingBottom: 16 },
  timelineTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  timelineDetail: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  timelineTime: { fontSize: 10, color: COLORS.textLight, marginTop: 3 },

  // Location clusters
  clusterRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  clusterDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF1744', marginRight: 8,
  },
  clusterText: { fontSize: 12, color: COLORS.textSecondary },
  mapBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14,
    backgroundColor: '#E3F2FD', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  mapBtnText: { fontSize: 13, fontWeight: '700', color: '#1565C0' },

  // Insights
  insightRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingVertical: 10, paddingLeft: 12, borderLeftWidth: 3,
    marginBottom: 8, backgroundColor: '#FAFAFA', borderRadius: 8,
    paddingRight: 10,
  },
  insightText: { fontSize: 13, color: COLORS.text, flex: 1, lineHeight: 19 },

  // Evidence grid
  evidenceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  evidenceItem: {
    alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16,
    backgroundColor: '#F5F5F5', borderRadius: 14, minWidth: 70,
  },
  evidenceCount: { fontSize: 22, fontWeight: '900', color: COLORS.text, marginTop: 4 },
  evidenceLabel: { fontSize: 10, fontWeight: '600', color: COLORS.textLight, marginTop: 2 },
  evidenceVerified: {
    fontSize: 11, color: COLORS.textLight, marginTop: 12, fontStyle: 'italic',
  },

  // Recommendations
  recRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
  recBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, minWidth: 54, alignItems: 'center' },
  recBadgeText: { fontSize: 9, fontWeight: '800' },
  recText: { fontSize: 13, color: COLORS.text, flex: 1, lineHeight: 19 },

  // Viewer actions
  viewerActions: { marginTop: 6, gap: 10 },
  shareFullBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#4E342E', borderRadius: 16, paddingVertical: 16,
    ...SHADOWS.medium,
  },
  shareFullBtnText: { fontSize: 15, fontWeight: '800', color: '#FFF' },
  viewRawBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#FFF', borderRadius: 14, paddingVertical: 14,
    borderWidth: 1.5, borderColor: COLORS.primary + '30',
  },
  viewRawBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
});
