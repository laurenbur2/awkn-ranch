-- Allow authenticated staff (admins, oracles, schedulers) to insert and
-- delete scheduling_bookings + scheduling_booking_attendees rows.
--
-- Bug: New Session in the Within Schedule page failed with
--   "new row violates row-level security policy for table scheduling_bookings"
-- because the table only had SELECT + UPDATE policies for authenticated;
-- INSERT/DELETE existed only via the service_role.
--
-- Page-level access is already gated by the admin shell's
-- requiredPermission system, so the RLS rule here mirrors what every
-- other booking table in the project uses (any authenticated request can
-- write).

CREATE POLICY "Auth insert bookings"
  ON public.scheduling_bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Auth delete bookings"
  ON public.scheduling_bookings
  FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Auth insert attendees"
  ON public.scheduling_booking_attendees
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Auth delete attendees"
  ON public.scheduling_booking_attendees
  FOR DELETE
  TO authenticated
  USING (true);
