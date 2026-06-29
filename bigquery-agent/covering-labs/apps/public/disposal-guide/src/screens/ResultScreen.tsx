'use client';

import { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type {
  AppState,
  DiagnosisResult,
  DisposalGuideChoices,
  Recommendation,
} from '../types';
import BottomBar from '../components/BottomBar';
import FeedbackDialog from '../components/FeedbackDialog';
import { DEFAULT_GUIDE_CONFIG } from '../data/defaultGuideConfig';
import { getNearestLengthExample } from '../data/lengthExamples';
import { detectSpecialItem } from '../data/specialItems';
import { isGeneralCategoryOnly } from '../logic/recommend';
import {
  buildGuideStateProps,
  clickEventName,
  getScreenMeta,
  track,
  viewEventName,
} from '../lib/analytics';
import { closeDisposalGuide } from '../lib/closeDisposalGuide';
import { buildFeedbackSubmissionPayload, type FeedbackSentiment } from '../lib/feedback';
import { BASE_PATH } from '../utils/basePath';

interface Props {
  result: DiagnosisResult;
  state: AppState;
  choices?: DisposalGuideChoices;
  onRestart: () => void;
  onCta?: () => void;
}

type Phase = 'analyzing' | 'check_appear' | 'content';

const ANALYZE_MS = 2000;
const CHECK_APPEAR_MS = 700;
const BAG_APPLICATION_URL = 'https://abr.ge/wn79bl';

interface ResultPresetMeta {
  brandPart: string;
}

const PRESET_META: Record<Recommendation, ResultPresetMeta> = {
  VISIT_PICKUP: {
    brandPart: '커버링 방문 수거',
  },
  LARGE_COVERING_BAG: {
    brandPart: '대형 커버링 봉투',
  },
  GENERAL_BAG_SINGLE: {
    brandPart: '일반 커버링 봉투',
  },
  GENERAL_BAG_MULTIPLE: {
    brandPart: '일반 커버링 봉투 여러 장',
  },
};

function buildFoodCaution(rec: Recommendation): string {
  if (rec === 'VISIT_PICKUP') {
    return '단, 음식물은 방문수거 물품에 포함하지 않고 일반 커버링 봉투로 분리해서 버려주세요';
  }
  if (rec === 'LARGE_COVERING_BAG') {
    return '음식물은 대형 커버링 봉투에 담지 않고 일반 커버링 봉투로 분리해서 버려주세요';
  }
  return '음식물은 다른 물건과 섞지 말고 따로 분리해서 담아주세요';
}

function CheckIcon({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      <circle cx="40" cy="40" r="36" fill="#07C576" />
      <path
        d="M24 40L34 50L56 28"
        stroke="white"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function findLabel(choices: { id: string; label: string }[], id?: string): string | undefined {
  if (!id) return undefined;
  return choices.find((c) => c.id === id)?.label;
}

interface InfoRow {
  label: string;
  value: string;
  badge?: { text: string; color: string };
}

function buildInfoRows(state: AppState, choices: DisposalGuideChoices): InfoRow[] {
  const rows: InfoRow[] = [];

  const labels = state.categories
    .map((c) => findLabel(choices.categories, c))
    .filter((s): s is string => Boolean(s));
  let value = labels.join(', ');
  if (state.itemDescription) {
    value = value ? `${value} ${state.itemDescription}` : state.itemDescription;
  }
  if (value) {
    rows.push({
      label: '품목',
      value,
      badge: { text: '수거 가능', color: '#07C576' },
    });
  }

  if (state.hasFoodWaste) {
    rows.push({ label: '음식물', value: '포함' });
  }

  if (typeof state.lengthCm === 'number') {
    const example = getNearestLengthExample(state.lengthCm);
    rows.push({
      label: '길이',
      value: `${state.lengthCm}cm · ${example.label}`,
    });
  }

  const weightLabel =
    state.weightRange !== 'UNKNOWN'
      ? findLabel(choices.weights, state.weightRange)
      : findLabel(choices.perceivedWeights, state.perceivedWeight);
  if (weightLabel) {
    rows.push({ label: '무게', value: weightLabel });
  }

  const splitLabel = findLabel(choices.splittable, state.splittableStatus);
  if (splitLabel) {
    rows.push({ label: '나눠 담기', value: splitLabel });
  }

  return rows;
}

function highlightBrand(text: string, brand: string): ReactNode {
  if (!brand) return text;
  const idx = text.indexOf(brand);
  if (idx < 0) return text;
  return (
    <>
      <span className="text-primary">{text.slice(0, idx + brand.length)}</span>
      <span className="text-text-default">{text.slice(idx + brand.length)}</span>
    </>
  );
}

export default function ResultScreen({
  result,
  state,
  choices = DEFAULT_GUIDE_CONFIG.choices,
  onRestart,
  onCta,
}: Props) {
  const [phase, setPhase] = useState<Phase>('analyzing');
  const [feedbackStage, setFeedbackStage] = useState<'idle' | 'sentiment_selected' | 'submitted'>(
    'idle',
  );
  const [feedbackSentiment, setFeedbackSentiment] = useState<FeedbackSentiment | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const contentTrackedRef = useRef(false);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('check_appear'), ANALYZE_MS);
    const t2 = setTimeout(() => setPhase('content'), ANALYZE_MS + CHECK_APPEAR_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const handleSentiment = (sentiment: FeedbackSentiment) => {
    if (feedbackStage === 'submitted' || feedbackSubmitting) return;
    const screenMeta = getScreenMeta('result');

    track(clickEventName('result', 'feedback'), {
      ...screenMeta,
      ...buildGuideStateProps(state),
      recommendation: result.recommendation,
      feedback_sentiment: sentiment,
    });

    setFeedbackSentiment(sentiment);
    setFeedbackStage('sentiment_selected');
    setFeedbackError(null);
  };

  const handleOpenDialog = () => {
    if (feedbackStage !== 'sentiment_selected' || feedbackSubmitting) return;
    const screenMeta = getScreenMeta('result');

    track(clickEventName('result', 'openFeedbackDialog'), {
      ...screenMeta,
      ...buildGuideStateProps(state),
      recommendation: result.recommendation,
      feedback_sentiment: feedbackSentiment,
    });

    setFeedbackError(null);
    setDialogOpen(true);
  };

  const handleSubmitFeedback = async (message: string) => {
    if (!feedbackSentiment || feedbackSubmitting) return;

    setFeedbackSubmitting(true);
    setFeedbackError(null);
    const screenMeta = getScreenMeta('result');

    track(clickEventName('result', 'submitFeedback'), {
      ...screenMeta,
      ...buildGuideStateProps(state),
      recommendation: result.recommendation,
      feedback_sentiment: feedbackSentiment,
      feedback_text_length: message.length,
    });

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(`${BASE_PATH}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(
          buildFeedbackSubmissionPayload(feedbackSentiment, result.recommendation, state, message),
        ),
      });

      if (!response.ok) {
        throw new Error(`feedback submission failed: ${response.status}`);
      }

      setDialogOpen(false);
      setFeedbackStage('submitted');
    } catch (error) {
      console.error('disposal-guide feedback submission failed', error);
      setFeedbackError(
        error instanceof DOMException && error.name === 'AbortError'
          ? '의견 전송이 지연되고 있어요. 잠시 후 다시 시도해주세요'
          : '의견을 저장하지 못했어요. 잠시 후 다시 시도해주세요',
      );
    } finally {
      window.clearTimeout(timeoutId);
      setFeedbackSubmitting(false);
    }
  };

  const handleCtaClick = () => {
    if (result.recommendation === 'VISIT_PICKUP') {
      onCta?.();
      return;
    }

    track(clickEventName('result', 'cta'), {
      ...getScreenMeta('result'),
      ...buildGuideStateProps(state),
      recommendation: result.recommendation,
      cta_label: result.cta,
      cta_action: 'close',
      cta_url: BAG_APPLICATION_URL,
    });

    closeDisposalGuide(window, { fallbackUrl: BAG_APPLICATION_URL });
  };

  const preset = PRESET_META[result.recommendation];
  const rows = buildInfoRows(state, choices);
  const special = detectSpecialItem(state.itemDescription);
  // 일반 봉투 결과는 음식물 caution 노출 안함 (일반 봉투엔 음식물 가능)
  const showFoodCaution =
    state.hasFoodWaste &&
    (result.recommendation === 'VISIT_PICKUP' || result.recommendation === 'LARGE_COVERING_BAG');
  const foodCaution = showFoodCaution ? buildFoodCaution(result.recommendation) : null;
  // 일반·재활용·음식물 단독 + 음식물 포함 + 일반 봉투 추천 시 음식물 안내 추가
  const showGeneralFoodNote =
    state.hasFoodWaste &&
    isGeneralCategoryOnly(state.categories) &&
    (result.recommendation === 'GENERAL_BAG_SINGLE' ||
      result.recommendation === 'GENERAL_BAG_MULTIPLE');

  useEffect(() => {
    if (phase !== 'content' || contentTrackedRef.current) return;

    const screenMeta = getScreenMeta('result');
    contentTrackedRef.current = true;

    track(viewEventName('result', 'result'), {
      ...screenMeta,
      ...buildGuideStateProps(state),
      recommendation: result.recommendation,
      result_title: result.title,
      cta_label: result.cta,
      row_count: rows.length,
      has_food_caution: Boolean(foodCaution),
      has_general_food_note: showGeneralFoodNote,
      has_special_item_note: Boolean(special),
    });
    // Result view should fire once when the content phase becomes visible.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── 분석 중
  if (phase === 'analyzing') {
    return (
      <div className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top,0px)]">
        <div className="flex flex-1 items-center justify-center">
          <p className="text-title1 text-text-secondary">
            분석 중<span className="dg-dot dg-dot-1">.</span>
            <span className="dg-dot dg-dot-2">.</span>
            <span className="dg-dot dg-dot-3">.</span>
          </p>
        </div>
      </div>
    );
  }

  // ── 체크 + 컨텐츠
  return (
    <div className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top,0px)]">
      <div className="flex flex-1 flex-col px-5 pt-4 pb-4">
        <div
          className="mx-auto transition-all duration-500 ease-out dg-scale-in"
          style={{ marginTop: phase === 'check_appear' ? '32vh' : '8px' }}
        >
          <CheckIcon />
        </div>

        {phase === 'content' && (
          <>
            <h1 className="dg-fade-in-up dg-fade-in-up-delay-1 mt-6 text-center text-title1">
              {highlightBrand(result.title, preset.brandPart)}
            </h1>

            <div className="dg-fade-in-up dg-fade-in-up-delay-2 mt-8 rounded-ds-lg bg-surface-dim p-5">
              <p className="text-body2-regular text-text-default">{result.description}</p>
              {showGeneralFoodNote && (
                <p className="mt-3 text-body2-regular text-text-default">
                  음식물도 편하게 담아서 버려주세요.
                </p>
              )}
              {foodCaution && (
                <p className="mt-4 text-body2-emphasized text-status-negative">
                  {foodCaution}
                </p>
              )}
              {special && (
                <p className="mt-3 text-body2-emphasized text-status-negative">
                  {special.message}
                </p>
              )}
            </div>

            {rows.length > 0 && (
              <div className="dg-fade-in-up dg-fade-in-up-delay-3 mt-8">
                <p className="mb-2 text-label1-emphasized text-text-neutral">입력 정보</p>
                <div className="rounded-ds-md bg-white">
                  {rows.map((row, i) => (
                    <div
                      key={`${row.label}-${i}`}
                      className={`flex items-start gap-3 px-4 py-3 ${
                        i < rows.length - 1 ? 'border-b border-border-faint' : ''
                      }`}
                    >
                      <p className="w-[56px] shrink-0 text-[13px] text-text-secondary">{row.label}</p>
                      <p className="flex-1 text-body2-emphasized text-text-neutral">{row.value}</p>
                      {row.badge && (
                        <span
                          className="shrink-0 text-[13px] font-bold"
                          style={{ color: row.badge.color }}
                        >
                          {row.badge.text}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="dg-fade-in-up dg-fade-in-up-delay-4 mt-8 flex flex-col items-center gap-2 rounded-ds-lg bg-surface-dim p-4">
              <p
                className="text-body2-emphasized text-text-neutral"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {feedbackStage === 'submitted'
                  ? '의견을 보내주셔서 감사합니다'
                  : feedbackStage === 'sentiment_selected'
                    ? '더 나은 서비스를 위해 의견을 주세요'
                    : '추천 결과가 어땠나요?'}
              </p>

              {feedbackStage === 'idle' && (
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={feedbackSubmitting}
                    onClick={() => handleSentiment('negative')}
                    className="flex h-8 w-[120px] items-center justify-center rounded-ds-sm border border-primary bg-transparent px-5 text-body2-emphasized text-primary active:bg-primary-tint disabled:opacity-50"
                  >
                    별로에요
                  </button>
                  <button
                    type="button"
                    disabled={feedbackSubmitting}
                    onClick={() => handleSentiment('positive')}
                    className="flex h-8 w-[120px] items-center justify-center rounded-ds-sm border border-primary bg-transparent px-5 text-body2-emphasized text-primary active:bg-primary-tint disabled:opacity-50"
                  >
                    만족해요
                  </button>
                </div>
              )}

              {feedbackStage === 'sentiment_selected' && (
                <button
                  type="button"
                  disabled={feedbackSubmitting}
                  onClick={handleOpenDialog}
                  className="flex h-8 w-[120px] items-center justify-center rounded-ds-sm border border-primary bg-transparent px-5 text-body2-emphasized text-primary active:bg-primary-tint disabled:opacity-50"
                >
                  의견 보내기
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {phase === 'content' && (
        <BottomBar
          label={result.cta}
          onClick={handleCtaClick}
          secondaryLabel="처음부터 다시 하기"
          onSecondary={onRestart}
        />
      )}

      {dialogOpen && (
        <FeedbackDialog
          onClose={() => {
            if (!feedbackSubmitting) {
              setDialogOpen(false);
              setFeedbackStage('idle');
              setFeedbackSentiment(null);
              setFeedbackError(null);
            }
          }}
          onSubmit={handleSubmitFeedback}
          isSubmitting={feedbackSubmitting}
          errorMessage={feedbackError}
        />
      )}
    </div>
  );
}
