<?php
require_once __DIR__ . '/../../config/bootstrap.php';
require_once __DIR__ . '/../../config/mailer.php';
$me = need_admin();
refresh_overdue();

const ITEM_SQL = "SELECT bi.*, ri.equipment_id, ri.quantity_requested, e.equipment_name,
    (bi.quantity_released - COALESCE((SELECT SUM(rt.quantity_returned) FROM return_item rt WHERE rt.borrowing_item_id=bi.borrowing_item_id),0)) AS outstanding
    FROM borrowing_item bi JOIN reservation_item ri ON ri.reservation_item_id=bi.reservation_item_id
    JOIN equipment e ON e.equipment_id=ri.equipment_id WHERE bi.borrowing_id IN ({IN})";

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $rows = q("SELECT b.*, r.event_name, r.event_location, r.event_date, u.full_name, u.contact_number, u.user_type
        FROM borrowing b JOIN reservation r ON r.reservation_id=b.reservation_id JOIN users u ON u.user_id=r.user_id
        ORDER BY FIELD(b.borrowing_status,'Overdue','Borrowed','Partially Returned','Returned'), b.expected_return_datetime DESC")->fetchAll();
    $map = group_rows(array_column($rows, 'borrowing_id'), 'borrowing_id', ITEM_SQL);
    foreach ($rows as &$r) $r['items'] = $map[$r['borrowing_id']] ?? [];
    unset($r);

    $ready = q("SELECT r.*, u.full_name, u.contact_number, u.user_type FROM reservation r JOIN users u ON u.user_id=r.user_id
        WHERE r.reservation_status='Approved' AND NOT EXISTS (SELECT 1 FROM borrowing b WHERE b.reservation_id=r.reservation_id)
        ORDER BY r.event_date, r.start_time")->fetchAll();
    $im = group_rows(array_column($ready, 'reservation_id'), 'reservation_id',
        "SELECT ri.reservation_item_id, ri.reservation_id, ri.quantity_requested, e.equipment_name, e.condition_status, e.quantity_available
         FROM reservation_item ri JOIN equipment e ON e.equipment_id=ri.equipment_id WHERE ri.reservation_id IN ({IN})");
    foreach ($ready as &$r) $r['items'] = $im[$r['reservation_id']] ?? [];
    out(['borrowings' => $rows, 'ready' => $ready]);
}

$b = body();
if (($b['action'] ?? '') === 'notify') {   // (re)send the "ready for release" email
    $rid = (int)($b['reservation_id'] ?? 0);
    $st = q("SELECT reservation_status FROM reservation WHERE reservation_id=?", [$rid])->fetchColumn();
    if ($st !== 'Approved') fail('Only approved reservations can be notified.');
    [$sent, $msg] = notify_reservation_ready($rid);
    out(['emailed' => $sent, 'email_message' => $msg]);
}
if (($b['action'] ?? '') === 'release') {
    $rid = (int)($b['reservation_id'] ?? 0);
    $r = q("SELECT * FROM reservation WHERE reservation_id=?", [$rid])->fetch();
    if (!$r || $r['reservation_status'] !== 'Approved') fail('Only approved reservations can be released.');
    if (q("SELECT 1 FROM borrowing WHERE reservation_id=?", [$rid])->fetch()) fail('Already released.');
    $items = is_array($b['items'] ?? null) ? $b['items'] : [];
    $valid = ['Excellent', 'Good', 'Fair', 'Needs Repair'];
    $pdo = db(); $pdo->beginTransaction();
    try {
        $expected = $r['event_date'] . ' ' . $r['end_time'];
        q("INSERT INTO borrowing (reservation_id,released_by,release_datetime,expected_return_datetime,dispatch_notes) VALUES (?,?,NOW(),?,?)",
          [$rid, $me['id'], $expected, s($b['notes'] ?? '') ?: null]);
        $bid = (int)$pdo->lastInsertId(); $n = 0;
        foreach ($items as $it) {
            $ri = q("SELECT ri.*, e.equipment_name FROM reservation_item ri JOIN equipment e ON e.equipment_id=ri.equipment_id
                     WHERE ri.reservation_item_id=? AND ri.reservation_id=?", [(int)$it['reservation_item_id'], $rid])->fetch();
            $qty = (int)($it['qty'] ?? 0);
            if (!$ri || $qty <= 0) continue;
            if ($qty > $ri['quantity_requested']) fail('Cannot release more than requested for "' . $ri['equipment_name'] . '".');
            $cond = in_array($it['condition'] ?? '', $valid, true) ? $it['condition'] : 'Good';
            q("INSERT INTO borrowing_item (borrowing_id,reservation_item_id,quantity_released,dispatch_condition,notes) VALUES (?,?,?,?,?)",
              [$bid, $ri['reservation_item_id'], $qty, $cond, s($it['notes'] ?? '') ?: null]);
            $n++;
        }
        if (!$n) fail('Release at least one item.');
        q("UPDATE reservation SET reservation_status='Borrowed' WHERE reservation_id=?", [$rid]);
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
    out(['borrowing_id' => $bid], 201);
}
fail('Unknown action.', 404);
