import DisposalGuideApp from '@/src/DisposalGuideApp';
import { loadDisposalGuideConfig } from '@/src/lib/loadGuideConfig';

// Supabase 운영 데이터 자동 갱신 (1시간 단위 ISR)
export const revalidate = 3600;

export default async function Page() {
  const guideConfig = await loadDisposalGuideConfig();
  return <DisposalGuideApp guideConfig={guideConfig} />;
}
