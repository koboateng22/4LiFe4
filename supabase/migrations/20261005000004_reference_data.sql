-- =====================================================================
-- 4Life-AI · reference data: emergency centres
-- Phone numbers and hours must be checked before launch; set verified_at
-- once a centre's details have been confirmed.
-- =====================================================================
insert into public.emergency_centers (id, name, type, region, address, phone, lat, lng, hours, beds_available, emergency_hotline) values
  ('ems-1', 'Accra Psychiatric Hospital', 'hospital', 'Greater Accra', 'Castle Road, Adabraka, Accra', '+233 30 222 8671', 5.556, -0.2057, '24/7 Emergency Psychiatric Unit', true, '112 / 193'),
  ('ems-2', 'Pantang Psychiatric Hospital', 'hospital', 'Greater Accra', 'Pantang Village, Abokobi Road, Accra', '+233 30 250 1856', 5.7196, -0.1783, '24/7 Acute Care & Detox Wing', true, '030 250 1856'),
  ('ems-3', 'Ankaful Psychiatric Hospital', 'hospital', 'Central', 'Ankaful, Cape Coast', '+233 33 213 2446', 5.1485, -1.2982, '24/7 Inpatient & Crisis Care', true, '112'),
  ('ems-4', 'Turning Point Recovery Centre Ghana', 'rehab', 'Greater Accra', 'Achimota - Dome Pillar 2, Accra', '+233 24 438 8899', 5.6425, -0.2312, 'Open 8:00 AM - 8:00 PM (Emergency 24/7)', true, '+233 24 438 8899'),
  ('ems-5', 'Komfo Anokye Teaching Hospital (KATH) Psychiatric Wing', 'hospital', 'Ashanti', 'Bantama, Kumasi', '+233 32 202 2301', 6.6978, -1.6287, '24/7 Trauma & Emergency Center', true, '112'),
  ('ems-6', 'Ghana Narcotics Control Commission Helpline', 'helpline', 'National', 'Ministries, Accra (Nationwide Dispatch)', '0800 100 100 / 030 276 1000', 5.55, -0.198, 'Toll-Free 24 Hours Daily', false, '0800 100 100'),
  ('ems-7', 'National Ambulance Service (NAS Ghana)', 'ems_station', 'National', 'Regional Rapid Response Stations', '112 / 193', 5.6037, -0.187, '24/7 Rapid Emergency Response', false, '112')
on conflict (id) do update set
  name = excluded.name, type = excluded.type, region = excluded.region, address = excluded.address,
  phone = excluded.phone, lat = excluded.lat, lng = excluded.lng, hours = excluded.hours,
  beds_available = excluded.beds_available, emergency_hotline = excluded.emergency_hotline, updated_at = now();
