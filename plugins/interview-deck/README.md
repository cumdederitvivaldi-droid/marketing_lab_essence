# interview-deck

면접 발표덱을 **처음부터 끝까지 병렬 파이프라인**으로 만들어 주는 Claude Code 플러그인.
그로스·마케팅(그 외 직무도 응용 가능) 면접 과제·발표 자료를 빠르고 일관된 품질로 제작한다.

> 면접 발표덱 15건 이상에서 반복 검증된 워크플로우를 표준화했습니다. (원작: 이도형 / Covering)

## 무엇이 들어있나

| 구성 | 역할 |
|------|------|
| `/interview-deck` 스킬 | 6단계 파이프라인 오케스트레이션 (인테이크→리서치→서사→캡처→빌드→배포→회고) |
| `slide-architecture.md` | 검증된 13p 서사 레시피 + HTML 컴포넌트 카탈로그 |
| `deck-template.html` | 1280×720 키보드 네비 단일 HTML 덱 스캐폴드 (브랜드 톤만 교체) |
| `deck-researcher` 에이전트 | 회사·JD·경쟁사·시장·벤치마크를 facet별 **병렬 리서치** (출처·신뢰도 태그) |
| `deck-deployer` 에이전트 | 완성 덱을 **본인 GitHub Pages**에 배포·200 검증 (환경 설정 필요) |

## 설치

```
/plugin marketplace add hound600al/marketing-lab-26-05-09
/plugin install interview-deck@marketing-lab-26-05-09
```

## 사용

```
/interview-deck
```
또는 그냥 `"OO 회사 OO 직무 면접 발표덱 만들어줘"` 라고 말하면 됩니다.
회사·채용공고 URL·면접 단계·발표자 이름을 물어본 뒤 자동으로 진행합니다.

## 필요 환경 (권장)
- **Playwright MCP** — 경쟁사/벤치마크 화면 실측 캡처용. 없으면 캡처 단계는 건너뛰고 수동 첨부.
- **WebSearch / WebFetch** — 리서치용(기본 제공).
- **GitHub Pages repo + git** — 배포(`deck-deployer`)를 쓸 경우만. 안 쓰면 로컬에서 HTML을 열어 발표해도 됩니다.

## 주의
- 모든 외부 수치에는 출처·신뢰도 태그를 답니다. **추측으로 빈칸을 메우지 않습니다.**
- 회사 내부데이터가 포함된 덱은 **public repo에 배포하지 마세요.** (deck-deployer가 경고합니다.)
