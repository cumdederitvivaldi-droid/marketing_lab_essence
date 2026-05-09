# visual-tools

웹 캡처 무드보드 생성과 파일 날짜별 자동 정리를 묶은 비주얼 작업 도구 플러그인.

## 포함 스킬

### `/moodboard [URL] [저장_폴더] [장수=30]`
웹사이트를 headless 브라우저로 열어 스크롤하며 스크린샷 N장을 캡처해 지정 폴더에 저장한다.

```
/moodboard https://kr.pinterest.com/ C:\Users\<username>\Downloads\moodboard 30
```

### `/sort-files [폴더_경로]`
지정 폴더의 파일을 생성 날짜 기준 `YYYY-MM` 하위 폴더로 자동 정리한다.

```
/sort-files C:\Users\<username>\Downloads\moodboard
```

## MCP

| 서버 | 설명 |
|------|------|
| `playwright` | `npx @playwright/mcp@latest` — 브라우저 자동화 |
