"""
광고 매체 데이터 통합 분석
- Meta, TikTok, Google Ads
- 인플/PA 소재 필터링
- 월별 시계열 CPA 분석
"""
import os, re, json, warnings
warnings.filterwarnings("ignore")
import pandas as pd
import numpy as np
from datetime import datetime

base = r"C:\Users\hound\OneDrive\바탕 화면\bigquery-agent\datas\광고 매체 데이터"
files = os.listdir(base)

# ── 1. TikTok 읽기 ────────────────────────────────────────────────
tiktok_f = [f for f in files if "Tiktok" in f or "tiktok" in f.lower()][0]
df_tt = pd.read_excel(os.path.join(base, tiktok_f))

# 날짜 추출: campaign name / ad group name 에서 YY.MM 패턴
def extract_ym(text):
    """_YY.MM.DD 또는 _YY.MM 패턴에서 YYYY-MM 추출"""
    if not isinstance(text, str): return None
    m = re.search(r'[_\s](\d{2})\.(\d{2})(?:\.\d{2})?', text)
    if m:
        yy, mm = int(m.group(1)), int(m.group(2))
        year = 2000 + yy
        return f"{year}-{mm:02d}"
    return None

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
df_tt['ctr'] = np.where(df_tt['impressions'] > 0, df_tt['clicks'] / df_tt['impressions'] * 100, np.nan)
df_tt['cpa'] = np.where(df_tt['purchases'] > 0, df_tt['cost'] / df_tt['purchases'], np.nan)

# ── 2. Meta 읽기 ─────────────────────────────────────────────────
meta_f = [f for f in files if "메타" in f][0]
df_meta_raw = pd.read_csv(os.path.join(base, meta_f), encoding="utf-8-sig")
# 컬럼 재매핑 (순서 기반)
col_map = {
    df_meta_raw.columns[0]:  'ad_name',
    df_meta_raw.columns[1]:  'adset_name',
    df_meta_raw.columns[2]:  'cost',
    df_meta_raw.columns[3]:  'impressions',
    df_meta_raw.columns[4]:  'clicks',
    df_meta_raw.columns[5]:  'installs',
    df_meta_raw.columns[6]:  'completions',
    df_meta_raw.columns[7]:  'purchases',
    df_meta_raw.columns[8]:  'adset_status',
    df_meta_raw.columns[9]:  'budget_type',
    df_meta_raw.columns[10]: 'start_date',
    df_meta_raw.columns[11]: 'end_date',
}
df_meta = df_meta_raw.rename(columns=col_map).copy()
df_meta['channel'] = 'Meta'
df_meta['campaign_name'] = ''  # Meta 데이터에 캠페인명 없음
df_meta['ym'] = df_meta['ad_name'].apply(extract_ym)
df_meta['ctr'] = np.where(df_meta['impressions'] > 0, df_meta['clicks'] / df_meta['impressions'] * 100, np.nan)
df_meta['cpa'] = np.where(df_meta['purchases'] > 0, df_meta['cost'] / df_meta['purchases'], np.nan)

# ── 3. Google Ads 읽기 ────────────────────────────────────────────
google_f = [f for f in files if "노클비" in f][0]
df_google = None
for enc, sep in [('utf-16', ','), ('utf-16-le', ','), ('utf-16', '\t'), ('utf-8-sig', ',')]:
    try:
        with open(os.path.join(base, google_f), 'r', encoding=enc) as fh:
            content = fh.read()
        # CSV 파싱
        from io import StringIO
        df_google = pd.read_csv(StringIO(content), sep=sep, on_bad_lines='skip')
        if df_google.shape[1] > 2:
            print(f"Google Ads 읽기 성공 ({enc}, sep='{sep}'): shape={df_google.shape}")
            print(f"  컬럼: {list(df_google.columns[:10])}")
            print(df_google.head(3).to_string())
            break
    except Exception as e:
        pass

if df_google is None:
    # 바이너리로 시도
    with open(os.path.join(base, google_f), 'rb') as fh:
        raw = fh.read()
    print(f"Google Ads 바이너리 BOM: {raw[:4].hex()}")
    print(f"첫 200바이트: {raw[:200]}")

# ── 4. 인플/PA 필터 ───────────────────────────────────────────────
def is_infl_pa(row):
    combined = ' '.join([
        str(row.get('campaign_name', '')),
        str(row.get('adset_name', '')),
        str(row.get('ad_name', ''))
    ]).lower()
    return bool(re.search(r'인플|_pa\b|pa\(|\bpa_|\bpa\)', combined) or
                '_pa(' in combined.lower() or
                '인플루언서' in combined)

# 각 채널별 인플/PA 필터
tt_infl = df_tt[df_tt.apply(is_infl_pa, axis=1)].copy()
meta_infl = df_meta[df_meta.apply(is_infl_pa, axis=1)].copy()

print(f"\n인플/PA 소재 수: TikTok={len(tt_infl)}, Meta={len(meta_infl)}")
print(f"\n[TikTok 인플/PA 캠페인]")
print(tt_infl[['campaign_name','adset_name','cost','purchases','cpa','ym']].to_string())
print(f"\n[Meta 인플/PA 소재 상위]")
print(meta_infl[['ad_name','adset_name','cost','purchases','cpa','ym']].head(30).to_string())

# ── 5. 월별 시계열 집계 ───────────────────────────────────────────
def monthly_summary(df, channel):
    df2 = df[df['ym'].notna()].copy()
    g = df2.groupby('ym').agg(
        total_cost=('cost', 'sum'),
        total_purchases=('purchases', 'sum'),
        total_installs=('installs', 'sum') if 'installs' in df2.columns else ('cost', 'count'),
        row_count=('cost', 'count')
    ).reset_index()
    g['cpa'] = np.where(g['total_purchases'] > 0, g['total_cost'] / g['total_purchases'], np.nan)
    g['channel'] = channel
    return g

tt_monthly = monthly_summary(tt_infl, 'TikTok')
meta_monthly = monthly_summary(meta_infl, 'Meta')

all_monthly = pd.concat([tt_monthly, meta_monthly], ignore_index=True).sort_values(['ym','channel'])
print(f"\n=== 인플/PA 월별 시계열 ===")
print(all_monthly.to_string())

# ── 6. 전체 채널 합산 요약 ────────────────────────────────────────
def channel_summary(df, channel):
    return {
        'channel': channel,
        'total_cost': int(df['cost'].sum()),
        'total_impressions': int(df['impressions'].sum()),
        'total_clicks': int(df['clicks'].sum()),
        'total_installs': int(df['installs'].sum()) if 'installs' in df.columns else 0,
        'total_purchases': int(df['purchases'].sum()),
        'ctr': round(df['clicks'].sum() / df['impressions'].sum() * 100, 2) if df['impressions'].sum() > 0 else 0,
        'cpi': round(df['cost'].sum() / df['installs'].sum(), 0) if df['installs'].sum() > 0 else None,
        'cpa': round(df['cost'].sum() / df['purchases'].sum(), 0) if df['purchases'].sum() > 0 else None,
    }

summary = [channel_summary(df_tt, 'TikTok'), channel_summary(df_meta, 'Meta')]
print(f"\n=== 채널별 전체 요약 ===")
for s in summary:
    print(s)

# ── 결과 저장 ────────────────────────────────────────────────────
os.makedirs("datas", exist_ok=True)
ts = datetime.now().strftime("%Y%m%d_%H%M%S")
all_monthly.to_csv(f"datas/{ts}_인플PA_월별.csv", index=False, encoding="utf-8-sig")
tt_infl.to_csv(f"datas/{ts}_TikTok_인플PA.csv", index=False, encoding="utf-8-sig")
meta_infl.to_csv(f"datas/{ts}_Meta_인플PA.csv", index=False, encoding="utf-8-sig")
print("\n저장 완료")
