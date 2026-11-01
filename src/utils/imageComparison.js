import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Compare two images and return a similarity score (0-1).
 * Uses color histogram comparison on downscaled images.
 *
 * @param {string} referenceUri - URI of the reference image
 * @param {string} capturedUri - URI of the captured image
 * @returns {Promise<{match: boolean, score: number}>}
 */
export async function compareImages(referenceUri, capturedUri) {
  // Strategy:
  // 1. Downscale both images to tiny size (16x16) using ImageManipulator
  // 2. Read both as base64
  // 3. Compare the base64 data using a normalized byte-level comparison
  // A real app would use TensorFlow Lite or a cloud vision API

  const THUMBNAIL_SIZE = 16;
  const MATCH_THRESHOLD = 0.55; // Fairly lenient - same general scene/object should pass

  if (!referenceUri || !capturedUri) {
    return { match: false, score: 0 };
  }

  try {
    const saveFormat =
      ImageManipulator.SaveFormat?.JPEG ||
      ImageManipulator.SaveFormat?.jpeg ||
      'jpeg';

    // Resize both to tiny thumbnails for comparison
    const [refResult, capResult] = await Promise.all([
      ImageManipulator.manipulateAsync(
        referenceUri,
        [{ resize: { width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE } }],
        { base64: true, format: saveFormat, compress: 0.5 }
      ),
      ImageManipulator.manipulateAsync(
        capturedUri,
        [{ resize: { width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE } }],
        { base64: true, format: saveFormat, compress: 0.5 }
      ),
    ]);

    let refBase64 = refResult?.base64;
    let capBase64 = capResult?.base64;

    // Fallback: read file directly via FileSystem if base64 is missing
    if (!refBase64 && refResult?.uri && FileSystem?.readAsStringAsync) {
      try {
        refBase64 = await FileSystem.readAsStringAsync(refResult.uri, {
          encoding: FileSystem.EncodingType?.Base64 || 'base64',
        });
      } catch (fsErr) {
        console.warn('Could not read refResult via FileSystem:', fsErr);
      }
    }

    if (!capBase64 && capResult?.uri && FileSystem?.readAsStringAsync) {
      try {
        capBase64 = await FileSystem.readAsStringAsync(capResult.uri, {
          encoding: FileSystem.EncodingType?.Base64 || 'base64',
        });
      } catch (fsErr) {
        console.warn('Could not read capResult via FileSystem:', fsErr);
      }
    }

    const refBytes = base64ToBytes(refBase64);
    const capBytes = base64ToBytes(capBase64);

    if (refBytes.length === 0 || capBytes.length === 0) {
      // If unable to extract bytes, be lenient and allow alarm dismissal
      return { match: true, score: 1.0 };
    }

    // Compare using multiple strategies and average
    const histogramScore = compareHistograms(refBytes, capBytes);
    const structuralScore = compareStructural(refBytes, capBytes);
    const score = histogramScore * 0.6 + structuralScore * 0.4;

    return {
      match: score >= MATCH_THRESHOLD,
      score: Math.round(score * 100) / 100,
    };
  } catch (error) {
    console.error('Image comparison failed:', error);
    // On error, be lenient and allow dismissal
    return { match: true, score: 1.0 };
  }
}

/**
 * Convert base64 string to a Uint8Array byte array.
 * Pure JavaScript manual decode implementation that works reliably across
 * all React Native JS engines without requiring atob, window, or Buffer.
 *
 * @param {string} base64 - Base64 encoded string
 * @returns {Uint8Array}
 */
export function base64ToBytes(base64) {
  if (!base64 || typeof base64 !== 'string') {
    return new Uint8Array(0);
  }

  // Strip optional data URI scheme prefix (e.g., "data:image/jpeg;base64,")
  const commaIdx = base64.indexOf(',');
  const rawBase64 = (commaIdx !== -1 ? base64.slice(commaIdx + 1) : base64)
    .replace(/[^A-Za-z0-9+/=]/g, '');

  const len = rawBase64.length;
  if (len === 0) {
    return new Uint8Array(0);
  }

  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
  }

  let padding = 0;
  if (rawBase64.charAt(len - 1) === '=') padding++;
  if (rawBase64.charAt(len - 2) === '=') padding++;

  const byteLength = Math.max(0, Math.floor((len * 3) / 4) - padding);
  const bytes = new Uint8Array(byteLength);

  let byteIdx = 0;
  for (let i = 0; i < len && byteIdx < byteLength; i += 4) {
    const b0 = lookup[rawBase64.charCodeAt(i)];
    const b1 = lookup[rawBase64.charCodeAt(i + 1)];
    const b2 = lookup[rawBase64.charCodeAt(i + 2)];
    const b3 = lookup[rawBase64.charCodeAt(i + 3)];

    bytes[byteIdx++] = (b0 << 2) | (b1 >> 4);
    if (byteIdx < byteLength) {
      bytes[byteIdx++] = ((b1 & 0x0f) << 4) | (b2 >> 2);
    }
    if (byteIdx < byteLength) {
      bytes[byteIdx++] = ((b2 & 0x03) << 6) | b3;
    }
  }

  return bytes;
}

/**
 * Build color histogram (simplified RGB buckets) and compare using cosine similarity.
 * Uses 8 buckets per channel across 3 interleaved channels (24 total bins).
 *
 * @param {Uint8Array} bytes1
 * @param {Uint8Array} bytes2
 * @returns {number} Normalized similarity between 0.0 and 1.0
 */
export function compareHistograms(bytes1, bytes2) {
  if (!bytes1 || !bytes2 || bytes1.length === 0 || bytes2.length === 0) {
    return 0;
  }

  const BUCKETS_PER_CHANNEL = 8;
  const CHANNELS = 3; // Simulated R, G, B channels
  const TOTAL_BINS = BUCKETS_PER_CHANNEL * CHANNELS; // 24 bins
  const BIN_SIZE = 256 / BUCKETS_PER_CHANNEL; // 32 values per bucket

  const hist1 = new Float64Array(TOTAL_BINS);
  const hist2 = new Float64Array(TOTAL_BINS);

  for (let i = 0; i < bytes1.length; i++) {
    const channel = i % CHANNELS;
    const bucket = Math.min(BUCKETS_PER_CHANNEL - 1, Math.floor(bytes1[i] / BIN_SIZE));
    hist1[channel * BUCKETS_PER_CHANNEL + bucket]++;
  }

  for (let i = 0; i < bytes2.length; i++) {
    const channel = i % CHANNELS;
    const bucket = Math.min(BUCKETS_PER_CHANNEL - 1, Math.floor(bytes2[i] / BIN_SIZE));
    hist2[channel * BUCKETS_PER_CHANNEL + bucket]++;
  }

  // Calculate cosine similarity: dot(h1, h2) / (norm(h1) * norm(h2))
  let dotProduct = 0;
  let sumSq1 = 0;
  let sumSq2 = 0;

  for (let i = 0; i < TOTAL_BINS; i++) {
    dotProduct += hist1[i] * hist2[i];
    sumSq1 += hist1[i] * hist1[i];
    sumSq2 += hist2[i] * hist2[i];
  }

  const norm1 = Math.sqrt(sumSq1);
  const norm2 = Math.sqrt(sumSq2);

  if (norm1 === 0 || norm2 === 0) {
    return norm1 === norm2 ? 1.0 : 0.0;
  }

  const similarity = dotProduct / (norm1 * norm2);
  return Math.max(0, Math.min(1, similarity));
}

/**
 * Structural comparison - compare corresponding byte positions.
 * Compares each byte pair and calculates normalized absolute difference.
 *
 * @param {Uint8Array} bytes1
 * @param {Uint8Array} bytes2
 * @returns {number} Structural similarity score between 0.0 and 1.0
 */
export function compareStructural(bytes1, bytes2) {
  if (!bytes1 || !bytes2 || bytes1.length === 0 || bytes2.length === 0) {
    return 0;
  }

  const len1 = bytes1.length;
  const len2 = bytes2.length;
  const minLen = Math.min(len1, len2);
  const maxLen = Math.max(len1, len2);

  if (maxLen === 0) {
    return 1.0;
  }

  let totalDiff = 0;
  for (let i = 0; i < minLen; i++) {
    totalDiff += Math.abs(bytes1[i] - bytes2[i]) / 255;
  }

  // Account for byte pairs that exist only in the longer array
  // Mild penalty (0.5 weight) for length discrepancy
  const lengthPenalty = (maxLen - minLen) * 0.5;
  const avgDiff = (totalDiff + lengthPenalty) / maxLen;
  const similarity = 1 - avgDiff;

  return Math.max(0, Math.min(1, similarity));
}

export default compareImages;
