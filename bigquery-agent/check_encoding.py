with open('C:/Users/hound/OneDrive/바탕 화면/bigquery-agent/datas/dong_detail.json', 'rb') as f:
    raw = f.read(500)

print("First 500 bytes (hex):")
print(raw.hex())
print()
print("Trying utf-8:")
try:
    print(raw.decode('utf-8')[:200])
except Exception as e:
    print("utf-8 fail:", e)

print("\nTrying utf-16:")
try:
    print(raw.decode('utf-16')[:200])
except Exception as e:
    print("utf-16 fail:", e)

print("\nTrying cp949:")
try:
    print(raw.decode('cp949')[:200])
except Exception as e:
    print("cp949 fail:", e)
