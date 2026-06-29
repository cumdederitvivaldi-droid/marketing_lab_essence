export interface BackofficeRequest {
  id: string;
  phone: string;
  request_type: "user_lookup" | "order_detail";
  url: string | null;
  status: "pending" | "processing" | "completed" | "error";
  result: ScrapedCustomerData | OrderDetailData | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface OrderDetailData {
  orderId: string;
  failureCode: string;       // 실패 사유 코드 (예: "정책 미준수")
  failureMessage: string;    // 실패 사유 메시지 (예: "기타")
  visitImages: number;       // 방문 이미지 개수
  visitImageUrls: string[];  // 방문 이미지 URL
  visitResult: string;       // 방문 결과 (예: "방문 실패")
  visitCount: string;        // 방문 차수 (예: "방문 1차")
  items: Array<{             // 상품 목록
    name: string;
    status: string;
    quantity: number;
    weight: string;
  }>;
}

export interface ScrapedCustomerData {
  orders: ScrapedOrder[];
  userInfo: UserInfo | null;
}

export interface ScrapedOrder {
  orderId: string;       // 주문번호
  orderStatus: string;   // 주문상태
  orderName: string;     // 주문명
  customerName: string;  // 고객명
  customerType: string;  // 고객유형
  phone: string;         // 전화번호
  address: string;       // 주소
  addressDetail: string; // 상세주소
  pickupDate: string;    // 수거/배송 날짜
  driver: string;        // 담당기사
  bags: string;          // 봉투
  boxes: string;         // 박스
  deliveryBags: string;  // 배송봉투
  waste: string;         // 폐기물
}

export interface UserInfo {
  name: string;              // 고객명
  id: string;                // 사용자 ID
  phone: string;             // 전화번호
  joinDate: string;          // 가입일
  lastModified: string;      // 마지막 수정일
  grade: string;             // 등급 (씨앗 등)
  validOrders: string;       // 유효 주문 수
  nextExpireOrders: string;  // 다음 주 소멸 예정 주문
  address: string;           // 등록 주소
  totalOrders: string;       // 총 주문 수
  isSubscriber: boolean;     // 구독 활성 여부 (구독 이력 테이블의 "활성" 상태)
  subscriptionDate: string;  // 구독 시작일
  subscriptionPlan: string;  // 플랜명 설명 (예: "커버링 구독 베타 서비스")
  subscriptionStatus: string; // 상태 ("활성" / "취소" / "")
  subscriptionValidUntil: string; // 유효기간 전체 텍스트 (예: "2026-04-17 ~ 2026-05-17")
  subscriptionCancelDate: string; // 취소일 (취소 상태일 때)
  recentOrders: Array<{      // 최근 주문 내역 (90일)
    date: string;
    orderId: string;
    orderUrl: string;
    orderName: string;
    status: string;
    weight: string;
  }>;
}
