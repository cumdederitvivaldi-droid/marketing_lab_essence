import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("home CTA uses the local Kakao bridge instead of Kakao chat directly", async () => {
  const source = await read("src/components/ui/CTALink.tsx");

  assert.match(source, /\bKAKAO_BRIDGE_URL\b/);
  assert.doesNotMatch(source, /href\s*=\s*\{\s*KAKAO_CHAT_URL\s*\}/);
  assert.doesNotMatch(
    source,
    /window\.location\.assign\(\s*KAKAO_CHAT_URL\s*\)/,
  );
});

test("legacy booking route redirects to the local Kakao bridge", async () => {
  const source = await read("src/app/booking/page.tsx");

  assert.match(source, /redirect\(\s*KAKAO_BRIDGE_PATH\s*\)/);
  assert.doesNotMatch(source, /redirect\(\s*KAKAO_CHAT_URL\s*\)/);
});

test("Android bridge path does not auto-open Kakao chat", async () => {
  const source = await read("src/components/kakao/KakaoBridgeClient.tsx");
  const androidGuardIndex = source.search(/if\s*\(\s*isAndroid\s*\)\s*\{/);
  const chatRedirectIndex = source.search(
    /window\.location\.replace\(\s*KAKAO_CHAT_URL\s*\)/,
  );

  assert.notEqual(androidGuardIndex, -1);
  assert.notEqual(chatRedirectIndex, -1);
  assert.ok(
    androidGuardIndex < chatRedirectIndex,
    "Android guard must run before any Kakao chat auto redirect",
  );
});
