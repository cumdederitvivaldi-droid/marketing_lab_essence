# F12 DevTools 작업 가이드 · v19

## 시작하기

### 1) 편집 모드 활성화
미리보기 URL 끝에 `?edit=1`을 붙여서 엽니다:

```
https://raw.githack.com/.../이도형_포트폴리오_v19.html?edit=1
```

활성 시:
- 모든 슬라이드에 코발트 점선 outline + 슬라이드 번호 (예: `P4`) 라벨
- `.col-l` / `.col-r` / `.chart-card` / `.phone-frame`에 라임 점선 outline
- 우상단 **EDIT MODE 도움말 패널**
- **클릭 시** 우하단에 해당 요소의 selector + 현재 CSS 추출 (복사해서 저에게 전달)

### 2) F12 열기 → Styles 패널에서 마우스 조정

1. `F12` (또는 `Ctrl+Shift+I`) 누름
2. 좌상단 **요소 선택 화살표** (`Ctrl+Shift+C`) → 조정하고 싶은 요소 클릭
3. 우측 **Styles** 패널에서 원하는 속성 찾기 (예: `grid-template-columns`)
4. **값 위에서 마우스 휠** 또는 **▲▼ 키**로 픽셀값 실시간 조정
5. 마음에 드는 값이 나오면 그 값을 저에게 전달

### 3) 변경된 값을 저에게 전달
편집 모드에서 요소 클릭하면 우하단에 적용 CSS가 나옵니다. 그걸 복사해서:

```
v20 요청:
- p4 .col-r 안의 grid-template-columns: 280px 1fr → 240px 1fr
- p9 LP 그리드 height: 520px → 620px
- p7 .col-r 안의 영상 카드 height: 720px → 800px
```

이 형식으로 알려주시면 v20에 그대로 반영합니다.

---

## 페이지별 핵심 조정 포인트

### p2 PROFILE — `#p2`
| selector | 조정 가능 | 추천 범위 |
|---|---|---|
| `#p2 > div > div:first-child` (좌측 사진 패널) | `width` 600px → 500~700px | 사진 크기 |
| `#p2` 우측 패널 `padding` | 72px 88px 96px → 56~96px | 여백 |
| 우측 4 modules `gap` | 24px 56px → 18~32px / 40~70px | 모듈 간 간격 |
| `linear-gradient(...)` 그라데이션 | `78%` → `60~85%` | 사진 가려지는 시점 |

### p3 CAPABILITY — `#p3`
| selector | 조정 가능 |
|---|---|
| `.skill-grid` `gap` | 카드 간 간격 (14px → 10~20px) |
| `.skill-block` `padding` | 카드 내부 여백 |
| 우측 `.chart-card` flex | 차트 크기 |

### p4 그로스 등급제 — `#p4`
| selector | 조정 가능 |
|---|---|
| `.body2` `grid-template-columns` | 720px 1fr → 640~820px |
| **`.col-r > div` (씨앗+등급표 그리드)** | `280px 1fr` → 좌 모바일 폭 |
| `.col-r > div > div:first-child` | 씨앗 모바일 컨테이너 |
| 등급표 컨테이너 `padding` 8px | 표 여백 |

### p5 ARPU — `#p5`
| selector | 조정 가능 |
|---|---|
| `.col-r > div` (ARPU 3장 그리드) | `1fr 1fr 1fr` → `1fr 1.4fr 1fr` (가운데 강조) |
| 하단 강조 배너 `padding` 14px 22px | 높이 |

### p6 CVR — `#p6`
| selector | 조정 가능 |
|---|---|
| `.col-r` 상단 알림톡 그리드 height | 1:1 비율 / 좌우 폭 |
| `.col-r` 하단 `.chart-card` 이미지 `padding` | 0~14px |

### p7 콘텐츠 — `#p7`
| selector | 조정 가능 |
|---|---|
| **`.col-r > div` (영상 4 그리드 height)** | 720px → 600~800px (하단 공백 조정) |
| `.yt-card .thumb aspect-ratio` | `9/16` 그대로 또는 `9/14` |

### p8 휴면 CRM — `#p8`
| selector | 조정 가능 |
|---|---|
| 우측 상단 시퀀스 카드 `padding` | 18px 22px |
| 우측 하단 `.chart-card` 이미지 padding | 0~14px |

### p9 페이백 — `#p9`
| selector | 조정 가능 |
|---|---|
| **`.col-r > div:first-child` (LP 2장 height)** | **520px → 400~700px** (이미지 보이는 양) |
| 하단 표 `.chart-card` padding | 14px |

### p10 Web2App — `#p10`
| selector | 조정 가능 |
|---|---|
| 우측 상단 브릿지 LP 3 그리드 `height` | 380px → 300~500px |
| `.phone-frame` 비율 | aspect-ratio |

---

## 자주 사용하는 속성

| 속성 | 마우스 조정 |
|---|---|
| `grid-template-columns: 280px 1fr` | 280px 위에서 휠/드래그 |
| `height: 520px` | 휠로 픽셀 단위 조정 |
| `padding: 14px 22px` | 각 값 별도 조정 |
| `gap: 12px` | 휠 조정 |
| `font-size: 19px` | 휠 조정 |

## Tip

- **Shift+휠** = 10px씩 점프 / **Alt+휠** = 0.1px (정밀) / **Ctrl+휠** = 100px씩
- **Styles 패널 좌측 컬러 박스** 클릭으로 색상 피커
- **Computed 탭** = 최종 적용된 값 확인
- 변경한 값을 잃지 않으려면 **DevTools → Sources → Filesystem → Add folder to workspace** 로 로컬 폴더 연결 (선택)

## v20 요청 예시

```
v20 요청 사항:
- p4 .col-r grid-template-columns: 280px 1fr → 220px 1fr (씨앗 모바일 더 작게)
- p9 LP 2장 그리드 height: 520px → 640px
- p7 영상 4장 그리드 height: 720px → 760px
- p5 강조 배너 fontSize: 22px → 26px
```

이렇게 짧게 boil down된 변경 사항만 전달해 주시면 v20으로 반영합니다.
