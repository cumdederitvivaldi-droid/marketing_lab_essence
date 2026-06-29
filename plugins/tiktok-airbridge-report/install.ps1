# tiktok-airbridge-report — Windows 자동 설치 스크립트
# 한 줄 실행:
#   irm https://raw.githubusercontent.com/hound600al/marketing-lab-26-05-09/main/plugins/tiktok-airbridge-report/install.ps1 | iex
#
# 수행 작업:
#   1. 사전 요구사항 검사 (git, node, python, claude)
#   2. openpyxl 설치 (pip)
#   3. TikTok Ads + Airbridge MCP 서버 등록
#   4. marketplace 등록 + tiktok-airbridge-report 플러그인 설치
#   5. TIKTOK_ADVERTISER_ID, AIRBRIDGE_APP_NAME 환경변수 영구 설정
#   6. OAuth 안내

#Requires -Version 5.1
$ErrorActionPreference = "Stop"

function Test-Cmd($cmd) {
    try { Get-Command $cmd -ErrorAction Stop | Out-Null; return $true } catch { return $false }
}

function Write-Step($msg) { Write-Host "`n▸ $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "  ✗ $msg" -ForegroundColor Red }

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor DarkCyan
Write-Host "  tiktok-airbridge-report 자동 설치" -ForegroundColor White
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor DarkCyan

# 1. 사전 요구사항
Write-Step "1/6  사전 요구사항 검사"
$missing = @()
if (-not (Test-Cmd "git"))    { $missing += @{ name="Git for Windows"; url="https://git-scm.com/download/win" } }
if (-not (Test-Cmd "node"))   { $missing += @{ name="Node.js 18+";    url="https://nodejs.org" } }
if (-not (Test-Cmd "python")) { $missing += @{ name="Python 3.10+";   url="https://www.python.org/downloads/" } }
if (-not (Test-Cmd "claude")) { $missing += @{ name="Claude Code";    url="설치 후: npm install -g @anthropic-ai/claude-code" } }

if ($missing.Count -gt 0) {
    Write-Err "다음을 먼저 설치하고 다시 실행해주세요:"
    foreach ($m in $missing) {
        Write-Host "    - $($m.name)  →  $($m.url)" -ForegroundColor Yellow
    }
    exit 1
}
Write-Ok "git / node / python / claude 모두 설치됨"

# 2. openpyxl
Write-Step "2/6  Python 의존성 (openpyxl) 설치"
try {
    python -m pip install --quiet --upgrade openpyxl 2>&1 | Out-Null
    Write-Ok "openpyxl 설치 완료"
} catch {
    Write-Err "openpyxl 설치 실패: $_"
    exit 1
}

# 3. MCP 서버 등록
Write-Step "3/6  TikTok Ads + Airbridge MCP 등록"
$mcpList = (claude mcp list 2>&1) -join "`n"
if ($mcpList -match "tiktok-ads:") {
    Write-Ok "tiktok-ads MCP 이미 등록됨"
} else {
    claude mcp add --transport http tiktok-ads https://tiktok-ads.mcp.pipeboard.co/ 2>&1 | Out-Null
    Write-Ok "tiktok-ads MCP 등록 완료"
}
if ($mcpList -match "airbridge:") {
    Write-Ok "airbridge MCP 이미 등록됨"
} else {
    claude mcp add --transport http airbridge https://mcp.airbridge.io/mcp 2>&1 | Out-Null
    Write-Ok "airbridge MCP 등록 완료"
}

# 4. Marketplace + 플러그인
Write-Step "4/6  marketplace 등록 및 플러그인 설치"
$mpList = (claude plugin marketplace list 2>&1) -join "`n"
if ($mpList -match "marketing-lab-26-05-09") {
    Write-Ok "marketplace 이미 등록됨 — 최신 sync 시도"
    claude plugin marketplace update marketing-lab-26-05-09 2>&1 | Out-Null
} else {
    claude plugin marketplace add hound600al/marketing-lab-26-05-09 2>&1 | Out-Null
    Write-Ok "marketplace 'marketing-lab-26-05-09' 등록 완료"
}
$plList = (claude plugin list 2>&1) -join "`n"
if ($plList -match "tiktok-airbridge-report") {
    Write-Ok "플러그인 이미 설치됨 — 최신 업데이트"
    claude plugin update tiktok-airbridge-report 2>&1 | Out-Null
} else {
    claude plugin install "tiktok-airbridge-report@marketing-lab-26-05-09" 2>&1 | Out-Null
    Write-Ok "tiktok-airbridge-report 플러그인 설치 완료"
}

# 5. 환경변수 영구 설정
Write-Step "5/6  환경변수 설정 (TikTok 광고주 ID / Airbridge 앱 이름)"
$currentAdv = [Environment]::GetEnvironmentVariable("TIKTOK_ADVERTISER_ID", "User")
$currentApp = [Environment]::GetEnvironmentVariable("AIRBRIDGE_APP_NAME", "User")
if ($currentAdv) {
    Write-Ok "TIKTOK_ADVERTISER_ID 이미 설정됨: $currentAdv"
} else {
    $adv = Read-Host "  TikTok 광고주 ID 입력 (ads.tiktok.com URL의 aadvid= 값)"
    if ($adv) {
        [Environment]::SetEnvironmentVariable("TIKTOK_ADVERTISER_ID", $adv.Trim(), "User")
        Write-Ok "TIKTOK_ADVERTISER_ID = $($adv.Trim()) 설정"
    } else {
        Write-Warn "입력 안 함 — 나중에 직접 설정 필요"
    }
}
if ($currentApp) {
    Write-Ok "AIRBRIDGE_APP_NAME 이미 설정됨: $currentApp"
} else {
    $app = Read-Host "  Airbridge 앱 subdomain 입력 (app.airbridge.io/app/<이값>/... 의 값)"
    if ($app) {
        [Environment]::SetEnvironmentVariable("AIRBRIDGE_APP_NAME", $app.Trim(), "User")
        Write-Ok "AIRBRIDGE_APP_NAME = $($app.Trim()) 설정"
    } else {
        Write-Warn "입력 안 함 — 나중에 직접 설정 필요"
    }
}

# 6. 마무리
Write-Step "6/6  설치 완료"
Write-Host ""
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor DarkGreen
Write-Host "  ✅  설치 완료!" -ForegroundColor Green
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor DarkGreen
Write-Host ""
Write-Host "다음 단계:" -ForegroundColor White
Write-Host "  1. Claude Code를 새로 시작 (VSCode 확장이면 VSCode 완전 종료 후 재실행)"
Write-Host "  2. /mcp 입력 → 'tiktok-ads' / 'airbridge' 각각 Authenticate (브라우저 OAuth)"
Write-Host "  3. /tiktok-report 2026-05-19 2026-05-25  ← 시작/종료일 입력해서 사용"
Write-Host ""
Write-Host "  환경변수 변경 필요할 때:" -ForegroundColor DarkGray
Write-Host "    [Environment]::SetEnvironmentVariable('TIKTOK_ADVERTISER_ID', '<새 ID>', 'User')" -ForegroundColor DarkGray
Write-Host "    [Environment]::SetEnvironmentVariable('AIRBRIDGE_APP_NAME', '<새 앱>', 'User')" -ForegroundColor DarkGray
Write-Host ""
