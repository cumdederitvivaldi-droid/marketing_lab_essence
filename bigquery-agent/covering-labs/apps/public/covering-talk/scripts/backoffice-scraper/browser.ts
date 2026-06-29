import puppeteer, { Browser, Page } from "puppeteer";

let browser: Browser | null = null;
let page: Page | null = null;

const isHeadless = process.env.HEADLESS !== "false";

export async function getBrowser(): Promise<Browser> {
  if (browser && browser.connected) return browser;

  console.log(`[Browser] 브라우저 시작 (headless: ${isHeadless})`);
  browser = await puppeteer.launch({
    headless: isHeadless,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
    defaultViewport: { width: 2400, height: 2400 },
    protocolTimeout: 30000,
  });

  browser.on("disconnected", () => {
    console.log("[Browser] 브라우저 연결 끊김");
    browser = null;
    page = null;
  });

  return browser;
}

export async function getPage(): Promise<Page> {
  if (page && !page.isClosed()) return page;

  const b = await getBrowser();
  const pages = await b.pages();
  page = pages.length > 0 ? pages[0] : await b.newPage();
  page.setDefaultNavigationTimeout(10000);
  page.setDefaultTimeout(8000);

  return page;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    console.log("[Browser] 브라우저 종료");
    await browser.close();
    browser = null;
    page = null;
  }
}
