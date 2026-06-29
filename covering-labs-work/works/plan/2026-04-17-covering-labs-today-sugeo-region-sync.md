# 오늘수거 서비스 지역 동기화 배치 플랜

> 유형: 플랜
> 작성일: 2026-04-17
> 상태: 완료

## Goal

- 오늘수거 공개 서비스 지역 페이지를 매일 수집해 시군구 기준 스냅샷 파일로 정규화한다.
- 결과물을 `gs://covering-labs/beige/today-sugeo-region-sync/` 아래에 올려 이후 Grafana 레이어가 안정적으로 읽을 수 있게 만든다.

## Current Status

- 기존 서비스 지역 지도는 우리 서비스 지역만 읽고 있다.
- 오늘수거 쪽은 공식 공개 페이지에 서비스 지역이 텍스트로만 공개돼 있고, 현재 자동 수집 배치는 없다.
- 커버링 랩스는 `batch` 앱과 Cloud Storage 업로드 패턴이 이미 있으므로 이번 청크는 배치 앱 추가만 하면 된다.
- PR 리뷰 과정에서 두 가지 정합성 이슈가 확인됐다: 고양시 시군구 코드 오매핑, 그리고 batch 표준(`apps/AGENTS.md`의 `/shared/.env + _load_env_file()`) 대비 실제 런타임 로더 누락.

## Context Lens

- Required: yes
- Primary lens: engineering
- Secondary lens: product
- Why this lens: 외부 공개 페이지를 안정적으로 수집하고, 이후 지도 패널이 바로 읽을 수 있는 정규화 산출물을 만드는 작업이기 때문이다.
- Source: delightroom-category-router
- Applied checks: parsing, batch, storage, verification, PR

## Working Contract

- In scope: 오늘수거 공개 페이지 수집, 서비스 지역 파싱, 시군구 코드 매핑, 로컬 산출물 작성, Cloud Storage 업로드, daily 배치 설정, PR 생성
- Out of scope: Grafana 패널 연결, 경쟁자 지역별 사용자 수 추정, 오늘수거 외 다른 경쟁자 레이어 추가
- Done means: `apps/today-sugeo-region-sync` 배치가 `--dry-run`으로 정상 실행되고, 산출물 구조와 업로드 경로가 문서화된 상태로 PR이 생성된다.
- How to verify: 라이브 페이지 기준 dry-run 실행, 추출 지역/행 개수 확인, 로컬 산출물 파일 확인, git diff 검토, PR 생성
- Main risks: 오늘수거 페이지 HTML 구조 변경, 새 서비스 지역 추가로 인한 매핑 누락, 서버 실행 환경의 `gsutil` 경로 차이

## Design / Decisions

- 소스는 오늘수거 공식 가정 페이지 `https://www.sugeo.onl/home` 하나만 사용한다.
- 대시보드가 바로 쓰기 쉽도록 결과는 `시군구 코드 1행 = 1권역` 기준으로 정규화한다.
- 일부 동만 서비스하는 지역은 `coverage_type=partial_dong`으로 남기고 동 목록도 같이 저장한다.
- 공개 페이지에 없는 사용자 수 추정 로직은 이번 청크에서 넣지 않는다.
- Cloud Storage 업로드는 `latest/`와 `snapshots/{date}/{time}/` 두 경로를 같이 유지한다.
- batch 환경변수 처리는 문서 설명만 두지 않고, 실제 crontab 실행 경로와 맞도록 `/shared/.env + _load_env_file()` 표준을 코드에 같이 반영한다.

## Implementation Log

- [x] 커버링 랩스 배치 앱 구조와 배포 규칙 확인
- [x] 오늘수거 공개 페이지 최신 서비스 지역 구조 재확인
- [x] 배치 앱 파일 추가
- [x] dry-run 검증
- [x] 커밋, 푸시, PR 생성
- [x] PR 리뷰 반영: 고양시 시군구 코드 정정
- [x] PR 리뷰 반영: `도시명 + 동목록` 한 줄 토큰 파싱 보강
- [x] 운영 보강: crontab 런타임에서 `/shared/.env` 자동 로드 추가
- [x] 문서 보강: 어떤 표준을 위배했고 왜 수정했는지 README/플랜에 명시
- [x] PR 리뷰 반영: 빈 파싱 결과는 `latest`를 덮지 않도록 fail-closed 가드 추가

## Changed Files

- `apps/today-sugeo-region-sync/.gitignore`
- `apps/today-sugeo-region-sync/README.md`
- `apps/today-sugeo-region-sync/deploy.yml`
- `apps/today-sugeo-region-sync/requirements.txt`
- `apps/today-sugeo-region-sync/src/artifact_store.py`
- `apps/today-sugeo-region-sync/src/main.py`
- `apps/today-sugeo-region-sync/src/region_map.json`
- `apps/today-sugeo-region-sync/src/region_parser.py`
- `apps/today-sugeo-region-sync/src/settings.py`
- `works/plan/2026-04-17-covering-labs-today-sugeo-region-sync.md`

## Verification

- 명령/방법: `python3 src/main.py --dry-run`
- 결과: 블록 34개, 시군구 행 61개, 도시 19개 추출 확인
- 명령/방법: `python3 - <<'PY' ... PY`
- 결과: `하남시 선동, 망월동, 풍산동, 덕풍동` / `광명시 하안동, 소하동` 같은 단일 토큰이 각각 `partial_dong` 블록으로 파싱되는 것 확인
- 명령/방법: `python3 -m json.tool src/region_map.json >/dev/null`
- 결과: JSON 문법 통과, 고양시 매핑을 `덕양구=41281`, `일산동구=41285`, `일산서구=41287`로 정정
- 명령/방법: `python3 - <<'PY' ... PY`
- 결과: `ENV_FILE=/tmp/...` 기준으로 `TODAY_SUGEO_BUCKET` 환경변수가 `/shared/.env` 스타일 파일에서 자동 로드되는 것 확인
- 명령/방법: `python3 - <<'PY' ... PY`
- 결과: `block_count=0`, `row_count=0` 요약값에서 `validate_summary()`가 예외를 발생시켜 빈 `latest` 산출물 쓰기를 막는 것 확인
- 명령/방법: `python3 src/main.py`
- 결과: `gs://covering-labs/beige/today-sugeo-region-sync/latest/` 와 `snapshots/2026-04-17/153442/` 업로드 확인
- 명령/방법: `python3 -m py_compile src/*.py`
- 결과: 통과
- 명령/방법: `gsutil cat gs://covering-labs/beige/today-sugeo-region-sync/latest/today_sugeo_summary.json`
- 결과: 최신 스냅샷 기준 도시 19개, 시군구 61개 확인

## Release / Handoff

- 브랜치: `feat/2026-04-17-today-sugeo-region-sync`
- 커밋: `b80dd4c`
- PR: `https://github.com/covering-app/covering-labs/pull/36`
- 운영 전달사항: 머지되면 커버링 랩스 배포 파이프라인을 통해 daily batch로 반영된다.

## Risks / Blockers

- 오늘수거가 새 서비스 지역을 추가하면 `src/region_map.json`에 시군구 코드 매핑을 같이 업데이트해야 한다.
- 현재 `gsutil` 실행 시 Python 3.9 deprecation warning과 LibreSSL warning이 출력되지만 업로드 자체는 성공했다.

## Independent Review

- Contract met: yes
- Out-of-scope preserved: yes
- Verification evidence present: yes
- Ready for next session: yes

## Next Step

- PR 리뷰 후 main 머지, 이후 경쟁자 지도 레이어에서 `latest/today_sugeo_regions.json`을 읽게 연결한다.
