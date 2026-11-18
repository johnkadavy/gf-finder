-- How a restaurant takes bookings, derived by the Airtable sync from the last
-- line of the reservation_link AI field:
--   URL      → reservation_link = URL, reservation_policy = 'online'
--   WALK_IN  → 'walk_in'  (explicitly no reservations: walk-in / first-come only)
--   PHONE    → 'phone'    (reservations by phone only, no online booking)
--   NONE     → null       (couldn't determine)
-- Read publicly through the existing "Public can read published restaurants"
-- policy, like reservation_link.

alter table public.restaurants
  add column reservation_policy text
  check (reservation_policy in ('online', 'walk_in', 'phone'));

-- Every row that already has a validated booking link books online.
update public.restaurants
  set reservation_policy = 'online'
  where reservation_link is not null;
