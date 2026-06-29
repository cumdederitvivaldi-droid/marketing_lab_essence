SELECT id, discount_type, amount, max_discount_amount, remark
FROM `covering-app-ccd23.secure_dataset.coupon_policy`
WHERE id IN (40,41,42,43,44,45,46,47,48,64,73,85,97,98,101,105,111,136,143,149)
ORDER BY id
