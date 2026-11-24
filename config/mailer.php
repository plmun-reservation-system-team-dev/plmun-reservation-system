<?php
/** Tiny SMTP mailer (no Composer needed) + the "reservation is ready" notification. */
require_once __DIR__ . '/config.php';

function mail_log(string $line): void {
    $dir = __DIR__ . '/../storage';
    if (!is_dir($dir)) @mkdir($dir, 0775, true);
    @file_put_contents($dir . '/mail.log', '[' . date('Y-m-d H:i:s') . '] ' . $line . "\n", FILE_APPEND);
}

function smtp_expect($fp, array $ok): string {
    $resp = '';
    while (($line = fgets($fp, 515)) !== false) {
        $resp .= $line;
        if (strlen($line) < 4 || $line[3] === ' ') break;   // last line of a multi-line reply
    }
    if (!in_array((int)substr($resp, 0, 3), $ok, true)) throw new RuntimeException('SMTP error: ' . trim($resp));
    return $resp;
}
function smtp_cmd($fp, string $cmd, array $ok): string { fwrite($fp, $cmd . "\r\n"); return smtp_expect($fp, $ok); }

/** Send one HTML email. Returns [bool sent, string message]. Never throws. */
function send_mail(string $to, string $subject, string $html, string $text = ''): array {
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) return [false, 'Invalid recipient address.'];
    if (!MAIL_ENABLED) {
        mail_log("(MAIL_ENABLED is false, not sent) To: $to | Subject: $subject\n" . ($text ?: strip_tags($html)));
        return [false, 'Email is not set up on this computer yet. Copy config/config.local.example.php to config/config.local.php and add the Gmail App Password. The message was saved to storage/mail.log instead.'];
    }
    try {
        $fp = @stream_socket_client('tcp://' . MAIL_HOST . ':' . MAIL_PORT, $en, $es, 15);
        if (!$fp) throw new RuntimeException("Cannot connect to " . MAIL_HOST . ": $es");
        stream_set_timeout($fp, 15);
        smtp_expect($fp, [220]);
        smtp_cmd($fp, 'EHLO localhost', [250]);
        smtp_cmd($fp, 'STARTTLS', [220]);
        if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) throw new RuntimeException('TLS failed.');
        smtp_cmd($fp, 'EHLO localhost', [250]);
        smtp_cmd($fp, 'AUTH LOGIN', [334]);
        smtp_cmd($fp, base64_encode(MAIL_USER), [334]);
        smtp_cmd($fp, base64_encode(str_replace(' ', '', MAIL_PASS)), [235]);
        smtp_cmd($fp, 'MAIL FROM:<' . MAIL_FROM_ADDR . '>', [250]);
        smtp_cmd($fp, 'RCPT TO:<' . $to . '>', [250, 251]);
        smtp_cmd($fp, 'DATA', [354]);

        $b = 'b' . bin2hex(random_bytes(8));
        $enc = fn(string $s) => '=?UTF-8?B?' . base64_encode($s) . '?=';
        $msg  = 'From: ' . $enc(MAIL_FROM_NAME) . ' <' . MAIL_FROM_ADDR . ">\r\n";
        $msg .= "To: <$to>\r\nSubject: " . $enc($subject) . "\r\nDate: " . date('r') . "\r\nMIME-Version: 1.0\r\n";
        $msg .= "Content-Type: multipart/alternative; boundary=\"$b\"\r\n\r\n";
        $msg .= "--$b\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($text ?: strip_tags($html))) . "\r\n";
        $msg .= "--$b\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($html)) . "\r\n--$b--\r\n";
        fwrite($fp, $msg . "\r\n.\r\n");
        smtp_expect($fp, [250]);
        smtp_cmd($fp, 'QUIT', [221]);
        fclose($fp);
        mail_log("SENT To: $to | Subject: $subject");
        return [true, 'Email sent to ' . $to . '.'];
    } catch (Throwable $e) {
        mail_log("FAILED To: $to | " . $e->getMessage());
        return [false, 'Email could not be sent: ' . $e->getMessage()];
    }
}

/** Email the borrower that their approved reservation is ready for release / pick-up. Returns [bool, message]. */
function notify_reservation_ready(int $reservationId): array {
    $r = q("SELECT r.*, u.full_name, u.email FROM reservation r JOIN users u ON u.user_id=r.user_id WHERE r.reservation_id=?", [$reservationId])->fetch();
    if (!$r) return [false, 'Reservation not found.'];
    $items = q("SELECT ri.quantity_requested, e.equipment_name FROM reservation_item ri JOIN equipment e ON e.equipment_id=ri.equipment_id WHERE ri.reservation_id=?", [$reservationId])->fetchAll();

    $h = fn($v) => htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
    $when = date('F j, Y', strtotime($r['event_date'])) . ', ' . date('g:i A', strtotime($r['start_time'])) . ' - ' . date('g:i A', strtotime($r['end_time']));
    $li = '';  $tx = '';
    foreach ($items as $i) { $li .= '<li>' . (int)$i['quantity_requested'] . ' &times; ' . $h($i['equipment_name']) . '</li>'; $tx .= '- ' . (int)$i['quantity_requested'] . ' x ' . $i['equipment_name'] . "\n"; }
    $remarks = trim((string)$r['approval_remarks']);

    $html = '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #ebe4d2;border-radius:12px;overflow:hidden">'
      . '<div style="background:#0e3a23;color:#fff;padding:18px 22px"><b style="font-size:18px">PLMun Property Office</b><br><span style="color:#f4c95d">Reservation &amp; Borrowing</span></div>'
      . '<div style="padding:22px;color:#16261c;line-height:1.55">'
      . '<p>Hi ' . $h($r['full_name']) . ',</p>'
      . '<p>Good news! Your reservation <b>#' . (int)$r['reservation_id'] . ' &ndash; ' . $h($r['event_name']) . '</b> is <b>approved and ready for release</b>.</p>'
      . '<table style="border-collapse:collapse;margin:10px 0"><tr><td style="padding:3px 14px 3px 0;color:#617066">When</td><td>' . $h($when) . '</td></tr>'
      . '<tr><td style="padding:3px 14px 3px 0;color:#617066">Venue</td><td>' . $h($r['event_location']) . '</td></tr></table>'
      . '<p style="margin-bottom:4px"><b>Items</b></p><ul style="margin-top:0">' . $li . '</ul>'
      . ($remarks !== '' ? '<p><b>Note from the office:</b> ' . $h($remarks) . '</p>' : '')
      . '<p>Please go to the Property Office to have your items released and bring your school ID. Returning late or damaged items may result in penalties.</p>'
      . '<p style="color:#617066;font-size:13px">This is an automated message from the PLMun Reservation &amp; Borrowing System.</p></div></div>';
    $text = "Hi {$r['full_name']},\n\nYour reservation #{$r['reservation_id']} ({$r['event_name']}) is approved and ready for release.\n"
          . "When: $when\nVenue: {$r['event_location']}\n\nItems:\n$tx" . ($remarks !== '' ? "\nNote from the office: $remarks\n" : '')
          . "\nPlease go to the Property Office to have your items released and bring your school ID.\n\nPLMun Property Office";

    return send_mail($r['email'], 'Your reservation #' . $r['reservation_id'] . ' is ready for release', $html, $text);
}

/** Email a 6-digit sign-up verification code. Returns [bool, message]. */
function send_verification_code(string $to, string $name, string $code, int $minutes): array {
    $h = fn($v) => htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
    $html = '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #ebe4d2;border-radius:12px;overflow:hidden">'
      . '<div style="background:#0e3a23;color:#fff;padding:18px 22px"><b style="font-size:18px">PLMun Property Office</b><br><span style="color:#f4c95d">Reservation &amp; Borrowing</span></div>'
      . '<div style="padding:22px;color:#16261c;line-height:1.55">'
      . '<p>Hi ' . $h($name) . ',</p>'
      . '<p>Use this code to verify your email and finish creating your account:</p>'
      . '<p style="font-size:32px;letter-spacing:8px;font-weight:700;background:#f6f1e3;border-radius:10px;padding:14px;text-align:center;margin:14px 0">' . $h($code) . '</p>'
      . '<p>The code expires in ' . (int)$minutes . ' minutes. If you did not try to sign up, you can ignore this email.</p>'
      . '<p style="color:#617066;font-size:13px">This is an automated message from the PLMun Reservation &amp; Borrowing System.</p></div></div>';
    $text = "Hi $name,\n\nYour PLMun verification code is: $code\n\nIt expires in $minutes minutes. If you did not try to sign up, ignore this email.\n\nPLMun Property Office";
    return send_mail($to, 'Your PLMun verification code: ' . $code, $html, $text);
}

/** Email the person the Property Office's decision on their new account request. Returns [bool, message]. */
function send_account_decision(string $to, string $name, bool $approved, string $reason = ''): array {
    $h = fn($v) => htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
    $head = '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #ebe4d2;border-radius:12px;overflow:hidden">'
      . '<div style="background:#0e3a23;color:#fff;padding:18px 22px"><b style="font-size:18px">PLMun Property Office</b><br><span style="color:#f4c95d">Reservation &amp; Borrowing</span></div>'
      . '<div style="padding:22px;color:#16261c;line-height:1.55"><p>Hi ' . $h($name) . ',</p>';
    $foot = '<p style="color:#617066;font-size:13px">This is an automated message from the PLMun Reservation &amp; Borrowing System.</p></div></div>';
    if ($approved) {
        $html = $head . '<p>Good news! The Property Office has <b>approved your account</b>. It is ready to use.</p><p>You can now log in with your email and password and start reserving equipment.</p>' . $foot;
        $text = "Hi $name,\n\nGood news! The Property Office has approved your account. It is ready to use. You can now log in with your email and password.\n\nPLMun Property Office";
        return send_mail($to, 'Your PLMun account is ready', $html, $text);
    }
    $html = $head . '<p>We could not approve your PLMun account request.</p>' . ($reason !== '' ? '<p><b>Note from the office:</b> ' . $h($reason) . '</p>' : '')
      . '<p>Please double-check that all the information you entered is correct (your name, ID number and a clear photo of your PLMun ID), or visit the Property Office for further assistance.</p>' . $foot;
    $text = "Hi $name,\n\nWe could not approve your PLMun account request." . ($reason !== '' ? "\nNote from the office: $reason" : '')
      . "\nPlease double-check that all the information you entered is correct (your name, ID number and a clear photo of your PLMun ID), or visit the Property Office for further assistance.\n\nPLMun Property Office";
    return send_mail($to, 'Your PLMun account request was not approved', $html, $text);
}
