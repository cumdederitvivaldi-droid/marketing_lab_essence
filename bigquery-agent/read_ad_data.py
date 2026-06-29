"""
광고 매체 데이터 파일 읽기 및 구조 파악
"""
import os, warnings
warnings.filterwarnings("ignore")
import pandas as pd

base = r"C:\Users\hound\OneDrive\바탕 화면\bigquery-agent\datas\광고 매체 데이터"

files = os.listdir(base)
print("파일 목록:", files)

dfs = {}
for f in files:
    path = os.path.join(base, f)
    try:
        if f.endswith(".xlsx"):
            df = pd.read_excel(path, sheet_name=None)
            print(f"\n=== {f} (Excel) ===")
            for sname, sdf in df.items():
                print(f"  시트: {sname} | shape: {sdf.shape}")
                print(f"  컬럼: {list(sdf.columns)}")
                print(sdf.head(3).to_string())
            dfs[f] = df
        elif f.endswith(".csv"):
            df = pd.read_csv(path, encoding="utf-8-sig")
            print(f"\n=== {f} (CSV) ===")
            print(f"  shape: {df.shape}")
            print(f"  컬럼: {list(df.columns)}")
            print(df.head(3).to_string())
            dfs[f] = df
    except Exception as e:
        try:
            df = pd.read_csv(path, encoding="cp949")
            print(f"\n=== {f} (CSV/cp949) ===")
            print(f"  shape: {df.shape}")
            print(f"  컬럼: {list(df.columns)}")
            print(df.head(3).to_string())
            dfs[f] = df
        except Exception as e2:
            print(f"  읽기 실패: {e} / {e2}")
