import subprocess
import sys
import os

def run_bq(query, output_file=None):
    bq_path = r"C:\Users\hound\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\bq.cmd"
    cmd = [bq_path, "query", "--use_legacy_sql=false", "--format=csv", "--max_rows=1000", query]
    result = subprocess.run(cmd, capture_output=True)
    # Try decoding with utf-8, fallback to cp949
    try:
        text = result.stdout.decode("utf-8")
    except:
        text = result.stdout.decode("cp949", errors="replace")
    if output_file:
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(text)
        print(f"Saved to {output_file}")
    else:
        print(text)
    if result.returncode not in (0, 255):  # 255 is warning exit code from bq
        err = result.stderr.decode("utf-8", errors="replace")
        if err:
            print("STDERR:", err[:500], file=sys.stderr)

if __name__ == "__main__":
    query = sys.argv[1] if len(sys.argv) > 1 else ""
    out = sys.argv[2] if len(sys.argv) > 2 else None
    run_bq(query, out)
