<?php
// Quick email test (localhost only).  Open:  http://localhost/plmun/tools/test-mail.php?to=youremail@gmail.com
require_once __DIR__ . '/../config/mailer.php';
header('Content-Type: text/plain; charset=utf-8');
if (!in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) { http_response_code(403); exit('Localhost only.'); }
$to = $_GET['to'] ?? '';
if ($to === '') exit("Add ?to=youremail@gmail.com to the address bar.");
echo 'config.local.php: ' . (is_file(__DIR__ . '/../config/config.local.php') ? 'found' : 'NOT FOUND (copy config/config.local.example.php to config/config.local.php and fill it in)') . "\n";
echo 'MAIL_USER: ' . (MAIL_USER ?: '(empty)') . "\n";
echo 'MAIL_PASS: ' . (MAIL_PASS === '' ? '(empty)' : strlen(str_replace(' ', '', MAIL_PASS)) . ' characters (a Gmail App Password has 16)') . "\n";
echo 'MAIL_FROM used: ' . MAIL_FROM_ADDR . "\n";
echo 'MAIL_ENABLED: ' . (MAIL_ENABLED ? 'true' : 'false (change it to true in config/config.php)') . "\n";
echo 'openssl: ' . (extension_loaded('openssl') ? 'on' : 'OFF (enable extension=openssl in php.ini)') . "\n\n";
[$ok, $msg] = send_mail($to, 'PLMun test email', '<p>It works! This is a test email from the PLMun Reservation system.</p>', 'It works! Test email from the PLMun Reservation system.');
echo ($ok ? 'SUCCESS: ' : 'FAILED: ') . $msg . "\n";
