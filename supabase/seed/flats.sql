-- The society's flats: wings A and B, 11 floors each, 4 flats per floor.
-- Flat numbers are floor * 100 + unit, so floor 1 is 101-104, floor 10 is
-- 1001-1004 and floor 11 is 1101-1104. 88 flats in total.
--
-- Safe to run more than once: existing flats are left alone.
insert into flats (wing, number)
select w.wing, (f.floor * 100 + u.unit)::text
from (values ('A'), ('B')) as w(wing),
     generate_series(1, 11) as f(floor),
     generate_series(1, 4) as u(unit)
on conflict (wing, number) do nothing;
