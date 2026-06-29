"""
Notion 페이지 콘텐츠 생성 v2: 구글애즈 포함 3채널 분석
"""
import os, re, json, warnings
warnings.filterwarnings("ignore")
import pandas as pd
import numpy as np
from datetime import datetime

base = r"C:\Users\hound\OneDrive\바탕 화면\bigquery-agent\datas\광고 매체 데이터"

def extract_ym(text):
    if not isinstance(text, str): return None
    m = re.search(r'[_\s](\d{2})\.(\d{2})(?:\.\d{2})?', text)
    if m:
        yy, mm = int(m.group(1)), int(m.group(2))
        return f"{2000+yy}-{mm:02d}"
    return None

# ── TikTok ────────────────────────────────────────────────────────
files = os.listdir(base)
tiktok_f = [f for f in files if "Tiktok" in f or "tiktok" in f.lower()][0]
df_tt = pd.read_excel(os.path.join(base, tiktok_f))
df_tt['ym'] = df_tt['Campaign name'].apply(extract_ym)
df_tt['channel'] = 'TikTok'
df_tt['ad_name'] = df_tt['Ad name'].fillna('')
df_tt['adset_name'] = df_tt['Ad group name'].fillna('')
df_tt['campaign_name'] = df_tt['Campaign name'].fillna('')
df_tt['cost'] = pd.to_numeric(df_tt['Cost'], errors='coerce').fillna(0)
df_tt['impressions'] = pd.to_numeric(df_tt['Impressions'], errors='coerce').fillna(0)
df_tt['clicks'] = pd.to_numeric(df_tt['Clicks (destination)'], errors='coerce').fillna(0)
df_tt['installs'] = pd.to_numeric(df_tt['App installs'], errors='coerce').fillna(0)
df_tt['purchases'] = pd.to_numeric(df_tt['Purchases (app)'], errors='coerce').fillna(0)

# ── Meta ──────────────────────────────────────────────────────────
meta_f = [f for f in files if "메타" in f][0]
df_meta_raw = pd.read_csv(os.path.join(base, meta_f), encoding="utf-8-sig")
col_map = {
    df_meta_raw.columns[0]: 'ad_name',   df_meta_raw.columns[1]: 'adset_name',
    df_meta_raw.columns[2]: 'cost',      df_meta_raw.columns[3]: 'impressions',
    df_meta_raw.columns[4]: 'clicks',    df_meta_raw.columns[5]: 'installs',
    df_meta_raw.columns[6]: 'completions', df_meta_raw.columns[7]: 'purchases',
    df_meta_raw.columns[8]: 'adset_status', df_meta_raw.columns[9]: 'budget_type',
    df_meta_raw.columns[10]: 'start_date', df_meta_raw.columns[11]: 'end_date',
}
df_meta = df_meta_raw.rename(columns=col_map).copy()
df_meta['channel'] = 'Meta'
df_meta['campaign_name'] = ''
df_meta['ym'] = df_meta['ad_name'].apply(extract_ym)
for col in ['cost','impressions','clicks','installs','purchases']:
    df_meta[col] = pd.to_numeric(df_meta[col], errors='coerce').fillna(0)

# ── Google Ads ────────────────────────────────────────────────────
google_f = [f for f in files if "구글애즈" in f][0]
df_g_raw = pd.read_excel(os.path.join(base, google_f), header=None)
# 헤더 행 찾기 (광고그룹이 포함된 행)
header_row = None
for i, row in df_g_raw.iterrows():
    if '광고그룹' in str(row.values):
        header_row = i
        break

df_g = df_g_raw.iloc[header_row+1:].copy()
df_g.columns = ['adset_name', 'campaign_name', 'currency', 'cost', 'impressions', 'clicks', 'installs', 'purchases']
df_g = df_g[df_g['cost'].apply(lambda x: str(x).replace('.','').isdigit() if pd.notna(x) else False)].copy()
for col in ['cost','impressions','clicks','installs','purchases']:
    df_g[col] = pd.to_numeric(df_g[col], errors='coerce').fillna(0)
df_g['channel'] = 'Google'
df_g['ad_name'] = df_g['adset_name']  # Google은 광고그룹 단위
df_g['ym'] = df_g['adset_name'].apply(extract_ym)

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

tt_sum   = ch_sum(df_tt)
meta_sum = ch_sum(df_meta)
google_sum = ch_sum(df_g)

# ── 인플/PA 필터 ─────────────────────────────────────────────────
def is_infl_pa(row):
    combined = ' '.join([
        str(row.get('campaign_name','')),
        str(row.get('adset_name','')),
        str(row.get('ad_name',''))
    ]).lower()
    return bool(re.search(r'인플|인플루언서|_pa\b|pa\(|\bpa_|\bpa\)| pa_| pa\b', combined) or
                '_pa(' in combined or '인플루언서pa' in combined)

tt_infl   = df_tt[df_tt.apply(is_infl_pa, axis=1)].copy()
meta_infl = df_meta[df_meta.apply(is_infl_pa, axis=1)].copy()
google_infl = df_g[df_g.apply(is_infl_pa, axis=1)].copy()

print(f"인플/PA 소재 수: TikTok={len(tt_infl)}, Meta={len(meta_infl)}, Google={len(google_infl)}")

# ── 월별 집계 ─────────────────────────────────────────────────────
def monthly_agg(df):
    d = df[df['ym'].notna()].copy()
    for col in ['purchases','cost','installs']:
        d[col] = pd.to_numeric(d[col], errors='coerce').fillna(0)
    g = d.groupby('ym').agg(
        cost=('cost','sum'),
        purchases=('purchases','sum'),
        installs=('installs','sum')
    ).reset_index()
    g['cpa'] = np.where(g['purchases']>0, (g['cost']/g['purchases']).round(0), np.nan)
    g['purchases'] = g['purchases'].astype(int)
    g['cost'] = g['cost'].astype(int)
    return g.sort_values('ym')

tt_mo     = monthly_agg(tt_infl)
meta_mo   = monthly_agg(meta_infl)
google_mo = monthly_agg(google_infl)

# 3채널 통합 월별
all_frames = []
for df, ch in [(tt_mo,'TikTok'),(meta_mo,'Meta'),(google_mo,'Google')]:
    d = df.copy(); d['channel'] = ch
    all_frames.append(d)
combined_mo = pd.concat(all_frames).sort_values(['ym','channel'])

# 채널 합산 월별
combined_all = pd.concat([
    tt_infl[['ym','cost','purchases','installs','channel']],
    meta_infl[['ym','cost','purchases','installs','channel']],
    google_infl[['ym','cost','purchases','installs','channel']]
])
for col in ['cost','purchases']:
    combined_all[col] = pd.to_numeric(combined_all[col], errors='coerce').fillna(0)
total_mo = combined_all[combined_all['ym'].notna()].groupby('ym').agg(
    cost=('cost','sum'), purchases=('purchases','sum')
).reset_index()
total_mo['cpa'] = np.where(total_mo['purchases']>0, (total_mo['cost']/total_mo['purchases']).round(0), np.nan)

# ── 소재별 Top ────────────────────────────────────────────────────
meta_infl['cpa'] = np.where(meta_infl['purchases']>0, meta_infl['cost']/meta_infl['purchases'], np.nan)
meta_top = meta_infl[meta_infl['purchases']>0].nlargest(20, 'purchases')[
    ['ad_name','adset_name','cost','impressions','installs','purchases','cpa','ym']
]

tt_infl['cpa'] = np.where(tt_infl['purchases']>0, tt_infl['cost']/tt_infl['purchases'], np.nan)
tt_top = tt_infl[tt_infl['purchases']>0].nlargest(20, 'purchases')[
    ['campaign_name','adset_name','ad_name','cost','impressions','installs','purchases','cpa','ym']
]

google_infl['cpa'] = np.where(google_infl['purchases']>0, google_infl['cost']/google_infl['purchases'], np.nan)
google_top = google_infl.nlargest(20, 'purchases')[
    ['adset_name','campaign_name','cost','impressions','installs','purchases','cpa','ym']
]

# ── 출력 ──────────────────────────────────────────────────────────
print("\n=== 채널별 전체 요약 ===")
print(f"TikTok: {tt_sum}")
print(f"Meta:   {meta_sum}")
print(f"Google: {google_sum}")

print("\n=== 인플/PA 통합 월별 ===")
print(total_mo.to_string(index=False))

print("\n=== 채널별 인플/PA 월별 ===")
print(combined_mo.to_string(index=False))

print("\n=== Google 인플/PA 소재 전체 ===")
print(google_infl[['adset_name','campaign_name','cost','installs','purchases','cpa','ym']].to_string(index=False))

# JSON 저장
result = {
    "tt_sum": tt_sum,
    "meta_sum": meta_sum,
    "google_sum": google_sum,
    "total_monthly": total_mo.fillna(0).to_dict('records'),
    "tt_monthly": tt_mo.fillna(0).to_dict('records'),
    "meta_monthly": meta_mo.fillna(0).to_dict('records'),
    "google_monthly": google_mo.fillna(0).to_dict('records'),
    "combined_monthly": combined_mo.fillna(0).to_dict('records'),
    "meta_top_creatives": meta_top.fillna(0).astype(str).to_dict('records'),
    "tt_top_creatives": tt_top.fillna(0).astype(str).to_dict('records'),
    "google_infl": google_infl[['adset_name','campaign_name','cost','installs','purchases','cpa','ym']].fillna(0).astype(str).to_dict('records'),
}
with open("datas/notion_data_v2.json", "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2, default=str)
print("\n저장 완료: datas/notion_data_v2.json")
