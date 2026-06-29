import { getPage } from "./browser.js";
import { ensureLoggedIn, forceRelogin } from "./auth.js";
import type { ScrapedCustomerData, OrderDetailData } from "./types.js";

export async function scrapeCustomer(phone: string): Promise<ScrapedCustomerData> {
  await ensureLoggedIn();

  const page = await getPage();
  const masked = phone.slice(0, 3) + "****" + phone.slice(-4);
  console.log(`[Scraper] 조회: ${masked}`);

  try {
    return await doScrape(page, phone, masked);
  } catch (err) {
    // 세션 만료일 가능성 → 재로그인 후 1회 재시도
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("로그인") || msg.includes("timeout") || msg.includes("Timeout") || msg.includes("Timed out") || msg.includes("Navigation") || msg.includes("Waiting")) {
      console.log(`[Scraper] 타임아웃/에러 → 재로그인 후 재시도`);
      await forceRelogin();
      // 재시도는 새 페이지 확보
      const newPage = await getPage();
      return await doScrape(newPage, phone, masked);
    }
    throw err;
  }
}

async function doScrape(page: import("puppeteer").Page, phone: string, masked: string): Promise<ScrapedCustomerData> {
  // 항상 /v2/user로 이동 (모달, 상세 페이지 등으로 꼬이는 문제 방지)
  await page.goto("https://admin.covering.app/v2/user", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    `document.body.innerText.includes('사용자 목록') && document.querySelector('input:not([type="hidden"])')`,
    { timeout: 10000 }
  );

  // 검색 입력 — Puppeteer 네이티브 방식 (1탭이라 안전)
  const searchInput = await page.$('input:not([type="hidden"]):not([type="password"])');
  if (!searchInput) throw new Error("검색 입력 필드를 찾을 수 없습니다");

  // 기존 내용 전체 선택 후 삭제 + 새 번호 입력
  await searchInput.click({ clickCount: 3 });
  await page.keyboard.press("Backspace");
  await searchInput.type(phone, { delay: 10 });

  // 검색 버튼 클릭
  const searchBtn = await page.evaluateHandle(`(() => {
    var buttons = document.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      if (buttons[i].textContent.trim().includes('검색')) return buttons[i];
    }
    return null;
  })()`);
  if (searchBtn) {
    await (searchBtn as import("puppeteer").ElementHandle<Element>).click();
  } else {
    await page.keyboard.press("Enter");
  }

  // 검색 결과 대기 — 테이블에 td가 나타나거나 "검색 결과: 0건" 표시될 때까지
  await page.waitForFunction(`(() => {
    var body = document.body.innerText;
    if (body.match(/검색 결과[:\\s]*0건/)) return true;
    var table = document.querySelector('table');
    if (table && table.querySelectorAll('td').length > 0) return true;
    return false;
  })()`, { timeout: 6000 }).catch(() => {});

  const hasResults = await page.evaluate(`(() => {
    var table = document.querySelector('table');
    if (table && table.querySelectorAll('td').length > 0) return true;
    var m = document.body.innerText.match(/검색 결과[:\\s]*([\\d]+)건/);
    return m && parseInt(m[1]) > 0;
  })()`);

  if (!hasResults) {
    console.log(`[Scraper] 결과 없음: ${masked}`);
    return { orders: [], userInfo: null };
  }

  // 결과 행 클릭 + userId 추출
  const userId = await page.evaluate(`(() => {
    var table = document.querySelector('table');
    if (!table) return null;
    var rows = table.querySelectorAll('tr');
    for (var i = 0; i < rows.length; i++) {
      var cells = rows[i].querySelectorAll('td');
      if (cells.length < 2) continue;
      rows[i].click();
      var lastCell = cells[cells.length - 1];
      var idText = lastCell ? lastCell.textContent.trim() : '';
      if (/^\\d{3,}$/.test(idText)) return idText;
    }
    return null;
  })()`) as string | null;

  if (!userId) {
    console.log(`[Scraper] userId 추출 실패: ${masked}`);
    return { orders: [], userInfo: null };
  }

  // 상세 페이지로 항상 직접 이동
  await page.goto(`https://admin.covering.app/v2/user/${userId}`, { waitUntil: "domcontentloaded", timeout: 12000 });
  await page.waitForFunction(
    `document.body.innerText.includes('기본 정보')`,
    { timeout: 8000 }
  );

  // 구독 이력 섹션이 하단에 있어 lazy-load될 수 있음 → 페이지 끝까지 스크롤
  await page.evaluate(`(() => {
    window.scrollTo(0, document.body.scrollHeight);
  })()`);

  // 주문 + 구독 섹션 통합 대기 (최대 8초)
  // 로딩 중 상태 ("구독 이력을 불러오는 중입니다...") 도 대기
  await page.waitForFunction(`(() => {
    var body = document.body.innerText;
    if (!body.includes('최근 주문 내역')) return false;
    // 로딩 중이면 계속 대기
    if (body.includes('불러오는 중')) return false;

    // 구독 섹션 판정
    if (body.includes('구독 이력이 없습니다')) return true; // 비구독자

    var tables = document.querySelectorAll('table');
    for (var t = 0; t < tables.length; t++) {
      var ths = tables[t].querySelectorAll('th');
      var ht = '';
      for (var h = 0; h < ths.length; h++) ht += ths[h].textContent + '|';
      if (ht.includes('플랜명') && ht.includes('시작일')) {
        // 실제 데이터 행에 플랜명/상태 텍스트 확인 (로딩 메시지 아닌지)
        var rows = tables[t].querySelectorAll('tbody tr, tr');
        for (var r = 0; r < rows.length; r++) {
          var cells = rows[r].querySelectorAll('td');
          if (cells.length >= 3) {
            // 셀이 3개 이상이면 실제 데이터 (로딩 메시지는 td 1개만)
            return true;
          }
        }
      }
    }
    return false;
  })()`, { timeout: 8000 }).catch(() => {});

  // 상세 정보 추출
  const userInfo = await page.evaluate(`(() => {
    var body = document.body.innerText;

    var nameMatch = body.match(/^(.+?)\\s+ID:\\s*(\\d+)/m);
    var phoneMatch = body.match(/[\\d-]{10,}/);
    var joinMatch = body.match(/가입일:\\s*([\\d-]+)/);
    var lastModMatch = body.match(/마지막 수정:\\s*([\\d-]+)/);
    var gradeMatch = body.match(/현재 등급\\s+(.+?)(?:\\n|지난)/s);
    var validOrderMatch = body.match(/지난 \\d+일간 유효 주문 수\\s+(\\d+)건/);
    var nextExpireMatch = body.match(/다음 주 소멸 예정 주문\\s+(\\d+)/);
    var totalOrderMatch = body.match(/총\\s*(\\d+)건/);
    var addressMatch = body.match(/(?:우리\\s*집|집|회사|기타)\\s*(?:기본)?\\s*([가-힣]+ [가-힣]+[시군구][^\\n]*)/);

    var recentOrders = [];
    var tables = document.querySelectorAll('table');
    for (var t = 0; t < tables.length; t++) {
      var ordHeaders = tables[t].querySelectorAll('th');
      if (ordHeaders.length < 3) continue;
      var ordHeaderText = '';
      for (var oh = 0; oh < ordHeaders.length; oh++) ordHeaderText += ordHeaders[oh].textContent + '|';
      if (!ordHeaderText.includes('주문일') && !ordHeaderText.includes('주문번호')) continue;
      var rows = tables[t].querySelectorAll('tr');
      for (var i = 0; i < rows.length && recentOrders.length < 10; i++) {
        var cells = rows[i].querySelectorAll('td');
        if (cells.length < 3) continue;
        var getCellText = function(idx) { return cells[idx] ? cells[idx].textContent.trim() : ''; };
        // 주문번호 셀에서 <a> 태그 href 추출
        var orderLink = cells[1] ? cells[1].querySelector('a') : null;
        var orderUrl = orderLink ? orderLink.href : '';
        recentOrders.push({
          date: getCellText(0),
          orderId: getCellText(1),
          orderUrl: orderUrl,
          orderName: getCellText(2),
          status: getCellText(3),
          weight: getCellText(4)
        });
      }
      break;
    }

    // ── 구독 이력 테이블 파싱 ──
    // 헤더: 플랜명 | 상태 | 시작일 | 갱신일 | 취소일 | 현재 구독 유효기간
    var subPlan = '';
    var subStatus = '';
    var subDate = '';
    var subValidUntil = '';
    var subCancelDate = '';
    for (var st = 0; st < tables.length; st++) {
      // 테이블의 모든 th 텍스트 합쳐서 헤더 판정 (단일 th 기준이 아니라 전체)
      var allThs = tables[st].querySelectorAll('th');
      if (allThs.length < 3) continue;
      var headerConcat = '';
      for (var h = 0; h < allThs.length; h++) headerConcat += allThs[h].textContent + '|';
      if (!headerConcat.includes('플랜명') || !headerConcat.includes('시작일')) continue;

      var subRows = tables[st].querySelectorAll('tr');
      // 셀 텍스트 추출: title 속성 우선(전체값), 없으면 textContent
      var extractCell = function(cell) {
        if (!cell) return '';
        var titleAttr = cell.getAttribute('title');
        if (titleAttr && titleAttr.trim()) return titleAttr.trim();
        // 자식 요소 중 title 있는지 확인
        var titled = cell.querySelector('[title]');
        if (titled) {
          var t = titled.getAttribute('title');
          if (t && t.trim()) return t.trim();
        }
        return cell.textContent.trim();
      };
      // 상태 정규화: ellipsis나 접두사 처리
      var normalizeStatus = function(raw) {
        if (!raw) return '';
        var clean = raw.replace(/[\\s.…]/g, '');
        if (clean.startsWith('활')) return '활성';
        if (clean.startsWith('취')) return '취소';
        if (clean.startsWith('대기') || clean.startsWith('pending')) return '대기';
        return raw.trim();
      };

      for (var r = 0; r < subRows.length; r++) {
        var subCells = subRows[r].querySelectorAll('td');
        if (subCells.length < 4) continue;
        // 플랜명 셀: "beta" + "커버링 구독 베타 서비스" 2줄 구조 → 설명 부분만 추출
        if (subCells[0]) {
          var planChildren = subCells[0].children;
          if (planChildren.length >= 2) {
            subPlan = extractCell(planChildren[planChildren.length - 1]);
          } else {
            var rawPlan = extractCell(subCells[0]);
            var svcMatch = rawPlan.match(/([가-힣][가-힣\\s]+서비스)/);
            subPlan = svcMatch ? svcMatch[1].trim() : rawPlan;
          }
        }
        subStatus = normalizeStatus(extractCell(subCells[1]));
        subDate = extractCell(subCells[2]);
        // 컬럼 순서: 플랜명(0) | 상태(1) | 시작일(2) | 갱신일(3) | 취소일(4) | 유효기간(5)
        if (subCells.length >= 5) {
          var cancelCell = extractCell(subCells[4]);
          subCancelDate = (cancelCell === '-' ? '' : cancelCell);
        }
        var lastIdx = subCells.length - 1;
        subValidUntil = extractCell(subCells[lastIdx]);
        break;
      }
      break;
    }

    return {
      name: nameMatch ? nameMatch[1].trim() : '',
      id: nameMatch ? nameMatch[2] : '',
      phone: phoneMatch ? phoneMatch[0] : '',
      joinDate: joinMatch ? joinMatch[1] : '',
      lastModified: lastModMatch ? lastModMatch[1] : '',
      grade: gradeMatch ? gradeMatch[1].trim() : '',
      validOrders: validOrderMatch ? validOrderMatch[1] : '0',
      nextExpireOrders: nextExpireMatch ? nextExpireMatch[1] : '0',
      address: addressMatch ? addressMatch[1].trim() : '',
      totalOrders: totalOrderMatch ? totalOrderMatch[1] : '0',
      isSubscriber: subStatus === '활성',
      subscriptionDate: subDate,
      subscriptionPlan: subPlan,
      subscriptionStatus: subStatus,
      subscriptionValidUntil: subValidUntil,
      subscriptionCancelDate: subCancelDate,
      recentOrders: recentOrders
    };
  })()`) as ScrapedCustomerData["userInfo"];

  if (userInfo?.subscriptionStatus === "활성") {
    console.log(`[Scraper] 구독: ${userInfo.subscriptionPlan} 활성 (${userInfo.subscriptionDate})`);
  } else if (userInfo) {
    // 디버그: 구독 테이블 원시 DOM 확인
    const subDebug = await page.evaluate(`(() => {
      var tables = document.querySelectorAll('table');
      for (var t = 0; t < tables.length; t++) {
        var ths = tables[t].querySelectorAll('th');
        var ht = '';
        for (var h = 0; h < ths.length; h++) ht += ths[h].textContent + '|';
        if (!ht.includes('플랜명') || !ht.includes('시작일')) continue;
        var rows = tables[t].querySelectorAll('tr');
        var rowData = [];
        for (var r = 0; r < rows.length; r++) {
          var cells = rows[r].querySelectorAll('td');
          if (cells.length === 0) continue;
          var row = [];
          for (var c = 0; c < cells.length; c++) {
            row.push({
              text: cells[c].textContent.trim().substring(0, 30),
              title: cells[c].getAttribute('title') || '',
              childCount: cells[c].children.length
            });
          }
          rowData.push(row);
        }
        return JSON.stringify(rowData);
      }
      return 'NO_SUB_TABLE';
    })()`);
    console.log(`[Scraper] 구독 DOM 디버그: ${subDebug}`);
  }

  console.log(`[Scraper] ${userInfo?.name || "추출 실패"} (ID: ${userInfo?.id}, 주문 ${userInfo?.recentOrders.length}건${userInfo?.isSubscriber ? ", 구독활성" : ""}) 완료`);
  return { orders: [], userInfo };
}

// ─── 주문 상세 스크래핑 (실패 사유, 방문 이미지) ───

export async function scrapeOrderDetail(url: string): Promise<OrderDetailData> {
  await ensureLoggedIn();
  const page = await getPage();
  console.log(`[Scraper] 주문 상세 조회: ${url}`);

  try {
    return await doOrderScrape(page, url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("로그인") || msg.includes("timeout") || msg.includes("Timeout") || msg.includes("Timed out") || msg.includes("Navigation") || msg.includes("Waiting")) {
      console.log(`[Scraper] 재로그인 후 재시도`);
      await forceRelogin();
      return await doOrderScrape(page, url);
    }
    throw err;
  }
}

async function doOrderScrape(page: import("puppeteer").Page, url: string): Promise<OrderDetailData> {
  await page.goto(url, { waitUntil: "domcontentloaded" });

  // 주문 상세 페이지 로딩 대기
  await page.waitForFunction(
    `document.body.innerText.includes('주문번호') && document.body.innerText.includes('고객 정보')`,
    { timeout: 15000 }
  );

  // 방문 이력 섹션 로딩 대기
  try {
    await page.waitForFunction(
      `document.body.innerText.includes('방문 이력') || document.body.innerText.includes('방문 이미지')`,
      { timeout: 5000 }
    );
  } catch {}

  const detail = await page.evaluate(`(() => {
    var body = document.body.innerText;

    // 주문번호
    var orderIdMatch = body.match(/주문번호\\s+([A-Z0-9]+)/);
    var orderId = orderIdMatch ? orderIdMatch[1] : '';

    // 실패 사유 코드 + 메시지
    var failureCode = '';
    var failureMessage = '';
    var codeMatch = body.match(/실패 사유 코드\\s+(.+?)\\n/);
    if (codeMatch) failureCode = codeMatch[1].trim();
    var msgMatch = body.match(/실패 사유 메시지\\s+(.+?)\\n/);
    if (msgMatch) failureMessage = msgMatch[1].trim();

    // 취소 사유도 체크
    if (!failureCode) {
      var cancelMatch = body.match(/취소 사유\\s+(.+?)\\n/);
      if (cancelMatch) failureCode = cancelMatch[1].trim();
    }

    // 방문 결과 + 차수
    var visitResult = '';
    var visitCount = '';
    // "방문 실패  방문 1차" 패턴
    var visitMatch = body.match(/(방문 (?:실패|성공|완료))\\s+(방문 \\d+차)/);
    if (visitMatch) {
      visitResult = visitMatch[1];
      visitCount = visitMatch[2];
    }

    // 방문 이미지 개수 + URL
    var imgCountMatch = body.match(/방문 이미지\\s*\\((\\d+)개\\)/);
    var visitImages = imgCountMatch ? parseInt(imgCountMatch[1]) : 0;

    // 방문 이미지 URL 추출 — "방문 이미지" 텍스트 근처의 img 태그
    var visitImageUrls = [];
    var allElements = document.querySelectorAll('*');
    var imgSection = null;
    for (var e = 0; e < allElements.length; e++) {
      if (allElements[e].textContent && allElements[e].textContent.includes('방문 이미지') && allElements[e].children.length < 5) {
        imgSection = allElements[e].closest('div') || allElements[e].parentElement;
        break;
      }
    }
    if (imgSection) {
      var imgs = imgSection.querySelectorAll('img');
      for (var im = 0; im < imgs.length; im++) {
        var src = imgs[im].src || imgs[im].getAttribute('src') || '';
        if (src && !src.includes('data:') && src.startsWith('http')) {
          visitImageUrls.push(src);
        }
      }
    }
    // fallback — 전체 페이지에서 수거/방문 관련 이미지 찾기
    if (visitImageUrls.length === 0 && visitImages > 0) {
      var allImgs = document.querySelectorAll('img');
      for (var im = 0; im < allImgs.length; im++) {
        var src = allImgs[im].src || '';
        if (src && src.includes('covering') && !src.includes('logo') && !src.includes('icon')) {
          visitImageUrls.push(src);
        }
      }
    }

    // 상품 목록 (상품명 / 상태 / 실제 수량 / 실제 무게)
    var items = [];
    var tables = document.querySelectorAll('table');
    for (var t = 0; t < tables.length; t++) {
      var headerRow = tables[t].querySelector('th');
      if (!headerRow) continue;
      var headerText = headerRow.parentElement ? headerRow.parentElement.textContent : '';
      if (!headerText.includes('상품명') || !headerText.includes('상태')) continue;
      var rows = tables[t].querySelectorAll('tr');
      for (var i = 0; i < rows.length; i++) {
        var cells = rows[i].querySelectorAll('td');
        if (cells.length < 3) continue;
        items.push({
          name: cells[0] ? cells[0].textContent.trim() : '',
          status: cells[1] ? cells[1].textContent.trim() : '',
          quantity: cells[2] ? parseInt(cells[2].textContent.trim()) || 0 : 0,
          weight: cells[3] ? cells[3].textContent.trim() : '-'
        });
      }
      break;
    }

    return {
      orderId: orderId,
      failureCode: failureCode,
      failureMessage: failureMessage,
      visitImages: visitImages,
      visitImageUrls: visitImageUrls,
      visitResult: visitResult,
      visitCount: visitCount,
      items: items
    };
  })()`) as OrderDetailData;

  console.log(`[Scraper] 주문 ${detail.orderId}: ${detail.failureCode || "사유 없음"} / 이미지 ${detail.visitImages}개`);
  return detail;
}
