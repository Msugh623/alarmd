import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Vibration,
  StatusBar,
} from 'react-native';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { useAlarms } from '../context/AlarmContext';
import GlassSurface from '../components/GlassSurface';
import { SafeAreaView } from 'react-native-safe-area-context';

const ALARM_SOUND_URL =
  'https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg';

/**
 * Format current date/time into display components.
 */
function getFormattedTime(date = new Date()) {
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const hoursFormatted = String(hours).padStart(2, '0');

  const dateString = date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return {
    time: `${hoursFormatted}:${minutes}`,
    ampm,
    dateString,
  };
}

export default function AlarmRingingScreen({ navigation, route }) {
  const { activeAlarm, dismissActiveAlarm } = useAlarms ? useAlarms() : {};
  const currentAlarm = activeAlarm || route?.params?.alarm || {};
  const alarmLabel = currentAlarm?.label || currentAlarm?.title || 'Wake Up!';

  // Detect whether alarm requires a reference photo for dismissal
  const hasReferencePhoto = Boolean(
    currentAlarm?.referencePhoto ||
    currentAlarm?.referencePhotoUri ||
    currentAlarm?.referenceImage ||
    currentAlarm?.photoUri ||
    currentAlarm?.photo ||
    currentAlarm?.imageUri ||
    currentAlarm?.targetPhotoUri ||
    currentAlarm?.hasReferencePhoto
  );

  // Time state for live ticking clock
  const [currentTime, setCurrentTime] = useState(() => getFormattedTime());

  const alarmPlayer = useAudioPlayer(ALARM_SOUND_URL, { downloadFirst: true });

  // Animation values
  const clockScale = useRef(new Animated.Value(1.0)).current;
  const urgentGlowScale = useRef(new Animated.Value(1.0)).current;
  const urgentGlowOpacity = useRef(new Animated.Value(0.4)).current;
  const buttonScale = useRef(new Animated.Value(1.0)).current;

  // 1. Live clock ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(getFormattedTime());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Large pulsing clock animation (1.0 -> 1.05 -> 1.0 loop)
  useEffect(() => {
    const clockLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(clockScale, {
          toValue: 1.05,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(clockScale, {
          toValue: 1.0,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    clockLoop.start();

    return () => clockLoop.stop();
  }, [clockScale]);

  // 3. Urgent red accent (#FF4757) pulsing effect
  useEffect(() => {
    const urgentLoop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(urgentGlowScale, {
            toValue: 1.3,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.timing(urgentGlowOpacity, {
            toValue: 0.1,
            duration: 700,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(urgentGlowScale, {
            toValue: 1.0,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.timing(urgentGlowOpacity, {
            toValue: 0.45,
            duration: 700,
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    urgentLoop.start();

    return () => urgentLoop.stop();
  }, [urgentGlowScale, urgentGlowOpacity]);

  // 4. Subtle glow/pulse animation for "Take Photo" button
  useEffect(() => {
    const buttonLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(buttonScale, {
          toValue: 1.04,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(buttonScale, {
          toValue: 1.0,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    buttonLoop.start();

    return () => buttonLoop.stop();
  }, [buttonScale]);

  // Helper to stop audio and cancel repeating vibration
  const stopSoundAndVibration = () => {
    try {
      Vibration.cancel();
    } catch (e) {
      // Ignore vibration cancel errors
    }

    alarmPlayer.pause();
  };

  // 5. Sound and Vibration on mount & cleanup
  useEffect(() => {
    let isMounted = true;

    // Start repeating vibration pattern
    const VIBRATION_PATTERN = [500, 500, 500, 500];
    try {
      Vibration.vibrate(VIBRATION_PATTERN, true);
    } catch (e) {
      console.warn('Vibration failed:', e);
    }

    // Start playing alarm sound on loop
    const startAlarmSound = async () => {
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: true,
          interruptionMode: 'duckOthers',
        });

        if (!isMounted) return;
        alarmPlayer.loop = true;
        alarmPlayer.volume = 1;
        alarmPlayer.play();
      } catch (error) {
        // If sound fails or network is offline, vibration pattern continues as fallback
        console.warn('Alarm sound could not be played, continuing with vibration fallback:', error);
      }
    };

    startAlarmSound();

    return () => {
      isMounted = false;
      stopSoundAndVibration();
    };
  }, [alarmPlayer]);

  // Handler for "Take Photo" press
  const handleTakePhoto = async () => {
    stopSoundAndVibration();
    if (navigation?.navigate) {
      navigation.navigate('Camera', {
        alarmId: currentAlarm?.id,
        mode: 'dismiss',
      });
    }
  };

  // Handler for simple "Dismiss" press (no reference photo)
  const handleDismiss = async () => {
    stopSoundAndVibration();
    if (typeof dismissActiveAlarm === 'function') {
      try {
        await dismissActiveAlarm();
      } catch (err) {
        console.warn('Failed to dismiss active alarm:', err);
      }
    }
    if (navigation?.canGoBack && navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F7F9" />

      {/* Top Urgent Status Banner */}
      <View style={styles.topSection}>
        <View style={styles.urgentBadge}>
          <View style={styles.urgentDot} />
          <Text style={styles.urgentBadgeText}>ALARM RINGING</Text>
        </View>
        <Text style={styles.dateText}>{currentTime.dateString}</Text>
      </View>

      {/* Center Clock Section with Red Pulse Halo */}
      <View style={styles.clockCenterWrapper}>
        {/* Pulsing red accent halo behind clock */}
        <Animated.View
          style={[
            styles.urgentPulseHalo,
            {
              transform: [{ scale: urgentGlowScale }],
              opacity: urgentGlowOpacity,
            },
          ]}
        />

        {/* Large pulsing clock */}
        <Animated.View
          style={[
            styles.clockContainer,
            {
              transform: [{ scale: clockScale }],
            },
          ]}
        >
          <GlassSurface style={styles.clockGlass}>
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>{currentTime.time}</Text>
              <Text style={styles.ampmText}>{currentTime.ampm}</Text>
            </View>
            <Text style={styles.alarmLabel} numberOfLines={2}>
              {alarmLabel}
            </Text>
          </GlassSurface>
        </Animated.View>
      </View>

      {/* Bottom Action Section */}
      <View style={styles.bottomSection}>
        {hasReferencePhoto ? (
          <Animated.View
            style={[
              styles.actionButtonWrapper,
              { transform: [{ scale: buttonScale }] },
            ]}
          >
            <TouchableOpacity
              style={styles.photoButton}
              activeOpacity={0.85}
              onPress={handleTakePhoto}
            >
              <Text style={styles.photoButtonText}>📸 Take Photo to Dismiss</Text>
            </TouchableOpacity>
            <Text style={styles.instructionText}>
              Match your reference photo to shut off the alarm
            </Text>
          </Animated.View>
        ) : (
          <View style={styles.actionButtonWrapper}>
            <TouchableOpacity
              style={styles.dismissButton}
              activeOpacity={0.8}
              onPress={handleDismiss}
            >
              <Text style={styles.dismissButtonText}>Dismiss</Text>
            </TouchableOpacity>
            <Text style={styles.instructionText}>
              Tap to dismiss this alarm
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F9',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 48,
  },
  topSection: {
    alignItems: 'center',
    marginTop: 20,
  },
  urgentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.76)',
    borderColor: 'rgba(17, 17, 17, 0.08)',
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 12,
  },
  urgentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF4757',
    marginRight: 8,
  },
  urgentBadgeText: {
    color: '#111111',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  dateText: {
    color: '#6B6B73',
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  clockCenterWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    width: 320,
    height: 320,
  },
  urgentPulseHalo: {
    position: 'absolute',
    width: 290,
    height: 290,
    borderRadius: 145,
    backgroundColor: 'rgba(255, 71, 87, 0.08)',
    borderColor: 'rgba(255, 71, 87, 0.18)',
    borderWidth: 1,
  },
  clockContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  clockGlass: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 280,
    minHeight: 220,
    paddingHorizontal: 24,
    paddingVertical: 36,
    borderRadius: 36,
    shadowColor: '#7A7A85',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 26,
    elevation: 5,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  timeText: {
    color: '#111111',
    fontSize: 72,
    fontWeight: '800',
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
  },
  ampmText: {
    color: '#6B6B73',
    fontSize: 22,
    fontWeight: '700',
    marginLeft: 6,
    marginTop: 12,
    letterSpacing: 1,
  },
  alarmLabel: {
    color: '#333333',
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 16,
    letterSpacing: 0.5,
    maxWidth: 280,
  },
  bottomSection: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
  },
  actionButtonWrapper: {
    width: '100%',
    alignItems: 'center',
  },
  photoButton: {
    backgroundColor: '#111111',
    width: '100%',
    paddingVertical: 18,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 10,
  },
  photoButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  dismissButton: {
    backgroundColor: '#111111',
    borderColor: '#111111',
    borderWidth: 1,
    width: '100%',
    paddingVertical: 18,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  dismissButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  instructionText: {
    color: '#6B6B73',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 14,
    letterSpacing: 0.3,
  },
});
