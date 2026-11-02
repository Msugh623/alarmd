import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { File, Paths } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { useAlarms } from '../context/AlarmContext';
import GlassSurface from '../components/GlassSurface';
import { compareImages } from '../utils/imageComparison';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';

export default function CameraScreen({ navigation, route }) {
  const cameraRef = useRef(null);
  const isFocused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const [capturedUri, setCapturedUri] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toastMessage, setToMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [cameraKey, setCameraKey] = useState(0);
  const [isTorchEnabled, setIsTorchEnabled] = useState(false);

  const { setReferencePhoto, dismissActiveAlarm, activeAlarm, alarms } = useAlarms?.() || {};

  const mode = route?.params?.mode || 'reference';
  const alarmId = route?.params?.alarmId;
  const isReferenceMode = mode === 'reference';
  const isDismissMode = mode === 'dismiss';

  // Determine reference photo uri for dismiss mode
  const referencePhotoUri =
    route?.params?.referencePhotoUri ||
    route?.params?.referencePhoto ||
    activeAlarm?.referencePhoto ||
    (alarms && alarms.find((a) => a.id === alarmId)?.referencePhoto);

  const displayToast = (message, duration = 3000) => {
    setToMessage(message);
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
    }, duration);
  };

  const handleCapture = async () => {
    if (!cameraReady || !cameraRef.current || isProcessing) return;

    try {
      setIsProcessing(true);
      setShowToast(false);

      // Capture photo
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
      });

      if (!photo || !photo.uri) {
        throw new Error('Failed to capture photo from camera');
      }

      // Resize captured image to 300x300 using ImageManipulator
      const saveFormat = ImageManipulator.SaveFormat?.JPEG || 'jpeg';
      const manipulated = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 300, height: 300 } }],
        { compress: 0.8, format: saveFormat }
      );

      // Save the processed image in the app's document directory.
      const fileName = `alarm_${alarmId || 'photo'}_${Date.now()}.jpg`;
      const destination = new File(Paths.document, fileName);
      await new File(manipulated.uri).copy(destination);
      const destinationUri = destination.uri;

      if (isReferenceMode) {
        // In 'reference' mode: show preview with Use Photo / Retake buttons
        setCapturedUri(destinationUri);
        setIsProcessing(false);
      } else {
        // In 'dismiss' mode: compare with reference photo
        if (!referencePhotoUri) {
          setIsProcessing(false);
          displayToast('No reference photo available to compare.');
          return;
        }

        const matchResult = await compareImages(referencePhotoUri, destinationUri);
        const similarity =
          typeof matchResult === 'number'
            ? matchResult
            : (matchResult?.similarity ?? matchResult?.score ?? 0);

        if (similarity > 0.75) {
          // Photo matched reference! Dismiss active alarm and navigate to Home
          if (dismissActiveAlarm) {
            await dismissActiveAlarm();
          }
          setIsProcessing(false);
          navigation?.navigate?.('Home');
        } else {
          // No match: keep alarm ringing and allow retake
          setIsProcessing(false);
          displayToast('No match! Try again.');
        }
      }
    } catch (error) {
      console.error('Error during photo capture or comparison:', error);
      setIsProcessing(false);
      displayToast('Failed to process photo. Try again.');
    }
  };

  const handleRetake = () => {
    setCapturedUri(null);
    setShowToast(false);
  };

  const handleUsePhoto = async () => {
    if (!capturedUri) return;

    try {
      if (setReferencePhoto && alarmId) {
        await setReferencePhoto(alarmId, capturedUri);
      }
      navigation?.navigate?.('EditAlarm', {
        alarmId,
        capturedReferencePhoto: capturedUri,
      });
    } catch (error) {
      console.error('Error saving reference photo:', error);
      displayToast('Failed to save reference photo.');
    }
  };

  // Handle permission states
  if (!permission) {
    return (
      <View style={styles.permissionContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#F7F7F9" />
        <ActivityIndicator size="large" color="#111111" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#F7F7F9" />
        <GlassSurface style={styles.permissionCard}>
          <Text style={styles.permissionTitle}>Camera Permission Required</Text>
          <Text style={styles.permissionMessage}>
            {isDismissMode
              ? 'Alarmd needs camera access to verify your wake-up photo and dismiss the alarm.'
              : 'Alarmd needs camera access to take reference photos for your alarms.'}
          </Text>
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={requestPermission}
            activeOpacity={0.8}
          >
            <Text style={styles.permissionButtonText}>Enable Camera</Text>
          </TouchableOpacity>

          {isReferenceMode && (
            <TouchableOpacity
              style={styles.permissionCancelButton}
              onPress={() => navigation?.goBack?.()}
              activeOpacity={0.8}
            >
              <Text style={styles.permissionCancelText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </GlassSurface>
      </SafeAreaView>
    );
  }

  // Reference Mode: Captured photo preview state
  if (isReferenceMode && capturedUri) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
        <Image
          source={{ uri: capturedUri }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
        />

        <SafeAreaView style={styles.previewHeader} edges={[]}>
          <BlurView
            intensity={56}
            tint="light"
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.previewHeaderTitle}>Reference Photo Preview</Text>
        </SafeAreaView>

        <View style={styles.previewBottomBar}>
          <BlurView
            intensity={64}
            tint="light"
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
          />
          <TouchableOpacity
            style={[styles.previewActionButton, styles.retakeButton]}
            onPress={handleRetake}
            activeOpacity={0.8}
          >
            <Text style={styles.retakeButtonText}>Retake</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.previewActionButton, styles.usePhotoButton]}
            onPress={handleUsePhoto}
            activeOpacity={0.8}
          >
            <Text style={styles.usePhotoButtonText}>Use Photo</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Live Camera View
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Full-screen camera preview */}
      {isFocused && (
        <CameraView
          key={cameraKey}
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          enableTorch={isTorchEnabled}
          onCameraReady={() => {
            setCameraError(null);
            setCameraReady(true);
          }}
          onMountError={({ message }) => {
            console.error('Camera preview failed to start:', message);
            setCameraReady(false);
            setCameraError(message);
          }}
        />
      )}

      {cameraError && (
        <View style={styles.cameraError}>
          <Text style={styles.cameraErrorText}>
            Camera could not start: {cameraError}
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setCameraReady(false);
              setCameraError(null);
              setCameraKey((key) => key + 1);
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.retryButtonText}>Retry camera</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Top Bar: Cancel button (only in 'reference' mode) */}
      <SafeAreaView style={styles.topBar} edges={[]}>
        {isReferenceMode && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => navigation?.goBack?.()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[
            styles.flashlightButton,
            isTorchEnabled && styles.flashlightButtonEnabled,
          ]}
          onPress={() => setIsTorchEnabled((enabled) => !enabled)}
          disabled={!cameraReady || Boolean(cameraError)}
          accessibilityRole="button"
          accessibilityLabel={`Flashlight ${isTorchEnabled ? 'on' : 'off'}`}
          accessibilityState={{ checked: isTorchEnabled, disabled: !cameraReady }}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.flashlightText,
              isTorchEnabled && styles.flashlightTextEnabled,
            ]}
          >
            Flashlight {isTorchEnabled ? 'On' : 'Off'}
          </Text>
        </TouchableOpacity>
      </SafeAreaView>

      {/* Dismiss Mode: Instruction overlay */}
      {isDismissMode && (
        <View style={styles.instructionContainer}>
          <BlurView
            intensity={52}
            tint="light"
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.instructionText}>
            Take a photo matching the reference to dismiss
          </Text>
        </View>
      )}

      {/* Dismiss Mode: Small reference photo overlay thumbnail (80x80) */}
      {isDismissMode && referencePhotoUri && (
        <View style={styles.thumbnailContainer}>
          <Image
            source={{ uri: referencePhotoUri }}
            style={styles.thumbnailImage}
            resizeMode="cover"
          />
          <View style={styles.thumbnailTag}>
            <Text style={styles.thumbnailTagText}>Reference</Text>
          </View>
        </View>
      )}

      {/* Toast Overlay for match feedback */}
      {showToast && (
        <View style={styles.toastOverlay}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}

      {/* Processing Spinner Overlay */}
      {isProcessing && (
        <View style={styles.processingOverlay}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.processingText}>
            {isDismissMode ? 'Comparing photo...' : 'Processing...'}
          </Text>
        </View>
      )}

      {/* Bottom Bar with large circular capture button (white ring, 70px) */}
      <View style={styles.bottomBar}>
        <BlurView
          intensity={64}
          tint="light"
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />
        <TouchableOpacity
          style={styles.captureButtonOuter}
          onPress={handleCapture}
          disabled={isProcessing || !cameraReady}
          activeOpacity={0.7}
        >
          <View style={styles.captureButtonInner} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  camera: {
    flex: 1,
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: '#F7F7F9',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  permissionCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    borderRadius: 28,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#7A7A85',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 5,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 12,
    textAlign: 'center',
  },
  permissionMessage: {
    fontSize: 15,
    color: '#6B6B73',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  permissionButton: {
    width: '100%',
    backgroundColor: '#111111',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  permissionCancelButton: {
    marginTop: 14,
    paddingVertical: 8,
    alignItems: 'center',
  },
  permissionCancelText: {
    color: '#6B6B73',
    fontSize: 15,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingTop: StatusBar.currentHeight ? StatusBar.currentHeight + 8 : 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
  },
  cancelText: {
    color: '#111111',
    fontSize: 16,
    fontWeight: '600',
  },
  flashlightButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
  },
  flashlightButtonEnabled: {
    backgroundColor: '#111111',
  },
  flashlightText: {
    color: '#111111',
    fontSize: 15,
    fontWeight: '600',
  },
  flashlightTextEnabled: {
    color: '#FFFFFF',
  },
  instructionContainer: {
    position: 'absolute',
    top: StatusBar.currentHeight ? StatusBar.currentHeight + 80 : 90,
    left: 20,
    right: 20,
    zIndex: 9,
    backgroundColor: 'rgba(255, 255, 255, 0.68)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  instructionText: {
    color: '#111111',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  thumbnailContainer: {
    position: 'absolute',
    top: StatusBar.currentHeight ? StatusBar.currentHeight + 12 : 24,
    right: 20,
    width: 80,
    height: 80,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
    backgroundColor: '#F1F1F4',
    zIndex: 11,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 5,
    elevation: 8,
  },
  thumbnailImage: {
    width: 80,
    height: 80,
  },
  thumbnailTag: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.76)',
    paddingVertical: 2,
    alignItems: 'center',
  },
  thumbnailTagText: {
    color: '#111111',
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 130,
    backgroundColor: 'rgba(255, 255, 255, 0.52)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 20,
  },
  captureButtonOuter: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  captureButtonInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#111111',
  },
  toastOverlay: {
    position: 'absolute',
    bottom: 145,
    alignSelf: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.95)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    zIndex: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 8,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 30,
  },
  processingText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 14,
  },
  cameraError: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    backgroundColor: '#000000',
    zIndex: 25,
  },
  cameraErrorText: {
    color: '#FFFFFF',
    fontSize: 16,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 18,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
  },
  retryButtonText: {
    color: '#111111',
    fontSize: 15,
    fontWeight: '600',
  },
  previewHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: StatusBar.currentHeight ? StatusBar.currentHeight + 12 : 20,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.66)',
    paddingBottom: 14,
    zIndex: 10,
  },
  previewHeaderTitle: {
    color: '#111111',
    fontSize: 18,
    fontWeight: '700',
  },
  previewBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  previewActionButton: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retakeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(17, 17, 17, 0.12)',
  },
  retakeButtonText: {
    color: '#111111',
    fontSize: 16,
    fontWeight: '600',
  },
  usePhotoButton: {
    backgroundColor: '#111111',
  },
  usePhotoButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
