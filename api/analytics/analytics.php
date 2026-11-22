<?php
require_once __DIR__ . '/../../config/bootstrap.php';
need_admin();
refresh_overdue();
$one = fn($sql, $p = []) => q($sql, $p)->fetchColumn();

$kpi = [
    'pending'      => (int)$one("SELECT COUNT(*) FROM reservation WHERE reservation_status='Pending'"),
    'to_release'   => (int)$one("SELECT COUNT(*) FROM reservation r WHERE reservation_status='Approved' AND NOT EXISTS (SELECT 1 FROM borrowing b WHERE b.reservation_id=r.reservation_id)"),
    'active'       => (int)$one("SELECT COUNT(*) FROM borrowing WHERE borrowing_status IN ('Borrowed','Partially Returned')"),
    'overdue'      => (int)$one("SELECT COUNT(*) FROM borrowing WHERE borrowing_status='Overdue'"),
    'reservations' => (int)$one("SELECT COUNT(*) FROM reservation"),
    'users'        => (int)$one("SELECT COUNT(*) FROM users"),
    'collected'    => (float)$one("SELECT COALESCE(SUM(amount),0) FROM penalty WHERE penalty_status='Paid'"),
    'outstanding'  => (float)$one("SELECT COALESCE(SUM(amount),0) FROM penalty WHERE penalty_status='Unpaid'"),
    'waived'       => (float)$one("SELECT COALESCE(SUM(amount),0) FROM penalty WHERE penalty_status='Waived'"),
    'avg_rating'   => round((float)$one("SELECT COALESCE(AVG(rating),0) FROM review"), 2),
    'reviews'      => (int)$one("SELECT COUNT(*) FROM review"),
];
$totalReturns = (int)$one("SELECT COUNT(*) FROM return_record");
$ontime = (int)$one("SELECT COUNT(*) FROM return_record rr JOIN borrowing b ON b.borrowing_id=rr.borrowing_id WHERE rr.return_datetime <= b.expected_return_datetime");
$kpi['ontime_rate'] = $totalReturns ? round($ontime / $totalReturns * 100) : null;

out([
    'kpi' => $kpi,
    'top_equipment' => q("SELECT e.equipment_name, SUM(ri.quantity_requested) AS qty, COUNT(DISTINCT r.reservation_id) AS bookings
        FROM reservation_item ri JOIN reservation r ON r.reservation_id=ri.reservation_id JOIN equipment e ON e.equipment_id=ri.equipment_id
        WHERE r.reservation_status IN ('Approved','Borrowed','Completed') GROUP BY e.equipment_id ORDER BY bookings DESC, qty DESC LIMIT 6")->fetchAll(),
    'monthly' => q("SELECT DATE_FORMAT(event_date,'%Y-%m') AS ym, DATE_FORMAT(event_date,'%b %Y') AS label, COUNT(*) AS total
        FROM reservation WHERE reservation_status NOT IN ('Cancelled','Rejected') AND event_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        GROUP BY ym, label ORDER BY ym")->fetchAll(),
    'revenue_monthly' => q("SELECT DATE_FORMAT(assessed_at,'%Y-%m') AS ym, DATE_FORMAT(assessed_at,'%b %Y') AS label, SUM(amount) AS total
        FROM penalty WHERE penalty_status='Paid' AND assessed_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH) GROUP BY ym, label ORDER BY ym")->fetchAll(),
    'penalty_types' => q("SELECT penalty_type, COUNT(*) AS cnt, SUM(amount) AS total FROM penalty WHERE penalty_status<>'Waived' GROUP BY penalty_type")->fetchAll(),
    'status_mix' => q("SELECT reservation_status AS label, COUNT(*) AS total FROM reservation GROUP BY reservation_status")->fetchAll(),
    'attention' => q("SELECT equipment_name, quantity_available, condition_status, availability_status FROM equipment
        WHERE condition_status IN ('Needs Repair','Damaged') OR availability_status='Under Maintenance' OR quantity_available<=2 ORDER BY quantity_available LIMIT 8")->fetchAll(),
    'top_borrowers' => q("SELECT u.user_id, u.email, u.user_type, u.department, COUNT(*) AS bookings,
            COALESCE(NULLIF(TRIM(u.full_name),''), NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)),''), u.email) AS full_name
        FROM reservation r JOIN users u ON u.user_id=r.user_id
        WHERE r.reservation_status NOT IN ('Cancelled','Rejected')
        GROUP BY u.user_id, u.email, u.user_type, u.department, u.full_name, u.first_name, u.last_name
        ORDER BY bookings DESC, full_name LIMIT 5")->fetchAll(),
]);
