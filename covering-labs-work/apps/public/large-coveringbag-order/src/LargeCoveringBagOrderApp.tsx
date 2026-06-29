'use client';

import { useEffect, useState } from 'react';
import Landing from './screens/Landing';
import Complete from './screens/Complete';
import Disposal from './screens/Disposal';
import { submitToSheets } from './api/sheets';
import { initAnalytics } from './lib/analytics';
import type { FormData, Screen } from './types';

function resolveInitialScreen(): Screen {
  if (typeof window === 'undefined') return 'landing';

  const page = new URLSearchParams(window.location.search).get('page');
  if (page === 'complete') return 'complete';
  if (page === 'disposal') return 'disposal';
  return 'landing';
}

export default function LargeCoveringBagOrderApp() {
  const [screen, setScreen] = useState<Screen>(resolveInitialScreen);

  useEffect(() => {
    initAnalytics();
  }, []);

  const handleSubmit = async (data: FormData) => {
    await submitToSheets(data);
    setScreen('complete');
  };

  return (
    <>
      <div
        className="pointer-events-none fixed left-0 right-0 top-0 z-[9999] bg-white"
        style={{ height: 'env(safe-area-inset-top, 0px)' }}
      />
      <div
        className="pointer-events-none fixed bottom-0 left-0 right-0 z-[9999] bg-white"
        style={{ height: 'env(safe-area-inset-bottom, 0px)' }}
      />
      <div className="min-h-screen w-full bg-white md:bg-[#F3F4F6]">
        <div className="relative isolate mx-auto min-h-screen w-full max-w-[360px] overflow-x-clip bg-white md:shadow-lg">
          {screen === 'landing' && <Landing onSubmit={handleSubmit} />}
          {screen === 'complete' && <Complete onHome={() => setScreen('landing')} />}
          {screen === 'disposal' && <Disposal onBack={() => setScreen('landing')} />}
        </div>
      </div>
    </>
  );
}
