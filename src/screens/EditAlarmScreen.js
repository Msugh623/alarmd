import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Image,
  Alert,
  Platform,
  Dimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAlarms } from '../context/AlarmContext';
import GlassSurface from '../components/GlassSurface';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 3;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

const HOURS_12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const PERIODS = ['AM', 'PM'];

const DAY_LABELS = [
  { short: 'M', full: 'Mon', key: 'mon' },
  { short: 'T', full: 'Tue', key: 'tue' },
  { short: 'W', full: 'Wed', key: 'wed' },
  { short: 'T', full: 'Thu', key: 'thu' },
  { short: 'F', full: 'Fri', key: 'fri' },
  { short: 'S', full: 'Sat', key: 'sat' },
  { short: 'S', full: 'Sun', key: 'sun' },
];

/**
 * Convert 24-hour hour into 12-hour format and period (AM/PM)
 */
function get12HourFrom24(hour24) {
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour12, period };
}

/**
 * Convert 12-hour hour and period (AM/PM) into 24-hour hour
 */
function get24HourFrom12(hour12, period) {
  let h = hour12 % 12;
  if (period === 'PM') {
    h += 12;
  }
  return h;
}

/**
 * Calculate human-readable time remaining until alarm fires
 */
function getTimeUntilAlarm(hour24, minute, days) {
  const now = new Date();
  const currentDay = (now.getDay() + 6) % 7; // Mon=0 .. Sun=6
  const hasActiveDays = Array.isArray(days) && days.some(Boolean);

  let target = new Date();
  target.setHours(hour24, minute, 0, 0);

  if (!hasActiveDays) {
    if (target <= now) {
      target.setDate(target.getDate() + 1);
    }
  } else {
    let found = false;
    for (let offset = 0; offset < 7; offset++) {
      const checkDay = (currentDay + offset) % 7;
      if (days[checkDay]) {
        const testDate = new Date();
        testDate.setDate(testDate.getDate() + offset);
        testDate.setHours(hour24, minute, 0, 0);
        if (testDate > now) {
          target = testDate;
          found = true;
          break;
        }
      }
    }

    if (!found) {
      for (let offset = 0; offset < 7; offset++) {
        const checkDay = (currentDay + offset) % 7;
        if (days[checkDay]) {
          target.setDate(target.getDate() + offset + 7);
          target.setHours(hour24, minute, 0, 0);
          break;
        }
      }
    }
  }

  const diffMs = target.getTime() - now.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (diffHours === 0 && diffMins === 0) {
    return 'Alarm will ring in less than a minute';
  }
  if (diffHours === 0) {
    return `Alarm in ${diffMins} minute${diffMins === 1 ? '' : 's'}`;
  }
  return `Alarm in ${diffHours} hour${diffHours === 1 ? '' : 's'} ${diffMins} min`;
}

/**
 * Summary string for active days
 */
function formatDaysSummary(days) {
  if (!Array.isArray(days)) return 'Ring once';
  const activeCount = days.filter(Boolean).length;
  if (activeCount === 7) return 'Every day';
  if (activeCount === 0) return 'Ring once';
  if (
    activeCount === 5 &&
    days[0] &&
    days[1] &&
    days[2] &&
    days[3] &&
    days[4] &&
    !days[5] &&
    !days[6]
  ) {
    return 'Weekdays (Mon - Fri)';
  }
  if (
    activeCount === 2 &&
    !days[0] &&
    !days[1] &&
    !days[2] &&
    !days[3] &&
    !days[4] &&
    days[5] &&
    days[6]
  ) {
    return 'Weekends (Sat - Sun)';
  }

  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return days
    .map((selected, i) => (selected ? names[i] : null))
    .filter(Boolean)
    .join(', ');
}

/**
 * Interactive Wheel Column for time picker
 */
function WheelColumn({
  items,
  selectedValue,
  onSelect,
  formatItem,
  width = 68,
}) {
  const scrollViewRef = useRef(null);
  const isUserScrollingRef = useRef(false);
  const selectedIndex = items.findIndex((it) => it === selectedValue);

  // Sync scroll position when selectedValue changes externally
  useEffect(() => {
    if (!isUserScrollingRef.current && selectedIndex >= 0) {
      scrollViewRef.current?.scrollTo({
        y: selectedIndex * ITEM_HEIGHT,
        animated: false,
      });
    }
  }, [selectedIndex]);

  const handleScrollBegin = () => {
    isUserScrollingRef.current = true;
  };

  const handleMomentumEnd = (e) => {
    isUserScrollingRef.current = false;
    const offsetY = e.nativeEvent.contentOffset.y;
    let index = Math.round(offsetY / ITEM_HEIGHT);
    if (index < 0) index = 0;
    if (index >= items.length) index = items.length - 1;
    if (items[index] !== selectedValue) {
      onSelect(items[index]);
    }
  };

  const handleScrollEndDrag = (e) => {
    const offsetY = e.nativeEvent.contentOffset.y;
    let index = Math.round(offsetY / ITEM_HEIGHT);
    if (index < 0) index = 0;
    if (index >= items.length) index = items.length - 1;
    scrollViewRef.current?.scrollTo({
      y: index * ITEM_HEIGHT,
      animated: true,
    });
    if (items[index] !== selectedValue) {
      onSelect(items[index]);
    }
    isUserScrollingRef.current = false;
  };

  return (
    <View style={[styles.wheelColumn, { width }]}>
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.wheelContent}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        onScrollBeginDrag={handleScrollBegin}
        onMomentumScrollEnd={handleMomentumEnd}
        onScrollEndDrag={handleScrollEndDrag}
      >
        <View style={{ height: ITEM_HEIGHT }} />
        {items.map((item, index) => {
          const isSelected = item === selectedValue;
          const label = formatItem ? formatItem(item) : String(item);
          return (
            <TouchableOpacity
              key={String(item)}
              activeOpacity={0.7}
              style={[styles.wheelItem, { height: ITEM_HEIGHT }]}
              onPress={() => {
                onSelect(item);
                scrollViewRef.current?.scrollTo({
                  y: index * ITEM_HEIGHT,
                  animated: true,
                });
              }}
            >
              <Text
                style={[
                  styles.wheelItemText,
                  isSelected && styles.wheelItemTextSelected,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
        <View style={{ height: ITEM_HEIGHT }} />
      </ScrollView>
    </View>
  );
}

export default function EditAlarmScreen({ navigation, route }) {
  const alarmId = route?.params?.alarmId;
  const isEditing = Boolean(alarmId);

  const { alarms, addAlarm, updateAlarm, deleteAlarm } = useAlarms?.() || {};

  // Find alarm if editing
  const existingAlarm = useMemo(() => {
    if (!alarmId || !Array.isArray(alarms)) return null;
    return alarms.find((a) => a.id === alarmId) || null;
  }, [alarms, alarmId]);

  // Form State
  const now = new Date();
  const initialHour =
    existingAlarm?.time?.hour ??
    existingAlarm?.hour ??
    (isEditing ? 7 : now.getHours());
  const initialMinute =
    existingAlarm?.time?.minute ??
    existingAlarm?.minute ??
    (isEditing ? 0 : now.getMinutes());
  const initialLabel = existingAlarm?.label ?? '';
  const initialDays =
    Array.isArray(existingAlarm?.days) && existingAlarm.days.length === 7
      ? [...existingAlarm.days]
      : [false, false, false, false, false, false, false];
  const initialPhoto =
    existingAlarm?.referencePhoto ||
    existingAlarm?.photoUri ||
    existingAlarm?.photo ||
    null;

  const [hour, setHour] = useState(initialHour);
  const [minute, setMinute] = useState(initialMinute);
  const [label, setLabel] = useState(initialLabel);
  const [days, setDays] = useState(initialDays);
  const [referencePhoto, setReferencePhoto] = useState(initialPhoto);
  const [isSaving, setIsSaving] = useState(false);

  // Sync state if existingAlarm loads asynchronously from AsyncStorage
  const hasHydratedAlarmRef = useRef(false);
  useEffect(() => {
    if (existingAlarm && !hasHydratedAlarmRef.current) {
      hasHydratedAlarmRef.current = true;
      const h = existingAlarm.time?.hour ?? existingAlarm.hour ?? 7;
      const m = existingAlarm.time?.minute ?? existingAlarm.minute ?? 0;
      setHour(h);
      setMinute(m);
      setLabel(existingAlarm.label || '');
      if (Array.isArray(existingAlarm.days) && existingAlarm.days.length === 7) {
        setDays([...existingAlarm.days]);
      }
      setReferencePhoto(
        existingAlarm.referencePhoto ||
          existingAlarm.photoUri ||
          existingAlarm.photo ||
          null
      );
    }
  }, [existingAlarm]);

  // Listen for captured photo returned from Camera via route params
  useEffect(() => {
    const returnedPhoto =
      route?.params?.capturedReferencePhoto ||
      route?.params?.referencePhoto ||
      route?.params?.photoUri ||
      route?.params?.photo;
    if (returnedPhoto) {
      setReferencePhoto(returnedPhoto);
      if (route?.params?.capturedReferencePhoto) {
        navigation?.setParams?.({ capturedReferencePhoto: undefined });
      }
    }
  }, [
    navigation,
    route?.params?.capturedReferencePhoto,
    route?.params?.referencePhoto,
    route?.params?.photoUri,
    route?.params?.photo,
  ]);

  // Derive 12-hour values for picker
  const { hour12, period } = useMemo(() => get12HourFrom24(hour), [hour]);

  const handleHourSelect = useCallback(
    (newHour12) => {
      const newHour24 = get24HourFrom12(newHour12, period);
      setHour(newHour24);
    },
    [period]
  );

  const handleMinuteSelect = useCallback((newMinute) => {
    setMinute(newMinute);
  }, []);

  const handlePeriodSelect = useCallback(
    (newPeriod) => {
      const newHour24 = get24HourFrom12(hour12, newPeriod);
      setHour(newHour24);
    },
    [hour12]
  );

  // Toggle single day
  const toggleDay = useCallback((index) => {
    setDays((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  }, []);

  // Quick preset for weekdays/everyday
  const selectAllDays = useCallback(() => {
    setDays([true, true, true, true, true, true, true]);
  }, []);

  const selectWeekdays = useCallback(() => {
    setDays([true, true, true, true, true, false, false]);
  }, []);

  const clearDays = useCallback(() => {
    setDays([false, false, false, false, false, false, false]);
  }, []);

  // Open camera challenge
  const handleOpenPhotoChallenge = useCallback(() => {
    if (navigation?.navigate) {
      navigation.navigate('Camera', {
        alarmId,
        mode: 'reference',
      });
    }
  }, [navigation, alarmId]);

  // Remove photo challenge
  const handleRemovePhoto = useCallback(() => {
    Alert.alert(
      'Remove Photo Challenge',
      'Are you sure you want to remove the photo challenge for this alarm?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setReferencePhoto(null);
          },
        },
      ]
    );
  }, []);

  // Save Alarm
  const handleSave = async () => {
    if (isSaving) return;

    if (!referencePhoto) {
      Alert.alert(
        'Photo Required',
        'Set a reference photo before saving this alarm.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Set Photo', onPress: handleOpenPhotoChallenge },
        ]
      );
      return;
    }

    try {
      setIsSaving(true);
      const cleanLabel = label.trim() || 'Alarm';

      if (isEditing && alarmId) {
        const updates = {
          time: { hour, minute },
          hour,
          minute,
          label: cleanLabel,
          days,
          referencePhoto,
          sound: existingAlarm?.sound || 'default',
          snoozeEnabled:
            existingAlarm?.snoozeEnabled !== undefined
              ? existingAlarm.snoozeEnabled
              : true,
          enabled:
            existingAlarm?.enabled !== undefined ? existingAlarm.enabled : true,
        };

        if (typeof updateAlarm === 'function') {
          await updateAlarm(alarmId, updates);
        }
      } else {
        const newAlarm = {
          time: { hour, minute },
          hour,
          minute,
          label: cleanLabel,
          days,
          referencePhoto,
          enabled: true,
          snoozeEnabled: true,
          sound: 'default',
        };

        if (typeof addAlarm === 'function') {
          await addAlarm(newAlarm);
        }
      }

      navigation?.goBack?.();
    } catch (error) {
      console.error('[EditAlarmScreen] Failed to save alarm:', error);
      Alert.alert('Save Failed', 'Could not save alarm. Please try again.');
      setIsSaving(false);
    }
  };

  // Delete Alarm
  const handleDelete = () => {
    if (!alarmId) return;

    Alert.alert(
      'Delete Alarm',
      'Are you sure you want to permanently delete this alarm?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (typeof deleteAlarm === 'function') {
                await deleteAlarm(alarmId);
              }
              navigation?.goBack?.();
            } catch (error) {
              console.error('[EditAlarmScreen] Failed to delete alarm:', error);
              Alert.alert('Delete Failed', 'Could not delete alarm.');
            }
          },
        },
      ]
    );
  };

  // Display strings
  const formattedHour12 = String(hour12).padStart(2, '0');
  const formattedMinute = String(minute).padStart(2, '0');
  const timeUntilString = useMemo(
    () => getTimeUntilAlarm(hour, minute, days),
    [hour, minute, days]
  );
  const daysSubtitle = useMemo(() => formatDaysSummary(days), [days]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />

      {/* Screen Header Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation?.goBack?.()}
          style={styles.topBarButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={styles.topBarCancelText}>Cancel</Text>
        </TouchableOpacity>

        <Text style={styles.topBarTitle}>
          {isEditing ? 'Edit Alarm' : 'New Alarm'}
        </Text>

        <TouchableOpacity
          onPress={handleSave}
          disabled={isSaving}
          style={styles.topBarButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Save Alarm"
        >
          <Text
            style={[
              styles.topBarSaveText,
              isSaving && styles.topBarSaveTextDisabled,
            ]}
          >
            {isSaving ? 'Saving' : 'Save'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Large Prominent Centered Time Display */}
        <View style={styles.largeTimeDisplay}>
          <View style={styles.timeRow}>
            <Text style={styles.timeBigNumber}>{formattedHour12}</Text>
            <Text style={styles.timeColon}>:</Text>
            <Text style={styles.timeBigNumber}>{formattedMinute}</Text>
            <View style={styles.periodPill}>
              <Text style={styles.periodPillText}>{period}</Text>
            </View>
          </View>
          <Text style={styles.timeUntilText}>{timeUntilString}</Text>
        </View>

        {/* Custom Scroll-Wheel Style Picker Card */}
        <GlassSurface style={styles.card}>
          <Text style={styles.cardHeaderTitle}>SELECT TIME</Text>

          <View style={styles.wheelPickerContainer}>
            {/* Center Selection Highlight Bar */}
            <View style={styles.wheelHighlightBar} pointerEvents="none" />

            <View style={styles.wheelColumnsRow}>
              {/* Hours Column */}
              <WheelColumn
                items={HOURS_12}
                selectedValue={hour12}
                onSelect={handleHourSelect}
                formatItem={(h) => String(h).padStart(2, '0')}
                width={72}
              />

              <View style={styles.wheelColonContainer}>
                <Text style={styles.wheelColonText}>:</Text>
              </View>

              {/* Minutes Column */}
              <WheelColumn
                items={MINUTES}
                selectedValue={minute}
                onSelect={handleMinuteSelect}
                formatItem={(m) => String(m).padStart(2, '0')}
                width={72}
              />

              {/* Period Column (AM/PM) */}
              <WheelColumn
                items={PERIODS}
                selectedValue={period}
                onSelect={handlePeriodSelect}
                width={68}
              />
            </View>
          </View>

          {/* Quick Period Switcher Buttons */}
          <View style={styles.quickPeriodRow}>
            <TouchableOpacity
              style={[
                styles.quickPeriodBtn,
                period === 'AM' && styles.quickPeriodBtnActive,
              ]}
              onPress={() => handlePeriodSelect('AM')}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.quickPeriodBtnText,
                  period === 'AM' && styles.quickPeriodBtnTextActive,
                ]}
              >
                AM (Morning)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.quickPeriodBtn,
                period === 'PM' && styles.quickPeriodBtnActive,
              ]}
              onPress={() => handlePeriodSelect('PM')}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.quickPeriodBtnText,
                  period === 'PM' && styles.quickPeriodBtnTextActive,
                ]}
              >
                PM (Evening)
              </Text>
            </TouchableOpacity>
          </View>
        </GlassSurface>

        {/* Alarm Label Section */}
        <GlassSurface style={styles.card}>
          <Text style={styles.cardHeaderTitle}>ALARM LABEL</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              value={label}
              onChangeText={setLabel}
              placeholder="Alarm label"
              placeholderTextColor="#8E8E93"
              maxLength={36}
              returnKeyType="done"
              clearButtonMode="while-editing"
            />
            {label.length > 0 && Platform.OS === 'android' && (
              <TouchableOpacity
                onPress={() => setLabel('')}
                style={styles.clearBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.clearBtnText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </GlassSurface>

        {/* Day Selector Section */}
        <GlassSurface style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardHeaderTitle}>REPEAT</Text>
            <Text style={styles.cardSubtitle}>{daysSubtitle}</Text>
          </View>

          <View style={styles.daySelectorContainer}>
            {DAY_LABELS.map((day, idx) => {
              const isSelected = Boolean(days[idx]);
              return (
                <TouchableOpacity
                  key={`day-${day.key}-${idx}`}
                  style={[
                    styles.dayCircle,
                    isSelected && styles.dayCircleSelected,
                  ]}
                  onPress={() => toggleDay(idx)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${day.full}, ${
                    isSelected ? 'selected' : 'not selected'
                  }`}
                >
                  <Text
                    style={[
                      styles.dayCircleText,
                      isSelected && styles.dayCircleTextSelected,
                    ]}
                  >
                    {day.short}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Quick Repeat Presets */}
          <View style={styles.presetButtonsRow}>
            <TouchableOpacity
              style={styles.presetChip}
              onPress={selectWeekdays}
              activeOpacity={0.7}
            >
              <Text style={styles.presetChipText}>Weekdays</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.presetChip}
              onPress={selectAllDays}
              activeOpacity={0.7}
            >
              <Text style={styles.presetChipText}>Every day</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.presetChip}
              onPress={clearDays}
              activeOpacity={0.7}
            >
              <Text style={styles.presetChipText}>Once</Text>
            </TouchableOpacity>
          </View>
        </GlassSurface>

        {/* Reference Photo Challenge Section */}
        <GlassSurface style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardHeaderTitle}>PHOTO CHALLENGE</Text>
            <View style={styles.activeTag}>
              <Text style={styles.activeTagText}>Required</Text>
            </View>
          </View>

          <Text style={styles.helperText}>
            Set a reference photo before saving. You'll need to match it to
            dismiss the alarm.
          </Text>

          {referencePhoto ? (
            <View style={styles.photoContentContainer}>
              <View style={styles.photoThumbnailWrapper}>
                <Image
                  source={{ uri: referencePhoto }}
                  style={styles.photoThumbnail}
                  resizeMode="cover"
                />
              </View>

              <View style={styles.photoActionsWrapper}>
                <TouchableOpacity
                  style={styles.setChallengeButton}
                  onPress={handleOpenPhotoChallenge}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Retake Photo Challenge"
                >
                  <Text style={styles.setChallengeButtonIcon}>📷</Text>
                  <Text style={styles.setChallengeButtonText}>
                    Change Photo
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.removePhotoButton}
                  onPress={handleRemovePhoto}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Remove Photo"
                >
                  <Text style={styles.removePhotoText}>Remove Photo</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.noPhotoWrapper}>
              <TouchableOpacity
                style={styles.setChallengeButton}
                onPress={handleOpenPhotoChallenge}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Set Photo Challenge"
              >
                <Text style={styles.setChallengeButtonIcon}>📷</Text>
                <Text style={styles.setChallengeButtonText}>
                  Set Photo Challenge
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </GlassSurface>

        {/* Bottom Actions: Save & Delete Buttons */}
        <View style={styles.bottomActionsContainer}>
          <TouchableOpacity
            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={isSaving}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Save Alarm"
          >
            <Text style={styles.saveButtonText}>
              {isSaving
                ? 'Saving...'
                : isEditing
                ? 'Save Changes'
                : 'Save Alarm'}
            </Text>
          </TouchableOpacity>

          {isEditing && (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDelete}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Delete Alarm"
            >
              <Text style={styles.deleteButtonText}>Delete Alarm</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export { EditAlarmScreen };

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F7F9',
    paddingTop: 0,
  },
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
  },
  topBarButton: {
    minWidth: 64,
  },
  topBarCancelText: {
    color: '#6B6B73',
    fontSize: 16,
    fontWeight: '500',
  },
  topBarTitle: {
    color: '#111111',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  topBarSaveText: {
    color: '#111111',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'right',
  },
  topBarSaveTextDisabled: {
    opacity: 0.5,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 48,
  },

  /* Centered Large Time Display */
  largeTimeDisplay: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    marginBottom: 12,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeBigNumber: {
    fontSize: 58,
    lineHeight: 64,
    fontWeight: '800',
    color: '#111111',
    letterSpacing: -1,
  },
  timeColon: {
    fontSize: 52,
    lineHeight: 60,
    fontWeight: '700',
    color: '#111111',
    marginHorizontal: 4,
    marginTop: -4,
  },
  periodPill: {
    backgroundColor: 'rgba(17, 17, 17, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(17, 17, 17, 0.12)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 12,
    alignSelf: 'center',
  },
  periodPillText: {
    color: '#111111',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  timeUntilText: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '500',
    color: '#6B6B73',
    textAlign: 'center',
  },

  /* Card Containers */
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.68)',
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#7A7A85',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 4,
    overflow: 'hidden',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardHeaderTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#8E8E93',
    marginBottom: 10,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#6B6B73',
    fontWeight: '600',
  },

  /* Wheel Picker */
  wheelPickerContainer: {
    height: WHEEL_HEIGHT,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
    overflow: 'hidden',
  },
  wheelHighlightBar: {
    position: 'absolute',
    top: ITEM_HEIGHT,
    left: 8,
    right: 8,
    height: ITEM_HEIGHT,
    backgroundColor: 'rgba(17, 17, 17, 0.06)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(17, 17, 17, 0.12)',
    borderRadius: 8,
  },
  wheelColumnsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  wheelColumn: {
    height: WHEEL_HEIGHT,
  },
  wheelContent: {
    alignItems: 'stretch',
  },
  wheelColonContainer: {
    width: 20,
    height: WHEEL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelColonText: {
    color: '#111111',
    fontSize: 24,
    fontWeight: '700',
  },
  wheelItem: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelItemText: {
    fontSize: 20,
    fontWeight: '500',
    color: '#8E8E93',
  },
  wheelItemTextSelected: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111111',
  },

  /* Quick Period Row */
  quickPeriodRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  quickPeriodBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F1F1F4',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  quickPeriodBtnActive: {
    backgroundColor: '#111111',
    borderColor: '#111111',
  },
  quickPeriodBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B6B73',
  },
  quickPeriodBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  /* Label Input */
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  textInput: {
    flex: 1,
    height: 48,
    color: '#111111',
    fontSize: 16,
  },
  clearBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearBtnText: {
    color: '#6B6B73',
    fontSize: 14,
    fontWeight: 'bold',
  },

  /* Day Selector */
  daySelectorContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 12,
  },
  dayCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#F1F1F4',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  dayCircleSelected: {
    backgroundColor: '#111111',
    borderColor: '#111111',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
  },
  dayCircleText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B6B73',
  },
  dayCircleTextSelected: {
    color: '#FFFFFF',
  },
  presetButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F1F1F4',
  },
  presetChipText: {
    fontSize: 12,
    color: '#6B6B73',
    fontWeight: '600',
  },

  /* Reference Photo Section */
  activeTag: {
    backgroundColor: '#F1F1F4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  activeTagText: {
    color: '#111111',
    fontSize: 11,
    fontWeight: '700',
  },
  helperText: {
    fontSize: 13,
    color: '#6B6B73',
    marginBottom: 16,
    lineHeight: 18,
  },
  photoContentContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  photoThumbnailWrapper: {
    shadowColor: '#7A7A85',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
    marginBottom: 16,
  },
  photoThumbnail: {
    width: 150,
    height: 150,
    borderRadius: 16,
    backgroundColor: '#F1F1F4',
    borderWidth: 2,
    borderColor: '#D1D1D6',
  },
  photoActionsWrapper: {
    width: '100%',
    alignItems: 'center',
    gap: 8,
  },
  noPhotoWrapper: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  setChallengeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#111111',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    width: '100%',
  },
  setChallengeButtonIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  setChallengeButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  removePhotoButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  removePhotoText: {
    color: '#FF4757',
    fontSize: 14,
    fontWeight: '600',
  },

  /* Bottom Actions */
  bottomActionsContainer: {
    marginTop: 8,
    marginBottom: 24,
    gap: 12,
  },
  saveButton: {
    backgroundColor: '#111111',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  deleteButton: {
    backgroundColor: '#D92D20',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
