# 웹훅 스펙 (개발팀 전달용)

```
POST https://vehicle-dispatch-monitor.vercel.app/api/webhook
X-Webhook-Secret: ac86c740ea58d29d9527b68cb525450b512d678959c4f0202f40a364459e281b

{"order_id": 1283492, "vehicle_number": "서울 85 바 9953", "rider_name": "윤성원"}
```

재시도 불필요 / 최초 1회만

# 채널톡 메시지 템플릿

안녕하세요, 커버링입니다 :)
수거 차량이 배정되었습니다.

차량번호: [{vehicle_number}]

아파트 차량 등록 후, 봉투를 문 앞에 놓아주시면 새벽에 수거해드리겠습니다.
감사합니다!
