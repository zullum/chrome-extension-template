import { recordingStore } from '../stores/recordingStore';
import type { RecordingStatus } from '../types';

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
    __audioSources?: WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>;
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

// Helper function to send status updates
const sendStatusUpdate = (status: RecordingStatus, message?: string, audioUrl?: string) => {
  chrome.runtime.sendMessage({
    type: 'RECORDING_STATUS',
    status,
    message,
    audioUrl,
  });
};

export const captureAudio = async (
  durationMs: number,
  quality: AudioQualitySettings = DEFAULT_QUALITY,
  isStopRequest: boolean = false
): Promise<string | null> => {
  try {
    console.log('[Extension] captureAudio called with:', { durationMs, quality, isStopRequest });

    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) {
      console.error('[Extension] No active tab found');
      sendStatusUpdate('inactive', 'No active tab found');
      return null;
    }

    const url = activeTab.url;
    if (
      !url ||
      url.startsWith('chrome://') ||
      url.startsWith('edge://') ||
      url.startsWith('about:') ||
      url.startsWith('chrome-extension://') ||
      url === 'chrome://newtab/' ||
      url === 'about:blank'
    ) {
      console.error('[Extension] Cannot inject scripts into this type of page:', url);
      sendStatusUpdate('inactive', 'Cannot record audio on this page');
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

    console.log('[Extension] Starting recording setup');

    const result = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: (settings: AudioQualitySettings) => {
        return new Promise<string | null>(resolve => {
          try {
            console.log('[Page] Setting up audio recording');

            // Send initial status update
            chrome.runtime.sendMessage({
              type: 'RECORDING_STATUS',
              status: 'waiting',
              message: 'Waiting for audio...',
            });

            if (!window.__audioContext || window.__audioContext.state === 'closed') {
              window.__audioContext = new AudioContext({
                sampleRate: settings.sampleRate,
                latencyHint: 'interactive',
              });
            }

            // Store audio sources to prevent duplicate connections
            if (!window.__audioSources) {
              window.__audioSources = new WeakMap();
            }

            window.__recordingDestination = window.__audioContext.createMediaStreamDestination();
            const audioChunks: BlobPart[] = [];

            // Configure MediaRecorder with proper settings
            const recorder = new MediaRecorder(window.__recordingDestination.stream, {
              mimeType: 'audio/webm;codecs=opus',
              audioBitsPerSecond: 128000, // Standard audio quality
            });

            recorder.ondataavailable = (event: BlobEvent) => {
              console.log('[Page] Data available - chunk size:', event.data.size);
              if (event.data.size > 0) {
                audioChunks.push(event.data);
              }
            };

            recorder.onstop = () => {
              console.log('[Page] Recording stopped, processing audio chunks:', audioChunks.length);
              if (audioChunks.length > 0) {
                const audioBlob = new Blob(audioChunks, {
                  type: 'audio/webm;codecs=opus',
                });
                console.log('[Page] Created audio blob of size:', audioBlob.size);
                const audioUrl = URL.createObjectURL(audioBlob);
                chrome.runtime.sendMessage({
                  type: 'RECORDING_STATUS',
                  status: 'inactive',
                  audioUrl,
                });
              } else {
                chrome.runtime.sendMessage({
                  type: 'RECORDING_STATUS',
                  status: 'inactive',
                  message: 'No audio data recorded',
                });
              }
              window.__cleanupRecording?.();
              resolve(null);
            };

            const startRecording = () => {
              if (recorder.state === 'recording') return;
              console.log('[Page] Starting media recorder');
              recorder.start(1000);
              chrome.runtime.sendMessage(
                {
                  type: 'RECORDING_STATUS',
                  status: 'recording',
                  message: 'Recording in progress...',
                },
                response => {
                  console.log('[Page] Status update response:', response);
                }
              );
            };

            const createPassiveStream = (element: HTMLMediaElement) => {
              if (!window.__audioContext || !window.__recordingDestination) return;

              try {
                // Check if we already have a source for this element
                if (!window.__audioSources) {
                  window.__audioSources = new WeakMap();
                }
                let source = window.__audioSources.get(element);

                if (!source) {
                  // Create new source only if one doesn't exist
                  source = window.__audioContext.createMediaElementSource(element);
                  window.__audioSources.set(element, source);

                  // Connect source to destination for normal playback
                  source.connect(window.__audioContext.destination);
                }

                // Create a gain node for the recording branch
                const recordingGain = window.__audioContext.createGain();
                recordingGain.gain.value = 1.0;

                // Connect to recording destination
                source.connect(recordingGain);
                recordingGain.connect(window.__recordingDestination);

                console.log('[Page] Audio routing established');

                if (!element.paused && !element.ended && element.currentTime > 0) {
                  console.log('[Page] Audio is already playing, starting recording');
                  startRecording();
                }

                const playHandler = () => {
                  console.log('[Page] Audio started playing');
                  if (recorder.state !== 'recording') {
                    startRecording();
                  }
                };

                element.removeEventListener('play', playHandler);
                element.addEventListener('play', playHandler);
                element.removeEventListener('playing', playHandler);
                element.addEventListener('playing', playHandler);
              } catch (e) {
                console.warn('[Page] Error creating passive stream:', e);
                chrome.runtime.sendMessage({
                  type: 'RECORDING_STATUS',
                  status: 'inactive',
                  message: 'Failed to create audio stream',
                });
              }
            };

            window.__cleanupRecording = () => {
              try {
                if (window.__recordingDestination) {
                  window.__recordingDestination.disconnect();
                  delete window.__recordingDestination;
                }
                if (window.__mediaRecorder) {
                  delete window.__mediaRecorder;
                }
                // Don't close the AudioContext or remove sources as they might be needed for playback
              } catch (e) {
                console.warn('[Page] Error during cleanup:', e);
              }
            };

            window.__mediaRecorder = recorder;

            const mediaElements = [
              ...Array.from(document.getElementsByTagName('audio')),
              ...Array.from(document.getElementsByTagName('video')),
            ];

            console.log('[Page] Found media elements:', mediaElements.length);

            if (mediaElements.length === 0) {
              console.log('[Page] No media elements found, waiting for audio...');
              chrome.runtime.sendMessage({
                type: 'RECORDING_STATUS',
                status: 'waiting',
                message: 'Waiting for audio elements...',
              });
            } else {
              mediaElements.forEach(createPassiveStream);
            }

            const processedElements = new Set();

            const checkForNewMediaElements = setInterval(() => {
              const currentElements = [
                ...Array.from(document.getElementsByTagName('audio')),
                ...Array.from(document.getElementsByTagName('video')),
              ];
              currentElements.forEach(element => {
                if (!processedElements.has(element)) {
                  processedElements.add(element);
                  createPassiveStream(element);
                }
              });
            }, 1000);

            recorder.addEventListener('stop', () => {
              clearInterval(checkForNewMediaElements);
            });
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
    sendStatusUpdate('inactive', 'Recording failed');
    return null;
  }
};

export async function startRecording(stream: MediaStream, onDataAvailable: (data: Blob) => void) {
  const mediaRecorder = new MediaRecorder(stream);

  // Add state change listener to track recording status
  mediaRecorder.addEventListener('start', () => {
    // Update recording status when actual recording begins
    recordingStore.setStatus('recording');
  });

  mediaRecorder.addEventListener('dataavailable', event => {
    if (event.data.size > 0) {
      onDataAvailable(event.data);
    }
  });

  // Start recording
  mediaRecorder.start();

  return mediaRecorder;
}
