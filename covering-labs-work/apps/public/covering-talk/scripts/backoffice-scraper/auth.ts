import { getPage } from "./browser.js";

function env() {
  return {
    LOGIN_URL: process.env.BACKOFFICE_LOGIN_URL!,
    SEARCH_URL: process.env.BACKOFFICE_SEARCH_URL!,
    USERNAME: process.env.BACKOFFICE_USERNAME!,
    PASSWORD: process.env.BACKOFFICE_PASSWORD!,
  };
}

// 마지막 로그인 확인 시각 — 10분간 재확인 안 함
let lastLoginCheck = 0;
const LOGIN_CHECK_INTERVAL = 10 * 60 * 1000;

export async function login(): Promise<void> {
  const { LOGIN_URL, USERNAME, PASSWORD } = env();
  const page = await getPage();

  console.log("[Auth] 로그인 페이지 이동...");
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForSelector('input[type="password"]', { timeout: 10000 });

  await page.evaluate(`(() => {
    var emailInput = document.querySelector('input[type="email"], input[name="email"]');
    var pwInput = document.querySelector('input[type="password"]');
    function setVal(el, val) {
      var nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      nativeSet.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (emailInput) setVal(emailInput, '${USERNAME}');
    if (pwInput) setVal(pwInput, '${PASSWORD}');
  })()`);

  await page.evaluate(`(() => {
    var buttons = document.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      var text = buttons[i].textContent.trim();
      if (text.includes('로그인') || text.includes('Login') || buttons[i].type === 'submit') {
        buttons[i].click();
        return;
      }
    }
  })()`);

  await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
  await page.waitForNetworkIdle({ idleTime: 1000, timeout: 10000 }).catch(() => {});
  lastLoginCheck = Date.now();
  console.log("[Auth] 로그인 완료");
}

/**
 * 로그인 보장 — 10분마다만 체크, 그 외에는 스킵
 */
export async function ensureLoggedIn(): Promise<void> {
  if (Date.now() - lastLoginCheck < LOGIN_CHECK_INTERVAL) return;

  const page = await getPage();
  console.log("[Auth] 로그인 상태 확인 중...");
  await page.goto(env().SEARCH_URL, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForNetworkIdle({ idleTime: 1000, timeout: 10000 }).catch(() => {});

  const loginForm = await page.$('input[type="password"]');
  if (loginForm) {
    console.log("[Auth] 세션 만료 — 재로그인");
    await login();
  } else {
    lastLoginCheck = Date.now();
    console.log("[Auth] 로그인 유지 중");
  }
}

/**
 * 세션 만료 시 강제 재로그인 (scraper에서 에러 발생 시 호출)
 */
export async function forceRelogin(): Promise<void> {
  lastLoginCheck = 0;
  await login();
}

/**
 * 로그인 캐시 리셋 — 브라우저 재시작 시 호출 (새 브라우저는 세션 없으므로)
 */
export function resetLoginState(): void {
  lastLoginCheck = 0;
}
