CREATE UNIQUE INDEX IF NOT EXISTS uniq_csv_visit_import
ON visits (
  business_id,
  lower(customer_email),
  coalesce(service_name, ''),
  visited_at
)
WHERE source = 'csv' AND customer_email IS NOT NULL;
