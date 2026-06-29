"""
배치 스크립트 템플릿
- 이 파일을 복사해서 작업하세요
- GCS, BigQuery, Sheets 접근은 서비스 계정으로 자동 인증됩니다
"""
from datetime import datetime

def main():
    print(f"[{datetime.now()}] 배치 시작")

    # 예시: Google Sheets 접근
    # creds, _ = google.auth.default(scopes=[
    #     "https://www.googleapis.com/auth/spreadsheets",
    #     "https://www.googleapis.com/auth/drive",
    # ])
    # import gspread
    # gc = gspread.authorize(creds)
    # sheet = gc.open("시트 이름").sheet1

    # 예시: BigQuery 접근
    # from google.cloud import bigquery
    # client = bigquery.Client()
    # rows = client.query("SELECT * FROM dataset.table LIMIT 10").result()

    print(f"[{datetime.now()}] 배치 완료")

if __name__ == "__main__":
    main()
