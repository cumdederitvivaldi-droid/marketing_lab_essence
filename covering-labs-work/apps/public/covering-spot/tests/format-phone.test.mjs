import assert from "node:assert/strict";
import { test } from "node:test";

// Node 22.7+ / 25 의 `--experimental-strip-types` 로 .ts 직접 import.
// package.json `test` script 에 플래그 포함.
import { formatPhone } from "../src/lib/format.ts";

test("formatPhone: 함수가 export 되어 있다", () => {
  assert.equal(typeof formatPhone, "function");
});

test("formatPhone: 빈 문자열은 그대로 빈 문자열", () => {
  assert.equal(formatPhone(""), "");
});

test("formatPhone: 숫자 3자 이하면 하이픈 없이 그대로", () => {
  assert.equal(formatPhone("0"), "0");
  assert.equal(formatPhone("01"), "01");
  assert.equal(formatPhone("010"), "010");
});

test("formatPhone: 4~7자는 'XXX-XXXX' 형태", () => {
  assert.equal(formatPhone("0101"), "010-1");
  assert.equal(formatPhone("0101234"), "010-1234");
});

test("formatPhone: 8자 이상은 'XXX-XXXX-XXXX' 형태", () => {
  assert.equal(formatPhone("01012345"), "010-1234-5");
  assert.equal(formatPhone("01012345678"), "010-1234-5678");
});

test("formatPhone: 11자 초과 입력은 11자로 절단", () => {
  assert.equal(formatPhone("010123456789999"), "010-1234-5678");
});

test("formatPhone: 비숫자는 모두 제거 후 포맷", () => {
  assert.equal(formatPhone("010-1234-5678"), "010-1234-5678");
  assert.equal(formatPhone("010 1234 5678"), "010-1234-5678");
  assert.equal(formatPhone("abc010def1234ghi5678"), "010-1234-5678");
  // 전체 숫자 추출 후 11자 절단 → "821-0123-4567"
  assert.equal(formatPhone("+82 10 1234 5678"), "821-0123-4567");
});
