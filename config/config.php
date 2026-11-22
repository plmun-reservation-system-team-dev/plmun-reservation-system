<?php
// Private values (passwords, API keys) live in config/config.local.php, which is NOT committed to git.
// Copy config.local.example.php to config.local.php and fill it in. Anything defined there wins over the defaults below.
if (is_file(__DIR__ . '/config.local.php')) require __DIR__ . '/config.local.php';
// ==== EDIT THESE to match your MySQL (XAMPP default shown) ====
const DB_HOST = '127.0.0.1';
const DB_PORT = '3306';
const DB_NAME = 'plmun_reservation_db';
const DB_USER = 'root';
defined('DB_PASS') || define('DB_PASS', '');   // XAMPP default is empty

// ==== System rules ====
const LATE_FEE_PER_HOUR = 50.00;   // PHP per hour late (auto-computed on return)
const DEBUG = true;                // set false when presenting/deploying

// ==== Email notifications ====
// MAIL_ENABLED=false -> emails are NOT sent, they are only written to storage/mail.log (good for testing/demo).
// For real sending with Gmail: turn on 2-Step Verification, create an "App password", and put it in MAIL_PASS.
defined('MAIL_PASS') || define('MAIL_PASS', '');            // set in config.local.php
define('MAIL_ENABLED', trim(str_replace(' ', '', MAIL_PASS)) !== '');                   // no password -> emails are only written to storage/mail.log
const MAIL_HOST      = 'smtp.gmail.com';
const MAIL_PORT      = 587;                    // 587 = STARTTLS
defined('MAIL_USER') || define('MAIL_USER', '');           // the sending account, set in config.local.php
// MAIL_FROM must be an e-mail address. If a name (or nothing) was typed there, the sending account is used instead.
define('MAIL_FROM_ADDR', (defined('MAIL_FROM') && filter_var(MAIL_FROM, FILTER_VALIDATE_EMAIL)) ? MAIL_FROM : MAIL_USER);
const MAIL_FROM_NAME = 'PLMun Reservation System';

// ==== AI chatbot ====
// Put your Anthropic API key here (https://console.anthropic.com). Leave '' to use the built-in
// rule-based answers (no internet / no key needed).
defined('AI_API_KEY') || define('AI_API_KEY', '');
const AI_MODEL   = 'claude-haiku-5-5';