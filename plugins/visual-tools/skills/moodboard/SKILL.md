---
name: moodboard
description: 웹사이트(Pinterest 등)에서 스크롤하며 스크린샷 N장을 자동 캡처해 지정 폴더에 저장. Python Playwright(headless)로 실행.
argument-hint: "[URL] [저장_폴더_경로] [캡처_장수=30]"
---

## 실행 방법

인자로 받은 값: `$ARGUMENTS`

- **URL**: 캡처할 웹사이트 주소 (예: https://kr.pinterest.com/)
- **저장 폴더**: 이미지를 저장할 로컬 경로 (예: C:\Users\hound\Downloads\도라지)
- **캡처 장수**: 기본값 30 (생략 가능)

---

### Step 1 — 환경 확인 및 준비

Python playwright 설치 여부 확인 후 없으면 설치한다.

```bash
python -c "import playwright" 2>&1 || pip install playwright
python -m playwright install chromium
```

저장 폴더가 없으면 생성한다.

```powershell
New-Item -ItemType Directory -Path "<저장_폴더>" -Force | Out-Null
```

---

### Step 2 — 캡처 스크립트 생성 및 실행

아래 Python 스크립트를 임시 파일로 작성한 뒤 실행한다.

```python
import asyncio, os
from playwright.async_api import async_playwright

URL        = "<URL>"
OUTPUT_DIR = r"<저장_폴더>"
COUNT      = <캡처_장수>   # 기본 30

async def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 900},
            locale="ko-KR"
        )
        page = await context.new_page()
        await page.goto(URL, wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(3000)

        for i in range(COUNT):
            path = os.path.join(OUTPUT_DIR, f"capture_{i+1:02d}.png")
            await page.screenshot(path=path, full_page=False)
            print(f"[{i+1}/{COUNT}] 저장: {path}")
            if i < COUNT - 1:
                await page.evaluate("window.scrollBy(0, 800)")
                await page.wait_for_timeout(1500)
                if (i + 1) % 5 == 0:
                    await page.wait_for_timeout(2000)

        await browser.close()
        print(f"\n완료! 총 {COUNT}장 → {OUTPUT_DIR}")

asyncio.run(main())
```

스크립트는 `<저장_폴더>\moodboard_capture.py` 에 저장 후 실행한다.

---

### Step 3 — 결과 보고

실행 완료 후 아래 형식으로 보고한다.

| 항목 | 내용 |
|------|------|
| 캡처 URL | `<URL>` |
| 저장 위치 | `<저장_폴더>` |
| 저장 파일 | `capture_01.png` ~ `capture_<N>.png` |
| 총 장수 | N장 |

파일이 정상 저장됐는지 폴더 내 파일 개수로 최종 확인한다.

```powershell
(Get-ChildItem "<저장_폴더>" -Filter "*.png").Count
```
