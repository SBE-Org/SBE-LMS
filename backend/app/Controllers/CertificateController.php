<?php
declare(strict_types=1);

namespace App\Controllers;

use DB;

final class CertificateController
{
    public function mine(): string
    {
        $u = require_login();
        $certs = DB::all(
            'SELECT ce.*, c.title, c.category FROM certificates ce JOIN courses c ON c.id = ce.course_id WHERE ce.user_id = ? ORDER BY ce.issued_at DESC',
            [$u['id']]
        );
        return view('certificates', ['certificates' => $certs, 'title' => 'My certificates']);
    }

    private function find(string $code): ?array
    {
        return DB::one(
            'SELECT ce.*, c.title AS course_title, u.name AS learner_name, u.employee_id
             FROM certificates ce
             JOIN courses c ON c.id = ce.course_id
             JOIN users u ON u.id = ce.user_id
             WHERE ce.code = ?',
            [strtoupper(trim($code))]
        );
    }

    public function show(string $code): string
    {
        $u = require_login();
        $cert = $this->find($code);
        if (!$cert) {
            abort(404, 'Certificate not found.');
        }
        $teamOk = has_role('team_lead') && in_array((int)DB::val('SELECT team_id FROM users WHERE id = ?', [$cert['user_id']]), visible_team_ids() ?? [], true);
        if ((int)$cert['user_id'] !== $u['id'] && !has_role('admin', 'trainer') && !$teamOk) {
            abort(403);
        }
        return view('certificate', ['cert' => $cert, 'verifyUrl' => absolute_url('/verify') . '?code=' . rawurlencode($cert['code'])], null);
    }

    /** Public page: anyone can check that a certificate code is genuine. */
    public function verify(): string
    {
        $code = (string)input('code');
        $cert = $code !== '' ? $this->find($code) : null;
        return view('verify', ['code' => $code, 'cert' => $cert, 'title' => 'Verify a certificate'], 'layout_plain');
    }
}
