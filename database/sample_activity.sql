-- OPTIONAL: demo history so the Admin Dashboard / Reviews / Penalties are not empty.
-- Run AFTER plmun_reservation_db.sql.  Delete the rows later if you do not want them.
USE plmun_reservation_db;
INSERT INTO users (last_name,first_name,middle_initial,email,password,user_type,department,course,year_level) VALUES
('Santos','Maria','L','maria@plmun.edu.ph',SHA2('user123',256),'Student','CITCS','BSCS','3rd Year'),
('Reyes','Ana','M','ana@plmun.edu.ph',SHA2('user123',256),'Faculty','CAS',NULL,NULL);

INSERT INTO reservation (reservation_id,user_id,admin_id,event_name,event_date,start_time,end_time,event_location,purpose,reservation_status,approval_remarks) VALUES
(1,1,1,'IT Week Opening',CURDATE()-INTERVAL 75 DAY,'08:00','17:00','Covered Court','Opening program','Completed','Approved'),
(2,2,1,'CAS Seminar',CURDATE()-INTERVAL 50 DAY,'09:00','12:00','AVR','Research seminar','Completed','Approved'),
(3,3,1,'Faculty Meeting',CURDATE()-INTERVAL 30 DAY,'13:00','16:00','Room 301','Monthly meeting','Completed','Approved'),
(4,1,1,'Org Fair',CURDATE()-INTERVAL 12 DAY,'08:00','15:00','Quadrangle','Student org fair','Completed','Approved'),
(5,2,NULL,'Acquaintance Party',CURDATE()+INTERVAL 5 DAY,'17:00','21:00','Gymnasium','Class party','Pending',NULL);
INSERT INTO reservation_item (reservation_item_id,reservation_id,equipment_id,quantity_requested) VALUES
(1,1,4,100),(2,1,1,3),(3,1,2,2),(4,2,3,1),(5,2,5,4),(6,3,3,1),(7,3,6,2),(8,4,5,10),(9,4,4,60),(10,4,2,1),(11,5,1,2),(12,5,7,4);
INSERT INTO borrowing (borrowing_id,reservation_id,released_by,release_datetime,expected_return_datetime,borrowing_status) VALUES
(1,1,1,CONCAT(CURDATE()-INTERVAL 75 DAY,' 07:30'),CONCAT(CURDATE()-INTERVAL 75 DAY,' 17:00'),'Returned'),
(2,2,1,CONCAT(CURDATE()-INTERVAL 50 DAY,' 08:30'),CONCAT(CURDATE()-INTERVAL 50 DAY,' 12:00'),'Returned'),
(3,3,1,CONCAT(CURDATE()-INTERVAL 30 DAY,' 12:30'),CONCAT(CURDATE()-INTERVAL 30 DAY,' 16:00'),'Returned'),
(4,4,1,CONCAT(CURDATE()-INTERVAL 12 DAY,' 07:30'),CONCAT(CURDATE()-INTERVAL 12 DAY,' 15:00'),'Returned');
INSERT INTO borrowing_item (borrowing_item_id,borrowing_id,reservation_item_id,quantity_released,dispatch_condition) VALUES
(1,1,1,100,'Good'),(2,1,2,3,'Good'),(3,1,3,2,'Excellent'),(4,2,4,1,'Good'),(5,2,5,4,'Good'),
(6,3,6,1,'Good'),(7,3,7,2,'Good'),(8,4,8,10,'Good'),(9,4,9,60,'Good'),(10,4,10,1,'Excellent');
INSERT INTO return_record (return_id,borrowing_id,received_by,return_datetime,return_status,inspection_notes) VALUES
(1,1,1,CONCAT(CURDATE()-INTERVAL 75 DAY,' 17:20'),'Complete','All good'),
(2,2,1,CONCAT(CURDATE()-INTERVAL 50 DAY,' 14:00'),'Late','Returned 2 hours late'),
(3,3,1,CONCAT(CURDATE()-INTERVAL 30 DAY,' 15:50'),'With Damage','Projector lens scratched'),
(4,4,1,CONCAT(CURDATE()-INTERVAL 12 DAY,' 14:40'),'Complete','All good');
INSERT INTO return_item (return_item_id,return_id,borrowing_item_id,quantity_returned,condition_on_return,damage_notes,inspection_status) VALUES
(1,1,1,100,'Good',NULL,'Passed'),(2,1,2,3,'Good',NULL,'Passed'),(3,1,3,2,'Excellent',NULL,'Passed'),
(4,2,4,1,'Good',NULL,'Passed'),(5,2,5,4,'Good',NULL,'Passed'),
(6,3,6,1,'Damaged','Lens scratched','Failed'),(7,3,7,2,'Good',NULL,'Passed'),
(8,4,8,10,'Good',NULL,'Passed'),(9,4,9,60,'Good',NULL,'Passed'),(10,4,10,1,'Excellent',NULL,'Passed');
INSERT INTO penalty (borrowing_id,return_item_id,assessed_by,penalty_type,amount,reason,penalty_status) VALUES
(2,NULL,1,'Late Return',100.00,'2 hour(s) late x PHP 50.00','Paid'),
(3,6,1,'Damage',500.00,'LCD Projector: lens scratched','Unpaid');
-- Reviews are per product. equipment ids: 1 Mic, 2 PA Speaker, 3 Projector, 4 Monobloc Chair, 5 Folding Table, 6 Extension Cord, 7 Par Light
INSERT INTO review (user_id,reservation_id,equipment_id,rating,comment) VALUES
(1,1,4,5,'Chairs were clean and complete, plenty for our opening program.'),
(1,1,2,5,'The PA speaker was loud and clear even at the covered court.'),
(1,1,1,4,'Mics worked well. One needed a battery swap mid-event.'),
(2,2,3,4,'Projector image was bright. Setup was quick.'),
(2,2,5,5,'Sturdy tables, perfect for the registration desk.'),
(3,3,3,2,'Lens was already a bit smudged when we got it, and I was penalized for the scratch.'),
(3,3,6,4,'Cord was long enough and had enough outlets.'),
(1,4,5,5,'Tables were stable and easy to set up for our booths.'),
(1,4,4,4,'Chairs were fine, a few had scuff marks.'),
(1,4,2,5,'Great sound, no feedback issues.');
