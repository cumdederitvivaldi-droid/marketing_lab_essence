'use client';

import type { Region } from '../types';

interface RegionChipsProps {
  selectedRegion: Region;
  onRegionChange: (region: Region) => void;
}

export default function RegionChips({ selectedRegion, onRegionChange }: RegionChipsProps) {
  const regions: { label: string; value: Region; isNew?: boolean }[] = [
    { label: '서울', value: '서울' },
    { label: '경기도', value: '경기도' },
    { label: '인천', value: '인천' },
    { label: '충청도', value: '충청도', isNew: true },
  ];

  return (
    <div className="sticky top-0 left-0 w-full z-10 bg-white">
      <div className="overflow-x-auto overflow-y-hidden py-[8px]" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <style>{`.overflow-x-auto::-webkit-scrollbar { display: none; }`}</style>
        <div className="flex gap-[8px] items-start min-w-min pl-[20px]">
          {regions.map((region) => (
            <button
              key={region.value}
              onClick={() => onRegionChange(region.value)}
              className={`content-stretch flex gap-[4px] h-[40px] items-center justify-center min-w-[64px] px-[12px] py-[8px] relative rounded-[999px] shrink-0 transition-colors ${
                selectedRegion === region.value ? 'bg-[#2d3139]' : 'bg-[#eef2f6]'
              }`}
            >
              <p className={`font-sans font-semibold leading-[24px] text-[16px] text-center shrink-0 ${
                selectedRegion === region.value ? 'text-white' : 'text-[#2d3139]'
              }`}>
                {region.label}
              </p>
              {region.isNew && (
                <p className="font-sans font-semibold leading-[14px] text-[#ff3358] text-[11px] text-nowrap tracking-[0.066px] shrink-0">
                  New
                </p>
              )}
            </button>
          ))}
          <div className="w-[12px] shrink-0" />
        </div>
      </div>
    </div>
  );
}
