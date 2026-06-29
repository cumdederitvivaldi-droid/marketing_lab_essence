'use client';

import { useState, useEffect, useRef } from 'react';
import type { AppState, Category, LengthRange, WeightRange, PerceivedWeight, SplittableStatus } from './types';
import type { HazardousMatch } from './types';
import { INIT_STATE } from './data/flow';
import { DEFAULT_GUIDE_CONFIG } from './data/defaultGuideConfig';
import {
  needsSplittable,
  needsLengthQuestion,
  isGeneralCategoryOnly,
  buildResult,
} from './logic/recommend';
import IntroScreen from './screens/IntroScreen';
import CategoryScreen from './screens/CategoryScreen';
import ItemDescriptionScreen from './screens/ItemDescriptionScreen';
import LengthSliderScreen from './screens/LengthSliderScreen';
import RadioListScreen from './screens/RadioListScreen';
import ResultScreen from './screens/ResultScreen';
import type { DisposalGuideConfig } from './types';
import {
  buildGuideStateProps,
  clickEventName,
  getScreenMeta,
  routeEventName,
  track,
} from './lib/analytics';
import { saveItemSearchEvent } from './lib/itemSearchEvents';

interface Props {
  guideConfig?: DisposalGuideConfig;
}

const INIT: AppState = { ...INIT_STATE, screen: 'intro' };

function findChoiceLabel(choices: { id: string; label: string }[], id: string) {
  return choices.find((choice) => choice.id === id)?.label;
}

function categoryLabels(config: DisposalGuideConfig, categories: Category[]) {
  return categories
    .map((category) => findChoiceLabel(config.choices.categories, category))
    .filter((label): label is string => Boolean(label));
}

export default function DisposalGuideApp({ guideConfig }: Props = {}) {
  const config = guideConfig ?? DEFAULT_GUIDE_CONFIG;
  const [state, setState] = useState<AppState>(INIT);
  const [history, setHistory] = useState<AppState[]>([]);
  // popstate에서 setState로 되돌릴 때 push가 다시 history.pushState 호출하는 걸 막기 위한 플래그
  const isPoppingRef = useRef(false);
  // push로 쌓은 브라우저 history entry 개수 — handleRestart에서 history.go(-n)로 실제 stack 정리에 사용
  const pushDepthRef = useRef(0);

  useEffect(() => {
    const screenMeta = getScreenMeta(state.screen);
    track(routeEventName(state.screen), {
      ...screenMeta,
      ...buildGuideStateProps(state),
    });
    // Route events should fire only when the screen changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.screen]);

  const push = (next: Partial<AppState>) => {
    setHistory((h) => [...h, state]);
    setState((s) => ({ ...s, ...next }));
    if (typeof window !== 'undefined' && !isPoppingRef.current) {
      window.history.pushState({}, '');
      pushDepthRef.current += 1;
    }
  };

  // 브라우저 뒤로가기 → 내부 history에서 pop
  useEffect(() => {
    const handler = () => {
      isPoppingRef.current = true;
      pushDepthRef.current = Math.max(0, pushDepthRef.current - 1);
      setHistory((h) => {
        if (h.length === 0) {
          isPoppingRef.current = false;
          return h;
        }
        const prev = h[h.length - 1];
        setState(prev);
        return h.slice(0, -1);
      });
      // 다음 tick 에서 플래그 해제
      setTimeout(() => { isPoppingRef.current = false; }, 0);
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  // (handleBack 제거 — 이제 브라우저 popstate가 유일한 back 트리거)

  const handleRestart = () => {
    const screenMeta = getScreenMeta('result');
    track(clickEventName('result', 'restartButton'), {
      ...screenMeta,
      ...buildGuideStateProps(state),
    });

    const depth = pushDepthRef.current;
    setHistory([]);
    setState(INIT);
    pushDepthRef.current = 0;
    if (typeof window !== 'undefined' && depth > 0) {
      // 누적된 pushState entries 만큼 실제 브라우저 history에서 제거
      // popstate가 비동기로 발생하지만 isPoppingRef 가드와 빈 history 분기로
      // 추가 setState 없이 안전하게 처리됨
      isPoppingRef.current = true;
      window.history.go(-depth);
      // popstate 핸들러가 정상 동작하면 그쪽 setTimeout이 먼저 해제하지만,
      // 어떤 이유로 popstate가 발생하지 않아 플래그가 영구 잠기는 걸 막기 위한 fallback
      setTimeout(() => { isPoppingRef.current = false; }, 100);
    }
  };

  const goResult = (partial: Partial<AppState> = {}) => {
    const merged = { ...state, ...partial } as AppState;
    const result = buildResult(merged, config);
    push({ ...partial, screen: 'result', resultId: result.recommendation });
  };

  const generalOnly = isGeneralCategoryOnly(state.categories);
  const isFoodIncluded = state.categories.includes('GENERAL_FOOD_RECYCLE');

  // ── Step numbers ──────────────────────────────────────────
  // general-only:  cat(1) food(2) weight(3) [+perceived]
  // no-food:       cat(1) item_desc(2) length(3) weight(4) [+perceived/split]
  // mixed:         cat(1) food(2) item_desc(3) length(4) weight(5) [+perceived/split]
  const itemDescStep = isFoodIncluded ? 3 : 2;
  const lengthStep = itemDescStep + 1;
  const weightStep = generalOnly ? 3 : lengthStep + 1;
  const splittableStep = weightStep + 1;

  const afterWeightResolved = (partial: Partial<AppState>) => {
    const next = { ...state, ...partial } as AppState;
    if (generalOnly) {
      goResult(partial);
      return;
    }
    if (needsSplittable(next)) {
      push({ ...partial, screen: 'step_splittable' });
    } else {
      goResult(partial);
    }
  };

  // ── Handlers ──────────────────────────────────────────────
  const handleStart = () => {
    const screenMeta = getScreenMeta('intro');
    track(clickEventName('intro', 'startButton'), screenMeta);
    push({ screen: 'step_category' });
  };

  const handleCategory = (categories: Category[]) => {
    const screenMeta = getScreenMeta('step_category');
    const nextState = { ...state, categories } as AppState;

    track(clickEventName('step_category', 'nextButton'), {
      ...screenMeta,
      ...buildGuideStateProps(nextState),
      category_labels: categoryLabels(config, categories),
    });

    if (categories.includes('GENERAL_FOOD_RECYCLE')) {
      push({ screen: 'step_food_waste', categories });
    } else {
      push({ screen: 'step_item_description', categories });
    }
  };

  const handleFoodWaste = (hasFoodWaste: boolean) => {
    const partial = { hasFoodWaste };
    const screenMeta = getScreenMeta('step_food_waste');

    track(clickEventName('step_food_waste', 'choice'), {
      ...screenMeta,
      ...buildGuideStateProps({ ...state, ...partial } as AppState),
      choice_id: hasFoodWaste ? 'yes' : 'no',
      choice_label: hasFoodWaste ? '네, 포함되어 있어요' : '아니요, 없어요',
    });

    if (needsLengthQuestion({ ...state, ...partial })) {
      push({ ...partial, screen: 'step_item_description' });
    } else {
      push({ ...partial, screen: 'step_weight' });
    }
  };

  const handleItemDescription = (itemDescription: string) => {
    const partial = { itemDescription };
    const screenMeta = getScreenMeta('step_item_description');
    const nextState = { ...state, ...partial } as AppState;

    track(clickEventName('step_item_description', 'nextButton'), {
      ...screenMeta,
      ...buildGuideStateProps(nextState),
    });
    saveItemSearchEvent(nextState, {
      eventName: 'item_description_submitted',
    });

    push({ itemDescription, screen: 'step_length' });
  };

  const handleRestrictedItemDescription = (itemDescription: string, match: HazardousMatch) => {
    saveItemSearchEvent({ ...state, itemDescription } as AppState, {
      eventName: 'restricted_item_detected',
      isRestrictedItem: true,
      hazardousCategory: match.category,
      hazardousKeyword: match.keyword,
    });
  };

  const handleLength = (lengthCm: number, lengthRange: LengthRange) => {
    const partial = { lengthCm, lengthRange };
    const screenMeta = getScreenMeta('step_length');

    track(clickEventName('step_length', 'nextButton'), {
      ...screenMeta,
      ...buildGuideStateProps({ ...state, ...partial } as AppState),
    });

    if (lengthRange === 'OVER_150') {
      goResult(partial);
    } else {
      push({ screen: 'step_weight', ...partial });
    }
  };

  const handleWeight = (id: string) => {
    const weightRange = id as WeightRange;
    const partial = { weightRange };
    const screenMeta = getScreenMeta('step_weight');

    track(clickEventName('step_weight', 'choice'), {
      ...screenMeta,
      ...buildGuideStateProps({ ...state, ...partial } as AppState),
      choice_id: weightRange,
      choice_label: findChoiceLabel(config.choices.weights, weightRange),
    });

    if (weightRange === 'OVER_25') {
      goResult(partial);
    } else if (weightRange === 'UNKNOWN') {
      push({ screen: 'step_perceived_weight', ...partial });
    } else {
      afterWeightResolved(partial);
    }
  };

  const handlePerceivedWeight = (id: string) => {
    const perceivedWeight = id as PerceivedWeight;
    const partial = { perceivedWeight };
    const screenMeta = getScreenMeta('step_perceived_weight');

    track(clickEventName('step_perceived_weight', 'choice'), {
      ...screenMeta,
      ...buildGuideStateProps({ ...state, ...partial } as AppState),
      choice_id: perceivedWeight,
      choice_label: findChoiceLabel(config.choices.perceivedWeights, perceivedWeight),
    });

    if (perceivedWeight === 'HARD_TO_LIFT') {
      goResult(partial);
    } else {
      afterWeightResolved(partial);
    }
  };

  const handleSplittable = (id: string) => {
    const splittableStatus = id as SplittableStatus;
    const partial = { splittableStatus };
    const screenMeta = getScreenMeta('step_splittable');

    track(clickEventName('step_splittable', 'choice'), {
      ...screenMeta,
      ...buildGuideStateProps({ ...state, ...partial } as AppState),
      choice_id: splittableStatus,
      choice_label: findChoiceLabel(config.choices.splittable, splittableStatus),
    });

    goResult(partial);
  };

  const result = state.screen === 'result' ? buildResult(state, config) : null;

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
      <div className="min-h-dvh w-full bg-white md:bg-surface-dim">
        <div className="relative isolate mx-auto min-h-dvh w-full max-w-[768px] bg-white md:shadow-lg">

          {state.screen === 'intro' && (
            <IntroScreen onStart={handleStart} />
          )}

          {state.screen === 'step_category' && (
            <CategoryScreen choices={config.choices.categories} onNext={handleCategory} />
          )}

          {state.screen === 'step_food_waste' && (
            <RadioListScreen
              step={2}
              question="음식물이 포함되어 있나요?"
              subtitle="음식물이나 음식물이 묻은 포장재가 있는지 알려주세요"
              choices={[
                { id: 'yes', label: '네, 포함되어 있어요' },
                { id: 'no', label: '아니요, 없어요' },
              ]}
              onSelect={(id) => handleFoodWaste(id === 'yes')}
            />
          )}

          {state.screen === 'step_item_description' && (
            <ItemDescriptionScreen
              step={itemDescStep}
              hazardousKeywords={config.hazardousKeywords}
              onNext={handleItemDescription}
              onRestrictedItem={handleRestrictedItemDescription}
            />
          )}

          {state.screen === 'step_length' && (
            <LengthSliderScreen step={lengthStep} onNext={handleLength} />
          )}

          {state.screen === 'step_weight' && (
            <RadioListScreen
              step={weightStep}
              question="예상 무게를 알려주세요"
              choices={config.choices.weights}
              onSelect={handleWeight}
            />
          )}

          {state.screen === 'step_perceived_weight' && (
            <RadioListScreen
              step={weightStep}
              question="혼자 들었을 때 어느 쪽에 가까운지 알려주세요"
              subtitle="정확한 무게를 몰라도 괜찮아요"
              choices={config.choices.perceivedWeights}
              onSelect={handlePerceivedWeight}
            />
          )}

          {state.screen === 'step_splittable' && (
            <RadioListScreen
              step={splittableStep}
              question="여러 봉투에 나눠 담을 수 있나요?"
              subtitle="하나로만 버려야 하는 물건이면 '아니요'"
              choices={config.choices.splittable}
              onSelect={handleSplittable}
            />
          )}

          {state.screen === 'result' && result && (
            <ResultScreen
              result={result}
              state={state}
              choices={config.choices}
              onRestart={handleRestart}
              onCta={() => {
                const url =
                  result.recommendation === 'VISIT_PICKUP'
                    ? 'https://abr.ge/7sx2me'
                    : 'https://abr.ge/wn79bl';
                const screenMeta = getScreenMeta('result');

                track(clickEventName('result', 'cta'), {
                  ...screenMeta,
                  ...buildGuideStateProps(state),
                  recommendation: result.recommendation,
                  cta_label: result.cta,
                  cta_url: url,
                });

                window.open(url, '_blank', 'noopener,noreferrer');
              }}
            />
          )}
        </div>
      </div>
    </>
  );
}
