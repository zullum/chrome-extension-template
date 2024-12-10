import '@src/SidePanel.css';
import { useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';
import { Download, Moon, Play, Settings, Sun, Square, Mic, Loader } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import { captureAudio } from './tools/captureAudio';
import type { RecordingStatus } from './types';

type QualityPreset = keyof typeof QUALITY_PRESETS;

const QUALITY_PRESETS = {
  low: {
    sampleRate: 44100,
    bitDepth: 16,
    channels: 2,
    vbrQuality: 4,
  },
  medium: {
    sampleRate: 48000,
    bitDepth: 24,
    channels: 2,
    vbrQuality: 2,
  },
  high: {
    sampleRate: 96000,
    bitDepth: 32,
    channels: 2,
    vbrQuality: 0,
  },
} as const;

const StatusIndicator = ({ status }: { status: RecordingStatus }) => {
  const getStatusDetails = () => {
    switch (status) {
      case 'recording':
        return {
          icon: <Mic className="size-4 animate-pulse text-red-500" />,
          text: 'Recording in progress',
          className: 'text-red-500',
        };
      case 'waiting':
        return {
          icon: <Loader className="size-4 animate-spin text-yellow-500" />,
          text: 'Waiting for audio',
          className: 'text-yellow-500',
        };
      default:
        return {
          icon: <Mic className="size-4 text-gray-500" />,
          text: 'Ready to record',
          className: 'text-gray-500',
        };
    }
  };

  const details = getStatusDetails();

  return (
    <div
      className={`flex items-center gap-2 rounded-full bg-opacity-10 px-3 py-1 ${details.className}`}
    >
      {details.icon}
      <span className="text-sm font-medium">{details.text}</span>
    </div>
  );
};

const SidePanel = () => {
  // Theme state
  useEffect(() => {
    const currentTheme = exampleThemeStorage.get();
    if (!currentTheme) {
      exampleThemeStorage.set('dark');
    }
  }, []);

  const theme = useStorage(exampleThemeStorage);
  const isLight = theme === 'light';

  // Recording state
  const [status, setStatus] = useState<RecordingStatus>('inactive');
  const [error, setError] = useState<string | null>(null);
  const [recordings, setRecordings] = useState<Array<{ url: string; timestamp: number }>>([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState<QualityPreset>('high');

  // Reset recording state
  const resetRecording = useCallback(() => {
    setStatus('inactive');
    setError(null);
    setElapsedTime(0);
  }, []);

  // Set up message listener for status updates
  useEffect(() => {
    const messageListener = (
      message: {
        type: string;
        status: RecordingStatus;
        message?: string;
        audioUrl?: string;
      },
      sender: chrome.runtime.MessageSender,
      sendResponse: (response: any) => void
    ) => {
      console.log('[UI] Received message:', message);

      if (message.type === 'RECORDING_STATUS') {
        console.log('[UI] Received status update:', message.status);

        // Update status
        setStatus(message.status);

        // Handle specific status cases
        switch (message.status) {
          case 'recording':
            console.log('[UI] Recording started');
            setError(null);
            break;
          case 'inactive':
            if (message.audioUrl) {
              console.log('[UI] Recording completed, saving URL:', message.audioUrl);
              setRecordings(prev => [...prev, { url: message.audioUrl!, timestamp: Date.now() }]);
            }
            if (message.message) {
              setError(message.message);
            }
            break;
          case 'waiting':
            console.log('[UI] Waiting for audio');
            setError(message.message || null);
            break;
        }

        // Send response to acknowledge receipt
        sendResponse({ received: true });
      }

      // Return true to indicate we'll send response asynchronously
      return true;
    };

    // Listen for messages from both the content script and the background script
    chrome.runtime.onMessage.addListener(messageListener);

    // Cleanup
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  // Timer effect
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    if (status === 'recording') {
      const startTime = Date.now();
      interval = setInterval(() => {
        setElapsedTime(Date.now() - startTime);
      }, 100);
      console.log('[UI] Started recording timer');
    } else {
      setElapsedTime(0);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [status]);

  const handleCaptureAudio = async () => {
    console.log('[UI] handleCaptureAudio called, current status:', status);

    try {
      // Handle stop recording
      if (status === 'recording') {
        console.log('[UI] Stopping recording');
        try {
          await captureAudio(0, QUALITY_PRESETS[selectedQuality], null, true);
        } catch (err) {
          console.error('[UI] Error stopping recording:', err);
          setError('Failed to stop recording');
          resetRecording();
        }
        return;
      }

      // Start new recording
      console.log('[UI] Starting new recording');
      setError(null);
      setStatus('waiting');

      try {
        await captureAudio(0, QUALITY_PRESETS[selectedQuality], null, false);
      } catch (err) {
        console.error('[UI] Error starting recording:', err);
        setError('Failed to start recording');
        resetRecording();
      }
    } catch (err) {
      console.error('[UI] Error in handleCaptureAudio:', err);
      setError('Failed to capture audio');
      resetRecording();
    }
  };

  const handleDownload = (url: string, index: number) => {
    const a = document.createElement('a');
    a.href = url;
    const extension = url.includes('audio/wav')
      ? 'wav'
      : url.includes('audio/mp3') || url.includes('audio/mpeg')
        ? 'mp3'
        : url.includes('audio/aac')
          ? 'm4a'
          : 'webm';

    const quality = selectedQuality.toUpperCase();
    const timestamp = new Date(recordings[index].timestamp)
      .toISOString()
      .slice(0, 19)
      .replace(/[^0-9]/g, '-');
    a.download = `recording-${timestamp}-${quality}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`App ${isLight ? 'bg-slate-50' : 'bg-gray-800'}`}>
      <button
        onClick={exampleThemeStorage.toggle}
        className="absolute right-4 top-4 rounded-full p-2 transition-colors hover:bg-gray-500/10"
        title={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      >
        {isLight ? (
          <Moon className="size-5 text-gray-800" />
        ) : (
          <Sun className="size-5 text-gray-200" />
        )}
      </button>

      <button
        onClick={() => setShowSettings(!showSettings)}
        className="absolute right-16 top-4 rounded-full p-2 transition-colors hover:bg-gray-500/10"
        title="Quality Settings"
      >
        <Settings className={`size-5 ${isLight ? 'text-gray-800' : 'text-gray-200'}`} />
      </button>

      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
        {/* Status Indicator */}
        <StatusIndicator status={status} />

        {showSettings && (
          <div
            className={`w-full max-w-md rounded-lg border p-4 ${
              isLight ? 'border-gray-200 bg-white' : 'border-gray-700 bg-gray-900'
            }`}
          >
            <h3 className={`mb-3 font-bold ${isLight ? 'text-gray-900' : 'text-gray-100'}`}>
              Quality Settings
            </h3>
            <div className="flex flex-col gap-2">
              <label
                htmlFor="quality-preset"
                className={`text-sm ${isLight ? 'text-gray-600' : 'text-gray-400'}`}
              >
                Quality Preset
              </label>
              <select
                id="quality-preset"
                value={selectedQuality}
                onChange={e => setSelectedQuality(e.target.value as QualityPreset)}
                className={`rounded border px-3 py-2 ${
                  isLight
                    ? 'border-gray-300 bg-white text-gray-900'
                    : 'border-gray-600 bg-gray-800 text-gray-100'
                }`}
              >
                <option value="low">Low (44.1kHz, 16-bit)</option>
                <option value="medium">Medium (48kHz, 24-bit)</option>
                <option value="high">High (96kHz, 32-bit)</option>
              </select>
            </div>
          </div>
        )}

        <div className="flex w-full max-w-md flex-col gap-4">
          <div className="flex gap-2">
            <button
              onClick={handleCaptureAudio}
              className={`flex flex-1 items-center justify-center gap-2 rounded px-6 py-2 font-bold shadow transition-all ${
                status === 'recording'
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : status === 'waiting'
                    ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                    : 'bg-purple-500 text-white hover:bg-purple-600'
              }`}
            >
              {status === 'recording' ? (
                <>
                  <Square className="size-4" />
                  Stop Recording ({formatTime(elapsedTime)})
                </>
              ) : status === 'waiting' ? (
                <>
                  <Loader className="size-4 animate-spin" />
                  Waiting for audio...
                </>
              ) : (
                <>
                  <Play className="size-4" />
                  Start Recording
                </>
              )}
            </button>
          </div>

          {/* Recordings List */}
          {recordings.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className={`text-sm font-medium ${isLight ? 'text-gray-900' : 'text-gray-100'}`}>
                Recordings
              </h4>
              {recordings.map((recording, index) => (
                <button
                  key={recording.timestamp}
                  onClick={() => handleDownload(recording.url, index)}
                  className={`flex items-center justify-between gap-2 rounded px-4 py-2 text-sm shadow transition-all hover:scale-105 ${
                    isLight
                      ? 'bg-green-500 text-white hover:bg-green-600'
                      : 'bg-green-400 text-white hover:bg-green-500'
                  }`}
                >
                  <span>Recording {recordings.length - index}</span>
                  <Download className="size-4" />
                </button>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-100 px-4 py-2 text-sm text-red-600">{error}</div>
        )}
      </div>
    </div>
  );
};

export default withErrorBoundary(
  withSuspense(SidePanel, <div> Loading ... </div>),
  <div> Error Occur </div>
);
