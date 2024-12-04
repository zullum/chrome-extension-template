export interface AudioQualitySettings {
  sampleRate: 44100 | 48000 | 96000;
  bitDepth: 16 | 24 | 32;
  channels: 1 | 2;
  vbrQuality: 0 | 1 | 2 | 3 | 4 | 5; // 0 = highest quality, 5 = lowest
}

const DEFAULT_QUALITY: AudioQualitySettings = {
  sampleRate: 48000,
  bitDepth: 24,
  channels: 2,
  vbrQuality: 0,
};

export const captureAudio = async (
  durationMs: number,
  quality: AudioQualitySettings = DEFAULT_QUALITY
): Promise<string | null> => {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!activeTab?.id) {
      console.error('No active tab found');
      return null;
    }

    // Inject and execute the audio capture script
    const result = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: (duration: number, settings: AudioQualitySettings) => {
        return new Promise<string | null>(resolve => {
          // Find all audio and video elements
          const mediaElements = [
            ...Array.from(document.getElementsByTagName('audio')),
            ...Array.from(document.getElementsByTagName('video')),
          ];

          if (mediaElements.length === 0) {
            resolve(null);
            return;
          }

          // Find the first playing media element
          const playingMedia = mediaElements.find(
            element => !element.paused && !element.ended && element.currentTime > 0
          );

          if (!playingMedia) {
            resolve(null);
            return;
          }

          // Create a MediaRecorder to capture the audio
          const audioContext = new AudioContext({
            sampleRate: settings.sampleRate,
            latencyHint: 'interactive',
          });

          const mediaSource = audioContext.createMediaElementSource(playingMedia);
          const destination = audioContext.createMediaStreamDestination();

          // Add advanced audio processing chain
          const gainNode = audioContext.createGain();
          const compressor = audioContext.createDynamicsCompressor();
          const analyser = audioContext.createAnalyser();
          const biquadFilter = audioContext.createBiquadFilter();

          // Configure compressor for better audio quality
          compressor.threshold.value = -50;
          compressor.knee.value = 40;
          compressor.ratio.value = 12;
          compressor.attack.value = 0;
          compressor.release.value = 0.25;

          // Configure biquad filter for noise reduction
          biquadFilter.type = 'lowpass';
          biquadFilter.frequency.value = 20000;
          biquadFilter.Q.value = 1;

          // Configure analyser for real-time analysis
          analyser.fftSize = 2048;
          analyser.smoothingTimeConstant = 0.8;

          // Connect the advanced audio processing chain
          mediaSource.connect(gainNode);
          gainNode.connect(compressor);
          compressor.connect(biquadFilter);
          biquadFilter.connect(analyser);
          analyser.connect(destination);
          analyser.connect(audioContext.destination);

          // Try to use the highest quality available codec with VBR support
          const mimeTypes = [
            'audio/mp3;codecs=mp3',
            'audio/mpeg',
            'audio/webm;codecs=opus',
            'audio/aac',
            'audio/wav',
          ];

          const selectedMimeType =
            mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'audio/webm;codecs=opus';

          // Calculate optimal bitrate based on quality settings
          const baseBitrate = 320000; // 320kbps base
          const qualityMultiplier = 1 - settings.vbrQuality * 0.15; // 0 = 100%, 5 = 25%
          const calculatedBitrate = Math.floor(baseBitrate * qualityMultiplier);

          const mediaRecorder = new MediaRecorder(destination.stream, {
            mimeType: selectedMimeType,
            audioBitsPerSecond: calculatedBitrate,
          });

          const audioChunks: BlobPart[] = [];

          mediaRecorder.ondataavailable = event => {
            if (event.data.size > 0) {
              audioChunks.push(event.data);
            }
          };

          mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: selectedMimeType });

            // If we're not already in MP3 format and MP3 conversion is needed
            if (!selectedMimeType.includes('mp3') && !selectedMimeType.includes('mpeg')) {
              try {
                // Convert to MP3 using audio context
                const arrayBuffer = await audioBlob.arrayBuffer();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

                // Create an offline context for processing
                const offlineCtx = new OfflineAudioContext(
                  settings.channels,
                  audioBuffer.length,
                  settings.sampleRate
                );

                const source = offlineCtx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(offlineCtx.destination);
                source.start();

                const renderedBuffer = await offlineCtx.startRendering();

                // Convert to WAV format with specified bit depth
                const wavBlob = new Blob([exportWAV(renderedBuffer, settings)], {
                  type: 'audio/wav',
                });
                const audioUrl = URL.createObjectURL(wavBlob);
                resolve(audioUrl);
              } catch (error) {
                console.error('Error converting audio:', error);
                // Fallback to original format if conversion fails
                const fallbackUrl = URL.createObjectURL(audioBlob);
                resolve(fallbackUrl);
              }
            } else {
              // If we already have MP3/MPEG format, use it directly
              const audioUrl = URL.createObjectURL(audioBlob);
              resolve(audioUrl);
            }
          };

          // Record for the specified duration
          mediaRecorder.start(100); // Request data every 100ms for smoother progress updates

          setTimeout(() => {
            mediaRecorder.stop();
          }, duration);
        });
      },
      args: [durationMs, quality],
    });

    return result[0]?.result || null;
  } catch (error) {
    console.error('Error capturing audio:', error);
    return null;
  }
};

// Helper function to convert AudioBuffer to WAV format with quality settings
function exportWAV(audioBuffer: AudioBuffer, settings: AudioQualitySettings): Blob {
  const interleaved = interleaveChannels(audioBuffer);
  const dataView = encodeWAV(interleaved, settings);
  return new Blob([dataView], { type: 'audio/wav' });
}

function interleaveChannels(audioBuffer: AudioBuffer): Float32Array {
  const channels = [];
  for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
    channels.push(audioBuffer.getChannelData(i));
  }

  const length = audioBuffer.length * audioBuffer.numberOfChannels;
  const result = new Float32Array(length);
  let index = 0;
  let inputIndex = 0;

  while (index < length) {
    for (let i = 0; i < channels.length; i++) {
      result[index++] = channels[i][inputIndex];
    }
    inputIndex++;
  }

  return result;
}

function encodeWAV(samples: Float32Array, settings: AudioQualitySettings): DataView {
  const bytesPerSample = settings.bitDepth / 8;
  const blockAlign = settings.channels * bytesPerSample;

  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, settings.channels, true);
  view.setUint32(24, settings.sampleRate, true);
  view.setUint32(28, settings.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, settings.bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * bytesPerSample, true);

  if (settings.bitDepth === 32) {
    floatTo32BitPCM(view, 44, samples);
  } else if (settings.bitDepth === 24) {
    floatTo24BitPCM(view, 44, samples);
  } else {
    floatTo16BitPCM(view, 44, samples);
  }

  return view;
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array): void {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
}

function floatTo24BitPCM(output: DataView, offset: number, input: Float32Array): void {
  for (let i = 0; i < input.length; i++, offset += 3) {
    const s = Math.max(-1, Math.min(1, input[i]));
    const val = s < 0 ? s * 0x800000 : s * 0x7fffff;
    output.setUint8(offset, val & 0xff);
    output.setUint8(offset + 1, (val >> 8) & 0xff);
    output.setUint8(offset + 2, (val >> 16) & 0xff);
  }
}

function floatTo32BitPCM(output: DataView, offset: number, input: Float32Array): void {
  for (let i = 0; i < input.length; i++, offset += 4) {
    output.setFloat32(offset, input[i], true);
  }
}
