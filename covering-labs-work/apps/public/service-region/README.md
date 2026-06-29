# service-region

커버링 서비스 지역 안내 페이지

## 목적

서울, 경기도, 인천, 충청도 지역의 커버링 서비스 이용 가능 여부와 지역별 수거 요일을 안내합니다. 고객이 서비스 가능 여부를 직접 확인할 수 있는 공개 페이지입니다.

## 실행 환경

- 실행 방식: PM2
- 실행 서버: covering-labs-public (공개 서버, VPN 불필요)
- 접속 URL: `https://public-labs.covering.app/service-region`

## 주요 파일

| 파일 | 역할 |
|---|---|
| `app/page.tsx` | 메인 페이지, 지역 탭 상태 관리 |
| `app/components/RegionChips.tsx` | 상단 지역 선택 칩 네비게이션 |
| `app/components/Seoul.tsx` | 서울 지역 지도 이미지 |
| `app/components/Gyeonggi.tsx` | 경기도 지도 + 수거요일 + 이용불가 지역 |
| `app/components/Incheon.tsx` | 인천 지도 + 수거요일 + 이용불가 지역 |
| `app/components/Chungcheong.tsx` | 충청도 지도 + 수거요일 + 이용불가 지역 |
| `public/images/` | 지역별 서비스 지도 이미지 (PNG) |

## 환경변수

없음 (정적 콘텐츠 페이지)

## 실행 방법

```bash
npm install
npm run dev   # http://localhost:3000
npm run build
```

## 의존 서비스

없음

## 주의사항

- `public/images/` 내 지도 이미지는 Figma Make에서 export된 PNG 파일입니다.
- 지역 데이터 업데이트 시 각 컴포넌트 파일의 데이터를 직접 수정하세요.
- `basePath`는 배포 스크립트가 자동으로 설정합니다. `next.config.js`를 직접 생성하지 마세요.
