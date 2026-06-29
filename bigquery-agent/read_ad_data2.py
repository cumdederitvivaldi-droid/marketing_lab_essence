"""
광고 매체 데이터 상세 분석
"""
import os, warnings, re
warnings.filterwarnings("ignore")
import pandas as pd

base = r"C:\Users\hound\OneDrive\바탕 화면\bigquery-agent\datas\광고 매체 데이터"
files = os.listdir(base)

# ── TikTok ────────────────────────────────────────────────────────
tiktok_file = [f for f in files if "Tiktok" in f or "tiktok" in f.lower()][0]
df_tt = pd.read_excel(os.path.join(base, tiktok_file))
print("=== TikTok ===")
print(f"shape: {df_tt.shape}")
print(f"columns: {list(df_tt.columns)}")
print(df_tt.dtypes)
print(df_tt.head(5).to_string())
print(f"\nCampaign name 샘플: {df_tt['Campaign name'].dropna().unique()[:10]}")
print(f"Ad group name 샘플: {df_tt['Ad group name'].dropna().unique()[:10]}")
print(f"Ad name 샘플: {df_tt['Ad name'].dropna().unique()[:10]}")

# ── Meta ──────────────────────────────────────────────────────────
meta_file = [f for f in files if "메타" in f][0]
df_meta = pd.read_csv(os.path.join(base, meta_file), encoding="utf-8-sig")
print("\n=== Meta ===")
print(f"shape: {df_meta.shape}")
print(f"columns: {list(df_meta.columns)}")
print(df_meta.dtypes)
print(df_meta.head(5).to_string())
print(f"\n광고 시작 unique sample: {df_meta.iloc[:,10].dropna().unique()[:5]}")
print(f"광고 종료 unique sample: {df_meta.iloc[:,11].dropna().unique()[:5]}")
# 구매 컬럼 확인
for col in df_meta.columns:
    if any(kw in col for kw in ['구매','구입','purchase','Purchase','CPA','cpa']):
        print(f"  구매 관련 컬럼: {col} | 예시: {df_meta[col].dropna().head(3).tolist()}")

# ── Google Ads (노클비) ───────────────────────────────────────────
google_file = [f for f in files if "노클비" in f][0]
for enc in ["utf-16", "utf-16-le", "utf-16-be", "utf-8-sig", "cp949"]:
    try:
        df_g = pd.read_csv(os.path.join(base, google_file), encoding=enc)
        print(f"\n=== Google Ads ({enc}) ===")
        print(f"shape: {df_g.shape}")
        print(f"columns: {list(df_g.columns)}")
        print(df_g.head(5).to_string())
        break
    except Exception as e:
        print(f"  {enc} 실패: {e}")
