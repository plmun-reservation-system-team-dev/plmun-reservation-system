<?php
require_once __DIR__ . '/../../config/bootstrap.php';
$me = need_login();
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $sql = "SELECT p.*, r.event_name, r.event_date, u.full_name, u.email, b.expected_return_datetime
        FROM penalty p JOIN borrowing b ON b.borrowing_id=p.borrowing_id JOIN reservation r ON r.reservation_id=b.reservation_id
        JOIN users u ON u.user_id=r.user_id";
    $p = []; $w = [];
    if ($me['role'] === 'user') { $w[] = 'r.user_id=?'; $p[] = $me['id']; }
    if (!empty($_GET['status'])) { $w[] = 'p.penalty_status=?'; $p[] = $_GET['status']; }
    if ($w) $sql .= ' WHERE ' . implode(' AND ', $w);
    $rows = q($sql . " ORDER BY FIELD(p.penalty_status,'Unpaid','Paid','Waived'), p.assessed_at DESC", $p)->fetchAll();
    foreach ($rows as &$r) $r['amount'] = (float)$r['amount'];
    out(['penalties' => $rows]);
}
$a = need_admin();
$b = body();
if (($b['action'] ?? '') === 'status') {
    if (!in_array($b['status'] ?? '', ['Unpaid', 'Paid', 'Waived'], true)) fail('Invalid status.');
    q("UPDATE penalty SET penalty_status=?, assessed_by=COALESCE(assessed_by,?) WHERE penalty_id=?", [$b['status'], $a['id'], (int)$b['id']]);
    out();
}
if (($b['action'] ?? '') === 'create') {
    $amt = (float)($b['amount'] ?? 0);
    if ($amt <= 0) fail('Amount must be greater than zero.');
    if (!q("SELECT 1 FROM borrowing WHERE borrowing_id=?", [(int)$b['borrowing_id']])->fetch()) fail('Borrowing record not found.');
    q("INSERT INTO penalty (borrowing_id,assessed_by,penalty_type,amount,reason) VALUES (?,?,'Other',?,?)",
      [(int)$b['borrowing_id'], $a['id'], $amt, s($b['reason'] ?? '') ?: null]);
    out([], 201);
}
fail('Unknown action.', 404);
