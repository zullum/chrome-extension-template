import '@src/SidePanel.css';
import { withErrorBoundary, withSuspense } from '@extension/shared';
import { Download, Play, Settings, Square, Mic, Loader, X, Check, Info } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import { captureAudio } from './tools/captureAudio';
import type { RecordingStatus } from './types';
import { ThemeProvider } from './theme/ThemeContext';
import { ThemeToggle } from './theme/ThemeToggle';
import AudioPlayer, { RHAP_UI } from 'react-h5-audio-player';
import 'react-h5-audio-player/lib/styles.css';

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
      className={`flex items-center gap-2 rounded-full bg-black/10 px-3 py-1 ${details.className}`}
    >
      {details.icon}
      <span className="text-sm font-medium">{details.text}</span>
    </div>
  );
};

const QualitySettings = ({
  selectedQuality,
  setSelectedQuality,
  onClose,
}: {
  selectedQuality: QualityPreset;
  setSelectedQuality: (quality: QualityPreset) => void;
  onClose: () => void;
}) => {
  const getQualityDetails = (quality: QualityPreset) => {
    const preset = QUALITY_PRESETS[quality];
    return {
      name: quality.charAt(0).toUpperCase() + quality.slice(1),
      specs: `${preset.sampleRate / 1000}kHz · ${preset.bitDepth}-bit · ${preset.channels}ch · 128kbps`,
      description:
        quality === 'low'
          ? 'Good for voice recordings'
          : quality === 'medium'
            ? 'Balanced quality for most uses'
            : 'Best quality for music',
    };
  };

  return (
    <div className="relative w-full max-w-md rounded-lg border border-gray-200 bg-white p-4 shadow-lg dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-bold text-gray-900 dark:text-gray-100">Recording Quality</h3>
        <button
          onClick={onClose}
          className="rounded-full p-1 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
          title="Close settings"
        >
          <X className="size-4 text-gray-500" />
        </button>
      </div>
      <div className="flex flex-col gap-3">
        {Object.keys(QUALITY_PRESETS).map(quality => {
          const details = getQualityDetails(quality as QualityPreset);
          const isSelected = selectedQuality === quality;
          return (
            <button
              key={quality}
              onClick={() => setSelectedQuality(quality as QualityPreset)}
              className={`group flex flex-col rounded-lg border p-3 text-left transition-all ${
                isSelected
                  ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-500/10'
                  : 'border-gray-200 hover:border-indigo-200 hover:bg-indigo-50/50 dark:border-gray-700 dark:hover:border-indigo-700 dark:hover:bg-indigo-500/5'
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`flex size-5 items-center justify-center rounded-full border transition-colors ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-500 dark:border-indigo-400 dark:bg-indigo-400'
                      : 'border-gray-300 group-hover:border-indigo-300 dark:border-gray-600 dark:group-hover:border-indigo-600'
                  }`}
                >
                  {isSelected && <Check className="size-3 text-white" />}
                </div>
                <span
                  className={`font-medium ${
                    isSelected
                      ? 'text-indigo-700 dark:text-indigo-300'
                      : 'text-gray-900 dark:text-gray-100'
                  }`}
                >
                  {details.name}
                </span>
              </div>
              <span
                className={`mt-2 text-xs font-medium ${
                  isSelected
                    ? 'text-indigo-600 dark:text-indigo-300'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {details.specs}
              </span>
              <span
                className={`mt-1 text-xs ${
                  isSelected
                    ? 'text-indigo-500 dark:text-indigo-300'
                    : 'text-gray-500 dark:text-gray-500'
                }`}
              >
                {details.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

const customPlayerStyles = `
  .rhap_container {
    background-color: transparent !important;
    box-shadow: none !important;
    padding: 8px 0 !important;
  }

  .rhap_time {
    color: rgb(109 40 217) !important;
    font-weight: 500 !important;
  }

  .dark .rhap_time {
    color: rgb(216 180 254) !important;
  }

  .rhap_main-controls-button {
    color: rgb(147 51 234) !important;
  }

  .rhap_main-controls-button:hover {
    color: rgb(126 34 206) !important;
  }

  .dark .rhap_main-controls-button {
    color: rgb(192 132 252) !important;
  }

  .dark .rhap_main-controls-button:hover {
    color: rgb(216 180 254) !important;
  }

  .rhap_progress-bar {
    height: 8px !important;
    background-color: rgb(243 232 255) !important;
    border-radius: 9999px !important;
  }

  .dark .rhap_progress-bar {
    background-color: rgb(88 28 135) !important;
  }

  .rhap_progress-filled {
    background-color: rgb(147 51 234) !important;
  }

  .dark .rhap_progress-filled {
    background-color: rgb(168 85 247) !important;
  }

  .rhap_progress-indicator {
    width: 16px !important;
    height: 16px !important;
    top: -4px !important;
    background-color: rgb(126 34 206) !important;
    box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1) !important;
  }

  .dark .rhap_progress-indicator {
    background-color: rgb(192 132 252) !important;
  }

  .rhap_volume-button {
    color: rgb(147 51 234) !important;
  }

  .rhap_volume-button:hover {
    color: rgb(126 34 206) !important;
  }

  .dark .rhap_volume-button {
    color: rgb(192 132 252) !important;
  }

  .dark .rhap_volume-button:hover {
    color: rgb(216 180 254) !important;
  }

  .rhap_volume-bar {
    height: 4px !important;
    background-color: rgb(243 232 255) !important;
    border-radius: 9999px !important;
  }

  .dark .rhap_volume-bar {
    background-color: rgb(88 28 135) !important;
  }

  .rhap_volume-indicator {
    width: 12px !important;
    height: 12px !important;
    top: -4px !important;
    background-color: rgb(126 34 206) !important;
    box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1) !important;
  }

  .dark .rhap_volume-indicator {
    background-color: rgb(192 132 252) !important;
  }

  .rhap_progress-section {
    margin: 0 !important;
  }

  .rhap_controls-section {
    padding: 0 5px 0 0 !important;
  }
`;

const SidePanel = () => {
  // Recording state
  const [status, setStatus] = useState<RecordingStatus>('inactive');
  const [error, setError] = useState<string | null>(null);
  const [recordings, setRecordings] = useState<
    Array<{
      url: string;
      timestamp: number;
      duration: number;
      isPlaying: boolean;
    }>
  >([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState<QualityPreset>('high');
  const [activePlayingIndex, setActivePlayingIndex] = useState<number | null>(null);

  // Reset recording state
  const resetRecording = useCallback(() => {
    setStatus('inactive');
    setError(null);
    setElapsedTime(0);
  }, []);

  // Format duration helper
  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Handle audio capture
  const handleCaptureAudio = useCallback(async () => {
    console.log('[UI] handleCaptureAudio called, current status:', status);

    try {
      // Handle stop recording
      if (status === 'recording') {
        console.log('[UI] Stopping recording');
        try {
          await captureAudio(0, QUALITY_PRESETS[selectedQuality], true);
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
      // Hide any active players when starting new recording
      setActivePlayingIndex(null);

      try {
        await captureAudio(0, QUALITY_PRESETS[selectedQuality], false);
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
  }, [status, selectedQuality, resetRecording]);

  // Handle cancel recording
  const handleCancelRecording = useCallback(async () => {
    try {
      console.log('[UI] Canceling recording');
      await captureAudio(0, QUALITY_PRESETS[selectedQuality], true);
      resetRecording();
    } catch (err) {
      console.error('[UI] Error canceling recording:', err);
      setError('Failed to cancel recording');
      resetRecording();
    }
  }, [selectedQuality, resetRecording]);

  // Handle download recording
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
    const duration = formatDuration(recordings[index].duration);
    a.download = `recording-${timestamp}-${duration}-${quality}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

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
      sendResponse: (response: { received: boolean }) => void
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
              // Hide any active players when saving new recording
              setActivePlayingIndex(null);
              // Save recording with duration
              setRecordings(prev => [
                {
                  url: message.audioUrl!,
                  timestamp: Date.now(),
                  duration: elapsedTime,
                  isPlaying: false,
                },
                ...prev,
              ]); // Add new recording at the start
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

        sendResponse({ received: true });
      }

      return true;
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [elapsedTime]);

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

  // Cleanup effect for unmounting
  useEffect(() => {
    return () => {
      recordings.forEach(recording => {
        const audio = new Audio(recording.url);
        audio.pause();
        audio.src = '';
      });
    };
  }, [recordings]);

  const handlePlayAudio = (index: number) => {
    setActivePlayingIndex(activePlayingIndex === index ? null : index);
  };

  useEffect(() => {
    // Add custom styles to the document
    const styleSheet = document.createElement('style');
    styleSheet.innerText = customPlayerStyles;
    document.head.appendChild(styleSheet);

    return () => {
      document.head.removeChild(styleSheet);
    };
  }, []);

  return (
    <ThemeProvider>
      <div className="flex min-h-screen flex-col bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
        <header className="sticky top-0 z-10 px-4 py-3">
          <div className="flex justify-end gap-2">
            <ThemeToggle />
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800"
              title="Settings"
            >
              <Settings className="size-5" />
            </button>
          </div>
        </header>

        <main className="-mt-16 flex flex-1 flex-col items-center justify-center p-4">
          <div className="flex w-full max-w-md flex-col items-center gap-4">
            {showSettings && (
              <QualitySettings
                selectedQuality={selectedQuality}
                setSelectedQuality={setSelectedQuality}
                onClose={() => setShowSettings(false)}
              />
            )}

            <StatusIndicator status={status} />

            {error && !error.includes('Waiting') && (
              <div className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-500">
                <p>{error}</p>
              </div>
            )}

            <div className="flex w-full gap-2">
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
                    Stop Recording ({formatDuration(elapsedTime)})
                  </>
                ) : status === 'waiting' ? (
                  <>
                    <Loader className="size-4 animate-spin" />
                    Starting Recording...
                  </>
                ) : (
                  <>
                    <Play className="size-4" />
                    Start Recording
                  </>
                )}
              </button>

              {status === 'waiting' && (
                <button
                  onClick={handleCancelRecording}
                  className="flex items-center justify-center rounded bg-yellow-500 px-3 text-white shadow transition-all hover:bg-yellow-600"
                  title="Cancel Recording"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            {recordings.length > 0 && (
              <div className="flex w-full flex-col gap-2">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium">Recordings</h4>
                  <div className="group relative">
                    <Info className="size-4 cursor-help text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300" />
                    <div className="absolute left-[-56px] top-6 z-50 hidden w-[280px] group-hover:block">
                      <div className="absolute -top-2 left-[20%] size-4 rotate-45 bg-white ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700" />
                      <div className="relative rounded-lg bg-white px-4 py-3 text-sm shadow-lg ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700">
                        <p className="text-gray-600 dark:text-gray-300">
                          <span className="mb-2 block font-medium text-gray-900 dark:text-white">
                            Temporary Storage
                          </span>
                          Recordings are stored in your browser&apos;s temporary memory and will be
                          lost when you close the extension.
                          <br />
                          <br />
                          To keep your recordings, make sure to download them using the download
                          button.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                {recordings.map((recording, index) => (
                  <div key={recording.timestamp} className="flex w-full flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handlePlayAudio(index)}
                        className="flex size-10 items-center justify-center rounded bg-purple-500 text-white shadow transition-all hover:bg-purple-600"
                        title={activePlayingIndex === index ? 'Hide player' : 'Play recording'}
                      >
                        <Play className="size-4" />
                      </button>
                      <div className="flex h-10 flex-1 items-center justify-between rounded bg-green-500 px-4 text-sm text-white shadow">
                        <span>
                          Recording {index + 1} ({formatDuration(recording.duration)})
                        </span>
                        <button
                          onClick={() => handleDownload(recording.url, index)}
                          className="rounded bg-green-600 p-1 hover:bg-green-700"
                          title="Download recording"
                        >
                          <Download className="size-4" />
                        </button>
                      </div>
                    </div>
                    {activePlayingIndex === index && (
                      <AudioPlayer
                        src={recording.url}
                        autoPlay
                        showJumpControls={false}
                        layout="horizontal"
                        customProgressBarSection={[
                          RHAP_UI.CURRENT_TIME,
                          RHAP_UI.PROGRESS_BAR,
                          RHAP_UI.DURATION,
                        ]}
                        customControlsSection={[RHAP_UI.MAIN_CONTROLS, RHAP_UI.VOLUME_CONTROLS]}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </ThemeProvider>
  );
};

export default withErrorBoundary(
  withSuspense(SidePanel, <div>Loading...</div>),
  <div>SidePanel Error</div>
);
