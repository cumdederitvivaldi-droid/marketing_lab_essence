> 유형: 플랜
> 작성일: 2026-05-19
> 상태: 검토중

# AI PR Guardrail 안정성 정비

알림 노이즈 + 로컬 훅 무력화 + 디듀프 마커 안전성, 세 문제를 같이 해결한다.

## 배경

PR #304 에서 동일한 `cause-pr-missing` 실패로 슬랙 알림 3회 발송 (12:00:35 / 12:01:53 / 13:09:02 KST). 광범위한 원인 분석에서 세 결함이 겹쳐 있었다.

### 문제 1 — 로컬 훅 자체가 안 걸리고 있었음

최근 30개 가드레일 실패 run (18개 unique PR) 작성자 분포:

- `beige-ian` (Claude Code 사용자 추정): 10 PRs
- `covering-joy` (자동 봇 — cross-repo 생성): 3 PRs
- `hound600al`: 3 PRs
- 기타: 2 PRs

훅이 적절히 안 걸린다는 의심을 따라가 두 단계로 깨져 있음을 확인.

#### 1-A. `.claude/settings.json` / `.codex/hooks.json` JSON syntax error

```diff
        {
          "type": "command",
-         "command": "python3 \"$(git rev-parse --show-toplevel ...)/.hooks/protected-file-guard.py\"
+         "command": "python3 \"$(git rev-parse --show-toplevel ...)/.hooks/protected-file-guard.py\""
        },
```

`.claude/settings.json` 53, 91 행 과 `.codex/hooks.json` 55, 90 행 의 PreToolUse Bash hook 정의에서 명령 문자열의 닫는 따옴표가 누락되어 string 안에 newline 이 들어가 JSON 파싱 자체가 실패. Claude Code / Codex 가 두 설정 파일을 못 읽어 hook 5개 전부 미작동.

#### 1-B. 모든 hook 이 Claude Code 입력 형식을 못 읽음

각 hook 은 `payload.get("file_path")`, `payload.get("command")` 등 stdin JSON 의 최상위 키를 직접 읽음. 그러나 **Claude Code 의 PreToolUse / PostToolUse hook 은 `{tool_name, tool_input:{file_path|command|...}}` 형식으로 한 단계 wrap 해서 전달**. 즉:

| 환경 | stdin shape |
|---|---|
| Claude Code | `{"tool_name":"Edit","tool_input":{"file_path":"x","content":"y"}}` |
| Codex | `{"file_path":"x","content":"y"}` |

Claude Code 환경에서는 모든 hook 이 빈 입력을 받아 무조건 통과. 1-A 만 고쳐도 Claude Code 사용자 환경에서는 가드 우회가 그대로 남는다.

### 문제 2 — GitHub Actions 알림 디듀프 부재

`on.pull_request.types` 가 `edited` 포함하므로 작성자가 본문 수정할 때마다 재검증되는데, `notify-failure` 잡에 동일 사유 중복 발송 차단이 없어 매 트리거마다 슬랙 발송.

### 문제 3 — 디듀프 마커가 슬랙 발송 성공 여부와 무관하게 부착될 위험 (CodeRabbit 지적)

초안 구현에선 슬랙 전송 step 이 `curl ... || true` 패턴이라 발송 실패/토큰 누락 시에도 다음 라벨 부착 step 이 실행되어 `guardrail-notified` 마커가 붙음. 한 번 마커가 붙으면 이후 알림이 영구 차단되어 디듀프 의도와 정반대 결과.

## 목표

1. 로컬 훅이 실제로 차단을 수행하도록 복구 → 1차 실패 자체를 줄인다 (Claude Code / Codex 양쪽 환경)
2. GitHub Actions 가 동일 PR / 동일 실패 사유로 알림을 반복 발송하지 않도록 디듀프
3. 디듀프 마커는 *슬랙이 실제로 발송된 경우에만* 부착하여 알림 누락 영구화 방지

## 작업 내역

### A. 로컬 훅 복구

#### A-1. JSON syntax error 수정

- `.claude/settings.json` 53, 91 행 누락 따옴표 보충
- `.codex/hooks.json` 55, 90 행 누락 따옴표 보충

#### A-2. 모든 hook 의 stdin 입력 평탄화

`.hooks/` 의 12개 hook 모두 `load_payload()` 또는 동등 구간에서 Claude Code 의 `tool_input` 을 평탄화하도록 변경.

```python
def load_payload() -> dict:
    """stdin JSON 파싱 + Claude Code의 tool_input wrap 평탄화."""
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}
    tool_input = data.get("tool_input")
    if isinstance(tool_input, dict):
        flat = {k: v for k, v in data.items() if k != "tool_input"}
        flat.update(tool_input)
        return flat
    return data
```

영향 받은 hook:

**PreToolUse Bash** (`command`):
- `pr-policy-guard.py`
- `dangerous-command-guard.py`
- `git-add-secret-guard.py`

**PreToolUse Edit|Write** (`file_path`, `content`, `new_string`, `old_string`):
- `protected-file-guard.py`
- `deploy-yml-guard.py`
- `works-format-guard.py`
- `security-check.py`
- `env-var-registry-check.py`
- `env-example-sync-check.py`

**PostToolUse Edit|Write** (`file_path`):
- `works-status-reminder.py`
- `readme-missing-guard.py`

**복합 (UserPromptSubmit `prompt` + PreToolUse Bash `command`)**:
- `release-file-guard.py`

UserPromptSubmit 전용 hook (`app-purpose-guard.py`, `git-pull-reminder.py`, `deploy-workflow-guide.py`, `security-keyword-guard.py`, `review-resolve-reminder.py`) 는 입력이 항상 flat (`prompt` 최상위) 이라 변경 불필요.

### A-3. 비개발자 PR 실수 사전 차단 검증 8개 추가 (`.hooks/pr-policy-guard.py`)

`general-purpose` agent 가 최근 50개 가드레일 실패 run 을 전수 분석한 결과 모두 `ai-label-missing` 단일 코드 (워크플로 early return). 실제 원인은 두 가지로 갈림:

- (a) 체크박스 [x] 누락 — `beige-ian` ~10건, `hound600al` 3건 등 비개발자 작성자에서 빈발
- (b) PR 템플릿 헤더 자체 결손 — 봇/짧은 본문 PR 에서 발생

GitHub Actions 정규식 `#\d+` 와 어긋나는 입력 패턴도 잠재 위험 (URL 형태, `#` 누락). 다음 검증을 사전 차단으로 추가:

| # | 검증 | 등급 |
|---|---|---|
| 1 | 본문 비어있음 / `test`/`tmp`/`wip` 등 placeholder | block |
| 2 | `## 🤖 AI 사용 여부` 헤더 결손 | block |
| 3 | `## 🚨 후속 수정 여부` 헤더 결손 | block |
| 4 | `원인 PR:` 가 `#` 없이 숫자 / URL 형태 | block |
| 5 | post-release-fix/hotfix 선택했는데 `## 🔗 후속 수정 PR` 섹션 결손 | block |
| 6 | Claude Code 푸터 (`Generated with [Claude Code]` 또는 `Co-Authored-By: Claude`) 가 있는데 `no-ai` 선택 (모순) | block |
| 7 | `문제 코드/파일:` 가 `TODO`/`<...>`/`[...]` placeholder | block |
| 8 | 브랜치 이름이 `YYYY-MM-DD-` 슬러그 누락 (50개 중 22건이 위반) | warn |

각 검증은 기존 `check_pr_body` 의 `errors: list[str]` 누적 패턴을 그대로 따른다. Claude Code / Codex 양쪽 환경에서 평탄화된 입력으로 동일하게 동작한다 (양쪽 형식 × 10개 시나리오 smoke test 통과).

### B. GitHub Actions 디듀프 — `.github/workflows/ai-pr-guardrail.yml`

`guardrail-notified` 마커 라벨 기반:

1. `check-ai-label` 잡 SUCCESS 시 → 마커 라벨이 있으면 제거 (다음 실패 사이클에 다시 1회 알림 허용)
2. `notify-failure` 잡:
   - **dedup step**: 마커 라벨이 이미 있으면 `should_send=false` → 슬랙 / 마커 부착 모두 skip
   - **slack_notify step** (id=slack_notify): Slack API 응답의 `ok` 필드 확인 → 실제 발송 성공시에만 `sent=true` output
   - **마커 부착 step**: `should_send='true' && slack_notify.outputs.sent=='true'` 일 때만 라벨 부착 → 발송 실패 시 마커 미부착으로 다음 트리거에서 재시도 가능

### C. 보호 파일 수정 승인 근거

`.claude/settings.json`, `.codex/hooks.json`, `.hooks/*` 모두 CLAUDE.md / AGENTS.md 에서 "수정 전 반드시 확인" 영역에 해당. 본 PR 의 수정 근거:

- 2026-05-19 운영 슬랙 알림 노이즈 사건 (PR #304 알림 3중 발송) 조사 중 hook 무력화 확인
- 사용자 (jun@covering.app) 명시 승인: "지금 가드레일이 계속 걸리는 것 같은데 훅에 문제 없는지 똑바로 확인해줘", "적절한 방식으로 해결해줘"

## 비목표

- `failure_code` 별 코드별 디듀프 (단일 마커 라벨로 단순화)
- 알림 채널 / 메시지 포맷 변경 없음
- 자동 봇 (`covering-joy`) 의 PR 생성 로직 자체는 별도 레포라 본 PR 범위 외

## Test plan

### 로컬 훅 (A) — 실측 완료

- [x] `.claude/settings.json`, `.codex/hooks.json` 양쪽 `json.load` 파싱 통과
- [x] 12개 hook × Claude Code 형식 (`{tool_input:{...}}`) × Codex 형식 (`{...}`) 전수 smoke test → 양쪽 환경에서 exit code / 출력 일치 확인 (테스트 스크립트 `/tmp/test_all_hooks.py`)
- [x] 정상 PR body → exit 0 / 잘못된 PR body → exit 1 양쪽 형식에서 동일하게 동작
- [x] 비개발자 PR 실수 8개 추가 검증 → 10개 시나리오 양쪽 형식 smoke test 통과 (`/tmp/test_new_validators.py`)

## 완료기준

본 PR 의 완료 여부를 판단하는 항목.

- [x] `.claude/settings.json` / `.codex/hooks.json` JSON 파싱 OK
- [x] 12개 hook 이 Claude Code (`tool_input` wrap) / Codex (flat) 양쪽 환경에서 동일 동작 확인
- [x] `pr-policy-guard.py` 추가 검증 8개 양쪽 형식 smoke test 통과
- [x] 본 PR (#305) 가드레일 SUCCESS — 본 PR body 가 곧 검증 대상
- [ ] 후속 테스트 PR (별도 후속): 본문에 원인 PR 누락한 post-release-fix PR → 1회 알림 + 마커 부착
- [ ] 본문 다른 부분 살짝 수정 (edited 재트리거) → 알림 미발송 + 마커 유지
- [ ] 원인 PR 번호 추가 → 통과 → 마커 자동 제거
- [ ] 통과 후 라인 다시 삭제 → 재실패 → 알림 1회 재발송
- [ ] Slack 토큰 누락 시뮬레이션 → 마커 부착 안 됨 (`slack_notify.outputs.sent=false`) → 다음 트리거에서 재시도 가능

## 영향 분석

- Claude Code / Codex 사용자의 `gh pr create` 1차 실패 빈도 감소
- 동일 사유 중복 알림 차단으로 슬랙 노이즈 감소
- Slack API 응답 검증으로 마커 부착이 실제 발송과 정합
- 새 라벨 `guardrail-notified` 1개 추가 — 가드 통과 시 자동 정리되므로 잔여 라벨 누적 없음
- `weekly-blocking-report` 의 차단율 카운트는 `critical-detected` / `had-followup` 라벨 기반이라 영향 없음
- 자동 봇 (`covering-joy`) 의 cross-repo PR 생성은 여전히 로컬 훅 우회 — GitHub Actions 가 유일한 가드, 다만 본 PR 의 B 디듀프 효과 받음
