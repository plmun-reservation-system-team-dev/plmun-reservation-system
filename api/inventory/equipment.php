<?php
require_once __DIR__ . '/../../config/bootstrap.php';
$me = need_login();
$isAdmin = $me['role'] === 'admin';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $id = (int)($_GET['id'] ?? 0);
    $sql = "SELECT e.*, c.category_name,
        COALESCE((SELECT SUM(ri.quantity_requested) FROM reservation_item ri JOIN reservation r ON r.reservation_id=ri.reservation_id
                  WHERE ri.equipment_id=e.equipment_id AND r.reservation_status IN ('Approved','Borrowed','Completed')),0) AS popularity,
        COALESCE((SELECT SUM(bi.quantity_released) FROM borrowing_item bi JOIN reservation_item ri ON ri.reservation_item_id=bi.reservation_item_id
                  WHERE ri.equipment_id=e.equipment_id),0) AS total_released,
        (SELECT COUNT(*) FROM return_item rt JOIN borrowing_item bi ON bi.borrowing_item_id=rt.borrowing_item_id
                  JOIN reservation_item ri ON ri.reservation_item_id=bi.reservation_item_id
                  WHERE ri.equipment_id=e.equipment_id AND rt.condition_on_return IN ('Damaged','Lost','Needs Repair')) AS incidents,
        COALESCE((SELECT AVG(rv.rating) FROM review rv WHERE rv.equipment_id=e.equipment_id),0) AS rating_avg,
        (SELECT COUNT(*) FROM review rv WHERE rv.equipment_id=e.equipment_id) AS rating_count
        FROM equipment e JOIN equipment_category c ON c.category_id=e.category_id";
    $where = []; $p = [];
    if ($id) { $where[] = 'e.equipment_id=?'; $p[] = $id; }
    if (!$isAdmin) $where[] = "e.condition_status<>'Retired'";
    if (!empty($_GET['category'])) { $where[] = 'e.category_id=?'; $p[] = (int)$_GET['category']; }
    if (!empty($_GET['q'])) { $where[] = '(e.equipment_name LIKE ? OR e.description LIKE ?)'; $p[] = '%' . $_GET['q'] . '%'; $p[] = '%' . $_GET['q'] . '%'; }
    if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
    $sql .= ' ORDER BY c.category_name, e.equipment_name';
    $rows = q($sql, $p)->fetchAll();

    $resv = [];
    $date = s($_GET['date'] ?? ''); $st = s($_GET['start'] ?? ''); $en = s($_GET['end'] ?? '');
    $windowed = $date && $st && $en && $st < $en;
    if ($windowed) $resv = reserved_map($date, $st, $en);
    // Units already tied up by live reservations (Pending / Approved / Borrowed, not yet past), so "in stock" drops as soon as someone books.
    $held = [];
    foreach (q("SELECT ri.equipment_id, SUM(ri.quantity_requested) AS qty
                FROM reservation_item ri JOIN reservation r ON r.reservation_id = ri.reservation_id
                WHERE r.reservation_status IN ('Pending','Approved','Borrowed')
                  AND (r.reservation_status = 'Borrowed' OR r.event_date >= CURDATE())
                GROUP BY ri.equipment_id") as $h) $held[(int)$h['equipment_id']] = (int)$h['qty'];
    foreach ($rows as &$r) {
        $r['in_stock'] = max(0, (int)$r['quantity_available'] - ($held[(int)$r['equipment_id']] ?? 0));
        $r['reservable'] = is_reservable($r);
        $r['reserved'] = $resv[(int)$r['equipment_id']] ?? 0;
        $r['available'] = $r['reservable'] ? max(0, (int)$r['quantity_available'] - $r['reserved']) : 0;
        $r['window_checked'] = $windowed;
    }
    unset($r);
    if ($id) {
        if (!$rows) fail('Equipment not found.', 404);
        // newest reviews first; the name falls back to the e-mail so a reviewer is never shown as blank
        $reviews = q("SELECT rv.review_id, rv.rating, rv.comment, rv.review_date, u.user_type, r.event_name,
                COALESCE(NULLIF(TRIM(u.full_name),''), NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)),''), u.email) AS full_name
            FROM review rv JOIN reservation r ON r.reservation_id=rv.reservation_id JOIN users u ON u.user_id=rv.user_id
            WHERE rv.equipment_id=? ORDER BY rv.review_date DESC, rv.review_id DESC LIMIT 50", [$id])->fetchAll();
        $summary = q("SELECT COUNT(*) total, COALESCE(AVG(rating),0) avg, COALESCE(SUM(rating=5),0) s5, COALESCE(SUM(rating=4),0) s4,
                COALESCE(SUM(rating=3),0) s3, COALESCE(SUM(rating=2),0) s2, COALESCE(SUM(rating=1),0) s1
            FROM review WHERE equipment_id=?", [$id])->fetch();
        out(['equipment' => $rows[0], 'reviews' => $reviews, 'summary' => $summary]);
    }
    out(['equipment' => $rows]);
}

// ---- admin write actions ----
need_admin();
$b = body();
$action = $b['action'] ?? '';

if ($action === 'delete') {
    try { q("DELETE FROM equipment WHERE equipment_id=?", [(int)$b['id']]); }
    catch (PDOException $e) { fail('This item has reservation history and cannot be deleted. Set it to Retired instead.', 409); }
    out();
}
if ($action === 'save') {
    $id = (int)($b['equipment_id'] ?? 0);
    $name = s($b['equipment_name'] ?? '');
    if ($name === '' || empty($b['category_id'])) fail('Name and category are required.');
    $qty = (int)($b['quantity_available'] ?? 0);
    if ($qty < 0) fail('Quantity cannot be negative.');
    $cond = in_array($b['condition_status'] ?? '', ['Excellent','Good','Fair','Needs Repair','Damaged','Retired'], true) ? $b['condition_status'] : 'Good';
    $avail = in_array($b['availability_status'] ?? '', ['Available','Reserved','Borrowed','Unavailable','Under Maintenance'], true) ? $b['availability_status'] : 'Available';
    if ($cond === 'Retired') $avail = 'Unavailable';

    $image = null;
    if (!empty($_FILES['image']['tmp_name'])) {
        $f = $_FILES['image'];
        $ext = strtolower(pathinfo($f['name'], PATHINFO_EXTENSION));
        if (!in_array($ext, ['jpg','jpeg','png','webp'], true)) fail('Image must be JPG, PNG or WEBP.');
        if ($f['size'] > 2 * 1024 * 1024) fail('Image must be 2 MB or smaller.');
        $fn = 'eq_' . bin2hex(random_bytes(6)) . '.' . $ext;
        if (!move_uploaded_file($f['tmp_name'], __DIR__ . '/../../assets/uploads/' . $fn)) fail('Could not save the image.');
        $image = 'assets/uploads/' . $fn;
    }
    if ($id) {
        q("UPDATE equipment SET category_id=?, equipment_name=?, description=?, quantity_available=?, condition_status=?, availability_status=?" .
          ($image ? ", image=?" : "") . " WHERE equipment_id=?",
          array_merge([(int)$b['category_id'], $name, s($b['description'] ?? '') ?: null, $qty, $cond, $avail], $image ? [$image] : [], [$id]));
    } else {
        q("INSERT INTO equipment (category_id,equipment_name,description,image,quantity_available,condition_status,availability_status) VALUES (?,?,?,?,?,?,?)",
          [(int)$b['category_id'], $name, s($b['description'] ?? '') ?: null, $image, $qty, $cond, $avail]);
    }
    out([], 201);
}
fail('Unknown action.', 404);
