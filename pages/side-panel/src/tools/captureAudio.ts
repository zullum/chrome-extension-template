import type { RecordingStatus } from '../types';

// Add type declaration for messages
type RecordingMessage = {
  type: 'RECORDING_STATUS';
  status: RecordingStatus;
  message?: string;
};

// Add type declaration for the global function
declare global {
  interface Window {
    __stopRecording?: () => void;
    __isRecordingActive?: boolean;
    __audioContext?: AudioContext;
    __recordingDestination?: MediaStreamAudioDestinationNode;
    __updateRecordingStatus?: (status: RecordingStatus, message?: string) => void;
    __cleanupRecording?: () => void;
    __mediaRecorder?: MediaRecorder;
  }
}

export interface AudioQualitySettings {
  sampleRate: 44100 | 48000 | 96000;
  bitDepth: 16 | 24 | 32;
  channels: 1 | 2;
  vbrQuality: 0 | 1 | 2 | 3 | 4 | 5;
}

const DEFAULT_QUALITY: AudioQualitySettings = {
  sampleRate: 48000,
  bitDepth: 24,
  channels: 2,
  vbrQuality: 0,
};

export const captureAudio = async (
  durationMs: number,
  quality: AudioQualitySettings = DEFAULT_QUALITY,
  onStop: ((url: string | null) => void) | null = null,
  isStopRequest: boolean = false
): Promise<string | null> => {
  try {
    console.log('[Extension] captureAudio called with:', { durationMs, quality, isStopRequest });

    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) {
      console.error('[Extension] No active tab found');
      return null;
    }

    if (isStopRequest) {
      console.log('[Extension] Stopping recording');
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: () => {
          if (window.__mediaRecorder && window.__mediaRecorder.state === 'recording') {
            window.__mediaRecorder.stop();
          }
        },
      });
      return null;
    }

    const url = activeTab.url;
    if (
      !url ||
      url.startsWith('chrome://') ||
      url.startsWith('edge://') ||
      url.startsWith('about:')
    ) {
      console.error('[Extension] Cannot inject scripts into this type of page:', url);
      return null;
    }

    console.log('[Extension] Starting recording setup');

    const result = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: (settings: AudioQualitySettings) => {
        return new Promise<string | null>(resolve => {
          try {
            console.log('[Page] Setting up audio recording');

            // Initialize audio context
            if (!window.__audioContext || window.__audioContext.state === 'closed') {
              window.__audioContext = new AudioContext({
                sampleRate: settings.sampleRate,
                latencyHint: 'interactive',
              });
            }

            // Create recording destination
            window.__recordingDestination = window.__audioContext.createMediaStreamDestination();
            const audioChunks: BlobPart[] = [];
            let isAudioDetected = false;
            const audioSources: MediaStreamAudioSourceNode[] = [];

            // Create MediaRecorder
            const recorder = new MediaRecorder(window.__recordingDestination.stream, {
              mimeType: 'audio/webm;codecs=opus',
              audioBitsPerSecond: Math.floor(320000 * (1 - settings.vbrQuality * 0.15)),
            });

            // Handle data available
            recorder.ondataavailable = (event: BlobEvent) => {
              if (event.data.size > 0) {
                audioChunks.push(event.data);
              }
            };

            // Handle recording stop
            recorder.onstop = () => {
              console.log('[Page] Recording stopped, processing audio');
              if (audioChunks.length > 0) {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' });
                const audioUrl = URL.createObjectURL(audioBlob);
                chrome.runtime.sendMessage({
                  type: 'RECORDING_STATUS',
                  status: 'inactive',
                  message: 'Recording stopped',
                  audioUrl,
                });
              }
              window.__cleanupRecording?.();
              resolve(null);
            };

            // Function to start recording
            const startRecording = () => {
              if (recorder.state === 'recording') return;
              console.log('[Page] Starting media recorder');
              recorder.start(100);
              isAudioDetected = true;
              chrome.runtime.sendMessage({
                type: 'RECORDING_STATUS',
                status: 'recording',
                message: 'Recording in progress...',
              });
            };

            // Function to create audio stream
            const createPassiveStream = (element: HTMLMediaElement) => {
              if (!window.__audioContext || !window.__recordingDestination) return;

              try {
                // @ts-expect-error - captureStream is supported in modern browsers
                const stream = element.captureStream();
                const audioTracks = stream.getAudioTracks();

                if (audioTracks.length > 0) {
                  console.log('[Page] Audio tracks found');
                  const mediaStream = new MediaStream([audioTracks[0]]);
                  const source = window.__audioContext.createMediaStreamSource(mediaStream);
                  source.connect(window.__recordingDestination);
                  audioSources.push(source);

                  if (!element.paused && !element.ended && element.currentTime > 0) {
                    console.log('[Page] Audio is already playing, starting recording');
                    startRecording();
                  }

                  element.addEventListener('play', () => {
                    console.log('[Page] Audio started playing');
                    if (!isAudioDetected) {
                      startRecording();
                    }
                  });
                }
              } catch (e) {
                console.warn('[Page] Error creating passive stream:', e);
              }
            };

            // Set up cleanup
            window.__cleanupRecording = () => {
              audioSources.forEach(source => {
                try {
                  source.disconnect();
                } catch (e) {
                  console.warn('[Page] Error disconnecting source:', e);
                }
              });
              if (window.__recordingDestination) {
                window.__recordingDestination.disconnect();
                delete window.__recordingDestination;
              }
              if (window.__mediaRecorder) {
                delete window.__mediaRecorder;
              }
            };

            // Store recorder reference
            window.__mediaRecorder = recorder;

            // Connect existing media elements
            const mediaElements = [
              ...Array.from(document.getElementsByTagName('audio')),
              ...Array.from(document.getElementsByTagName('video')),
            ];

            mediaElements.forEach(createPassiveStream);

            if (!isAudioDetected) {
              console.log('[Page] No media playing, waiting for audio');
              chrome.runtime.sendMessage({
                type: 'RECORDING_STATUS',
                status: 'waiting',
                message: 'Waiting for audio input...',
              });
            }
          } catch (error) {
            console.error('[Page] Recording setup error:', error);
            chrome.runtime.sendMessage({
              type: 'RECORDING_STATUS',
              status: 'inactive',
              message: 'Recording setup failed',
            });
            resolve(null);
          }
        });
      },
      args: [quality],
    });

    return result[0]?.result || null;
  } catch (error) {
    console.error('[Extension] Error in captureAudio:', error);
    return null;
  }
};
