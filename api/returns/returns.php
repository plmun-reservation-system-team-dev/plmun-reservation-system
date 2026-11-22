<?php
require_once __DIR__ . '/../../config/bootstrap.php';
$me = need_admin();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $rows = q("SELECT rr.*, r.event_name, u.full_name, a.full_name AS received_by_name, b.expected_return_datetime
        FROM return_record rr JOIN borrowing b ON b.borrowing_id=rr.borrowing_id JOIN reservation r ON r.reservation_id=b.reservation_id
        JOIN users u ON u.user_id=r.user_id LEFT JOIN admin a ON a.admin_id=rr.received_by ORDER BY rr.return_datetime DESC LIMIT 100")->fetchAll();
    $map = group_rows(array_column($rows, 'return_id'), 'return_id',
        "SELECT rt.*, e.equipment_name FROM return_item rt JOIN borrowing_item bi ON bi.borrowing_item_id=rt.borrowing_item_id
         JOIN reservation_item ri ON ri.reservation_item_id=bi.reservation_item_id JOIN equipment e ON e.equipment_id=ri.equipment_id
         WHERE rt.return_id IN ({IN})");
    foreach ($rows as &$r) $r['items'] = $map[$r['return_id']] ?? [];
    out(['returns' => $rows, 'late_fee_per_hour' => LATE_FEE_PER_HOUR]);
}

$b = body();
if (($b['action'] ?? '') !== 'process') fail('Unknown action.', 404);
$bid = (int)($b['borrowing_id'] ?? 0);
$bor = q("SELECT * FROM borrowing WHERE borrowing_id=?", [$bid])->fetch();
if (!$bor || $bor['borrowing_status'] === 'Returned') fail('This borrowing is not open for return.');
$items = is_array($b['items'] ?? null) ? $b['items'] : [];
$conds = ['Excellent', 'Good', 'Fair', 'Needs Repair', 'Damaged', 'Lost'];

$pdo = db(); $pdo->beginTransaction();
try {
    $lines = [];
    foreach ($items as $it) {
        $qty = (int)($it['qty'] ?? 0);
        if ($qty <= 0) continue;
        $bi = q("SELECT bi.*, ri.equipment_id, e.equipment_name,
                 (bi.quantity_released - COALESCE((SELECT SUM(quantity_returned) FROM return_item WHERE borrowing_item_id=bi.borrowing_item_id),0)) AS outstanding
                 FROM borrowing_item bi JOIN reservation_item ri ON ri.reservation_item_id=bi.reservation_item_id
                 JOIN equipment e ON e.equipment_id=ri.equipment_id WHERE bi.borrowing_item_id=? AND bi.borrowing_id=?",
                [(int)$it['borrowing_item_id'], $bid])->fetch();
        if (!$bi) fail('Invalid item.');
        if ($qty > $bi['outstanding']) fail('"' . $bi['equipment_name'] . '": only ' . $bi['outstanding'] . ' still outstanding.');
        $cond = in_array($it['condition'] ?? '', $conds, true) ? $it['condition'] : 'Good';
        $lines[] = ['bi' => $bi, 'qty' => $qty, 'cond' => $cond, 'notes' => s($it['notes'] ?? ''), 'fee' => max(0, (float)($it['penalty'] ?? 0))];
    }
    if (!$lines) fail('Enter the quantity being returned for at least one item.');

    $now = new DateTime();
    $expected = new DateTime($bor['expected_return_datetime']);
    $late = $now > $expected;
    $damaged = false;

    q("INSERT INTO return_record (borrowing_id,received_by,return_datetime,return_status,inspection_notes) VALUES (?,?,NOW(),'Complete',?)",
      [$bid, $me['id'], s($b['inspection_notes'] ?? '') ?: null]);
    $rid = (int)$pdo->lastInsertId();

    foreach ($lines as $l) {
        $bad = in_array($l['cond'], ['Needs Repair', 'Damaged', 'Lost'], true);
        $damaged = $damaged || $bad;
        q("INSERT INTO return_item (return_id,borrowing_item_id,quantity_returned,condition_on_return,damage_notes,inspection_status) VALUES (?,?,?,?,?,?)",
          [$rid, $l['bi']['borrowing_item_id'], $l['qty'], $l['cond'], $l['notes'] ?: null, $bad ? 'Failed' : 'Passed']);
        $riid = (int)$pdo->lastInsertId();
        if ($bad) // damaged / lost units leave the usable stock until the admin restores them in Inventory
            q("UPDATE equipment SET quantity_available=GREATEST(quantity_available-?,0) WHERE equipment_id=?", [$l['qty'], $l['bi']['equipment_id']]);
        if ($l['fee'] > 0 && $bad) {
            $type = $l['cond'] === 'Lost' ? 'Loss' : 'Damage';
            q("INSERT INTO penalty (borrowing_id,return_item_id,assessed_by,penalty_type,amount,reason) VALUES (?,?,?,?,?,?)",
              [$bid, $riid, $me['id'], $type, $l['fee'], $l['bi']['equipment_name'] . ' x' . $l['qty'] . ' - ' . $l['cond'] . ($l['notes'] ? ': ' . $l['notes'] : '')]);
        }
    }
    // late-return penalty (once per borrowing)
    $lateFee = 0.0;
    if ($late && !q("SELECT 1 FROM penalty WHERE borrowing_id=? AND penalty_type='Late Return'", [$bid])->fetch()) {
        $hours = (int)ceil(($now->getTimestamp() - $expected->getTimestamp()) / 3600);
        $lateFee = isset($b['late_fee']) && $b['late_fee'] !== '' ? max(0, (float)$b['late_fee']) : $hours * LATE_FEE_PER_HOUR;
        if ($lateFee > 0)
            q("INSERT INTO penalty (borrowing_id,assessed_by,penalty_type,amount,reason) VALUES (?,?,'Late Return',?,?)",
              [$bid, $me['id'], $lateFee, $hours . ' hour(s) late x PHP ' . number_format(LATE_FEE_PER_HOUR, 2)]);
    }
    $tot = q("SELECT SUM(bi.quantity_released) rel,
              COALESCE((SELECT SUM(rt.quantity_returned) FROM return_item rt JOIN borrowing_item x ON x.borrowing_item_id=rt.borrowing_item_id WHERE x.borrowing_id=?),0) ret
              FROM borrowing_item bi WHERE bi.borrowing_id=?", [$bid, $bid])->fetch();
    $complete = (int)$tot['ret'] >= (int)$tot['rel'];
    $status = !$complete ? 'Partial' : ($damaged ? 'With Damage' : ($late ? 'Late' : 'Complete'));
    q("UPDATE return_record SET return_status=? WHERE return_id=?", [$status, $rid]);
    q("UPDATE borrowing SET borrowing_status=? WHERE borrowing_id=?", [$complete ? 'Returned' : ($late ? 'Overdue' : 'Partially Returned'), $bid]);
    if ($complete) q("UPDATE reservation SET reservation_status='Completed' WHERE reservation_id=?", [$bor['reservation_id']]);
    $pdo->commit();
} catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
out(['return_id' => $rid, 'status' => $status, 'late_fee' => $lateFee, 'complete' => $complete], 201);
