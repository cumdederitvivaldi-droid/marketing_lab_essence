# meta-ads-automation

Meta Marketing API를 통해 광고 세트·소재를 자동으로 생성하는 CLI 도구다.

## 구성 파일

| 파일 | 설명 |
|------|------|
| `src/setup_wizard.py` | 대화형 마법사 — 메인 진입점 |
| `src/create_adset_from_folder.py` | 폴더 기반 세트+소재 일괄 생성 (CLI / 마법사 공용 모듈) |
| `src/add_to_adset.py` | 기존 세트에 소재 추가 |
| `src/update_creative.py` | 기존 광고의 소재 교체 |
| `src/create_campaign.py` | job JSON 기반 전체 캠페인 생성 |
| `src/config.json` | 계정·타겟·소재 기본 설정 |
| `src/job_example.json` | create_campaign.py 입력 예시 |

## 실행

```bash
# 환경변수 설정 (PowerShell)
$env:FACEBOOK_ACCESS_TOKEN = "토큰값"

# 대화형 마법사
python3 src/setup_wizard.py

# 폴더 기반 직접 실행
python3 src/create_adset_from_folder.py \
    --campaign_id 120231883282870514 \
    --folder "./content" \
    --adset_name "aos_purchase_all_vd_컨셉(후킹)_mk1_26.05.15" \
    --ad_name "aos_vd_all_컨셉(후킹)_mk1_26.05.15" \
    --os aos \
    --targeting all \
    --title "첫 주문 990원" \
    --message "드디어!..."

# 기존 세트에 소재 추가
python3 src/add_to_adset.py \
    --adset_id 120231883282870514 \
    --video "./video.mp4" \
    --ad_name "aos_vd_all_컨셉(후킹)2_mk1_26.05.15"

# 미리보기 (실제 API 호출 없음)
python3 src/setup_wizard.py --dry-run
```

## 정책

- 생성되는 모든 세트·광고는 **PAUSED** 상태다. 활성화는 Meta 광고 관리자에서 직접 진행한다.
- iOS 지면: Instagram 전용 / AOS 지면: Facebook + Instagram
- 어드벤티지 크리에이티브 전체 OFF
- CBO 캠페인일 경우 세트 예산 필드를 자동 제외한다.
- 영상 업로드 후 Meta 처리 완료(`video_status=ready`) 확인 후 소재를 생성한다.
- 액세스 토큰은 `FACEBOOK_ACCESS_TOKEN` 환경변수로만 주입한다. 코드·파일에 기록하지 않는다.

