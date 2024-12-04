import '@src/SidePanel.css';
import { useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';
import { Download, Moon, Pause, Play, Settings, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { captureAudio } from './tools/captureAudio';

// Set default theme to dark
exampleThemeStorage.set('dark');

// Duration options in seconds
const DURATION_OPTIONS = [
  { label: '10 seconds', value: 10 },
  { label: '30 seconds', value: 30 },
  { label: '1 minute', value: 60 },
  { label: '2 minutes', value: 120 },
  { label: '5 minutes', value: 300 },
];

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

type QualityPreset = keyof typeof QUALITY_PRESETS;

const SidePanel = () => {
  const theme = useStorage(exampleThemeStorage);
  const isLight = theme === 'light';
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState(30);
  const [progress, setProgress] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState<QualityPreset>('high');

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    if (isCapturing) {
      const startTime = Date.now();
      interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const newProgress = Math.min((elapsed / (selectedDuration * 1000)) * 100, 100);
        setProgress(newProgress);
        setElapsedTime(elapsed);

        if (newProgress >= 100) {
          setIsCapturing(false);
          setProgress(0);
          setElapsedTime(0);
        }
      }, 100);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isCapturing, selectedDuration]);

  const handleCaptureAudio = async () => {
    try {
      setIsCapturing(true);
      setError(null);
      setProgress(0);
      setElapsedTime(0);
      const url = await captureAudio(selectedDuration * 1000, QUALITY_PRESETS[selectedQuality]);
      if (!url) {
        setError('No audio playing found on this page');
        return;
      }
      setAudioUrl(url);
    } catch (err) {
      setError('Failed to capture audio');
      console.error(err);
    } finally {
      setIsCapturing(false);
      setProgress(0);
      setElapsedTime(0);
    }
  };

  const handleDownload = () => {
    if (!audioUrl) return;

    const a = document.createElement('a');
    a.href = audioUrl;
    const extension = audioUrl.includes('audio/wav')
      ? 'wav'
      : audioUrl.includes('audio/mp3') || audioUrl.includes('audio/mpeg')
        ? 'mp3'
        : audioUrl.includes('audio/aac')
          ? 'm4a'
          : 'webm';

    const quality = selectedQuality.toUpperCase();
    a.download = `captured-audio-${selectedDuration}s-${quality}.${extension}`;
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
          <select
            value={selectedDuration}
            onChange={e => setSelectedDuration(Number(e.target.value))}
            disabled={isCapturing}
            className={`rounded border px-4 py-2 ${
              isLight
                ? 'border-gray-300 bg-white text-gray-900'
                : 'border-gray-600 bg-gray-700 text-gray-100'
            }`}
          >
            {DURATION_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <button
            onClick={handleCaptureAudio}
            disabled={isCapturing}
            className={`flex items-center justify-center gap-2 rounded px-6 py-2 font-bold shadow hover:scale-105 ${
              isLight ? 'bg-purple-500 text-white' : 'bg-purple-400 text-white'
            } ${isCapturing ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            {isCapturing ? (
              <>
                <Pause className="size-4" />
                Recording... {formatTime(elapsedTime)} / {formatTime(selectedDuration * 1000)}
              </>
            ) : (
              <>
                <Play className="size-4" />
                Start Recording
              </>
            )}
          </button>

          {isCapturing && (
            <div className="w-full">
              <div className="mb-1 h-2 overflow-hidden rounded bg-gray-200 dark:bg-gray-700">
                <div
                  className="h-full rounded bg-purple-500 transition-all duration-300 ease-in-out dark:bg-purple-400"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="text-center text-sm text-gray-500 dark:text-gray-400">
                {Math.round(progress)}%
              </div>
            </div>
          )}

          {audioUrl && (
            <button
              onClick={handleDownload}
              className={`flex items-center justify-center gap-2 rounded px-6 py-2 font-bold shadow hover:scale-105 ${
                isLight ? 'bg-green-500 text-white' : 'bg-green-400 text-white'
              }`}
            >
              <Download className="size-4" />
              Download Audio ({selectedQuality.toUpperCase()})
            </button>
          )}
        </div>

        {error && <div className={`mt-4 text-red-500`}>{error}</div>}
      </div>
    </div>
  );
};

export default withErrorBoundary(
  withSuspense(SidePanel, <div> Loading ... </div>),
  <div> Error Occur </div>
);
