# 커버링 Meta 광고 자동 세팅 — 팀원 설치 가이드

## 방법 A : 웹 브라우저에서 바로 사용 (설치 없음)

Render에 배포된 URL로 접속하기만 하면 됩니다.  
배포 URL은 팀 Notion 또는 Slack에서 확인하세요.

**필요한 것: 없음 (브라우저만 있으면 됩니다)**

---

## 방법 B : 내 PC에서 직접 실행 (로컬 개발 / 테스트)

### 1. 다운로드 해야 하는 것

| 항목 | 버전 | 다운로드 링크 |
|------|------|--------------|
| **Python** | 3.10 이상 | https://www.python.org/downloads/ |
| **Git** (선택) | 최신 | https://git-scm.com/downloads |

> Windows 설치 시 Python 설치 화면에서 **"Add Python to PATH"** 체크 필수

### 2. 이 폴더 다운로드

**방법 1 — GitHub에서 ZIP 다운로드 (Git 불필요)**
1. `covering-labs` 저장소 → `Code` → `Download ZIP`
2. 압축 해제 후 `apps/private/meta-ads-automation/` 폴더 이동

**방법 2 — Git 클론**
```bash
git clone https://github.com/covering-app/covering-labs.git
cd covering-labs/apps/private/meta-ads-automation
```

### 3. 패키지 설치 (최초 1회)

PowerShell 또는 터미널에서 아래 명령어 실행:

```powershell
cd covering-labs/apps/private/meta-ads-automation
pip install -r requirements.txt
```

### 4. 앱 실행

```powershell
streamlit run src/app.py
```

브라우저에서 `http://localhost:8501` 자동 오픈됩니다.

### 5. 토큰 입력

앱 왼쪽 사이드바에 **Facebook Access Token** 을 붙여넣으세요.  
토큰은 팀 내부 채널(Slack 또는 Notion)에서 확인하세요.

---

## Render 배포 방법 (관리자용)

1. [render.com](https://render.com) → New Web Service
2. GitHub 저장소 연결: `covering-app/covering-labs`
3. Root Directory: `apps/private/meta-ads-automation`
4. Build Command: `pip install -r requirements.txt`
5. Start Command: `streamlit run src/app.py --server.port $PORT --server.address 0.0.0.0`
6. Environment 탭 → `FACEBOOK_ACCESS_TOKEN` 입력 (팀 토큰)
7. Deploy 클릭

배포 완료 후 생성된 URL을 팀에 공유하면, 팀원들은 설치 없이 바로 사용 가능합니다.

---

## 주의사항

- 생성되는 모든 광고는 **일시정지(PAUSED)** 상태입니다. 활성화는 Meta 광고 관리자에서 직접 진행하세요.
- `FACEBOOK_ACCESS_TOKEN`은 코드나 파일에 저장하지 마세요. 앱 사이드바 또는 서버 환경변수로만 사용합니다.
- `config.json`에는 계정 정보가 포함되어 있습니다. 외부에 공유하지 마세요.
