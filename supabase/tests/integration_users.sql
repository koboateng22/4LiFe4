-- Test users for scripts/integration-test.ts (local development database only).
insert into auth.users (id, email, raw_user_meta_data) values
 ('11111111-1111-4111-8111-111111111111', 'ama@it.test',
  '{"role":"therapist","nickname":"dr_ama_it","full_name":"Ama Konadu","title":"Dr.","profession":"Clinical psychologist","license_body":"GPC","license_number":"IT-1","agreed_confidentiality":true,"agreed_crisis_protocol":true,"agreed_accuracy":true,"specialties":["substance"],"session_length":50,"fee_ghs":35}'),
 ('22222222-2222-4222-8222-222222222222', 'kwame@it.test', '{"nickname":"SoberWarrior_GH","display_name":"Kwame Mensah","current_triage":"substance"}'),
 ('33333333-3333-4333-8333-333333333333', 'akosua@it.test', '{"nickname":"Akosua_Rising","current_triage":"social_media"}');
update public.therapists set verification = 'verified' where id = '11111111-1111-4111-8111-111111111111';
update public.profiles set share_location_in_crisis = true where id = '22222222-2222-4222-8222-222222222222';
