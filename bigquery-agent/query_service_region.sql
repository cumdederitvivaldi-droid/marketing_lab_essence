SELECT DISTINCT
  region_1_depth_name,
  region_2_depth_name,
  COUNT(*) AS h_code_count
FROM `covering-app-ccd23.secure_dataset.service_region`
WHERE active_flag = TRUE
  AND deleted_date IS NULL
GROUP BY region_1_depth_name, region_2_depth_name
ORDER BY region_1_depth_name, region_2_depth_name
