-- PLMun Reservation & Borrowing - account approval (XAMPP / MySQL)
-- Run ONCE on an existing database: phpMyAdmin > select the database > SQL tab > paste > Go.
-- (A brand-new install using plmun_reservation_db.sql already has these columns.)
-- New sign-ups ask for an ID number and a photo of the PLMun ID, and wait as 'Pending' until the Property Office approves them.

ALTER TABLE users
  ADD COLUMN id_number VARCHAR(30) NULL AFTER year_level,
  ADD COLUMN id_photo  MEDIUMTEXT  NULL AFTER id_number,
  MODIFY COLUMN account_status ENUM('Pending','Active','Rejected','Suspended','Deactivated') NOT NULL DEFAULT 'Active';
