"""
Notion 페이지 콘텐츠 생성: 광고 매체 데이터 분석
"""
import os, re, json, warnings
warnings.filterwarnings("ignore")
import pandas as pd
import numpy as np
from datetime import datetime

base = r"C:\Users\hound\OneDrive\바탕 화면\bigquery-agent\datas\광고 매체 데이터"
files = os.listdir(base)

# ── 데이터 로드 ────────────────────────────────────────────────────
def extract_ym(text):
    if not isinstance(text, str): return None
    m = re.search(r'[_\s](\d{2})\.(\d{2})(?:\.\d{2})?', text)
    if m:
        yy, mm = int(m.group(1)), int(m.group(2))
        return f"{2000+yy}-{mm:02d}"
    return None

# TikTok
tiktok_f = [f for f in files if "Tiktok" in f][0]
df_tt = pd.read_excel(os.path.join(base, tiktok_f))
df_tt['ym'] = df_tt['Campaign name'].apply(extract_ym)
df_tt['channel'] = 'TikTok'
df_tt['ad_name'] = df_tt['Ad name'].fillna('')
df_tt['adset_name'] = df_tt['Ad group name'].fillna('')
df_tt['campaign_name'] = df_tt['Campaign name'].fillna('')
df_tt['cost'] = df_tt['Cost']
df_tt['impressions'] = df_tt['Impressions']
df_tt['clicks'] = df_tt['Clicks (destination)']
df_tt['installs'] = df_tt['App installs']
df_tt['purchases'] = df_tt['Purchases (app)']

# Meta
meta_f = [f for f in files if "메타" in f][0]
df_meta_raw = pd.read_csv(os.path.join(base, meta_f), encoding="utf-8-sig")
col_map = {
    df_meta_raw.columns[0]: 'ad_name', df_meta_raw.columns[1]: 'adset_name',
    df_meta_raw.columns[2]: 'cost',    df_meta_raw.columns[3]: 'impressions',
    df_meta_raw.columns[4]: 'clicks',  df_meta_raw.columns[5]: 'installs',
    df_meta_raw.columns[6]: 'completions', df_meta_raw.columns[7]: 'purchases',
    df_meta_raw.columns[8]: 'adset_status', df_meta_raw.columns[9]: 'budget_type',
    df_meta_raw.columns[10]: 'start_date', df_meta_raw.columns[11]: 'end_date',
}
df_meta = df_meta_raw.rename(columns=col_map).copy()
df_meta['channel'] = 'Meta'
df_meta['campaign_name'] = ''
df_meta['ym'] = df_meta['ad_name'].apply(extract_ym)

def is_infl_pa(row):
    combined = ' '.join([str(row.get('campaign_name','')), str(row.get('adset_name','')), str(row.get('ad_name',''))]).lower()
    return bool(re.search(r'인플|_pa\(|_pa\b|\bpa_|\(pa\)', combined) or '인플루언서' in combined)

tt_infl = df_tt[df_tt.apply(is_infl_pa, axis=1)].copy()
meta_infl = df_meta[df_meta.apply(is_infl_pa, axis=1)].copy()

# ── 채널 전체 요약 ────────────────────────────────────────────────
def ch_sum(df):
    purchases = df['purchases'].sum()
    cost = df['cost'].sum()
    impressions = df['impressions'].sum()
    clicks = df['clicks'].sum()
    installs = df['installs'].sum() if 'installs' in df.columns else 0
    ctr = clicks/impressions*100 if impressions > 0 else 0
    return dict(
        cost=int(cost), impressions=int(impressions), clicks=int(clicks),
        installs=int(installs), purchases=int(purchases),
        ctr=round(ctr,2),
        cpi=round(cost/installs,0) if installs > 0 else None,
        cpa=round(cost/purchases,0) if purchases > 0 else None,
    )

tt_sum  = ch_sum(df_tt)
meta_sum = ch_sum(df_meta)

# ── 인플/PA 월별 시계열 ───────────────────────────────────────────
def monthly_agg(df):
    d = df[df['ym'].notna()].copy()
    d['purchases'] = pd.to_numeric(d['purchases'], errors='coerce').fillna(0)
    g = d.groupby('ym').agg(cost=('cost','sum'), purchases=('purchases','sum'), installs=('installs','sum')).reset_index()
    g['cpa'] = np.where(g['purchases']>0, (g['cost']/g['purchases']).round(0), np.nan)
    g['purchases'] = g['purchases'].astype(int)
    g['cost'] = g['cost'].astype(int)
    return g.sort_values('ym')

tt_mo   = monthly_agg(tt_infl)
meta_mo = monthly_agg(meta_infl)

# 통합 월별
all_df = []
for df, ch in [(tt_mo, 'TikTok'), (meta_mo, 'Meta')]:
    df2 = df.copy(); df2['channel'] = ch
    all_df.append(df2)
combined_mo = pd.concat(all_df).sort_values('ym')

# 전체 통합 (채널 합산)
tt_infl['purchases'] = pd.to_numeric(tt_infl['purchases'], errors='coerce').fillna(0)
meta_infl['purchases'] = pd.to_numeric(meta_infl['purchases'], errors='coerce').fillna(0)
combined_all = pd.concat([
    tt_infl[['ym','cost','purchases','installs','channel']],
    meta_infl[['ym','cost','purchases','installs','channel']]
])
total_mo = combined_all[combined_all['ym'].notna()].groupby('ym').agg(
    cost=('cost','sum'), purchases=('purchases','sum')
).reset_index()
total_mo['cpa'] = np.where(total_mo['purchases']>0, (total_mo['cost']/total_mo['purchases']).round(0), np.nan)

# ── 인플/PA 소재 상위 성과 ────────────────────────────────────────
# Meta 인플/PA 소재별 (purchases > 0)
meta_infl['purchases'] = pd.to_numeric(meta_infl['purchases'], errors='coerce').fillna(0)
meta_infl['cpa'] = np.where(meta_infl['purchases']>0, meta_infl['cost']/meta_infl['purchases'], np.nan)
meta_top = meta_infl[meta_infl['purchases']>0].nlargest(20, 'purchases')[
    ['ad_name','adset_name','cost','impressions','installs','purchases','cpa','ym']
]

# TikTok 인플/PA 소재별
tt_infl['purchases'] = pd.to_numeric(tt_infl['purchases'], errors='coerce').fillna(0)
tt_infl['cpa'] = np.where(tt_infl['purchases']>0, tt_infl['cost']/tt_infl['purchases'], np.nan)
tt_top = tt_infl[tt_infl['purchases']>0].nlargest(20, 'purchases')[
    ['campaign_name','adset_name','ad_name','cost','impressions','installs','purchases','cpa','ym']
]

# ── 출력 (Notion용 데이터 확인) ────────────────────────────────────
print("=== 채널별 요약 ===")
print(f"TikTok: {tt_sum}")
print(f"Meta: {meta_sum}")

print("\n=== 인플/PA 월별 (통합) ===")
print(total_mo.to_string(index=False))

print("\n=== TikTok 인플/PA 월별 ===")
print(tt_mo.to_string(index=False))

print("\n=== Meta 인플/PA 월별 ===")
print(meta_mo.to_string(index=False))

print("\n=== Meta 인플/PA 소재 TOP 20 (구매수 기준) ===")
print(meta_top.to_string())

print("\n=== TikTok 인플/PA 소재 TOP 20 ===")
print(tt_top.to_string())

# JSON으로 저장 (Notion 작성용)
result = {
    "tt_sum": tt_sum,
    "meta_sum": meta_sum,
    "total_monthly": total_mo.fillna(0).to_dict('records'),
    "tt_monthly": tt_mo.fillna(0).to_dict('records'),
    "meta_monthly": meta_mo.fillna(0).to_dict('records'),
    "meta_top_creatives": meta_top.fillna(0).astype(str).to_dict('records'),
    "tt_top_creatives": tt_top.fillna(0).astype(str).to_dict('records'),
}
with open("datas/notion_data.json", "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2, default=str)
print("\n저장 완료: datas/notion_data.json")
