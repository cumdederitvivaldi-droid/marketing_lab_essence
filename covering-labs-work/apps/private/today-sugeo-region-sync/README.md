# 오늘수거 서비스 지역 동기화 배치

오늘수거 공식 가정 페이지의 공개 서비스 지역을 매일 수집해 시군구 기준 스냅샷으로 저장하는 배치입니다.

## 목적

오늘수거 서비스의 공개 지역 정보를 일일 기준으로 수집하고, 시군구 코드와 매칭하여 구조화된 데이터로 관리합니다. 수집 결과는 로컬과 Google Cloud Storage에 최신본과 타임스탬프 기준 스냅샷으로 보관됩니다.

## 실행 환경

- 실행 방식: cron 배치
- 실행 주기: 매일 08:00 KST
- 실행 서버: 배치 서버
- 스케줄 설정: `0 8 * * *` (deploy.yml 참조)

## 주요 파일

| 파일 | 역할 |
|------|------|
| `src/main.py` | 배치 진입점. HTML 수집, 파싱, 산출물 생성 및 업로드 전체 흐름 관리 |
| `src/region_parser.py` | 오늘수거 페이지 HTML 파싱. 도시/지역/동 정보 추출 및 블록 생성 |
| `src/artifact_store.py` | 산출물 파일 저장 및 Cloud Storage 업로드 |
| `src/settings.py` | 환경변수 로더 및 기본값 관리. crontab 실행 환경에서 `/shared/.env` 자동 로드 |
| `src/region_map.json` | 도시/지역명과 시군구 코드 매핑 테이블 |
| `deploy.yml` | 배치 배포 메타데이터 (스케줄, 실행 명령어) |
| `requirements.txt` | Python 패키지 의존성 |

## 환경변수

환경변수는 기본값이 정의되어 있으며, crontab 실행 시 `/shared/.env` 에 정의하면 자동으로 로드됩니다. `src/settings.py` 의 `_load_env_file()` 함수가 배치 시작 시 자동 호출됩니다.

| 변수명 | 기본값 | 설명 |
|--------|--------|------|
| `TODAY_SUGEO_SOURCE_URL` | `https://www.sugeo.onl/home` | 오늘수거 공식 페이지 URL |
| `TODAY_SUGEO_USER_AGENT` | Chrome 135 UA | HTML 요청 시 사용할 User-Agent |
| `TODAY_SUGEO_BUCKET` | `covering-labs` | Google Cloud Storage 버킷명 |
| `TODAY_SUGEO_PREFIX` | `beige/today-sugeo-region-sync` | Cloud Storage 업로드 경로 prefix |
| `TODAY_SUGEO_GSUTIL_BIN` | `gsutil` | gsutil 바이너리 경로 |

## 실행 방법

### 일반 실행

```bash
python3 src/main.py
```

### 드라이 런 (로컬 파일만 생성, Cloud Storage 업로드 제외)

```bash
python3 src/main.py --dry-run
```

### Cloud Storage 업로드 제외

```bash
python3 src/main.py --skip-upload
```

### 커스텀 출력 디렉토리 지정

```bash
python3 src/main.py --output-dir /custom/path
```

## 의존 서비스

| 서비스 | 용도 |
|--------|------|
| 오늘수거 공식 페이지 (`https://www.sugeo.onl/home`) | HTML 페이지 스크래핑 |
| Google Cloud Storage | 산출물 최신본 및 스냅샷 저장 |
| `/shared/.env` | 런타임 환경변수 파일 (crontab 실행 환경) |

## 산출물

모든 산출물은 로컬 `output/` 디렉토리에 저장되며, Cloud Storage `gs://covering-labs/beige/today-sugeo-region-sync/` 아래에 업로드됩니다.

### 파일 구조

```text
output/
├── latest/                    # 최신 산출물
│   ├── today_sugeo_summary.json        # 요약 정보
│   ├── today_sugeo_regions.json        # 시군구 행 데이터 (JSON)
│   ├── today_sugeo_regions.csv         # 시군구 행 데이터 (CSV)
│   └── today_sugeo_blocks.json         # 파싱된 블록 데이터
└── snapshots/
    └── {YYYY-MM-DD}/                   # 수집 날짜
        └── {HHMMSS}/                   # 수집 시간
            ├── today_sugeo_summary.json
            ├── today_sugeo_regions.json
            ├── today_sugeo_regions.csv
            └── today_sugeo_blocks.json
```

### 산출물 스키마

#### today_sugeo_summary.json

배치 실행 결과의 메타정보 요약입니다.

```json
{
  "snapshot_date": "2026-04-17",
  "collected_at_kst": "2026-04-17T08:00:00+09:00",
  "competitor_key": "today_sugeo",
  "competitor_name": "오늘수거",
  "source_url": "https://www.sugeo.onl/home",
  "source_hash": "sha256...",
  "block_count": 150,
  "row_count": 240,
  "block_count_by_type": {
    "full_city": 10,
    "partial_dong": 140
  },
  "row_count_by_type": {
    "full_city": 95,
    "partial_dong": 145
  },
  "city_count": 25,
  "region_count": 240,
  "cities": ["서울시", "부천시", "의정부시", ...]
}
```

#### today_sugeo_regions.json / today_sugeo_regions.csv

오늘수거 서비스 지역을 시군구 단위로 정규화한 데이터입니다. 각 행은 한 시군구의 서비스 정보를 나타냅니다.

```json
[
  {
    "snapshot_date": "2026-04-17",
    "collected_at_kst": "2026-04-17T08:00:00+09:00",
    "competitor_key": "today_sugeo",
    "competitor_name": "오늘수거",
    "source_url": "https://www.sugeo.onl/home",
    "source_hash": "sha256...",
    "city_name": "서울시",
    "district_name": "강남구",
    "region_label": "서울시 강남구",
    "sgg_code": "11680",
    "coverage_type": "full_city",
    "dong_count": 0,
    "dong_names": "",
    "raw_text": "서울시 전 지역 가능"
  }
]
```

**필드 설명:**

| 필드 | 설명 |
|------|------|
| `snapshot_date` | 수집 날짜 (YYYY-MM-DD) |
| `collected_at_kst` | 수집 시각 (ISO 8601 형식, KST) |
| `competitor_key` | 경쟁사 식별자 |
| `competitor_name` | 경쟁사명 |
| `source_url` | 수집 원본 URL |
| `source_hash` | HTML 콘텐츠 SHA-256 해시 |
| `city_name` | 도시명 (예: 서울시, 부산시) |
| `district_name` | 자치구/군/시명 |
| `region_label` | 표시용 지역명 |
| `sgg_code` | 시군구 행정코드 (5자리) |
| `coverage_type` | 커버리지 유형 (`full_city` 또는 `partial_dong`) |
| `dong_count` | 동 개수 (부분 서비스 지역일 때만) |
| `dong_names` | 동명 목록 (쉼표 구분) |
| `raw_text` | 원본 페이지에서 추출한 텍스트 |

#### today_sugeo_blocks.json

파싱된 원본 블록 데이터입니다. 도시/지역/동 정보의 구조화되지 않은 원본입니다.

```json
[
  {
    "coverage_type": "full_city",
    "city_name": "서울시",
    "district_name": null,
    "dong_names": [],
    "raw_text": "서울시 전 지역 가능"
  }
]
```

## 주의사항

### 서비스 지역 업데이트

오늘수거 공식 페이지에 새로운 도시 또는 자치구/군이 추가될 경우, `src/region_map.json` 에 시군구 코드 매핑을 추가해야 합니다. 매핑이 없으면 해당 지역은 파싱되지 않으며, 배치는 `ValueError` 로 중단됩니다:

```text
시군구 코드 매핑이 없는 오늘수거 권역이 있습니다: {지역명}
```

매핑 구조:

```json
{
  "full_city": {
    "신규도시": [
      { "sgg_code": "12345", "district_name": "신규구", "region_label": "신규도시 신규구" }
    ]
  },
  "partial": {
    "도시명": {
      "자치구명": { "sgg_code": "12345", "district_name": "자치구명", "region_label": "도시명 자치구명" }
    }
  }
}
```

### 빈 데이터 검증

배치는 `validate_summary()` 에서 파싱 결과가 비어있지 않은지 확인합니다. 파싱에 실패하면 다음 오류로 중단되며 Cloud Storage 업로드는 수행되지 않습니다:

```text
오늘수거 서비스 지역을 파싱하지 못했습니다. 빈 latest 산출물 업로드를 막기 위해 실행을 중단합니다.
```

### Cloud Storage 권한

배치 서버는 다음 권한이 필요합니다:

- `storage.objects.create` (파일 업로드)
- `storage.objects.delete` (기존 파일 덮어쓰기)
- 버킷: `gs://covering-labs/beige/today-sugeo-region-sync/`

### 파일 인코딩

모든 산출물은 UTF-8 인코딩으로 저장됩니다. JSON 파일에서 한글은 유니코드로 escape되지 않고 직접 저장됩니다.

### 로그 출력

배치는 다음 정보를 stdout으로 출력합니다:

```text
[today-sugeo-region-sync] 블록 {수}개 / 시군구 행 {수}개
[today-sugeo-region-sync] 도시 {수}개 / 시군구 {수}개
[today-sugeo-region-sync] latest 산출물: {경로}
[today-sugeo-region-sync] 업로드 완료
  - gs://covering-labs/beige/today-sugeo-region-sync/latest/{파일명}
  - ...
```

crontab 실행 시 이 출력은 이메일로 수신됩니다.
