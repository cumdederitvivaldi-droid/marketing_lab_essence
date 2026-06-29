"""A/B 결정적 배정 — user_id 해시 기반, treatment 51% / control 49%.

명목 50:50이되 소수점 경계는 treatment 쪽으로 기울이는 정책.
"""

import hashlib
from config import EXPERIMENT_KEY

TREATMENT_THRESHOLD = 51  # treatment 51%, control 49% (out of 100 buckets)


def assign_variant(user_id: int) -> str:
    """같은 user_id는 항상 같은 군. salt에 experiment key 포함해 다른 실험과 독립."""
    h = hashlib.md5(f"{EXPERIMENT_KEY}:{user_id}".encode()).hexdigest()  # noqa: S324 - non-cryptographic deterministic bucketing
    bucket = int(h, 16) % 100
    return "treatment" if bucket < TREATMENT_THRESHOLD else "control"
