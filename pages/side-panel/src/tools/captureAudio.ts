// Add type declaration for the global function
declare global {
  interface Window {
    __stopRecording?: () => void;
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
      console.log('[Extension] Stopping existing recording', {
        duration: recordingStartTime ? (Date.now() - recordingStartTime) / 1000 : 0,
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

    console.log('[Extension] Starting new recording:', {
      tabId: activeTab.id,
      url: activeTab.url,
      timestamp: new Date().toISOString(),
    });

    // Start the actual recording
    const result = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: (settings: AudioQualitySettings) => {
        return new Promise<string | null>(resolve => {
          console.log('[Page] Starting audio capture with settings:', {
            settings,
            timestamp: new Date().toISOString(),
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
          let playingMedia = mediaElements.find(
            element => !element.paused && !element.ended && element.currentTime > 0
          );

          if (!playingMedia) {
            playingMedia = mediaElements[0];
          }

          try {
            const audioContext = new AudioContext({
              sampleRate: settings.sampleRate,
              latencyHint: 'interactive',
            });

            const mediaSource = audioContext.createMediaElementSource(playingMedia);
            const destination = audioContext.createMediaStreamDestination();

            mediaSource.connect(destination);
            mediaSource.connect(audioContext.destination);

            const audioChunks: BlobPart[] = [];
            const mediaRecorder = new MediaRecorder(destination.stream, {
              mimeType: 'audio/webm;codecs=opus',
              audioBitsPerSecond: Math.floor(320000 * (1 - settings.vbrQuality * 0.15)),
            });

            mediaRecorder.ondataavailable = event => {
              if (event.data.size > 0) {
                audioChunks.push(event.data);
              }
            };

            mediaRecorder.onstop = () => {
              if (audioChunks.length === 0) {
                resolve(null);
                return;
              }

              const audioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' });
              const audioUrl = URL.createObjectURL(audioBlob);

              resolve(audioUrl);
            };

            window.__stopRecording = () => {
              if (mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
                mediaSource.disconnect();
                destination.disconnect();
                audioContext.close();
              }
            };

            mediaRecorder.start(100);
          } catch (error) {
            console.error('[Page] Error during recording setup:', error);
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
