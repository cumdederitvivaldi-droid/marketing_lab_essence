# apps/public/

이 디렉토리에는 VPN 없이 외부에서 접근 가능한 **공개 앱**을 배치합니다.

## 배포 대상

`apps/public/[앱이름]/` 에 앱을 추가하면 GitHub Actions가 자동으로 `covering-labs-public` VM에 배포합니다.

- 접속 주소: `https://public-labs.covering.app/[앱이름]`
- VPN 연결 없이 접근 가능
- 단, site-to-site VPN 미연결 → 내부 AWS 리소스·Admin API 접근 불가

## 앱 추가 방법

`apps/AGENTS.md` → "private vs public 앱 구분" 섹션을 참조하세요.
