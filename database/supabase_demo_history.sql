-- =====================================================================================
-- OPTIONAL: demo history for Supabase (past reservations, returns, penalties and reviews) so the dashboards are not empty.
-- Run it AFTER supabase_setup.sql, once. Dates are relative to today.
-- The three demo borrowers (Juan, Maria, Ana) are sample records only: they have NO login. Real people sign up on the website.
-- To remove the demo data later, run:  delete from reservation; delete from reservation_item; delete from review; delete from borrowing;
--   delete from borrowing_item; delete from return_record; delete from return_item; delete from penalty; delete from users where auth_id is null;
-- =====================================================================================
insert into public.users (user_id, last_name, first_name, middle_initial, email, user_type, contact_number, department, course, year_level) values
 (1, 'Dela Cruz', 'Juan',  'A', 'juan.demo@plmun.edu.ph',  'Student', '09987654321', 'CITCS', 'BSIT', '4th Year'),
 (2, 'Santos',    'Maria', 'L', 'maria.demo@plmun.edu.ph', 'Student', null,          'CITCS', 'BSCS', '3rd Year'),
 (3, 'Reyes',     'Ana',   'M', 'ana.demo@plmun.edu.ph',   'Faculty', null,          'CAS',   null,   null)
on conflict do nothing;
select setval(pg_get_serial_sequence('public.users', 'user_id'), greatest((select max(user_id) from public.users), 1));

with d as (select to_char(current_date - 75, 'YYYY-MM-DD') d1, to_char(current_date - 50, 'YYYY-MM-DD') d2,
                  to_char(current_date - 30, 'YYYY-MM-DD') d3, to_char(current_date - 12, 'YYYY-MM-DD') d4,
                  to_char(current_date + 5,  'YYYY-MM-DD') d5, to_char(now() at time zone 'Asia/Manila', 'YYYY-MM-DD HH24:MI:SS') n)
insert into public.reservation (reservation_id, user_id, admin_id, event_name, event_date, start_time, end_time, event_location, purpose, reservation_date, reservation_status, approval_remarks)
select * from (select 1, 1, null::int, 'IT Week Opening',    d1, '08:00:00', '17:00:00', 'Covered Court', 'Opening program',   n, 'Completed', 'Approved' from d
         union all select 2, 2, null, 'CAS Seminar',         d2, '09:00:00', '12:00:00', 'AVR',           'Research seminar',  n, 'Completed', 'Approved' from d
         union all select 3, 3, null, 'Faculty Meeting',     d3, '13:00:00', '16:00:00', 'Room 301',      'Monthly meeting',   n, 'Completed', 'Approved' from d
         union all select 4, 1, null, 'Org Fair',            d4, '08:00:00', '15:00:00', 'Quadrangle',    'Student org fair',  n, 'Completed', 'Approved' from d
         union all select 5, 2, null, 'Acquaintance Party',  d5, '17:00:00', '21:00:00', 'Gymnasium',     'Class party',       n, 'Pending',   null       from d) x
where not exists (select 1 from public.reservation);

insert into public.reservation_item (reservation_item_id, reservation_id, equipment_id, quantity_requested)
select * from (values (1,1,4,100),(2,1,1,3),(3,1,2,2),(4,2,3,1),(5,2,5,4),(6,3,3,1),(7,3,6,2),(8,4,5,10),(9,4,4,60),(10,4,2,1),(11,5,1,2),(12,5,7,4)) v
where not exists (select 1 from public.reservation_item);

insert into public.borrowing (borrowing_id, reservation_id, released_by, release_datetime, expected_return_datetime, borrowing_status)
select * from (values
 (1, 1, null::int, to_char(current_date - 75, 'YYYY-MM-DD') || ' 07:30:00', to_char(current_date - 75, 'YYYY-MM-DD') || ' 17:00:00', 'Returned'),
 (2, 2, null, to_char(current_date - 50, 'YYYY-MM-DD') || ' 08:30:00', to_char(current_date - 50, 'YYYY-MM-DD') || ' 12:00:00', 'Returned'),
 (3, 3, null, to_char(current_date - 30, 'YYYY-MM-DD') || ' 12:30:00', to_char(current_date - 30, 'YYYY-MM-DD') || ' 16:00:00', 'Returned'),
 (4, 4, null, to_char(current_date - 12, 'YYYY-MM-DD') || ' 07:30:00', to_char(current_date - 12, 'YYYY-MM-DD') || ' 15:00:00', 'Returned')) v
where not exists (select 1 from public.borrowing);

insert into public.borrowing_item (borrowing_item_id, borrowing_id, reservation_item_id, quantity_released, dispatch_condition)
select * from (values (1,1,1,100,'Good'),(2,1,2,3,'Good'),(3,1,3,2,'Excellent'),(4,2,4,1,'Good'),(5,2,5,4,'Good'),
                      (6,3,6,1,'Good'),(7,3,7,2,'Good'),(8,4,8,10,'Good'),(9,4,9,60,'Good'),(10,4,10,1,'Excellent')) v
where not exists (select 1 from public.borrowing_item);

insert into public.return_record (return_id, received_by, borrowing_id, return_datetime, return_status, inspection_notes)
select * from (values
 (1, null::int, 1, to_char(current_date - 75, 'YYYY-MM-DD') || ' 17:20:00', 'Complete',    'All good'),
 (2, null,      2, to_char(current_date - 50, 'YYYY-MM-DD') || ' 14:00:00', 'Late',        'Returned 2 hours late'),
 (3, null,      3, to_char(current_date - 30, 'YYYY-MM-DD') || ' 15:50:00', 'With Damage', 'Projector lens scratched'),
 (4, null,      4, to_char(current_date - 12, 'YYYY-MM-DD') || ' 14:40:00', 'Complete',    'All good')) v
where not exists (select 1 from public.return_record);

insert into public.return_item (return_item_id, return_id, borrowing_item_id, quantity_returned, condition_on_return, damage_notes, inspection_status)
select * from (values (1,1,1,100,'Good',null,'Passed'),(2,1,2,3,'Good',null,'Passed'),(3,1,3,2,'Excellent',null,'Passed'),
                      (4,2,4,1,'Good',null,'Passed'),(5,2,5,4,'Good',null,'Passed'),(6,3,6,1,'Damaged','Lens scratched','Failed'),
                      (7,3,7,2,'Good',null,'Passed'),(8,4,8,10,'Good',null,'Passed'),(9,4,9,60,'Good',null,'Passed'),(10,4,10,1,'Excellent',null,'Passed')) v
where not exists (select 1 from public.return_item);

insert into public.penalty (penalty_id, borrowing_id, return_item_id, assessed_by, penalty_type, amount, reason, penalty_status, assessed_at)
select * from (values
 (1, 2, null::int, null::int, 'Late Return', 100.00, '2 hour(s) late x PHP 50.00', 'Paid',   to_char(now() at time zone 'Asia/Manila', 'YYYY-MM-DD HH24:MI:SS')),
 (2, 3, 6,         null,      'Damage',      500.00, 'LCD Projector: lens scratched', 'Unpaid', to_char(now() at time zone 'Asia/Manila', 'YYYY-MM-DD HH24:MI:SS'))) v
where not exists (select 1 from public.penalty);

insert into public.review (review_id, user_id, reservation_id, equipment_id, rating, comment, review_date)
select * from (values
 (1, 1, 1, 4, 5, 'Chairs were clean and complete, plenty for our opening program.'),
 (2, 1, 1, 2, 5, 'The PA speaker was loud and clear even at the covered court.'),
 (3, 1, 1, 1, 4, 'Mics worked well. One needed a battery swap mid-event.'),
 (4, 2, 2, 3, 4, 'Projector image was bright. Setup was quick.'),
 (5, 2, 2, 5, 5, 'Sturdy tables, perfect for the registration desk.'),
 (6, 3, 3, 3, 2, 'Lens was already a bit smudged when we got it, and I was penalized for the scratch.'),
 (7, 3, 3, 6, 4, 'Cord was long enough and had enough outlets.'),
 (8, 1, 4, 5, 5, 'Tables were stable and easy to set up for our booths.'),
 (9, 1, 4, 4, 4, 'Chairs were fine, a few had scuff marks.'),
 (10,1, 4, 2, 5, 'Great sound, no feedback issues.')) v(a,b,c,d,e,f)
cross join (select to_char(now() at time zone 'Asia/Manila', 'YYYY-MM-DD HH24:MI:SS') g) t
where not exists (select 1 from public.review);
