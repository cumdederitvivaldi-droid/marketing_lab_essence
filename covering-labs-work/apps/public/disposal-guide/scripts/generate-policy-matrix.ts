import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { buildPolicyMatrix } from '../src/logic/policyMatrix';

const matrix = buildPolicyMatrix();
const appRoot = process.cwd();
const fixturePath = resolve(appRoot, 'src/logic/__fixtures__/policy-matrix.approved.json');
const reportPath = resolve(appRoot, '../../../works/reports/2026-05-11-covering-labs-disposal-guide-policy-matrix.md');

mkdirSync(dirname(fixturePath), { recursive: true });
mkdirSync(dirname(reportPath), { recursive: true });

writeFileSync(fixturePath, `${JSON.stringify(matrix, null, 2)}\n`, 'utf8');

const failed = matrix.filter((entry) => !entry.pass);
const lines = [
  '# 링퀴즈 추천 정책 Matrix',
  '',
  '> 유형: 분석',
  '> 작성일: 2026-05-11',
  '> 상태: 검토중',
  '',
  '## 결론',
  '',
  failed.length === 0
    ? '현재 fallback 추천 정책 matrix는 모두 기대 결과와 일치한다.'
    : `${failed.length}개 시나리오가 기대 결과와 다르다. DB 활성화 또는 운영 배포 전에 수정이 필요하다.`,
  '',
  '## QA 시나리오',
  '',
  ...matrix.flatMap((entry, index) => [
    `${index + 1}. ${entry.pass ? 'PASS' : 'FAIL'} ${entry.label}`,
    `   - 입력: categories=${entry.input.categories.join(', ')}, length=${entry.input.lengthRange}, weight=${entry.input.weightRange}, perceived=${entry.input.perceivedWeight ?? '-'}, split=${entry.input.splittableStatus ?? '-'}`,
    `   - 기대/실제: ${entry.expectedRecommendation} / ${entry.actualRecommendation}`,
    `   - 근거: matchedRule=${entry.trace.matchedRuleId ?? '-'}, action=${entry.trace.action ?? '-'}, heavySplitReason=${entry.trace.heavySplitReason ?? '-'}, fallback=${entry.trace.fallbackReason ?? '-'}`,
    `   - QA 메모: ${entry.qaNote}`,
    '',
  ]),
];

writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');

if (failed.length > 0) {
  console.error(`Policy matrix failed: ${failed.map((entry) => entry.id).join(', ')}`);
  process.exit(1);
}

console.log(`Policy matrix written: ${fixturePath}`);
console.log(`Policy matrix report written: ${reportPath}`);
