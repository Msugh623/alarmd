import React, { useEffect } from 'react';
import {
  DarkTheme as NavigationDarkTheme,
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  HomeScreen,
  EditAlarmScreen,
  CameraScreen,
  AlarmRingingScreen,
} from '../screens';
import { useAlarms } from '../context/AlarmContext';

export const navigationRef = createNavigationContainerRef();

const Stack = createNativeStackNavigator();

export const DarkTheme = {
  ...NavigationDarkTheme,
  colors: {
    ...NavigationDarkTheme.colors,
    primary: '#6C63FF',
    background: '#121212',
    card: '#1E1E1E',
    text: '#FFFFFF',
    border: '#2A2A2A',
    notification: '#FF4757',
  },
};

export default function AppNavigator() {
  const { activeAlarm } = useAlarms();

  useEffect(() => {
    if (activeAlarm && navigationRef.isReady()) {
      navigationRef.navigate('AlarmRinging');
    }
  }, [activeAlarm]);

  const handleReady = () => {
    if (activeAlarm && navigationRef.isReady()) {
      navigationRef.navigate('AlarmRinging');
    }
  };

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={DarkTheme}
      onReady={handleReady}
    >
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="EditAlarm" component={EditAlarmScreen} />
        <Stack.Screen
          name="Camera"
          component={CameraScreen}
          options={{
            presentation: 'fullScreenModal',
          }}
        />
        <Stack.Screen
          name="AlarmRinging"
          component={AlarmRingingScreen}
          options={{
            presentation: 'fullScreenModal',
            gestureEnabled: false,
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
