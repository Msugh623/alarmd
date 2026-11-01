import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { scheduleAlarm, cancelAlarm } from '../utils/alarmScheduler';

const STORAGE_KEY = '@alarmd_alarms';

/**
 * Helper to ensure an alarm object conforms to the data model:
 * {
 *   id: string (uuid),
 *   time: { hour: number, minute: number },
 *   label: string,
 *   enabled: boolean,
 *   referencePhoto: string | null,
 *   days: boolean[7],
 *   sound: string,
 *   snoozeEnabled: boolean,
 *   createdAt: number,
 * }
 */
function createAlarm(data = {}) {
  return {
    id: data.id || uuidv4(),
    time: data.time || { hour: 7, minute: 0 },
    label: data.label !== undefined ? data.label : 'Alarm',
    enabled: data.enabled !== undefined ? data.enabled : true,
    referencePhoto: data.referencePhoto !== undefined ? data.referencePhoto : null,
    days:
      Array.isArray(data.days) && data.days.length === 7
        ? [...data.days]
        : [false, false, false, false, false, false, false],
    sound: data.sound || 'default',
    snoozeEnabled: data.snoozeEnabled !== undefined ? data.snoozeEnabled : true,
    createdAt: data.createdAt || Date.now(),
  };
}

const initialState = {
  alarms: [],
  activeAlarm: null,
};

function alarmReducer(state, action) {
  switch (action.type) {
    case 'SET_ALARMS':
      return {
        ...state,
        alarms: action.payload,
      };

    case 'ADD_ALARM':
      return {
        ...state,
        alarms: [...state.alarms, action.payload],
      };

    case 'UPDATE_ALARM':
      return {
        ...state,
        alarms: state.alarms.map((alarm) =>
          alarm.id === action.payload.id
            ? { ...alarm, ...action.payload.updates }
            : alarm
        ),
      };

    case 'DELETE_ALARM':
      return {
        ...state,
        alarms: state.alarms.filter((alarm) => alarm.id !== action.payload),
      };

    case 'TOGGLE_ALARM':
      return {
        ...state,
        alarms: state.alarms.map((alarm) =>
          alarm.id === action.payload
            ? { ...alarm, enabled: !alarm.enabled }
            : alarm
        ),
      };

    case 'SET_REFERENCE_PHOTO':
      return {
        ...state,
        alarms: state.alarms.map((alarm) =>
          alarm.id === action.payload.id
            ? { ...alarm, referencePhoto: action.payload.uri }
            : alarm
        ),
      };

    case 'SET_ACTIVE_ALARM':
      return {
        ...state,
        activeAlarm: action.payload,
      };

    case 'DISMISS_ACTIVE_ALARM':
      return {
        ...state,
        activeAlarm: null,
      };

    default:
      return state;
  }
}

const AlarmContext = createContext(null);

export function AlarmProvider({ children }) {
  const [state, dispatch] = useReducer(alarmReducer, initialState);
  const [isLoaded, setIsLoaded] = useState(false);
  const isInitialLoadDone = useRef(false);
  const alarmsRef = useRef(state.alarms);

  // Keep alarmsRef updated with current alarms
  useEffect(() => {
    alarmsRef.current = state.alarms;
  }, [state.alarms]);

  // Load alarms from AsyncStorage on mount
  useEffect(() => {
    let isMounted = true;

    async function loadAlarms() {
      try {
        const storedAlarms = await AsyncStorage.getItem(STORAGE_KEY);
        if (storedAlarms !== null) {
          const parsed = JSON.parse(storedAlarms);
          if (Array.isArray(parsed) && isMounted) {
            dispatch({ type: 'SET_ALARMS', payload: parsed });
          }
        }
      } catch (error) {
        console.error('[AlarmContext] Failed to load alarms from storage:', error);
      } finally {
        if (isMounted) {
          isInitialLoadDone.current = true;
          setIsLoaded(true);
        }
      }
    }

    loadAlarms();

    return () => {
      isMounted = false;
    };
  }, []);

  // Save alarms to AsyncStorage whenever alarms change (after initial load)
  useEffect(() => {
    if (!isInitialLoadDone.current || !isLoaded) {
      return;
    }

    async function persistAlarms() {
      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state.alarms));
      } catch (error) {
        console.error('[AlarmContext] Failed to save alarms to storage:', error);
      }
    }

    persistAlarms();
  }, [state.alarms, isLoaded]);

  // Add a new alarm
  const addAlarm = useCallback(async (alarmData = {}) => {
    const newAlarm = createAlarm(alarmData);
    dispatch({ type: 'ADD_ALARM', payload: newAlarm });

    try {
      if (newAlarm.enabled) {
        await scheduleAlarm(newAlarm);
      }
    } catch (error) {
      console.warn('[AlarmContext] Failed to schedule alarm:', error);
    }

    return newAlarm;
  }, []);

  // Update an existing alarm's properties
  const updateAlarm = useCallback(async (id, updates) => {
    dispatch({ type: 'UPDATE_ALARM', payload: { id, updates } });

    const currentAlarm = alarmsRef.current.find((a) => a.id === id);
    if (currentAlarm) {
      const updatedAlarm = { ...currentAlarm, ...updates };
      try {
        if (updatedAlarm.enabled) {
          await scheduleAlarm(updatedAlarm);
        } else {
          await cancelAlarm(id);
        }
      } catch (error) {
        console.warn('[AlarmContext] Failed to update alarm schedule:', error);
      }
      return updatedAlarm;
    }

    return null;
  }, []);

  // Delete an alarm
  const deleteAlarm = useCallback(async (id) => {
    dispatch({ type: 'DELETE_ALARM', payload: id });

    try {
      await cancelAlarm(id);
    } catch (error) {
      console.warn('[AlarmContext] Failed to cancel alarm notification:', error);
    }
  }, []);

  // Toggle alarm enabled/disabled state
  const toggleAlarm = useCallback(async (id) => {
    const currentAlarm = alarmsRef.current.find((a) => a.id === id);
    if (!currentAlarm) return null;

    const nextEnabled = !currentAlarm.enabled;
    const updatedAlarm = { ...currentAlarm, enabled: nextEnabled };

    dispatch({ type: 'TOGGLE_ALARM', payload: id });

    try {
      if (nextEnabled) {
        await scheduleAlarm(updatedAlarm);
      } else {
        await cancelAlarm(id);
      }
    } catch (error) {
      console.warn('[AlarmContext] Failed to toggle alarm schedule:', error);
    }

    return updatedAlarm;
  }, []);

  // Set reference photo URI for an alarm
  const setReferencePhoto = useCallback((id, uri) => {
    dispatch({ type: 'SET_REFERENCE_PHOTO', payload: { id, uri } });
  }, []);

  // Set the currently active (ringing) alarm
  const setActiveAlarm = useCallback((alarm) => {
    dispatch({ type: 'SET_ACTIVE_ALARM', payload: alarm });
  }, []);

  // Dismiss / clear the active alarm
  const dismissActiveAlarm = useCallback(() => {
    dispatch({ type: 'DISMISS_ACTIVE_ALARM' });
  }, []);

  const value = useMemo(
    () => ({
      alarms: state.alarms,
      addAlarm,
      updateAlarm,
      deleteAlarm,
      toggleAlarm,
      setReferencePhoto,
      activeAlarm: state.activeAlarm,
      setActiveAlarm,
      dismissActiveAlarm,
      isLoaded,
    }),
    [
      state.alarms,
      state.activeAlarm,
      addAlarm,
      updateAlarm,
      deleteAlarm,
      toggleAlarm,
      setReferencePhoto,
      setActiveAlarm,
      dismissActiveAlarm,
      isLoaded,
    ]
  );

  return (
    <AlarmContext.Provider value={value}>
      {children}
    </AlarmContext.Provider>
  );
}

/**
 * Custom hook to consume the AlarmContext
 */
export function useAlarms() {
  const context = useContext(AlarmContext);
  if (!context) {
    throw new Error('useAlarms must be used within an AlarmProvider');
  }
  return context;
}

export { AlarmContext };
export default AlarmProvider;
