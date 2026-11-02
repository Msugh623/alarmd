import React, { useEffect } from 'react';
import {
  DefaultTheme as NavigationLightTheme,
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

export const LightTheme = {
  ...NavigationLightTheme,
  colors: {
    ...NavigationLightTheme.colors,
    primary: '#111111',
    background: '#F7F7F9',
    card: '#FFFFFF',
    text: '#111111',
    border: '#E5E5EA',
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
      theme={LightTheme}
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
