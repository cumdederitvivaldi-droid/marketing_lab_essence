"use client";

import { useEffect, useMemo, useState } from "react";
import { BASE_PATH, KAKAO_CHANNEL_URL, KAKAO_CHAT_URL } from "@/lib/constants";
import { KakaoIcon } from "@/components/ui/KakaoIcon";

type CopyState = "idle" | "copied" | "failed";

function isAndroidUserAgent(userAgent: string) {
  return /Android/i.test(userAgent);
}

async function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("copy failed");
  }
}

export function KakaoBridgeClient() {
  const [isAndroid, setIsAndroid] = useState<boolean | null>(null);
  const [copyState, setCopyState] = useState<CopyState>("idle");

  useEffect(() => {
    const isAndroid = isAndroidUserAgent(window.navigator.userAgent);
    const stateTimer = window.setTimeout(() => setIsAndroid(isAndroid), 0);

    if (isAndroid) {
      return () => window.clearTimeout(stateTimer);
    }

    const redirectTimer = window.setTimeout(() => {
      window.location.replace(KAKAO_CHAT_URL);
    }, 350);

    return () => {
      window.clearTimeout(stateTimer);
      window.clearTimeout(redirectTimer);
    };
  }, []);

  const primaryHref = isAndroid === false ? KAKAO_CHAT_URL : KAKAO_CHANNEL_URL;
  const copyTarget = isAndroid === false ? KAKAO_CHAT_URL : KAKAO_CHANNEL_URL;
  const statusText = useMemo(() => {
    if (isAndroid === null) {
      return "카카오 상담 연결을 준비하고 있습니다.";
    }
    if (isAndroid) {
      return "현재 앱 안에서는 카카오톡 상담이 바로 열리지 않을 수 있어요. 채널 페이지를 연 뒤 상담을 시작해 주세요.";
    }
    return "카카오톡 상담으로 연결 중입니다.";
  }, [isAndroid]);

  const handleCopy = async () => {
    try {
      await copyToClipboard(copyTarget);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <section className="mx-auto flex min-h-[calc(100dvh-64px)] w-full max-w-[420px] flex-col justify-center">
      <div className="rounded-lg border border-border-light bg-white p-6 shadow-md">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-md bg-kakao text-[#371D1E]">
          <KakaoIcon size={28} />
        </div>

        <h1 className="text-[24px] font-bold leading-[32px] text-text-primary">
          카카오톡 상담으로 이어갈게요
        </h1>
        <p className="mt-3 text-[15px] leading-6 text-text-sub">
          {statusText}
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <a
            href={primaryHref}
            className="inline-flex h-[50px] items-center justify-center gap-2 rounded-md bg-kakao px-5 text-[15px] font-semibold text-[#371D1E] transition-colors hover:bg-kakao-hover"
          >
            <KakaoIcon size={18} />
            {isAndroid === false ? "카카오톡 상담 바로 열기" : "카카오 채널 열기"}
          </a>

          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex h-[46px] items-center justify-center rounded-md border border-border bg-white px-5 text-[14px] font-semibold text-text-primary transition-colors hover:bg-bg-warm2"
          >
            {copyState === "copied"
              ? "링크가 복사됐어요"
              : copyState === "failed"
                ? "복사 실패, 채널 열기를 눌러주세요"
                : "상담 링크 복사"}
          </button>

          <a
            href={BASE_PATH}
            className="inline-flex h-[42px] items-center justify-center rounded-md px-5 text-[14px] font-semibold text-text-sub transition-colors hover:bg-bg-warm2"
          >
            방문수거 페이지로 돌아가기
          </a>
        </div>
      </div>
    </section>
  );
}
