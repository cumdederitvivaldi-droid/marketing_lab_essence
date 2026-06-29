'use client';

import { useState, useEffect } from 'react';
import RegionChips from './components/RegionChips';
import Seoul from './components/Seoul';
import Gyeonggi from './components/Gyeonggi';
import Incheon from './components/Incheon';
import Chungcheong from './components/Chungcheong';
import type { Region } from './types';

export default function Home() {
  const [selectedRegion, setSelectedRegion] = useState<Region>('서울');

  useEffect(() => {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'viewport');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', 'width=device-width, initial-scale=1.0');
  }, []);

  return (
    <div className="bg-white relative size-full flex justify-center min-h-screen">
      <div className="relative w-full max-w-[767px] h-full overflow-y-auto">
        <RegionChips selectedRegion={selectedRegion} onRegionChange={setSelectedRegion} />
        {selectedRegion === '서울' && <Seoul />}
        {selectedRegion === '경기도' && <Gyeonggi />}
        {selectedRegion === '인천' && <Incheon />}
        {selectedRegion === '충청도' && <Chungcheong />}
      </div>
    </div>
  );
}
