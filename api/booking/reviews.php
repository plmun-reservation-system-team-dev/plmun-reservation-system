<?php
require_once __DIR__ . '/../../config/bootstrap.php';
$me = need_login();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $limit = min(max((int)($_GET['limit'] ?? 200), 1), 500);
    $reviews = q("SELECT rv.review_id, rv.equipment_id, e.equipment_name, c.category_name, rv.rating, rv.comment, rv.review_date,
            u.full_name, u.user_type, r.event_name
        FROM review rv
        JOIN equipment e ON e.equipment_id=rv.equipment_id JOIN equipment_category c ON c.category_id=e.category_id
        JOIN users u ON u.user_id=rv.user_id JOIN reservation r ON r.reservation_id=rv.reservation_id
        ORDER BY rv.review_date DESC, rv.review_id DESC LIMIT $limit")->fetchAll();

    // one summary row per product (only products that have at least one review)
    $products = q("SELECT e.equipment_id, e.equipment_name, e.image, c.category_name, COUNT(*) total, AVG(rv.rating) avg,
            SUM(rv.rating=5) s5, SUM(rv.rating=4) s4, SUM(rv.rating=3) s3, SUM(rv.rating=2) s2, SUM(rv.rating=1) s1
        FROM review rv JOIN equipment e ON e.equipment_id=rv.equipment_id JOIN equipment_category c ON c.category_id=e.category_id
        GROUP BY e.equipment_id, e.equipment_name, e.image, c.category_name
        ORDER BY e.equipment_name")->fetchAll();

    $sum = q("SELECT COUNT(*) total, COALESCE(AVG(rating),0) avg FROM review")->fetch();

    $eligible = [];
    // reviewable as soon as the items were released (Borrowed) and stays listed until reviewed
    if ($me['role'] === 'user')
        $eligible = q("SELECT r.reservation_id, r.event_name, r.event_date, e.equipment_id, e.equipment_name
            FROM reservation r JOIN reservation_item ri ON ri.reservation_id=r.reservation_id
            JOIN equipment e ON e.equipment_id=ri.equipment_id
            WHERE r.user_id=? AND r.reservation_status IN ('Borrowed','Completed')
              AND NOT EXISTS (SELECT 1 FROM review v WHERE v.reservation_id=r.reservation_id AND v.equipment_id=ri.equipment_id)
            ORDER BY r.event_date DESC, e.equipment_name", [$me['id']])->fetchAll();
    out(['reviews' => $reviews, 'products' => $products, 'summary' => $sum, 'eligible' => $eligible]);
}

$u = need_user();
$b = body();
$rating = (int)($b['rating'] ?? 0);
$rid = (int)($b['reservation_id'] ?? 0);
$eid = (int)($b['equipment_id'] ?? 0);
if ($rating < 1 || $rating > 5) fail('Please choose a rating from 1 to 5 stars.');
if (!$eid) fail('Please choose the product you are reviewing.');
$r = q("SELECT reservation_status FROM reservation WHERE reservation_id=? AND user_id=?", [$rid, $u['id']])->fetch();
if (!$r || !in_array($r['reservation_status'], ['Borrowed', 'Completed'], true)) fail('You can review items once you have borrowed them.');
if (!q("SELECT 1 FROM reservation_item WHERE reservation_id=? AND equipment_id=?", [$rid, $eid])->fetch())
    fail('That product was not part of this reservation.');
if (q("SELECT 1 FROM review WHERE reservation_id=? AND equipment_id=?", [$rid, $eid])->fetch()) fail('You already reviewed this product for this reservation.', 409);
q("INSERT INTO review (user_id,reservation_id,equipment_id,rating,comment) VALUES (?,?,?,?,?)", [$u['id'], $rid, $eid, $rating, s($b['comment'] ?? '') ?: null]);
out([], 201);
