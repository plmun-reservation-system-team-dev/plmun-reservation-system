<?php
/** Chatbot endpoint. POST { messages: [{role:'user'|'assistant', content:'...'}] }
 *  Uses the Claude API when AI_API_KEY is set (config/config.php), otherwise answers with simple built-in rules. */
require_once __DIR__ . '/../../config/bootstrap.php';
$me = need_login();
if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST only.', 405);

// ---- clean the conversation sent by the browser ----
$msgs = [];
foreach (array_slice(is_array(body()['messages'] ?? null) ? body()['messages'] : [], -12) as $m) {
    $role = ($m['role'] ?? '') === 'assistant' ? 'assistant' : 'user';
    $text = mb_substr(s($m['content'] ?? ''), 0, 1000);
    if ($text === '') continue;
    if ($msgs && $msgs[count($msgs) - 1]['role'] === $role) $msgs[count($msgs) - 1]['content'] .= "\n" . $text;  // roles must alternate
    else $msgs[] = ['role' => $role, 'content' => $text];
}
while ($msgs && $msgs[0]['role'] !== 'user') array_shift($msgs);
if (!$msgs || $msgs[count($msgs) - 1]['role'] !== 'user') fail('Please type a message.');
$last = $msgs[count($msgs) - 1]['content'];

// ---- facts from the database (only this person's own data) ----
$equipment = q("SELECT e.equipment_name, c.category_name, e.quantity_available, e.condition_status, e.availability_status
                FROM equipment e JOIN equipment_category c ON c.category_id=e.category_id
                WHERE e.condition_status <> 'Retired' ORDER BY c.category_name, e.equipment_name")->fetchAll();
$mine = []; $unpaid = 0.0; $adminInfo = null;
if ($me['role'] === 'user') {
    $mine = q("SELECT reservation_id, event_name, event_date, start_time, end_time, reservation_status FROM reservation
               WHERE user_id=? ORDER BY reservation_id DESC LIMIT 5", [$me['id']])->fetchAll();
    $unpaid = (float)q("SELECT COALESCE(SUM(p.amount),0) FROM penalty p JOIN borrowing b ON b.borrowing_id=p.borrowing_id
                        JOIN reservation r ON r.reservation_id=b.reservation_id WHERE r.user_id=? AND p.penalty_status='Unpaid'", [$me['id']])->fetchColumn();
} else {
    refresh_overdue();
    $adminInfo = [
        'pending'  => (int)q("SELECT COUNT(*) FROM reservation WHERE reservation_status='Pending'")->fetchColumn(),
        'approved_waiting_release' => (int)q("SELECT COUNT(*) FROM reservation r WHERE reservation_status='Approved' AND NOT EXISTS (SELECT 1 FROM borrowing b WHERE b.reservation_id=r.reservation_id)")->fetchColumn(),
        'overdue'  => (int)q("SELECT COUNT(*) FROM borrowing WHERE borrowing_status='Overdue'")->fetchColumn(),
    ];
}

// ---- 1) Claude API ----
if (AI_API_KEY !== '' && function_exists('curl_init')) {
    $lines = [];
    foreach ($equipment as $e) $lines[] = "- {$e['equipment_name']} ({$e['category_name']}): {$e['quantity_available']} in stock, {$e['condition_status']}, {$e['availability_status']}";
    $ctx = "You are the helpful assistant of the PLMun (Pamantasan ng Lungsod ng Muntinlupa) Smart Event Equipment Reservation and Borrowing System.\n"
      . "Answer briefly (max 5 sentences) and in the language the person writes in (English or Filipino/Taglish). Only help with this system; for anything not listed below, say you are not sure and tell them to ask the Property Office. Never invent policies, prices, schedules or availability.\n\n"
      . "HOW THE SYSTEM WORKS: 1) Users sign up and log in. 2) Browse the Catalog, check availability for a date/time, add items to the request on the Reserve page, then submit (status Pending). "
      . "3) The Property Office admin approves or rejects (rejections include a reason); approved users get an email saying the items are ready for release. "
      . "4) The items are released at the Property Office with a dispatch record (status Borrowed). 5) On return, each item is inspected; late returns are charged PHP " . number_format(LATE_FEE_PER_HOUR, 2) . " per hour, plus damage/loss penalties. "
      . "Users with unpaid penalties cannot make new reservations until they settle them at the Property Office. Only Pending or Approved reservations can be cancelled. After borrowing, users can review each item.\n\n"
      . "EQUIPMENT RIGHT NOW (stock is before time-slot conflicts; exact availability for a date is on the Catalog/Reserve page):\n" . implode("\n", $lines) . "\n\n"
      . "THE PERSON TALKING TO YOU: role = {$me['role']}, name = {$me['name']}.\n";
    if ($me['role'] === 'user') {
        $ctx .= "Their latest reservations: " . ($mine ? json_encode($mine, JSON_UNESCAPED_UNICODE) : 'none') . "\nTheir unpaid penalties: PHP " . number_format($unpaid, 2) . "\n";
    } else {
        $ctx .= "Admin overview: " . json_encode($adminInfo) . "\n";
    }
    $ch = curl_init('https://api.anthropic.com/v1/messages');
    curl_setopt_array($ch, [
        CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 25,
        CURLOPT_HTTPHEADER => ['content-type: application/json', 'x-api-key: ' . AI_API_KEY, 'anthropic-version: 2023-06-01'],
        CURLOPT_POSTFIELDS => json_encode(['model' => AI_MODEL, 'max_tokens' => 500, 'system' => $ctx, 'messages' => $msgs]),
    ]);
    $raw = curl_exec($ch); $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    $j = $raw ? json_decode($raw, true) : null;
    $reply = '';
    foreach (($j['content'] ?? []) as $blk) if (($blk['type'] ?? '') === 'text') $reply .= $blk['text'];
    if ($http === 200 && trim($reply) !== '') out(['reply' => trim($reply), 'mode' => 'ai']);
    // API problem (bad key, no internet, no credit...): fall through to the built-in answers
    if (DEBUG) error_log('Chatbot API failed (' . $http . '): ' . substr((string)$raw, 0, 300));
}

// ---- 2) Built-in answers (no API needed) ----
$t = mb_strtolower($last);
$has = fn(array $w) => (bool)array_filter($w, fn($x) => str_contains($t, $x));
$reply = null;

if ($has(['hello', 'hi ', 'hi!', 'hey', 'kumusta', 'good morning', 'good afternoon']) && mb_strlen($t) < 25) {
    $reply = "Hi {$me['name']}! I can help with equipment availability, how to reserve, your reservation status, penalties and returns. What would you like to know?";
} elseif ($has(['my reservation', 'my request', 'status', 'approved', 'reservations ko'])) {
    if ($me['role'] === 'admin') {
        $reply = "Right now: {$adminInfo['pending']} pending request(s), {$adminInfo['approved_waiting_release']} approved and waiting for release, {$adminInfo['overdue']} overdue borrowing(s).";
    } elseif (!$mine) {
        $reply = "You have no reservations yet. Go to Catalog, add the items you need, then submit the request on the Reserve page.";
    } else {
        $reply = "Your latest reservations:\n" . implode("\n", array_map(fn($r) => "- #{$r['reservation_id']} {$r['event_name']} ({$r['event_date']}): {$r['reservation_status']}", $mine));
    }
} elseif ($has(['penalt', 'fee', 'fine', 'late', 'damage', 'multa'])) {
    $reply = "Late returns are charged PHP " . number_format(LATE_FEE_PER_HOUR, 2) . " per hour, and damaged or lost items have their own penalty. Unpaid penalties block new reservations until you settle them at the Property Office.";
    if ($me['role'] === 'user') $reply .= $unpaid > 0 ? " You currently owe PHP " . number_format($unpaid, 2) . "." : " You have no unpaid penalties.";
} elseif ($has(['how to reserve', 'how do i reserve', 'how to borrow', 'paano', 'book', 'reserve'])) {
    $reply = "1) Open the Catalog and add the equipment you need. 2) Go to Reserve, pick the date and time, and submit. 3) Wait for the Property Office to approve it; you will get an email. 4) Claim the items at the Property Office and return them on time.";
} elseif ($has(['cancel'])) {
    $reply = "You can cancel a Pending or Approved reservation from My Reservations. Once the items are released it can no longer be cancelled.";
} elseif ($has(['return'])) {
    $reply = "Return the items to the Property Office by the end time of your event. Each item is inspected; late, damaged or missing items may incur penalties.";
} else {
    // maybe they named an equipment item
    $hits = array_filter($equipment, function ($e) use ($t) {
        foreach (preg_split('/\s+/', mb_strtolower($e['equipment_name'])) as $w) if (mb_strlen($w) > 3 && str_contains($t, rtrim($w, 's'))) return true;
        return str_contains($t, mb_strtolower($e['category_name']));
    });
    if ($hits || $has(['available', 'stock', 'equipment', 'catalog', 'meron', 'avail'])) {
        $list = $hits ?: $equipment;
        $reply = "Equipment in stock (exact availability for your date is shown on the Reserve page):\n" . implode("\n", array_map(
            fn($e) => "- {$e['equipment_name']}: {$e['quantity_available']} ({$e['availability_status']})", array_slice(array_values($list), 0, 10)));
    }
}
out(['reply' => $reply ?? "I'm not sure about that one. I can help with equipment availability, how to reserve, reservation status, penalties and returns, or please ask the Property Office.", 'mode' => 'basic']);
