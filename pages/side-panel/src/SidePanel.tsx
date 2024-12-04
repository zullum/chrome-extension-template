import '@src/SidePanel.css';
import { useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';
import { Download, Moon, Play, Settings, Sun, Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import { captureAudio } from './tools/captureAudio';

// Remove or comment out this line as it's causing the issue
// exampleThemeStorage.set('dark');

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
  useEffect(() => {
    const currentTheme = exampleThemeStorage.get();
    if (!currentTheme) {
      exampleThemeStorage.set('dark');
    }
  }, []);

  const theme = useStorage(exampleThemeStorage);
  const isLight = theme === 'light';
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState<QualityPreset>('high');

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    if (isCapturing) {
      const startTime = Date.now();
      interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        setElapsedTime(elapsed);
      }, 100);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isCapturing]);

  const handleCaptureAudio = async () => {
    try {
      if (isCapturing) {
        await captureAudio(0, QUALITY_PRESETS[selectedQuality], null, true);
        setIsCapturing(false);
        setElapsedTime(0);
        return;
      }

      setError(null);
      setElapsedTime(0);
      setIsCapturing(true);

      const url = await captureAudio(0, QUALITY_PRESETS[selectedQuality], url => {
        if (url) {
          setAudioUrl(url);
        }
        setIsCapturing(false);
        setElapsedTime(0);
      });

      if (url) {
        setAudioUrl(url);
      } else {
        setError('No audio playing found on this page');
        setIsCapturing(false);
      }
    } catch (err) {
      setError('Failed to capture audio');
      console.error(err);
      setIsCapturing(false);
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
    const duration = Math.round(elapsedTime / 1000);
    a.download = `captured-audio-${duration}s-${quality}.${extension}`;
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
          <div className="flex gap-2">
            <button
              onClick={handleCaptureAudio}
              className={`flex flex-1 items-center justify-center gap-2 rounded px-6 py-2 font-bold shadow hover:scale-105 ${
                isLight ? 'bg-purple-500 text-white' : 'bg-purple-400 text-white'
              }`}
            >
              {isCapturing ? (
                <>
                  <Square className="size-4" />
                  Stop Recording ({formatTime(elapsedTime)})
                </>
              ) : (
                <>
                  <Play className="size-4" />
                  Start Recording
                </>
              )}
            </button>
          </div>

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
