import type { BrandMessage, SweetTrackerSendResult } from "./types";

// 스윗트래커 실제 응답 구조 (PDF 3.2 / 3.3.1 예시 기준) — array of these
interface RawSendResponseItem {
  msgid: string;
  result: "Y" | "N";
  code: string;
  error?: string;
  kind?: string;
  originCode?: string;
  originError?: string;
  sendtime?: string;
}

const API_BASE = "https://alimtalk-api.sweettracker.net";
// 이미지 업로드 / 결과 조회 등 관리 API 는 별도 host (PDF 4.1절 / 3.3절 운영서버)
const MGMT_API_BASE = "https://alimtalk-api.bizmsg.kr";

function getCredentials(): { profileKey: string; userId: string } {
  const profileKey = process.env.SWEETTRACKER_PROFILE_KEY;
  const userId = process.env.SWEETTRACKER_USERID;
  if (!profileKey) throw new Error("SWEETTRACKER_PROFILE_KEY 환경변수가 설정되지 않았습니다.");
  if (!userId) throw new Error("SWEETTRACKER_USERID 환경변수가 설정되지 않았습니다.");
  return { profileKey, userId };
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// 100건 단위 chunk + 순차 처리 (병렬 절대 금지 — API 가 순차 처리)
export async function sendBatch(messages: BrandMessage[]): Promise<SweetTrackerSendResult[]> {
  const { profileKey, userId } = getCredentials();
  const chunks = chunkArray(messages, 100);
  const allResults: SweetTrackerSendResult[] = [];

  for (const chunk of chunks) {
    const res = await fetch(`${API_BASE}/v2/${profileKey}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        userid: userId,
      },
      body: JSON.stringify(chunk),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`SweetTracker API 오류 ${res.status}: ${text}`);
    }

    // 응답은 array — 각 row 가 개별 메시지 결과
    const data = (await res.json()) as RawSendResponseItem[];
    if (!Array.isArray(data)) {
      // 예상치 못한 형태 — 모든 chunk 메시지를 unknown 실패로 기록
      for (const msg of chunk) {
        allResults.push({
          msgid: msg.msgid,
          success: false,
          result_code: "UNKNOWN",
          result_message: "응답 형식이 예상과 다릅니다",
        });
      }
      continue;
    }
    for (const r of data) {
      allResults.push({
        msgid: r.msgid,
        success: r.result === "Y",
        result_code: r.code,
        result_message: r.error,
        kind: r.kind,
        origin_code: r.originCode,
        origin_error: r.originError,
      });
    }
  }

  return allResults;
}

// 발송 결과 조회 — 단일 발신프로필 (PDF 3.3.1) — 40일 내 발송 건만
// 100건 단위 chunk + 순차 처리.
export async function queryResult(msgids: string[]): Promise<SweetTrackerSendResult[]> {
  const { profileKey, userId } = getCredentials();
  const chunks = chunkArray(msgids, 100);
  const allResults: SweetTrackerSendResult[] = [];

  for (const chunk of chunks) {
    const res = await fetch(`${API_BASE}/v2/${profileKey}/response`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        userid: userId,
      },
      body: JSON.stringify(chunk.map((id) => ({ msgid: id }))),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`SweetTracker queryResult 오류 ${res.status}: ${text}`);
    }

    const data = (await res.json()) as RawSendResponseItem[];
    if (!Array.isArray(data)) continue;
    for (const r of data) {
      allResults.push({
        msgid: r.msgid,
        success: r.result === "Y",
        result_code: r.code,
        result_message: r.error,
        kind: r.kind,
        origin_code: r.originCode,
        origin_error: r.originError,
      });
    }
  }

  return allResults;
}

// 이미지 업로드 — PDF 4.2.1 (이미지형/커머스형/프리미엄동영상형) 또는 4.2.1.2 (와이드형)
// kind: "default" → FI/FM/FP 용 (800x400 권장, 비율 2:1~3:4)
//       "wide"    → FW 용 (800x600 권장, 비율 2:1~1:1)
// 둘 다 jpg/png · 최대 5MB · 가로 500px 이상.
// 응답: imageUrl (사전 업로드된 카카오 CDN URL — 이후 sendMessage 의 image_url 로 사용)
export async function uploadImage(
  buffer: Buffer | Blob,
  kind: "default" | "wide",
  filename: string,
  nickname?: string,
): Promise<{ imageUrl: string; imageName: string; imageNickname: string }> {
  const { userId } = getCredentials();

  const path = kind === "wide" ? "/v1/direct/image/wide" : "/v1/direct/image/default";

  const form = new FormData();
  // Node 의 fetch FormData 는 Blob 받음 — Buffer 면 Blob 으로 변환
  const blob = buffer instanceof Blob
    ? buffer
    : new Blob([new Uint8Array(buffer)], { type: filename.endsWith(".png") ? "image/png" : "image/jpeg" });
  form.append("image", blob, filename);
  if (nickname) form.append("imageNickname", nickname.slice(0, 30));

  // 헤더는 case-insensitive — userId + userid 둘 다 보내면 fetch 가 병합해서 "covering20, covering20" 으로 보냄
  // (서버: "존재하지 않는 사용자 계정"). PDF 4.2 절 표기인 'userId' 단독 사용.
  const res = await fetch(`${MGMT_API_BASE}${path}`, {
    method: "POST",
    headers: { userId },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`SweetTracker uploadImage 오류 ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    code: string;
    message?: string;
    data?: { imageName?: string; imageNickname?: string; imageUrl?: string };
  };

  if (data.code !== "success" || !data.data?.imageUrl) {
    throw new Error(`이미지 업로드 실패: ${data.message ?? data.code}`);
  }

  return {
    imageUrl: data.data.imageUrl,
    imageName: data.data.imageName ?? filename,
    imageNickname: data.data.imageNickname ?? "",
  };
}
