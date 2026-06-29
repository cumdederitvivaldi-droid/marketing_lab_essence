/** @type {import('next').NextConfig} */
// basePath는 covering-labs deploy-app.sh가 디렉토리명 기준으로 자동 생성하지만,
// deploy.yml의 detect 로직(--diff-filter=ACMR)이 파일 삭제(D)를 변경으로 감지하지 않아
// next.config.js 파일을 두지 않으면 재배포가 트리거되지 않는 한계가 있다.
// V1(apps/public/covering-invite/)도 동일 패턴으로 운영 중이며, deploy-app.sh detect
// 로직 개선이 이뤄지기 전까지 V2도 동일하게 명시한다.
const nextConfig = {
  basePath: '/covering-invite-v2',
};

module.exports = nextConfig;
