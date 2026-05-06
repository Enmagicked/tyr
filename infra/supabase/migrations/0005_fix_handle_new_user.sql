-- 0005_fix_handle_new_user.sql — hardens the auth → candidates trigger.
--
-- The original trigger from 0001_baseline.sql failed in Supabase prod with
-- "Database error creating new user" on the auth/v1/admin/users POST. Root
-- cause: the SECURITY DEFINER function lacks an explicit search_path, so
-- when fired from the auth schema's INSERT trigger it cannot resolve
-- `candidates` (a public-schema table).
--
-- Also adds `on conflict (id) do nothing` so re-tries (rate limit, half-
-- finished signups) don't break on a second attempt.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.candidates (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Re-bind the trigger so it picks up the rewritten function definition.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
