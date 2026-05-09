---
name: sort-files
description: 지정한 폴더의 파일/폴더를 생성 날짜 기준으로 YYYY-MM 하위 폴더에 자동 정리. 서브 에이전트를 월별로 병렬 실행하여 분담 처리.
argument-hint: "[폴더_경로]"
---

## 실행 방법

인자로 받은 폴더: `$ARGUMENTS`

---

### Step 1 — 파일 목록 조회

PowerShell로 해당 폴더 내 모든 항목의 이름과 생성 날짜를 조회한다.

```powershell
Get-ChildItem "$ARGUMENTS" | ForEach-Object {
  "$($_.CreationTime.ToString('yyyy-MM')) | $($_.Name)"
} | Sort-Object
```

이미 `yyyy-MM` 형식인 항목(예: `2026-03`, `2026-04`)은 **대상에서 제외**한다 (무한 중첩 방지).

---

### Step 2 — 월별 그룹화

조회 결과를 `yyyy-MM` 기준으로 그룹화하여 각 월별 이동 대상 목록을 확정한다.

---

### Step 3 — 서브 에이전트 병렬 실행

월별로 독립된 서브 에이전트를 **단일 메시지에 동시에** 실행한다 (Agent 도구 복수 호출).

각 서브 에이전트의 임무:
1. `$ARGUMENTS\yyyy-MM\` 폴더 생성 (이미 존재하면 그대로 사용)
2. 해당 월의 파일/폴더를 `Move-Item`으로 이동 (없으면 조용히 건너뜀)
3. 완료 후 해당 월 폴더 내 목록 반환

```powershell
New-Item -ItemType Directory -Path "$ARGUMENTS\yyyy-MM" -Force | Out-Null
Move-Item -Path "$ARGUMENTS\파일명" -Destination "$ARGUMENTS\yyyy-MM\" -Force -ErrorAction SilentlyContinue
```

---

### Step 4 — 결과 보고

모든 에이전트 완료 후 아래 형식으로 요약 보고한다.

| 폴더 | 이동 완료 | 건너뜀 |
|------|----------|--------|
| yyyy-MM/ | N개 | N개 |
