import '@src/SidePanel.css';
import { useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';
import type { ComponentPropsWithoutRef } from 'react';
import { useState } from 'react';
import { getH1Title } from './tools/getH1Title';

// Set default theme to dark
exampleThemeStorage.set('dark');

const SidePanel = () => {
  const theme = useStorage(exampleThemeStorage);
  const isLight = theme === 'light';
  const [titles, setTitles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGetH1Titles = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const h1Titles = await getH1Title();
      setTitles(h1Titles);
      if (h1Titles.length === 0) {
        setError('No H1 titles found on this page');
      }
    } catch (err) {
      setError('Failed to get H1 titles');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`App ${isLight ? 'bg-slate-50' : 'bg-gray-800'}`}>
      <div className="absolute right-4 top-4">
        <ToggleButton>Toggle theme</ToggleButton>
      </div>

      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <button
          onClick={handleGetH1Titles}
          disabled={isLoading}
          className={`mb-4 rounded px-6 py-2 font-bold shadow hover:scale-105 ${
            isLight ? 'bg-blue-500 text-white' : 'bg-blue-400 text-white'
          } ${isLoading ? 'cursor-not-allowed opacity-50' : ''}`}>
          {isLoading ? 'Loading...' : 'Get H1 Titles'}
        </button>

        {error && <div className={`mt-4 text-red-500`}>{error}</div>}

        {titles.length > 0 && (
          <div className={`mt-4 ${isLight ? 'text-gray-900' : 'text-gray-100'}`}>
            <h2 className="mb-2 text-lg font-bold">Found H1 Titles:</h2>
            <ul className="list-disc pl-5">
              {titles.map((title, index) => (
                <li key={index}>{title}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

const ToggleButton = (props: ComponentPropsWithoutRef<'button'>) => {
  const theme = useStorage(exampleThemeStorage);
  return (
    <button
      className={
        props.className +
        ' ' +
        'font-bold mt-4 py-1 px-4 rounded shadow hover:scale-105 ' +
        (theme === 'light' ? 'bg-white text-black' : 'bg-black text-white')
      }
      onClick={exampleThemeStorage.toggle}>
      {props.children}
    </button>
  );
};

export default withErrorBoundary(withSuspense(SidePanel, <div> Loading ... </div>), <div> Error Occur </div>);
