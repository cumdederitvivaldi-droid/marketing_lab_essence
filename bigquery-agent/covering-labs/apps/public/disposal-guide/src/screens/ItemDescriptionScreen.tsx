'use client';

import { useState, useEffect, useRef } from 'react';
import ProgressBar from '../components/ProgressBar';
import BottomBar from '../components/BottomBar';
import FilledButton from '../components/FilledButton';
import BottomSheetModal from '../components/BottomSheetModal';
import NoticeCard from '../components/NoticeCard';
import { detectHazardous, type HazardousMatch } from '../data/hazardousKeywords';
import { clickEventName, getScreenMeta, normalizeItemSearchKeyword, track, viewEventName } from '../lib/analytics';

interface Props {
  step: number;
  hazardousKeywords?: HazardousMatch[];
  onNext: (description: string) => void;
  onRestrictedItem?: (description: string, match: HazardousMatch) => void;
}

function AlertCircleIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="22" fill="#FFF7E5" />
      <path d="M24 14V26" stroke="#D97706" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="24" cy="32" r="1.6" fill="#D97706" />
    </svg>
  );
}

interface HazardousModalProps {
  description: string;
  match: HazardousMatch;
  onEdit: () => void;
  onClose: () => void;
}

function HazardousModal({ description, match, onEdit, onClose }: HazardousModalProps) {
  const isPharma = match.category === 'PHARMACEUTICAL';
  const guideText = isPharma
    ? '폐의약품 처리 안내 — 가까운 약국, 보건소, 행정복지센터에 비치된 폐의약품 수거함에 배출해 주세요. 알약·캡슐·물약·연고는 종류별로 분리해 봉투째 넣으면 됩니다.'
    : '유해 폐기물 처리 안내 — 페인트·농약·가스통 등은 일반 봉투에 담을 수 없어요. 거주지 행정복지센터, 동주민센터 또는 지정 수거함을 이용해 주세요.';

  return (
    <BottomSheetModal onClose={onClose}>
      <div className="flex flex-col items-center text-center">
        <AlertCircleIcon />
        <h2 className="mt-4 text-title3-emphasized text-text-default">
          커버링에서 버릴 수 없어요
        </h2>
        <p className="mt-2 text-body2-regular text-text-tertiary">
          <span className="font-medium text-text-default">‘{description}’</span>은(는) {isPharma ? '폐의약품' : '유해 폐기물'}으로 분류돼요.
        </p>
      </div>

      <div className="mt-5">
        <NoticeCard variant="warn" message={guideText} />
      </div>

      <div className="mt-6">
        <FilledButton label="다시 입력하기" onClick={onEdit} />
      </div>
    </BottomSheetModal>
  );
}

export default function ItemDescriptionScreen({
  step,
  hazardousKeywords,
  onNext,
  onRestrictedItem,
}: Props) {
  const [text, setText] = useState('');
  const [hazardousMatch, setHazardousMatch] = useState<HazardousMatch | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 페이지 진입 시 모바일/데스크탑 모두 input에 포커스 → 키보드 자동 노출
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, []);

  const handleNext = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      onNext('');
      return;
    }
    const match = detectHazardous(trimmed, hazardousKeywords);
    if (match) {
      const screenMeta = getScreenMeta('step_item_description');
      const itemSearchKeyword = normalizeItemSearchKeyword(trimmed);

      track(clickEventName('step_item_description', 'nextButton'), {
        ...screenMeta,
        has_item_description: true,
        item_description_length: trimmed.length,
        item_search_keyword: itemSearchKeyword,
        is_restricted_item: true,
        hazardous_category: match.category,
        hazardous_keyword: match.keyword,
      });
      track(viewEventName('step_item_description', 'hazardousModal'), {
        ...screenMeta,
        item_search_keyword: itemSearchKeyword,
        hazardous_category: match.category,
        hazardous_keyword: match.keyword,
      });
      onRestrictedItem?.(trimmed, match);

      setHazardousMatch(match);
    } else {
      onNext(trimmed);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top,0px)]">
      <ProgressBar current={step} />

      <div className="flex flex-1 flex-col px-5 pt-8 pb-4">
        <h1 className="text-title2 text-text-default">
          구체적인 물품을 알려주세요
        </h1>
        <p className="mt-2 text-body2-regular text-text-secondary">
          알려주시면 더 정확하게 추천해 드릴 수 있어요
        </p>

        <label htmlFor="item-description" className="sr-only">
          버릴 물품 설명
        </label>
        <input
          id="item-description"
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="예: 소파, 옷장, 겨울 이불, 선풍기"
          className={`mt-10 w-full border-b-2 bg-transparent pb-3 text-[17px] text-text-default outline-none placeholder:text-text-placeholder ${
            text ? 'border-primary' : 'border-[#E0E3E8]'
          }`}
          autoFocus
        />
      </div>

      <BottomBar
        label={text.trim() ? '작성 완료' : '건너뛰기'}
        onClick={handleNext}
      />

      {hazardousMatch && (
        <HazardousModal
          description={text.trim()}
          match={hazardousMatch}
          onEdit={() => {
            const screenMeta = getScreenMeta('step_item_description');

            track(clickEventName('step_item_description', 'hazardousModalEdit'), {
              ...screenMeta,
              item_search_keyword: normalizeItemSearchKeyword(text),
              hazardous_category: hazardousMatch.category,
              hazardous_keyword: hazardousMatch.keyword,
            });

            setHazardousMatch(null);
            setText('');
          }}
          onClose={() => setHazardousMatch(null)}
        />
      )}
    </div>
  );
}
