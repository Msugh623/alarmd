import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { AlarmProvider, useAlarms } from './src/context/AlarmContext';
import AppNavigator, { navigationRef } from './src/navigation/AppNavigator';
import { requestPermissions } from './src/utils/alarmScheduler';

// Inner component that has access to AlarmContext
function AppContent() {
  const { alarms, setActiveAlarm } = useAlarms();

  useEffect(() => {
    requestPermissions().catch((error) => {
      console.error('Failed to request notification permissions:', error);
    });
  }, []);

  // Listen for notification responses (user tapped notification)
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const alarmId = response.notification.request.content.data?.alarmId;
        if (alarmId) {
          const alarm = alarms.find((a) => a.id === alarmId);
          if (alarm) {
            setActiveAlarm(alarm);
          }
        }
      }
    );

    return () => subscription.remove();
  }, [alarms]);

  // Listen for notifications received while app is in foreground
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener(
      (notification) => {
        const alarmId = notification.request.content.data?.alarmId;
        if (alarmId) {
          const alarm = alarms.find((a) => a.id === alarmId);
          if (alarm) {
            setActiveAlarm(alarm);
          }
        }
      }
    );

    return () => subscription.remove();
  }, [alarms]);

  return (
    <>
      <StatusBar style="light" />
      <AppNavigator />
    </>
  );
}

export default function App() {
  return (
    <AlarmProvider>
      <AppContent />
    </AlarmProvider>
  );
}
