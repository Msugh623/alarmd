import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

const ANDROID_ALARM_CHANNEL_ID = 'alarms-v2';

// Configure notification handler — show notification even when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

/**
 * Request notification permissions
 */
export async function requestPermissions() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_ALARM_CHANNEL_ID, {
      name: 'Alarms',
      importance: AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: '#111111',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('Notification permissions not granted');
    return false;
  }

  return true;
}

/**
 * Schedule a notification for an alarm
 */
export async function scheduleAlarm(alarm) {
  // Cancel any existing notifications for this alarm
  await cancelAlarm(alarm.id);

  if (!alarm.enabled) return;

  const { hour, minute } = alarm.time;
  const hasActiveDays = alarm.days.some((d) => d);

  if (hasActiveDays) {
    // Schedule for each active day
    // days array: [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
    // Expo weekday: 1=Sunday, 2=Monday, ..., 7=Saturday
    const dayMapping = [2, 3, 4, 5, 6, 7, 1]; // Mon→2, Tue→3, ... Sun→1

    for (let i = 0; i < 7; i++) {
      if (alarm.days[i]) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '⏰ alarmd',
            body: alarm.label || 'Time to wake up!',
            data: { alarmId: alarm.id },
            sound: 'default',
            priority: 'max',
            categoryIdentifier: 'alarm',
          },
          trigger: {
            type: 'weekly',
            weekday: dayMapping[i],
            hour,
            minute,
            channelId: ANDROID_ALARM_CHANNEL_ID,
          },
          identifier: `${alarm.id}_day_${i}`,
        });
      }
    }
  } else {
    // One-time alarm — schedule for the next occurrence
    const now = new Date();
    const alarmTime = new Date();
    alarmTime.setHours(hour, minute, 0, 0);

    // If the time has already passed today, schedule for tomorrow
    if (alarmTime <= now) {
      alarmTime.setDate(alarmTime.getDate() + 1);
    }

    const secondsUntilAlarm = Math.floor((alarmTime - now) / 1000);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: '⏰ alarmd',
        body: alarm.label || 'Time to wake up!',
        data: { alarmId: alarm.id },
        sound: 'default',
        priority: 'max',
        categoryIdentifier: 'alarm',
      },
      trigger: {
        type: 'timeInterval',
        seconds: secondsUntilAlarm,
        channelId: ANDROID_ALARM_CHANNEL_ID,
      },
      identifier: `${alarm.id}_once`,
    });
  }
}

/**
 * Cancel all scheduled notifications for an alarm
 */
export async function cancelAlarm(alarmId) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const toCancel = scheduled.filter((n) => n.identifier.startsWith(alarmId));

  for (const notification of toCancel) {
    await Notifications.cancelScheduledNotificationAsync(notification.identifier);
  }
}

/**
 * Cancel all scheduled alarms
 */
export async function cancelAllAlarms() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Get all currently scheduled notifications (for debugging)
 */
export async function getScheduledAlarms() {
  return await Notifications.getAllScheduledNotificationsAsync();
}
