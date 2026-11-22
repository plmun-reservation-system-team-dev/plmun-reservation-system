<?php
require_once __DIR__ . '/../../config/bootstrap.php';
$action = $_GET['action'] ?? '';

function check_password(string $plain, string $hash): bool {
    if (password_verify($plain, $hash)) return true;
    return hash_equals(strtolower($hash), hash('sha256', $plain)); // legacy SHA2 from the sample data
}

if ($action === 'me') {
    $a = auth();
    if (!$a) out(['user' => null]);
    if ($a['role'] === 'user') {
        $a['unpaid'] = (float)q("SELECT COALESCE(SUM(p.amount),0) FROM penalty p
            JOIN borrowing b ON b.borrowing_id=p.borrowing_id JOIN reservation r ON r.reservation_id=b.reservation_id
            WHERE r.user_id=? AND p.penalty_status='Unpaid'", [$a['id']])->fetchColumn();
    }
    // bell counter in the top bar
    refresh_overdue();
    if ($a['role'] === 'admin') {
        $a['notify'] = (int)q("SELECT COUNT(*) FROM reservation WHERE reservation_status='Pending'")->fetchColumn()
                     + (int)q("SELECT COUNT(*) FROM borrowing WHERE borrowing_status='Overdue'")->fetchColumn();
    } else {
        $a['notify'] = (int)q("SELECT COUNT(*) FROM penalty p JOIN borrowing b ON b.borrowing_id=p.borrowing_id
            JOIN reservation r ON r.reservation_id=b.reservation_id WHERE r.user_id=? AND p.penalty_status='Unpaid'", [$a['id']])->fetchColumn()
                     + (int)q("SELECT COUNT(*) FROM borrowing b JOIN reservation r ON r.reservation_id=b.reservation_id
            WHERE r.user_id=? AND b.borrowing_status='Overdue'", [$a['id']])->fetchColumn();
    }
    out(['user' => $a]);
}

if ($action === 'logout') { $_SESSION = []; session_destroy(); out(); }

if ($action === 'login') {
    $b = body();
    $role = s($b['role'] ?? 'user') === 'admin' ? 'admin' : 'user';
    $email = strtolower(s($b['email'] ?? ''));
    $pass = (string)($b['password'] ?? '');
    if ($email === '' || $pass === '') fail('Please enter your email and password.');

    if ($role === 'admin') {
        $row = q("SELECT * FROM admin WHERE email=?", [$email])->fetch();
        $idCol = 'admin_id'; $table = 'admin';
    } else {
        $row = q("SELECT * FROM users WHERE email=?", [$email])->fetch();
        $idCol = 'user_id'; $table = 'users';
    }
    if (!$row || !check_password($pass, $row['password'])) fail('Wrong email or password.', 401);
    if ($role === 'user') {
        $msg = ['Pending' => 'Your account is still waiting for approval.',
                'Suspended' => 'Your account is suspended. Please see the Property Office.',
                'Deactivated' => 'Your account is deactivated.'];
        if (isset($msg[$row['account_status']])) fail($msg[$row['account_status']], 403);
    }
    if (!password_get_info($row['password'])['algo']) { // upgrade legacy hash
        q("UPDATE $table SET password=? WHERE $idCol=?", [password_hash($pass, PASSWORD_DEFAULT), $row[$idCol]]);
    }
    session_regenerate_id(true);
    $_SESSION['auth'] = [
        'role' => $role, 'id' => (int)$row[$idCol], 'name' => $row['full_name'], 'first_name' => $row['first_name'] ?? $row['full_name'], 'email' => $row['email'],
        'type' => $role === 'admin' ? 'Admin' : $row['user_type'],
        'department' => $row['department'] ?? null,
    ];
    out(['user' => $_SESSION['auth']]);
}

// ---- Sign-up with e-mail verification -------------------------------------------------
// Step 1 (register): validate the form, keep it in the session, e-mail a 6-digit code. Nothing is saved to the database yet.
// Step 2 (verify_email): the right code creates the account. resend_code sends a fresh code.
const VERIFY_MINUTES = 10, VERIFY_MAX_TRIES = 5, VERIFY_RESEND_SECONDS = 60;

function issue_verification_code(): array {
    $p = &$_SESSION['pending_signup'];
    $code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $p['code_hash'] = password_hash($code, PASSWORD_DEFAULT);
    $p['expires'] = time() + VERIFY_MINUTES * 60;
    $p['tries'] = 0;
    $p['sent_at'] = time();
    [$sent, $msg] = send_mail_code($p, $code);
    return [$sent, $msg];
}
function send_mail_code(array $p, string $code): array {
    require_once __DIR__ . '/../../config/mailer.php';
    $r = send_verification_code($p['email'], $p['first_name'], $code, VERIFY_MINUTES);
    // MAIL_ENABLED=false is a demo mode: the code is written to storage/mail.log instead of being e-mailed.
    if (!$r[0] && !MAIL_ENABLED) return [true, $r[1]];
    return $r;
}

if ($action === 'register') {
    $b = body();
    $last = s($b['last_name'] ?? ''); $first = s($b['first_name'] ?? '');
    $mi = strtoupper(rtrim(s($b['middle_initial'] ?? ''), '. '));
    $email = strtolower(s($b['email'] ?? '')); $pass = (string)($b['password'] ?? '');
    $type = in_array($b['user_type'] ?? '', ['Student', 'Faculty', 'Staff'], true) ? $b['user_type'] : 'Student';
    if ($last === '' || $first === '' || $email === '' || $pass === '') fail('Please fill in all required fields.');
    if (mb_strlen($last) > 60 || mb_strlen($first) > 60) fail('Surname and first name must be 60 characters or fewer.');
    if ($mi !== '' && !preg_match('/^\p{L}$/u', $mi)) fail('Middle initial must be a single letter.');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Please enter a valid email address.');
    if (strlen($pass) < 6) fail('Password must be at least 6 characters.');
    $contact = s($b['contact_number'] ?? '');
    if ($contact !== '' && !preg_match('/^[0-9+\-\s]{7,20}$/', $contact)) fail('Contact number looks invalid.');
    if (q("SELECT 1 FROM users WHERE email=?", [$email])->fetch() || q("SELECT 1 FROM admin WHERE email=?", [$email])->fetch())
        fail('That email is already registered.', 409);
    $_SESSION['pending_signup'] = [
        'last' => $last, 'first' => $first, 'first_name' => $first, 'mi' => $mi, 'email' => $email,
        'pass_hash' => password_hash($pass, PASSWORD_DEFAULT), 'type' => $type, 'contact' => $contact,
        'department' => s($b['department'] ?? ''), 'course' => s($b['course'] ?? ''), 'year' => s($b['year_level'] ?? ''),
    ];
    [$sent, $msg] = issue_verification_code();
    if (!$sent) { unset($_SESSION['pending_signup']); fail('We could not send the verification code. ' . $msg, 502); }
    out(['verify' => true, 'email' => $email, 'minutes' => VERIFY_MINUTES, 'resend_after' => VERIFY_RESEND_SECONDS]);
}

if ($action === 'resend_code') {
    if (empty($_SESSION['pending_signup'])) fail('Your sign-up session expired. Please fill in the form again.', 409);
    $wait = VERIFY_RESEND_SECONDS - (time() - (int)$_SESSION['pending_signup']['sent_at']);
    if ($wait > 0) fail("Please wait $wait second(s) before requesting another code.", 429);
    [$sent, $msg] = issue_verification_code();
    if (!$sent) fail('We could not send the verification code. ' . $msg, 502);
    out(['email' => $_SESSION['pending_signup']['email'], 'resend_after' => VERIFY_RESEND_SECONDS]);
}

if ($action === 'verify_email') {
    $p = $_SESSION['pending_signup'] ?? null;
    if (!$p) fail('Your sign-up session expired. Please fill in the form again.', 409);
    $code = preg_replace('/\D/', '', (string)(body()['code'] ?? ''));
    if (strlen($code) !== 6) fail('Enter the 6-digit code from your email.');
    if (time() > $p['expires']) fail('That code has expired. Tap “Resend code” to get a new one.', 410);
    if ($p['tries'] >= VERIFY_MAX_TRIES) fail('Too many wrong attempts. Tap “Resend code” to get a new one.', 429);
    if (!password_verify($code, $p['code_hash'])) {
        $_SESSION['pending_signup']['tries']++;
        $left = VERIFY_MAX_TRIES - $_SESSION['pending_signup']['tries'];
        fail($left > 0 ? "Wrong code. $left attempt(s) left." : 'Too many wrong attempts. Tap “Resend code” to get a new one.', 401);
    }
    if (q("SELECT 1 FROM users WHERE email=?", [$p['email']])->fetch() || q("SELECT 1 FROM admin WHERE email=?", [$p['email']])->fetch())
        fail('That email is already registered.', 409);
    q("INSERT INTO users (last_name,first_name,middle_initial,email,password,user_type,contact_number,department,course,year_level)
       VALUES (?,?,?,?,?,?,?,?,?,?)",
      [$p['last'], $p['first'], $p['mi'] ?: null, $p['email'], $p['pass_hash'], $p['type'], $p['contact'] ?: null,
       $p['department'] ?: null,
       $p['type'] === 'Student' ? ($p['course'] ?: null) : null,
       $p['type'] === 'Student' ? ($p['year'] ?: null) : null]);
    unset($_SESSION['pending_signup']);
    out(['message' => 'Email verified. Account created. You can log in now.'], 201);
}
fail('Unknown action.', 404);
