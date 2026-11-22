-- OPTIONAL: upgrade an EXISTING database without wiping it.
-- (If you are fine losing old data, just re-import plmun_reservation_db.sql instead.)
USE plmun_reservation_db;

-- 1) Split names: Surname / First name / M.I.
--    Old full names are split on a best-guess basis (last word = surname, rest = first name).
--    Please review the Users page afterwards and fix any that were guessed wrong.
ALTER TABLE users
  ADD COLUMN last_name      VARCHAR(60) NOT NULL DEFAULT '' AFTER user_id,
  ADD COLUMN first_name     VARCHAR(60) NOT NULL DEFAULT '' AFTER last_name,
  ADD COLUMN middle_initial CHAR(1) NULL AFTER first_name;

UPDATE users SET
  last_name  = SUBSTRING_INDEX(full_name, ' ', -1),
  first_name = TRIM(SUBSTRING(full_name, 1, CHAR_LENGTH(full_name) - CHAR_LENGTH(SUBSTRING_INDEX(full_name, ' ', -1))));

ALTER TABLE users DROP COLUMN full_name;
ALTER TABLE users ADD COLUMN full_name VARCHAR(135)
  AS (CONCAT(first_name, IF(middle_initial IS NULL OR middle_initial = '', '', CONCAT(' ', middle_initial, '.')), ' ', last_name)) STORED AFTER middle_initial;

-- 1b) Same split for the admin table.
ALTER TABLE admin
  ADD COLUMN last_name      VARCHAR(60) NOT NULL DEFAULT '' AFTER admin_id,
  ADD COLUMN first_name     VARCHAR(60) NOT NULL DEFAULT '' AFTER last_name,
  ADD COLUMN middle_initial CHAR(1) NULL AFTER first_name;

UPDATE admin SET
  last_name  = SUBSTRING_INDEX(full_name, ' ', -1),
  first_name = TRIM(SUBSTRING(full_name, 1, CHAR_LENGTH(full_name) - CHAR_LENGTH(SUBSTRING_INDEX(full_name, ' ', -1))));

ALTER TABLE admin DROP COLUMN full_name;
ALTER TABLE admin ADD COLUMN full_name VARCHAR(135)
  AS (CONCAT(first_name, IF(middle_initial IS NULL OR middle_initial = '', '', CONCAT(' ', middle_initial, '.')), ' ', last_name)) STORED AFTER middle_initial;

-- 2) Reviews per product. Old reviews were per reservation, so each one is copied to every item of that reservation.
ALTER TABLE review ADD COLUMN equipment_id INT UNSIGNED NULL AFTER reservation_id;

INSERT INTO review (user_id, reservation_id, equipment_id, rating, comment, review_date)
  SELECT rv.user_id, rv.reservation_id, ri.equipment_id, rv.rating, rv.comment, rv.review_date
  FROM review rv JOIN reservation_item ri ON ri.reservation_id = rv.reservation_id
  WHERE rv.equipment_id IS NULL;
DELETE FROM review WHERE equipment_id IS NULL AND review_id > 0;

ALTER TABLE review
  MODIFY equipment_id INT UNSIGNED NOT NULL,
  ADD CONSTRAINT fk_review_equipment FOREIGN KEY (equipment_id) REFERENCES equipment(equipment_id) ON UPDATE CASCADE ON DELETE CASCADE,
  ADD CONSTRAINT uq_review_item UNIQUE (reservation_id, equipment_id);
