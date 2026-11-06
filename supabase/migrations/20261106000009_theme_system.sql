-- Theme: "system" joins "light" and "dark". It follows the device's own light or dark setting,
-- and is now the default for new accounts. Existing people keep the theme they chose.
-- Only the allowed values change; no data is rewritten.
alter table public.profiles drop constraint if exists profiles_theme_check;
alter table public.profiles add constraint profiles_theme_check check (theme in ('light', 'dark', 'system'));
alter table public.profiles alter column theme set default 'system';

-- Sign-up keeps the theme chosen before the account existed (same function as
-- 20261103000008_signup_age.sql, with only the theme line changed).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  m        jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role   public.app_role := case when m ->> 'role' = 'therapist' then 'therapist'::public.app_role else 'client'::public.app_role end;
  v_nick   text := coalesce(nullif(trim(m ->> 'nickname'), ''), 'member_' || substr(replace(new.id::text, '-', ''), 1, 8));
  v_age    smallint;
begin
  -- Two steps on purpose: SQL doesn't promise to run the digit check before the cast
  if m ->> 'age' ~ '^[0-9]{1,3}$' then
    v_age := (m ->> 'age')::smallint;
    if v_age not between 13 and 120 then
      v_age := null;
    end if;
  end if;

  insert into public.profiles (id, role, display_name, nickname, region, age, language, theme, current_triage, belief, religion_type)
  values (
    new.id, v_role,
    coalesce(m ->> 'display_name', ''),
    v_nick,
    m ->> 'region',
    v_age,
    coalesce(m ->> 'language', 'en'),
    case when m ->> 'theme' in ('light', 'dark', 'system') then m ->> 'theme' else 'system' end,
    coalesce(m ->> 'current_triage', 'general'),
    m ->> 'belief',
    m ->> 'religion_type'
  );

  if v_role = 'therapist' then
    if coalesce(m ->> 'license_number', '') = '' or coalesce(m ->> 'license_body', '') = '' then
      raise exception 'Therapist sign-up needs a licensing body and licence number';
    end if;
    if not (coalesce((m ->> 'agreed_confidentiality')::boolean, false)
        and coalesce((m ->> 'agreed_crisis_protocol')::boolean, false)
        and coalesce((m ->> 'agreed_accuracy')::boolean, false)) then
      raise exception 'Therapist sign-up needs all three professional agreements';
    end if;

    insert into public.therapists (
      id, title, full_name, profession, years_experience, specialties, approaches, languages, formats,
      region, practice_location, work_days, start_time, end_time, session_length, fee_ghs, sliding_scale,
      accepting_clients, bio)
    values (
      new.id,
      coalesce(m ->> 'title', ''),
      coalesce(nullif(m ->> 'full_name', ''), m ->> 'display_name', v_nick),
      coalesce(m ->> 'profession', 'Counsellor'),
      coalesce((m ->> 'years_experience')::smallint, 0),
      coalesce(array(select jsonb_array_elements_text(m -> 'specialties')), '{}'),
      coalesce(array(select jsonb_array_elements_text(m -> 'approaches')), '{}'),
      coalesce(nullif(array(select jsonb_array_elements_text(m -> 'languages')), '{}'), '{English}'),
      coalesce(nullif(array(select jsonb_array_elements_text(m -> 'formats'))::public.session_format[], '{}'), '{video,voice}'),
      m ->> 'region',
      m ->> 'practice_location',
      coalesce(nullif(array(select jsonb_array_elements_text(m -> 'work_days')), '{}'), '{Mon,Tue,Wed,Thu,Fri}'),
      coalesce((m ->> 'start_time')::time, '09:00'),
      coalesce((m ->> 'end_time')::time, '17:00'),
      coalesce((m ->> 'session_length')::smallint, 50),
      coalesce((m ->> 'fee_ghs')::numeric, 0),
      coalesce((m ->> 'sliding_scale')::boolean, true),
      coalesce((m ->> 'accepting_clients')::boolean, true),
      coalesce(m ->> 'bio', '')
    );

    insert into public.therapist_credentials (
      therapist_id, license_body, license_number,
      agreed_confidentiality_at, agreed_crisis_protocol_at, agreed_accuracy_at)
    values (new.id, m ->> 'license_body', m ->> 'license_number', now(), now(), now());
  end if;

  return new;
end $$;
