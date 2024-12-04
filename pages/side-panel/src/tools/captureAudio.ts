// Add type declaration for the global function
declare global {
  interface Window {
    __stopRecording?: () => void;
    __audioContext?: AudioContext;
    __mediaSource?: MediaElementAudioSourceNode;
    __isCleaningUp?: boolean;
    __connectedMediaElement?: HTMLMediaElement;
    __previousConnections?: WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>;
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

// Store recording state
let isRecording = false;
let recordingStartTime: number | null = null;

export const captureAudio = async (
  durationMs: number,
  quality: AudioQualitySettings = DEFAULT_QUALITY,
  onStop?: ((url: string | null) => void) | null,
  isStopRequest: boolean = false
): Promise<string | null> => {
  try {
    // Get active tab first
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) {
      console.error('[Extension] No active tab found');
      return null;
    }

    // If this is a stop request or we're already recording
    if (isStopRequest || isRecording) {
      console.log('[Extension] Stopping recording:', {
        isStopRequest,
        isRecording,
        duration: recordingStartTime ? (Date.now() - recordingStartTime) / 1000 : 0,
        timestamp: new Date().toISOString(),
      });

      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: () => {
          if (typeof window.__stopRecording === 'function') {
            window.__stopRecording();
            delete window.__stopRecording;
            return true;
          }
          return false;
        },
      });

      isRecording = false;
      recordingStartTime = null;
      return null;
    }

    // Check if we can inject into this URL
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

    console.log('[Extension] Starting recording:', {
      tabId: activeTab.id,
      url: activeTab.url,
      timestamp: new Date().toISOString(),
      quality: {
        sampleRate: quality.sampleRate,
        bitDepth: quality.bitDepth,
        channels: quality.channels,
      },
    });

    // Start the actual recording
    const result = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: (settings: AudioQualitySettings) => {
        return new Promise<string | null>(resolve => {
          try {
            console.log('[Page] Starting audio capture with settings:', {
              settings,
            });

            // Find all media elements
            const mediaElements = [
              ...Array.from(document.getElementsByTagName('audio')),
              ...Array.from(document.getElementsByTagName('video')),
            ];

            if (mediaElements.length === 0) {
              console.log('[Page] No media elements found');
              resolve(null);
              return;
            }

            // Try to find any playing media first
            let sourceMedia = mediaElements.find(
              element => !element.paused && !element.ended && element.currentTime > 0
            );

            if (!sourceMedia) {
              sourceMedia = mediaElements[0];
            }

            // Create a new audio element for recording
            const recordingMedia = document.createElement('audio');
            // Use MediaStream to capture the audio
            const audioStream = sourceMedia.captureStream();
            recordingMedia.srcObject = audioStream;
            recordingMedia.muted = true; // Prevent double playback

            const audioContext = new AudioContext({
              sampleRate: settings.sampleRate,
              latencyHint: 'interactive',
            });

            const mediaSource = audioContext.createMediaStreamSource(audioStream);
            const destination = audioContext.createMediaStreamDestination();

            mediaSource.connect(destination);

            const audioChunks: BlobPart[] = [];
            const mediaRecorder = new MediaRecorder(destination.stream, {
              mimeType: 'audio/webm;codecs=opus',
              audioBitsPerSecond: Math.floor(320000 * (1 - settings.vbrQuality * 0.15)),
            });

            let isCleanedUp = false;
            // Clean up function
            const cleanup = () => {
              if (isCleanedUp) return;
              isCleanedUp = true;

              try {
                mediaSource.disconnect();
                audioStream.getTracks().forEach(track => track.stop());
                recordingMedia.pause();
                recordingMedia.remove();
                // Only close AudioContext after a short delay to ensure all operations are complete
                setTimeout(() => {
                  try {
                    audioContext.close();
                  } catch (e) {
                    console.warn('[Page] Error closing AudioContext:', e);
                  }
                }, 100);
              } catch (e) {
                console.warn('[Page] Cleanup error:', e);
              }
            };

            mediaRecorder.ondataavailable = event => {
              if (event.data.size > 0) {
                audioChunks.push(event.data);
              }
            };

            mediaRecorder.onstop = () => {
              if (audioChunks.length === 0) {
                cleanup();
                resolve(null);
                return;
              }

              const audioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' });
              const audioUrl = URL.createObjectURL(audioBlob);
              resolve(audioUrl);
              cleanup();
            };

            window.__stopRecording = () => {
              if (mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
              }
            };

            // Start recording immediately
            mediaRecorder.start(100);
            console.log('[Page] Recording started');
          } catch (error) {
            console.error('[Page] Recording setup error:', error);
            resolve(null);
          }
        });
      },
      args: [quality],
    });

    const recordingUrl = result[0]?.result;
    if (recordingUrl) {
      isRecording = true;
      recordingStartTime = Date.now();
    }
    return recordingUrl || null;
  } catch (error) {
    console.error('[Extension] Error in captureAudio:', error);
    isRecording = false;
    recordingStartTime = null;
    return null;
  }
};
