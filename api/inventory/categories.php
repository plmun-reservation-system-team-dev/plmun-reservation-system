<?php
require_once __DIR__ . '/../../config/bootstrap.php';
need_login();
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    out(['categories' => q("SELECT c.*, COUNT(e.equipment_id) AS items FROM equipment_category c
        LEFT JOIN equipment e ON e.category_id=c.category_id GROUP BY c.category_id ORDER BY c.category_name")->fetchAll()]);
}
need_admin();
$b = body();
if (($b['action'] ?? '') === 'add') {
    $n = s($b['category_name'] ?? '');
    if ($n === '') fail('Category name is required.');
    try { q("INSERT INTO equipment_category (category_name,description) VALUES (?,?)", [$n, s($b['description'] ?? '') ?: null]); }
    catch (PDOException $e) { fail('That category already exists.', 409); }
    out([], 201);
}
if (($b['action'] ?? '') === 'delete') {
    try { q("DELETE FROM equipment_category WHERE category_id=?", [(int)$b['id']]); }
    catch (PDOException $e) { fail('Category still has equipment. Move or remove those items first.', 409); }
    out();
}
fail('Unknown action.', 404);
