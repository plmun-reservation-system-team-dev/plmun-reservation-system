<?php
require_once __DIR__ . '/../../config/bootstrap.php';
need_admin();
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['photo'])) {   // one user's ID photo (loaded on demand because pictures are big)
    out(['photo' => q("SELECT id_photo FROM users WHERE user_id=?", [(int)$_GET['photo']])->fetchColumn() ?: null]);
}
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    out(['users' => q("SELECT u.user_id, u.last_name, u.first_name, u.middle_initial, u.full_name, u.email, u.user_type, u.department, u.course, u.year_level, u.contact_number, u.account_status, u.created_at,
        u.id_number, (u.id_photo IS NOT NULL AND u.id_photo <> '') AS has_id_photo,
        (SELECT COUNT(*) FROM reservation r WHERE r.user_id=u.user_id) AS reservations,
        COALESCE((SELECT SUM(p.amount) FROM penalty p JOIN borrowing b ON b.borrowing_id=p.borrowing_id JOIN reservation r ON r.reservation_id=b.reservation_id
                  WHERE r.user_id=u.user_id AND p.penalty_status='Unpaid'),0) AS unpaid
        FROM users u ORDER BY u.last_name, u.first_name")->fetchAll()]);
}
$b = body();
if (($b['action'] ?? '') === 'decide') {   // approve or reject a new account request, then e-mail the person
    $u = q("SELECT * FROM users WHERE user_id=?", [(int)($b['id'] ?? 0)])->fetch();
    if (!$u) fail('User not found.', 404);
    if ($u['account_status'] !== 'Pending') fail('This account request was already reviewed.');
    $approve = ($b['decision'] ?? '') === 'approve';
    q("UPDATE users SET account_status=? WHERE user_id=?", [$approve ? 'Active' : 'Rejected', $u['user_id']]);
    require_once __DIR__ . '/../../config/mailer.php';
    [$sent, $msg] = send_account_decision($u['email'], $u['first_name'], $approve, mb_substr(s($b['reason'] ?? ''), 0, 300));
    out(['emailed' => $sent, 'email_message' => $msg]);
}
if (($b['action'] ?? '') === 'status' && in_array($b['status'] ?? '', ['Pending', 'Active', 'Rejected', 'Suspended', 'Deactivated'], true)) {
    q("UPDATE users SET account_status=? WHERE user_id=?", [$b['status'], (int)$b['id']]);
    out();
}

if (($b['action'] ?? '') === 'delete') {
    $id = (int)($b['id'] ?? 0);
    $u = q("SELECT full_name FROM users WHERE user_id=?", [$id])->fetch();
    if (!$u) fail('User not found.', 404);
    $n = (int)q("SELECT COUNT(*) FROM reservation WHERE user_id=?", [$id])->fetchColumn();
    if ($n > 0) fail($u['full_name'] . ' has ' . $n . ' reservation record(s), so the account cannot be deleted (it would erase the borrowing history). Set the status to Deactivated instead.');
    q("DELETE FROM users WHERE user_id=?", [$id]);
    out();
}

if (($b['action'] ?? '') === 'make_admin') {   // move a user account into the admin table (same email + password)
    $id = (int)($b['id'] ?? 0);
    $u = q("SELECT * FROM users WHERE user_id=?", [$id])->fetch();
    if (!$u) fail('User not found.', 404);
    if (q("SELECT 1 FROM admin WHERE email=?", [$u['email']])->fetch()) fail('That email is already an admin.', 409);
    $pdo = db(); $pdo->beginTransaction();
    try {
        q("INSERT INTO admin (last_name,first_name,middle_initial,email,password,contact_number,department) VALUES (?,?,?,?,?,?,?)",
          [$u['last_name'], $u['first_name'], $u['middle_initial'], $u['email'], $u['password'], $u['contact_number'], $u['department']]);
        $n = (int)q("SELECT COUNT(*) FROM reservation WHERE user_id=?", [$id])->fetchColumn();
        if ($n === 0) q("DELETE FROM users WHERE user_id=?", [$id]);
        else q("UPDATE users SET account_status='Deactivated' WHERE user_id=?", [$id]);   // keep history, stop using it as a client account
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
    out(['kept_as_deactivated' => $n > 0]);
}
fail('Unknown action.', 404);
