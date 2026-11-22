<?php
/* Shared dashboard data (Module 5). Works for both roles: admins see campus-wide activity, users see their own. */
require_once __DIR__ . '/../../config/bootstrap.php';
$me = need_login();
refresh_overdue();
$one = fn($sql, $p = []) => q($sql, $p)->fetchColumn();
$isAdmin = $me['role'] === 'admin';

/* ---- headline numbers ---- */
$thisM = (int)$one("SELECT COUNT(*) FROM reservation WHERE DATE_FORMAT(event_date,'%Y-%m') = DATE_FORMAT(CURDATE(),'%Y-%m')");
$lastM = (int)$one("SELECT COUNT(*) FROM reservation WHERE DATE_FORMAT(event_date,'%Y-%m') = DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH),'%Y-%m')");
$stats = [
    'equipment_types' => (int)$one("SELECT COUNT(*) FROM equipment WHERE condition_status <> 'Retired'"),
    'reservations'    => (int)$one("SELECT COUNT(*) FROM reservation"),
    'reservations_change' => $lastM ? round(($thisM - $lastM) / $lastM * 100) : null,
    'borrowers'       => (int)$one("SELECT COUNT(*) FROM users WHERE account_status = 'Active'"),
    'avg_rating'      => round((float)$one("SELECT COALESCE(AVG(rating),0) FROM review"), 1),
    'reviews'         => (int)$one("SELECT COUNT(*) FROM review"),
];

/* ---- reservation trends: last 6 calendar months, empty months filled with 0 ---- */
$rows = q("SELECT DATE_FORMAT(event_date,'%Y-%m') ym, COUNT(*) total,
        SUM(reservation_status IN ('Approved','Borrowed','Completed')) approved,
        SUM(reservation_status = 'Rejected') rejected
    FROM reservation
    WHERE event_date >= DATE_SUB(DATE_FORMAT(CURDATE(),'%Y-%m-01'), INTERVAL 5 MONTH)
      AND event_date <  DATE_ADD(DATE_FORMAT(CURDATE(),'%Y-%m-01'), INTERVAL 1 MONTH)
    GROUP BY ym")->fetchAll();
$by = [];
foreach ($rows as $r) $by[$r['ym']] = $r;
$trend = ['labels' => [], 'reservations' => [], 'approved' => [], 'rejected' => []];
for ($i = 5; $i >= 0; $i--) {
    $t = strtotime(date('Y-m-01') . " -$i month");
    $r = $by[date('Y-m', $t)] ?? null;
    $trend['labels'][]       = date('M', $t);
    $trend['reservations'][] = (int)($r['total'] ?? 0);
    $trend['approved'][]     = (int)($r['approved'] ?? 0);
    $trend['rejected'][]     = (int)($r['rejected'] ?? 0);
}

/* ---- most borrowed equipment (by number of approved bookings) ---- */
$top = q("SELECT e.equipment_id, e.equipment_name, e.image, c.category_name,
        COUNT(DISTINCT r.reservation_id) AS bookings, SUM(ri.quantity_requested) AS units
    FROM reservation_item ri
    JOIN reservation r ON r.reservation_id = ri.reservation_id
    JOIN equipment e ON e.equipment_id = ri.equipment_id
    JOIN equipment_category c ON c.category_id = e.category_id
    WHERE r.reservation_status IN ('Approved','Borrowed','Completed')
    GROUP BY e.equipment_id, e.equipment_name, e.image, c.category_name
    ORDER BY bookings DESC, units DESC LIMIT 8")->fetchAll();

/* ---- recent activity (admin: everyone, user: own) ---- */
$mine = $isAdmin ? '' : ' AND r.user_id = ' . (int)$me['id'];
$act = [];
$add = function (string $kind, string $title, ?string $ts, string $detail) use (&$act) { if ($ts) $act[] = compact('kind', 'title', 'ts', 'detail'); };
foreach (q("SELECT r.event_name, r.reservation_date ts FROM reservation r WHERE 1=1 $mine ORDER BY r.reservation_date DESC LIMIT 5") as $x)
    $add('request', 'New reservation request', $x['ts'], $x['event_name']);
foreach (q("SELECT r.event_name, b.release_datetime ts FROM borrowing b JOIN reservation r ON r.reservation_id = b.reservation_id WHERE 1=1 $mine ORDER BY b.release_datetime DESC LIMIT 5") as $x)
    $add('release', 'Equipment released', $x['ts'], $x['event_name']);
foreach (q("SELECT r.event_name, rr.return_datetime ts FROM return_record rr JOIN borrowing b ON b.borrowing_id = rr.borrowing_id JOIN reservation r ON r.reservation_id = b.reservation_id WHERE 1=1 $mine ORDER BY rr.return_datetime DESC LIMIT 5") as $x)
    $add('return', 'Equipment returned', $x['ts'], $x['event_name']);
foreach (q("SELECT r.event_name, b.expected_return_datetime ts FROM borrowing b JOIN reservation r ON r.reservation_id = b.reservation_id WHERE b.borrowing_status = 'Overdue' $mine ORDER BY b.expected_return_datetime DESC LIMIT 5") as $x)
    $add('overdue', 'Overdue item', $x['ts'], $x['event_name']);
foreach (q("SELECT r.event_name, p.assessed_at ts, p.amount FROM penalty p JOIN borrowing b ON b.borrowing_id = p.borrowing_id JOIN reservation r ON r.reservation_id = b.reservation_id WHERE 1=1 $mine ORDER BY p.assessed_at DESC LIMIT 5") as $x)
    $add('penalty', 'Penalty assessed', $x['ts'], $x['event_name']);
usort($act, fn($a, $b) => strcmp($b['ts'], $a['ts']));

out(['stats' => $stats, 'trend' => $trend, 'top_equipment' => $top, 'activities' => array_slice($act, 0, $isAdmin ? 8 : 4)]);
