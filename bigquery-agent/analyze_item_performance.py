"""
대형폐기물 세트 내 소재별 '언급 품목' 성과 분석
소재명에서 품목 키워드를 추출하여 CPI/지출 기준 성과 집계
"""
import csv
import os
import re
from datetime import datetime

# CSV 읽기
creatives = []
with open("datas/20260504_183240_대형폐기물_소재분석.csv", encoding="utf-8-sig") as f:
    for row in csv.DictReader(f):
        row["total_cost"] = float(row["total_cost"])
        row["total_installs"] = int(row["total_installs"])
        row["cpi"] = float(row["cpi"])
        creatives.append(row)

adsets = []
with open("datas/20260504_183240_대형폐기물_세트별집계.csv", encoding="utf-8-sig") as f:
    for row in csv.DictReader(f):
        row["total_cost"] = float(row["total_cost"])
        row["total_installs"] = int(row["total_installs"])
        row["cpi"] = float(row["cpi"])
        adsets.append(row)

# ── 소재명에서 품목 추출 ────────────────────────────────────────────
def extract_item(creative_name):
    """소재명 내 괄호 안 품목 추출"""
    matches = re.findall(r'\(([^)]+)\)', creative_name)
    return matches[-1] if matches else "기타"

# 품목별 집계
item_stats = {}
for r in creatives:
    item = extract_item(r["ad_creative"])
    if item not in item_stats:
        item_stats[item] = {"cost": 0, "installs": 0, "creatives": []}
    item_stats[item]["cost"] += r["total_cost"]
    item_stats[item]["installs"] += r["total_installs"]
    item_stats[item]["creatives"].append(r["ad_creative"])

# CPI 계산
for k, v in item_stats.items():
    v["cpi"] = v["cost"] / v["installs"] if v["installs"] > 0 else None

# 세트 콘셉트별 집계
concept_stats = {}
def extract_concept(adgroup):
    m = re.search(r'_vd_([^(]+)\(대형폐기물\)', adgroup)
    if m:
        raw = m.group(1).strip()
        # pa_ 등 prefix 제거
        raw = re.sub(r'^pa_', '', raw)
        return raw
    return "기타"

for r in adsets:
    concept = extract_concept(r["ad_group"])
    if concept not in concept_stats:
        concept_stats[concept] = {"cost": 0, "installs": 0, "adsets": []}
    concept_stats[concept]["cost"] += r["total_cost"]
    concept_stats[concept]["installs"] += r["total_installs"]
    concept_stats[concept]["adsets"].append(r["ad_group"])

for k, v in concept_stats.items():
    v["cpi"] = v["cost"] / v["installs"] if v["installs"] > 0 else None

# ── 출력 ───────────────────────────────────────────────────────────
total_cost = sum(r["total_cost"] for r in adsets)
total_installs = sum(r["total_installs"] for r in adsets)

print("=" * 70)
print("대형폐기물 세트 광고 성과 종합 분석")
print("=" * 70)
print(f"분석 기간: 2026-02-09 ~ 2026-05-03")
print(f"광고 세트 수: {len(adsets)}개 | 소재 수: {len(creatives)}개")
print(f"총 지출: {total_cost:,.0f}원 | 총 인스톨: {total_installs:,}개")
print(f"전체 평균 CPI: {total_cost/total_installs:,.0f}원" if total_installs else "")

# 품목별 순위 (지출 기준)
print("\n" + "─" * 70)
print("【품목별 성과】 소재에서 언급된 폐기물 품목")
print("─" * 70)
sorted_items = sorted([(k, v) for k, v in item_stats.items() if v["cost"] > 10000],
                       key=lambda x: x[1]["cost"], reverse=True)
print(f"{'품목':<14} {'지출':>12} {'인스톨':>8} {'CPI':>10} {'지출비중':>8}")
print("─" * 55)
for item, v in sorted_items:
    cpi_str = f"{v['cpi']:>10,.0f}" if v["cpi"] else f"{'-':>10}"
    share = v["cost"] / total_cost * 100 if total_cost else 0
    print(f"{item:<14} {v['cost']:>12,.0f} {v['installs']:>8,} {cpi_str} {share:>7.1f}%")

# 콘셉트별 순위
print("\n" + "─" * 70)
print("【광고 콘셉트별 성과】 세트명 기준")
print("─" * 70)
sorted_concepts = sorted(concept_stats.items(), key=lambda x: x[1]["cost"], reverse=True)
print(f"{'콘셉트':<18} {'지출':>12} {'인스톨':>8} {'CPI':>10}")
print("─" * 52)
for concept, v in sorted_concepts:
    cpi_str = f"{v['cpi']:>10,.0f}" if v["cpi"] else f"{'-':>10}"
    print(f"{concept:<18} {v['cost']:>12,.0f} {v['installs']:>8,} {cpi_str}")

# TOP 소재 (인스톨 100건 이상)
print("\n" + "─" * 70)
print("【우수 소재 (인스톨 100건+)】")
print("─" * 70)
high_install = [r for r in creatives if r["total_installs"] >= 100]
high_install.sort(key=lambda x: x["cpi"] if x["cpi"] > 0 else 9999999)
for r in high_install:
    concept = extract_concept(r["ad_group"])
    item = extract_item(r["ad_creative"])
    print(f"CPI {r['cpi']:>7,.0f}원 | 인스톨 {r['total_installs']:>5,} | 지출 {r['total_cost']:>10,.0f}원")
    print(f"  콘셉트: {concept}  |  품목: {item}")
    print(f"  소재명: {r['ad_creative']}")

# TXT 저장
ts = datetime.now().strftime("%Y%m%d_%H%M%S")
txt_path = f"datas/{ts}_대형폐기물_품목성과분석.txt"
with open(txt_path, "w", encoding="utf-8") as f:
    f.write("쿼리 설명: 메타(facebook.business) 광고 중 '대형폐기물' 세트 내 소재별 품목 언급 성과 분석\n")
    f.write("테이블: ads_data.daily_cost_creative\n")
    f.write(f"추출 일시: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    f.write("분석 기간: 2026-02-09 ~ 2026-05-03\n")
    f.write("\n=== 분석 목적 ===\n")
    f.write("'대형폐기물' 키워드가 포함된 광고 세트 내 소재들에서 어떤 품목을 언급했을 때 성과(CPI 기준)가 좋았는지 파악\n")
    f.write("→ 지출이 높을수록 Meta가 효율적이라고 판단하여 예산을 집중한 소재\n")
    f.write("\n=== 컬럼 설명 ===\n")
    f.write("ad_group: 광고 세트명 | ad_creative: 소재명\n")
    f.write("total_cost: 총 지출(원) | total_installs: 총 앱설치 | cpi: 설치당 비용(원)\n")
    f.write("품목: 소재명 괄호 안 언급 품목\n")

    f.write("\n\n=== 품목별 성과 요약 ===\n")
    f.write(f"{'품목':<14} {'지출':>12} {'인스톨':>8} {'CPI':>10} {'지출비중':>8}\n")
    for item, v in sorted_items:
        cpi_str = f"{v['cpi']:>10,.0f}" if v["cpi"] else f"{'없음':>10}"
        share = v["cost"] / total_cost * 100 if total_cost else 0
        f.write(f"{item:<14} {v['cost']:>12,.0f} {v['installs']:>8,} {cpi_str} {share:>7.1f}%\n")

    f.write("\n\n=== 광고 콘셉트별 성과 ===\n")
    f.write(f"{'콘셉트':<18} {'지출':>12} {'인스톨':>8} {'CPI':>10}\n")
    for concept, v in sorted_concepts:
        cpi_str = f"{v['cpi']:>10,.0f}" if v["cpi"] else f"{'없음':>10}"
        f.write(f"{concept:<18} {v['cost']:>12,.0f} {v['installs']:>8,} {cpi_str}\n")

    f.write("\n\n=== 우수 소재 (인스톨 100건 이상, CPI 오름차순) ===\n")
    for r in high_install:
        concept = extract_concept(r["ad_group"])
        item = extract_item(r["ad_creative"])
        f.write(f"\nCPI {r['cpi']:,.0f}원 | 인스톨 {r['total_installs']:,} | 지출 {r['total_cost']:,.0f}원\n")
        f.write(f"  콘셉트: {concept} | 품목: {item}\n")
        f.write(f"  소재명: {r['ad_creative']}\n")
        f.write(f"  세트명: {r['ad_group']}\n")

print(f"\nTXT 저장: {txt_path}")
