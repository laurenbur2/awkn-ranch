-- Let any authenticated session read app_users so admin pages (Users
-- directory, Facilitators "add from team" search, etc.) can list teammates.
--
-- Without this, the existing "own record" policy meant a logged-in admin
-- could only see themselves — staff lookups were silently empty in
-- multiple places. App-level access is already gated by permission keys
-- (`view_users` for the Users page, `view_crm` for Within admin pages),
-- so RLS just needs to mirror the convention used by every other admin
-- table in this project.

CREATE POLICY "Auth read app_users"
  ON public.app_users
  FOR SELECT
  TO authenticated
  USING (true);
