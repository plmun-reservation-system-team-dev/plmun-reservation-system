-- =====================================================
-- PLMun Smart Event Equipment Reservation and
-- Borrowing Management System  (12 tables)
-- Same schema as yours. ONLY changes:
--   * users.user_type added (Student / Faculty / Staff) for the sign-up form
--   * users AND admin now have last_name / first_name / middle_initial (full_name is built automatically)
--   * review is now PER PRODUCT (review.equipment_id)
--   * extra category + equipment seed rows
-- WARNING: DROP DATABASE below wipes the old data.
-- =====================================================
DROP DATABASE IF EXISTS plmun_reservation_db;
CREATE DATABASE plmun_reservation_db CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE plmun_reservation_db;

CREATE TABLE users (
  user_id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  last_name       VARCHAR(60) NOT NULL,
  first_name      VARCHAR(60) NOT NULL,
  middle_initial  CHAR(1) NULL,
  full_name       VARCHAR(135) AS (CONCAT(first_name, IF(middle_initial IS NULL OR middle_initial = '', '', CONCAT(' ', middle_initial, '.')), ' ', last_name)) STORED,
  email           VARCHAR(100) NOT NULL UNIQUE,
  password        VARCHAR(255) NOT NULL,
  user_type       ENUM('Student','Faculty','Staff') NOT NULL DEFAULT 'Student',
  contact_number  VARCHAR(20),
  department      VARCHAR(100),
  course          VARCHAR(100),
  year_level      VARCHAR(20),
  id_number       VARCHAR(30) NULL,          -- student / employee ID number given at sign-up
  id_photo        MEDIUMTEXT NULL,           -- photo of the PLMun ID (small compressed picture, stored as text)
  account_status  ENUM('Pending','Active','Rejected','Suspended','Deactivated') NOT NULL DEFAULT 'Active',
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE admin (
  admin_id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  last_name       VARCHAR(60) NOT NULL,
  first_name      VARCHAR(60) NOT NULL,
  middle_initial  CHAR(1) NULL,
  full_name       VARCHAR(135) AS (CONCAT(first_name, IF(middle_initial IS NULL OR middle_initial = '', '', CONCAT(' ', middle_initial, '.')), ' ', last_name)) STORED,
  email           VARCHAR(100) NOT NULL UNIQUE,
  password        VARCHAR(255) NOT NULL,
  contact_number  VARCHAR(20),
  department      VARCHAR(100),
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE equipment_category (
  category_id     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_name   VARCHAR(100) NOT NULL UNIQUE,
  description     TEXT
) ENGINE=InnoDB;

CREATE TABLE equipment (
  equipment_id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id         INT UNSIGNED NOT NULL,
  equipment_name      VARCHAR(150) NOT NULL,
  description         TEXT,
  image               VARCHAR(255),
  quantity_available  INT UNSIGNED NOT NULL DEFAULT 0,
  condition_status    ENUM('Excellent','Good','Fair','Needs Repair','Damaged','Retired') NOT NULL DEFAULT 'Good',
  availability_status ENUM('Available','Reserved','Borrowed','Unavailable','Under Maintenance') NOT NULL DEFAULT 'Available',
  CONSTRAINT fk_equipment_category FOREIGN KEY (category_id) REFERENCES equipment_category(category_id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE reservation (
  reservation_id      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id             INT UNSIGNED NOT NULL,
  admin_id            INT UNSIGNED NULL,
  event_name          VARCHAR(150) NOT NULL,
  event_date          DATE NOT NULL,
  start_time          TIME NOT NULL,
  end_time            TIME NOT NULL,
  event_location      VARCHAR(150) NOT NULL,
  purpose             TEXT,
  reservation_date    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reservation_status  ENUM('Pending','Approved','Rejected','Cancelled','Borrowed','Completed') NOT NULL DEFAULT 'Pending',
  approval_remarks    TEXT,
  CONSTRAINT fk_reservation_user FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_reservation_admin FOREIGN KEY (admin_id) REFERENCES admin(admin_id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE reservation_item (
  reservation_item_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reservation_id      INT UNSIGNED NOT NULL,
  equipment_id        INT UNSIGNED NOT NULL,
  quantity_requested  INT UNSIGNED NOT NULL DEFAULT 1,
  notes               TEXT,
  CONSTRAINT fk_resitem_reservation FOREIGN KEY (reservation_id) REFERENCES reservation(reservation_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_resitem_equipment FOREIGN KEY (equipment_id) REFERENCES equipment(equipment_id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE review (
  review_id       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         INT UNSIGNED NOT NULL,
  reservation_id  INT UNSIGNED NOT NULL,
  equipment_id    INT UNSIGNED NOT NULL,
  rating          TINYINT UNSIGNED NOT NULL,
  comment         TEXT,
  review_date     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_review_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT fk_review_user FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_review_reservation FOREIGN KEY (reservation_id) REFERENCES reservation(reservation_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_review_equipment FOREIGN KEY (equipment_id) REFERENCES equipment(equipment_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT uq_review_item UNIQUE (reservation_id, equipment_id)
) ENGINE=InnoDB;

CREATE TABLE borrowing (
  borrowing_id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reservation_id          INT UNSIGNED NOT NULL,
  released_by             INT UNSIGNED NULL,
  release_datetime        DATETIME NOT NULL,
  expected_return_datetime DATETIME NOT NULL,
  borrowing_status        ENUM('Borrowed','Partially Returned','Returned','Overdue') NOT NULL DEFAULT 'Borrowed',
  dispatch_notes          TEXT,
  CONSTRAINT fk_borrowing_reservation FOREIGN KEY (reservation_id) REFERENCES reservation(reservation_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_borrowing_admin FOREIGN KEY (released_by) REFERENCES admin(admin_id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE borrowing_item (
  borrowing_item_id   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  borrowing_id        INT UNSIGNED NOT NULL,
  reservation_item_id INT UNSIGNED NOT NULL,
  quantity_released   INT UNSIGNED NOT NULL DEFAULT 1,
  dispatch_condition  ENUM('Excellent','Good','Fair','Needs Repair') NOT NULL DEFAULT 'Good',
  notes               TEXT,
  CONSTRAINT fk_boritem_borrowing FOREIGN KEY (borrowing_id) REFERENCES borrowing(borrowing_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_boritem_resitem FOREIGN KEY (reservation_item_id) REFERENCES reservation_item(reservation_item_id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE return_record (
  return_id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  borrowing_id      INT UNSIGNED NOT NULL,
  received_by       INT UNSIGNED NULL,
  return_datetime   DATETIME NOT NULL,
  return_status     ENUM('Complete','Partial','Late','With Damage') NOT NULL DEFAULT 'Complete',
  inspection_notes  TEXT,
  CONSTRAINT fk_return_borrowing FOREIGN KEY (borrowing_id) REFERENCES borrowing(borrowing_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_return_admin FOREIGN KEY (received_by) REFERENCES admin(admin_id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE return_item (
  return_item_id      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  return_id           INT UNSIGNED NOT NULL,
  borrowing_item_id   INT UNSIGNED NOT NULL,
  quantity_returned   INT UNSIGNED NOT NULL DEFAULT 0,
  condition_on_return ENUM('Excellent','Good','Fair','Needs Repair','Damaged','Lost') NOT NULL DEFAULT 'Good',
  damage_notes        TEXT,
  inspection_status   ENUM('Pending','Passed','Failed') NOT NULL DEFAULT 'Pending',
  CONSTRAINT fk_retitem_return FOREIGN KEY (return_id) REFERENCES return_record(return_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_retitem_boritem FOREIGN KEY (borrowing_item_id) REFERENCES borrowing_item(borrowing_item_id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE penalty (
  penalty_id      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  borrowing_id    INT UNSIGNED NOT NULL,
  return_item_id  INT UNSIGNED NULL,
  assessed_by     INT UNSIGNED NULL,
  penalty_type    ENUM('Late Return','Damage','Loss','Other') NOT NULL,
  amount          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  reason          TEXT,
  penalty_status  ENUM('Unpaid','Paid','Waived') NOT NULL DEFAULT 'Unpaid',
  assessed_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_penalty_borrowing FOREIGN KEY (borrowing_id) REFERENCES borrowing(borrowing_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_penalty_returnitem FOREIGN KEY (return_item_id) REFERENCES return_item(return_item_id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_penalty_admin FOREIGN KEY (assessed_by) REFERENCES admin(admin_id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE INDEX idx_reservation_status ON reservation(reservation_status);
CREATE INDEX idx_reservation_event_date ON reservation(event_date);
CREATE INDEX idx_borrowing_status ON borrowing(borrowing_status);
CREATE INDEX idx_penalty_status ON penalty(penalty_status);

-- =====================================================
-- SAMPLE DATA   admin@plmun.edu.ph / admin123   juan@plmun.edu.ph / user123
-- (SHA2 hashes are upgraded to password_hash() automatically on first login)
-- =====================================================
INSERT INTO admin (last_name, first_name, middle_initial, email, password, contact_number, department) VALUES
('Administrator', 'System', NULL, 'admin@plmun.edu.ph', SHA2('admin123',256), '09123456789', 'Property Office');

INSERT INTO users (last_name, first_name, middle_initial, email, password, user_type, contact_number, department, course, year_level) VALUES
('Dela Cruz', 'Juan', 'A', 'juan@plmun.edu.ph', SHA2('user123',256), 'Student', '09987654321', 'CITCS', 'BSIT', '4th Year');

INSERT INTO equipment_category (category_name, description) VALUES
('Audio', 'Speakers, microphones, mixers'),
('Visual', 'Projectors, screens, monitors'),
('Furniture', 'Chairs, tables, stages'),
('Lighting', 'Stage and event lighting'),
('Electrical', 'Extension cords, power strips');

INSERT INTO equipment (category_id, equipment_name, description, quantity_available, condition_status, availability_status) VALUES
(1, 'Wireless Microphone', 'Handheld wireless mic for emceeing, speeches and performances.', 10, 'Good', 'Available'),
(1, 'PA Speaker', '15-inch powered speaker for programs, announcements and small-venue events.', 4, 'Excellent', 'Available'),
(2, 'LCD Projector', 'HDMI/VGA projector for presentations, film showings and lectures.', 5, 'Good', 'Available'),
(3, 'Monobloc Chair', 'Durable, lightweight plastic chair. Easy to move, arrange and store.', 200, 'Good', 'Available'),
(3, 'Folding Table', '6-foot folding table for registration desks, exhibits and food stations.', 30, 'Good', 'Available'),
(5, 'Extension Cord', 'Multi-outlet extension cord for sound systems, projectors and other equipment.', 15, 'Good', 'Available'),
(4, 'Stage Par Light', 'LED par can for stage and program lighting.', 8, 'Good', 'Available');
