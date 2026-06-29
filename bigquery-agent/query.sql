SELECT
  signup_referral_channel,
  COUNT(*) AS cnt
FROM `covering-app-ccd23.secure_dataset.user`
WHERE LOWER(signup_referral_channel) LIKE '%uac%'
   OR LOWER(signup_referral_channel) LIKE '%purchase%'
   OR signup_referral_channel LIKE '%복합소구%'
GROUP BY signup_referral_channel
ORDER BY cnt DESC
LIMIT 30
