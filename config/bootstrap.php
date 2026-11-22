<?php
require_once __DIR__ . '/config.php';
session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax']);
session_start();
header('Content-Type: application/json; charset=utf-8');

function db(): PDO {
    static $pdo = null;
    if (!$pdo) {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER, DB_PASS,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
             PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
             PDO::ATTR_EMULATE_PREPARES => false]
        );
    }
    return $pdo;
}
function out(array $d = [], int $code = 200): void {
    http_response_code($code);
    echo json_encode(['ok' => true] + $d);
    exit;
}
function fail(string $msg, int $code = 400): void {
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $msg]);
    exit;
}
function body(): array {
    static $b = null;
    if ($b === null) {
        $b = json_decode(file_get_contents('php://input'), true);
        if (!is_array($b)) $b = $_POST;
    }
    return $b;
}
function q(string $sql, array $p = []): PDOStatement {
    $st = db()->prepare($sql);
    $st->execute($p);
    return $st;
}
function auth() { return $_SESSION['auth'] ?? null; }
function need_login(): array { $a = auth(); if (!$a) fail('Please log in first.', 401); return $a; }
function need_user(): array { $a = need_login(); if ($a['role'] !== 'user') fail('Users only.', 403); return $a; }
function need_admin(): array { $a = need_login(); if ($a['role'] !== 'admin') fail('Admin access only.', 403); return $a; }
function s($v): string { return trim((string)($v ?? '')); }
function hhmmss(string $t): string { return strlen($t) === 5 ? $t . ':00' : $t; }

/** Units of each equipment already committed in an overlapping time window. */
function reserved_map(string $date, string $start, string $end, int $exclude = 0): array {
    $st = q("SELECT ri.equipment_id, SUM(ri.quantity_requested) AS qty
             FROM reservation_item ri
             JOIN reservation r ON r.reservation_id = ri.reservation_id
             WHERE r.event_date = ? AND r.reservation_status IN ('Pending','Approved','Borrowed')
               AND r.start_time < ? AND r.end_time > ? AND r.reservation_id <> ?
             GROUP BY ri.equipment_id", [$date, hhmmss($end), hhmmss($start), $exclude]);
    $m = [];
    foreach ($st as $r) $m[(int)$r['equipment_id']] = (int)$r['qty'];
    return $m;
}
function is_reservable(array $e): bool {
    return !in_array($e['availability_status'], ['Unavailable', 'Under Maintenance'], true)
        && $e['condition_status'] !== 'Retired' && (int)$e['quantity_available'] > 0;
}
/** Flip Borrowed / Partially Returned borrowings to Overdue once the expected return passed. */
function refresh_overdue(): void {
    q("UPDATE borrowing SET borrowing_status='Overdue'
       WHERE borrowing_status IN ('Borrowed','Partially Returned') AND expected_return_datetime < NOW()");
}
/** Group rows from a "... IN ({IN}) ..." query by $key. */
function group_rows(array $ids, string $key, string $sql): array {
    if (!$ids) return [];
    $in = implode(',', array_fill(0, count($ids), '?'));
    $map = [];
    foreach (q(str_replace('{IN}', $in, $sql), $ids) as $r) $map[$r[$key]][] = $r;
    return $map;
}
set_exception_handler(function (Throwable $e) {
    fail(DEBUG ? $e->getMessage() : 'Server error. Please try again.', 500);
});
