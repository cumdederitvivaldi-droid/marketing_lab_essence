'use client';

import { useEffect, useRef, useState } from 'react';
import BottomSheetModal from './BottomSheetModal';
import FilledButton from './FilledButton';

interface Props {
  onClose: () => void;
  onSubmit: (text: string) => void | Promise<void>;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  maxLength?: number;
}

const DEFAULT_MAX = 500;

// 결과 화면에서 "의견 보내기" 클릭 시 노출되는 하단 입력 모달.
// - 외부 터치 / ESC 로 dismiss
// - textarea maxLength 제한 (기본 500자)
// - 입력 글자 수 표시
// - iOS Safari 자동 확대 방지를 위해 textarea 폰트는 16px+ (`text-body1-regular`)
// - 작성 완료 시 onSubmit 호출
export default function FeedbackDialog({
  onClose,
  onSubmit,
  isSubmitting = false,
  errorMessage,
  maxLength = DEFAULT_MAX,
}: Props) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const trimmedLength = text.trim().length;
  const canSubmit = trimmedLength > 0;

  // 모달 열림 시 textarea 자동 포커스
  useEffect(() => {
    const t = setTimeout(() => textareaRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return;
    await onSubmit(text.trim());
  };

  return (
    <BottomSheetModal onClose={onClose} ariaLabel="의견 보내기">
      {/* sheet 핸들 바 */}
      <div aria-hidden className="mx-auto -mt-1 mb-3 h-1 w-10 rounded-full bg-border-subtle" />

      {/* 헤더: 타이틀 */}
      <h2 className="mb-3 text-body1-emphasized text-text-default">
        추천 결과에 대한 의견을 들려주세요
      </h2>
      <label htmlFor="feedback-text" className="sr-only">
        의견 입력
      </label>
      <textarea
        id="feedback-text"
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, maxLength))}
        maxLength={maxLength}
        placeholder="좋았던 점, 아쉬웠던 점을 알려주세요"
        rows={5}
        className="block w-full resize-none appearance-none rounded-ds-md border-0 bg-surface-dim px-4 py-3 text-body1-regular text-text-default outline-none placeholder:text-text-assistive focus:outline-none focus:ring-0"
      />

      <p className="mt-2 text-right text-label1-regular text-text-tertiary">
        {text.length}/{maxLength}
      </p>

      {errorMessage && (
        <p className="mt-3 text-body2-emphasized text-status-negative" role="alert">
          {errorMessage}
        </p>
      )}

      <div className="mt-4">
        <FilledButton
          label={isSubmitting ? '전송 중' : '작성 완료'}
          onClick={handleSubmit}
          disabled={!canSubmit || isSubmitting}
        />
      </div>
    </BottomSheetModal>
  );
}
