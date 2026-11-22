<?php
require_once __DIR__ . '/../../config/bootstrap.php';
require_once __DIR__ . '/../../config/mailer.php';
$me = need_login();
refresh_overdue();

function attach_items(array $rows): array {
    $map = group_rows(array_column($rows, 'reservation_id'), 'reservation_id',
        "SELECT ri.reservation_item_id, ri.reservation_id, ri.equipment_id, ri.quantity_requested, e.equipment_name, e.image, c.category_name,
            EXISTS(SELECT 1 FROM review v WHERE v.reservation_id=ri.reservation_id AND v.equipment_id=ri.equipment_id) AS reviewed
         FROM reservation_item ri JOIN equipment e ON e.equipment_id=ri.equipment_id
         JOIN equipment_category c ON c.category_id=e.category_id WHERE ri.reservation_id IN ({IN})");
    foreach ($rows as &$r) $r['items'] = $map[$r['reservation_id']] ?? [];
    return $rows;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $base = "SELECT r.*, u.full_name, u.user_type, u.department, u.email, u.contact_number,
             b.borrowing_id, b.expected_return_datetime, b.borrowing_status, b.release_datetime,
             (SELECT COUNT(*) FROM reservation_item ri2 WHERE ri2.reservation_id=r.reservation_id
                AND NOT EXISTS (SELECT 1 FROM review v WHERE v.reservation_id=ri2.reservation_id AND v.equipment_id=ri2.equipment_id)) AS unreviewed
             FROM reservation r JOIN users u ON u.user_id=r.user_id
             LEFT JOIN borrowing b ON b.reservation_id=r.reservation_id";
    if ($me['role'] === 'user') {
        $rows = q("$base WHERE r.user_id=? ORDER BY r.reservation_date DESC, r.reservation_id DESC", [$me['id']])->fetchAll();
    } else {
        $p = []; $w = '';
        if (!empty($_GET['status'])) { $w = ' WHERE r.reservation_status=?'; $p[] = $_GET['status']; }
        $rows = q("$base$w ORDER BY FIELD(r.reservation_status,'Pending','Approved','Borrowed','Completed','Rejected','Cancelled'), r.event_date", $p)->fetchAll();
    }
    out(['reservations' => attach_items($rows)]);
}

$b = body();
$action = $b['action'] ?? '';

if ($action === 'create') {
    $me = need_user();
    $name = s($b['event_name'] ?? ''); $date = s($b['event_date'] ?? '');
    $start = s($b['start_time'] ?? ''); $end = s($b['end_time'] ?? '');
    $loc = s($b['event_location'] ?? ''); $purpose = s($b['purpose'] ?? '');
    $items = is_array($b['items'] ?? null) ? $b['items'] : [];
    if ($name === '' || $loc === '' || $date === '' || $start === '' || $end === '') fail('Please complete all event details.');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || $date < date('Y-m-d')) fail('Event date cannot be in the past.');
    if ($start >= $end) fail('End time must be later than start time.');
    if (!$items) fail('Add at least one equipment item to your request.');

    $unpaid = (float)q("SELECT COALESCE(SUM(p.amount),0) FROM penalty p JOIN borrowing b ON b.borrowing_id=p.borrowing_id
        JOIN reservation r ON r.reservation_id=b.reservation_id WHERE r.user_id=? AND p.penalty_status='Unpaid'", [$me['id']])->fetchColumn();
    if ($unpaid > 0) fail('You have unpaid penalties (PHP ' . number_format($unpaid, 2) . '). Please settle them at the Property Office first.', 403);
    $st = q("SELECT account_status FROM users WHERE user_id=?", [$me['id']])->fetchColumn();
    if ($st !== 'Active') fail('Your account is not active.', 403);

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $resv = reserved_map($date, $start, $end);
        $clean = [];
        foreach ($items as $it) {
            $eid = (int)($it['equipment_id'] ?? 0); $qty = (int)($it['qty'] ?? 0);
            if ($eid <= 0 || $qty <= 0) continue;
            $clean[$eid] = ($clean[$eid] ?? 0) + $qty;
        }
        if (!$clean) fail('Add at least one equipment item to your request.');
        foreach ($clean as $eid => $qty) {
            $e = q("SELECT * FROM equipment WHERE equipment_id=? FOR UPDATE", [$eid])->fetch();
            if (!$e || !is_reservable($e)) fail('"' . ($e['equipment_name'] ?? 'An item') . '" is not available for reservation.');
            $free = (int)$e['quantity_available'] - ($resv[$eid] ?? 0);
            if ($qty > $free) fail('Only ' . max($free, 0) . ' of "' . $e['equipment_name'] . '" left for that time slot.', 409);
        }
        q("INSERT INTO reservation (user_id,event_name,event_date,start_time,end_time,event_location,purpose) VALUES (?,?,?,?,?,?,?)",
          [$me['id'], $name, $date, hhmmss($start), hhmmss($end), $loc, $purpose ?: null]);
        $rid = (int)$pdo->lastInsertId();
        foreach ($clean as $eid => $qty)
            q("INSERT INTO reservation_item (reservation_id,equipment_id,quantity_requested) VALUES (?,?,?)", [$rid, $eid, $qty]);
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
    out(['reservation_id' => $rid], 201);
}

if ($action === 'cancel') {
    $me = need_user();
    $r = q("SELECT reservation_status FROM reservation WHERE reservation_id=? AND user_id=?", [(int)$b['id'], $me['id']])->fetch();
    if (!$r) fail('Reservation not found.', 404);
    if (!in_array($r['reservation_status'], ['Pending', 'Approved'], true)) fail('Only pending or approved reservations can be cancelled.');
    q("UPDATE reservation SET reservation_status='Cancelled' WHERE reservation_id=?", [(int)$b['id']]);
    out();
}

if ($action === 'decide') {
    $me = need_admin();
    $r = q("SELECT * FROM reservation WHERE reservation_id=?", [(int)$b['id']])->fetch();
    if (!$r) fail('Reservation not found.', 404);
    if ($r['reservation_status'] !== 'Pending') fail('This request was already reviewed.');
    $remarks = s($b['remarks'] ?? '');
    if ($b['decision'] === 'approve') {
        $resv = reserved_map($r['event_date'], $r['start_time'], $r['end_time'], (int)$r['reservation_id']);
        foreach (q("SELECT ri.*, e.equipment_name, e.quantity_available FROM reservation_item ri JOIN equipment e ON e.equipment_id=ri.equipment_id
                    WHERE ri.reservation_id=?", [$r['reservation_id']]) as $it) {
            $free = (int)$it['quantity_available'] - ($resv[(int)$it['equipment_id']] ?? 0);
            if ($it['quantity_requested'] > $free) fail('Cannot approve: only ' . max($free, 0) . ' of "' . $it['equipment_name'] . '" is free for that slot.', 409);
        }
        q("UPDATE reservation SET reservation_status='Approved', admin_id=?, approval_remarks=? WHERE reservation_id=?", [$me['id'], $remarks ?: null, $r['reservation_id']]);
        [$sent, $mailMsg] = notify_reservation_ready((int)$r['reservation_id']);   // email the borrower
        out(['emailed' => $sent, 'email_message' => $mailMsg]);
    } elseif ($b['decision'] === 'reject') {
        if ($remarks === '') fail('Please give a reason for rejecting.');
        q("UPDATE reservation SET reservation_status='Rejected', admin_id=?, approval_remarks=? WHERE reservation_id=?", [$me['id'], $remarks, $r['reservation_id']]);
    } else fail('Invalid decision.');
    out();
}
fail('Unknown action.', 404);
