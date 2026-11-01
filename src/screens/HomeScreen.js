import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  Switch,
  Alert,
  SafeAreaView,
  Platform,
  StatusBar as RNStatusBar,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAlarms } from '../context/AlarmContext';

const DAYS = [
  { key: 'mon', short: 'M', label: 'Mon', jsDay: 1, index1: 1 },
  { key: 'tue', short: 'T', label: 'T', jsDay: 2, index1: 2 },
  { key: 'wed', short: 'W', label: 'W', jsDay: 3, index1: 3 },
  { key: 'thu', short: 'T', label: 'T', jsDay: 4, index1: 4 },
  { key: 'fri', short: 'F', label: 'F', jsDay: 5, index1: 5 },
  { key: 'sat', short: 'S', label: 'S', jsDay: 6, index1: 6 },
  { key: 'sun', short: 'S', label: 'S', jsDay: 0, index1: 7 },
];

/**
 * Format alarm time into 12-hour format with AM/PM.
 */
function formatAlarmTime(alarm) {
  if (!alarm) {
    return { time: '12:00', ampm: 'AM' };
  }

  // If explicit hour & minute are provided
  if (alarm.hour !== undefined && alarm.minute !== undefined) {
    const hourNum = parseInt(alarm.hour, 10);
    const minuteNum = parseInt(alarm.minute, 10);
    const ampm = hourNum >= 12 ? 'PM' : 'AM';
    const displayHour = hourNum % 12 === 0 ? 12 : hourNum % 12;
    const displayMinute = minuteNum < 10 ? `0${minuteNum}` : minuteNum;
    return {
      time: `${displayHour}:${displayMinute}`,
      ampm,
    };
  }

  const rawTime = alarm.time || alarm.alarmTime;
  if (rawTime) {
    if (typeof rawTime === 'string') {
      const match = rawTime.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
      if (match) {
        let hour = parseInt(match[1], 10);
        const minute = match[2];
        const ampmPart = match[3];

        if (ampmPart) {
          return {
            time: `${hour}:${minute}`,
            ampm: ampmPart.toUpperCase(),
          };
        }

        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 === 0 ? 12 : hour % 12;
        return {
          time: `${displayHour}:${minute}`,
          ampm,
        };
      }
    }

    const date = new Date(rawTime);
    if (!isNaN(date.getTime())) {
      let hours = date.getHours();
      const minutes = date.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      const minutesFormatted = minutes < 10 ? `0${minutes}` : minutes;
      return {
        time: `${hours}:${minutesFormatted}`,
        ampm,
      };
    }
  }

  return { time: '12:00', ampm: 'AM' };
}

/**
 * Determine if a particular day (0 = Mon, 6 = Sun) is active for an alarm.
 */
function isDayActive(alarm, dayIndex) {
  const dayInfo = DAYS[dayIndex];
  const days = alarm.days || alarm.repeatDays || alarm.repeat;

  if (!days) return false;

  // String presets
  if (typeof days === 'string') {
    const lower = days.toLowerCase();
    if (lower === 'daily' || lower === 'every day' || lower === 'everyday') return true;
    if (lower === 'weekdays' && dayIndex < 5) return true;
    if (lower === 'weekends' && dayIndex >= 5) return true;
  }

  // Array of days (indices, day codes, or booleans)
  if (Array.isArray(days)) {
    if (days.length === 7 && typeof days[0] === 'boolean') {
      return Boolean(days[dayIndex]);
    }

    return days.some((d) => {
      if (typeof d === 'number') {
        return (
          d === dayIndex ||
          d === dayIndex + 1 ||
          d === dayInfo.jsDay ||
          d === dayInfo.index1
        );
      }
      if (typeof d === 'string') {
        const lower = d.toLowerCase().trim();
        return (
          lower === dayInfo.key ||
          lower === dayInfo.label.toLowerCase() ||
          lower.startsWith(dayInfo.key)
        );
      }
      return false;
    });
  }

  // Object mapping (e.g. { mon: true, tue: false })
  if (typeof days === 'object') {
    return Boolean(
      days[dayInfo.key] ||
      days[dayInfo.label] ||
      days[dayInfo.label.toLowerCase()] ||
      days[dayIndex] ||
      days[dayInfo.jsDay]
    );
  }

  return false;
}

export default function HomeScreen({ navigation }) {
  const alarmContext = useAlarms?.() || {};
  const alarms = alarmContext.alarms || [];
  const toggleAlarm = alarmContext.toggleAlarm;
  const deleteAlarm = alarmContext.deleteAlarm || alarmContext.removeAlarm;
  const updateAlarm = alarmContext.updateAlarm;

  const handleToggle = (alarm) => {
    const nextState = !alarm.enabled;
    if (typeof toggleAlarm === 'function') {
      toggleAlarm(alarm.id, nextState);
    } else if (typeof updateAlarm === 'function') {
      updateAlarm({ ...alarm, enabled: nextState });
    }
  };

  const handleDelete = (alarmId) => {
    if (typeof deleteAlarm === 'function') {
      deleteAlarm(alarmId);
    }
  };

  const handleLongPress = (alarm) => {
    const { time, ampm } = formatAlarmTime(alarm);
    const alarmLabel = alarm.label ? ` "${alarm.label}"` : '';

    Alert.alert(
      'Delete Alarm',
      `Are you sure you want to delete the ${time} ${ampm}${alarmLabel} alarm?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => handleDelete(alarm.id),
        },
      ],
      { cancelable: true }
    );
  };

  const renderAlarmCard = ({ item: alarm }) => {
    const { time, ampm } = formatAlarmTime(alarm);
    const hasPhoto = Boolean(
      alarm.hasPhoto ||
      alarm.photoUri ||
      alarm.photo ||
      alarm.referencePhoto ||
      alarm.referencePhotoUri ||
      alarm.imageUri ||
      alarm.image
    );
    const isEnabled = Boolean(alarm.enabled ?? true);

    return (
      <Pressable
        style={({ pressed }) => [
          styles.card,
          !isEnabled && styles.cardDisabled,
          pressed && styles.cardPressed,
        ]}
        onPress={() => navigation.navigate('EditAlarm', { alarmId: alarm.id })}
        onLongPress={() => handleLongPress(alarm)}
        delayLongPress={450}
        accessibilityRole="button"
        accessibilityLabel={`Alarm at ${time} ${ampm}, ${isEnabled ? 'enabled' : 'disabled'}`}
      >
        <View style={styles.cardContent}>
          {/* Time row */}
          <View style={styles.timeRow}>
            <Text style={[styles.timeText, !isEnabled && styles.textDisabled]}>
              {time}
            </Text>
            <Text style={[styles.ampmText, !isEnabled && styles.textDisabled]}>
              {ampm}
            </Text>
          </View>

          {/* Label */}
          <Text
            style={[styles.label, !isEnabled && styles.labelDisabled]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {alarm.label || 'Alarm'}
          </Text>

          {/* Footer: Days indicators & Photo indicator */}
          <View style={styles.cardFooter}>
            <View style={styles.daysRow}>
              {DAYS.map((day, idx) => {
                const active = isDayActive(alarm, idx);
                return (
                  <View
                    key={`${alarm.id || 'alarm'}-day-${day.key}-${idx}`}
                    style={[
                      styles.dayDot,
                      active && styles.dayDotActive,
                      !isEnabled && active && styles.dayDotActiveDisabled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayLetter,
                        active && styles.dayLetterActive,
                        !isEnabled && active && styles.dayLetterActiveDisabled,
                      ]}
                    >
                      {day.short}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.indicatorsRight}>
              <Text
                style={[
                  styles.photoIcon,
                  !hasPhoto && styles.photoIconInactive,
                ]}
                accessibilityLabel={hasPhoto ? 'Photo verification set' : 'No photo verification'}
              >
                📸
              </Text>
            </View>
          </View>
        </View>

        {/* Right side Switch toggle */}
        <View style={styles.switchContainer}>
          <Switch
            value={isEnabled}
            onValueChange={() => handleToggle(alarm)}
            trackColor={{ false: '#333333', true: '#6C63FF' }}
            thumbColor="#FFFFFF"
            ios_backgroundColor="#333333"
          />
        </View>
      </Pressable>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>⏰</Text>
      <Text style={styles.emptyTitle}>No alarms yet</Text>
      <Text style={styles.emptySubtitle}>Tap + to create your first alarm</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      {/* Screen Header */}
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text style={styles.headerTitle}>alarmd</Text>
          <Text style={styles.headerEmoji}>⏰</Text>
        </View>
      </View>

      {/* Alarm List or Empty State */}
      <FlatList
        data={alarms}
        keyExtractor={(item, index) => (item?.id != null ? String(item.id) : String(index))}
        renderItem={renderAlarmCard}
        contentContainerStyle={[
          styles.listContainer,
          alarms.length === 0 && styles.listContainerEmpty,
        ]}
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
      />

      {/* Floating Action Button (FAB) */}
      <Pressable
        style={({ pressed }) => [
          styles.fab,
          pressed && styles.fabPressed,
        ]}
        onPress={() => navigation.navigate('EditAlarm')}
        accessibilityRole="button"
        accessibilityLabel="Create alarm"
      >
        <Text style={styles.fabIcon}>+</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#121212',
    paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight || 20 : 0,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  headerEmoji: {
    fontSize: 24,
    marginLeft: 8,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 96,
  },
  listContainerEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#262626',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  cardDisabled: {
    opacity: 0.65,
    backgroundColor: '#181818',
    borderColor: '#202020',
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  cardContent: {
    flex: 1,
    paddingRight: 12,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  timeText: {
    fontSize: 34,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  ampmText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 6,
  },
  textDisabled: {
    color: '#888888',
  },
  label: {
    fontSize: 14,
    color: '#888888',
    marginTop: 2,
    marginBottom: 12,
  },
  labelDisabled: {
    color: '#555555',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  daysRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dayDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#262626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDotActive: {
    backgroundColor: '#6C63FF',
  },
  dayDotActiveDisabled: {
    backgroundColor: '#3E386B',
  },
  dayLetter: {
    fontSize: 11,
    fontWeight: '700',
    color: '#555555',
  },
  dayLetterActive: {
    color: '#FFFFFF',
  },
  dayLetterActiveDisabled: {
    color: '#888888',
  },
  indicatorsRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  photoIcon: {
    fontSize: 16,
    opacity: 1,
  },
  photoIconInactive: {
    opacity: 0.25,
  },
  switchContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    marginTop: -40,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: 16,
    opacity: 0.8,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#888888',
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#6C63FF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },
  fabPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.95 }],
  },
  fabIcon: {
    fontSize: 32,
    lineHeight: 34,
    fontWeight: '300',
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: -2,
  },
});
