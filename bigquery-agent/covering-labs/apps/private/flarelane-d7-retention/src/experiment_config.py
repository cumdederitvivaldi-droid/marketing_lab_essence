from __future__ import annotations

EXPERIMENT_KEY = "eng_1559_d7_reward_v2"
ENG1559_TAG_KEY = "pickup_order_count"
# D7_DELAY_MINUTES = 10080  # 여정 즉시 진입 전환으로 미사용 (레퍼런스 보존)

ENTRY_EVENT = "[EVENT] Eng1559FirstOrderEligible"
ENTRY_EVENT_SOURCE = "eng1559_exact_d7_batch"

ARM_CONTROL = "CONTROL"
ARM_MSG_ONLY = "MSG_ONLY"
ARM_PCT50 = "PCT50"
ARM_FIXED5000 = "FIXED5000"
ARMS = (ARM_CONTROL, ARM_MSG_ONLY, ARM_PCT50, ARM_FIXED5000)

REMINDER_EVENT_SOURCE = "eng1559_exact_d7_batch"
BENEFIT_EVENT_SOURCE = "eng1559_addorder_signal_batch"
EXIT_EVENT = "[EVENT] AddOrderComplete"   # 7일 대기 중 재주문 시 자동 이탈
ADD_ORDER_SIGNAL_EVENT = "[ROUTE] AddOrderScreen"

REMINDER_EVENT_BY_ARM = {
    ARM_MSG_ONLY: "[EVENT] Eng1559ReminderMsgEligible",
    ARM_PCT50: "[EVENT] Eng1559Reward50ReminderEligible",
    ARM_FIXED5000: "[EVENT] Eng1559Reward5000ReminderEligible",
}

BENEFIT_EVENT_BY_ARM = {
    ARM_PCT50: "[EVENT] Eng1559Reward50Eligible",
    ARM_FIXED5000: "[EVENT] Eng1559Reward5000Eligible",
}

REMINDER_AUTOMATION_BY_ARM = {
    ARM_MSG_ONLY: "[ENG-1559] D7 Reminder Journey - MSG_ONLY",
    ARM_PCT50: "[ENG-1559] D7 Reminder Journey - PCT50",
    ARM_FIXED5000: "[ENG-1559] D7 Reminder Journey - FIXED5000",
}

BENEFIT_AUTOMATION_BY_ARM = {
    ARM_PCT50: "[ENG-1559] D7 Benefit Journey - PCT50",
    ARM_FIXED5000: "[ENG-1559] D7 Benefit Journey - FIXED5000",
}

LEGACY_AUTOMATION_NAME = "[ENG-1559] D7 Retention Incentive Journey"

SPECIAL50_POLICY_ID = "192"
SPECIAL5000_POLICY_ID = "193"
COUPON_POLICY_BY_ARM = {
    ARM_PCT50: SPECIAL50_POLICY_ID,
    ARM_FIXED5000: SPECIAL5000_POLICY_ID,
}

ARM_INDEX_BY_BUCKET = {
    0: ARM_CONTROL,
    1: ARM_MSG_ONLY,
    2: ARM_PCT50,
    3: ARM_FIXED5000,
}
