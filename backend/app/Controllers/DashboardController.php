<?php
declare(strict_types=1);

namespace App\Controllers;

use DB;
use Progress;

final class DashboardController
{
    public function index(): string
    {
        $u = require_login();

        $enrolments = DB::all(
            "SELECT e.*, c.title, c.summary, c.category
             FROM enrolments e JOIN courses c ON c.id = e.course_id
             WHERE e.user_id = ? AND c.status = 'published'
             ORDER BY CASE WHEN e.completed_at IS NULL THEN 0 ELSE 1 END, e.due_date, c.title",
            [$u['id']]
        );
        $courseIds = array_map(fn($e) => (int)$e['course_id'], $enrolments);
        $progress = Progress::map([$u['id']], $courseIds ?: [0])[$u['id']] ?? [];
        $totals = Progress::courseTotals($courseIds ?: [0]);

        $active = [];
        $completed = [];
        foreach ($enrolments as $e) {
            $cid = (int)$e['course_id'];
            $e['progress'] = $progress[$cid] ?? ['pct' => 0, 'done' => 0, 'total' => $totals[$cid]['total'] ?? 0];
            $e['overdue'] = !$e['completed_at'] && $e['due_date'] && $e['due_date'] < today();
            if ($e['completed_at']) {
                $completed[] = $e;
            } else {
                $active[] = $e;
            }
        }

        // "Continue where you left off": the first active course that has been started
        $resume = null;
        foreach ($active as $e) {
            $o = Progress::outline((int)$e['course_id'], $u['id']);
            if ($o['next']) {
                $resume = ['course' => $e, 'next' => $o['next']];
                if ($e['progress']['pct'] > 0) {
                    break;
                }
            }
        }

        $certificates = DB::all(
            'SELECT ce.*, c.title FROM certificates ce JOIN courses c ON c.id = ce.course_id WHERE ce.user_id = ? ORDER BY ce.issued_at DESC LIMIT 4',
            [$u['id']]
        );

        $snapshot = null;
        if (has_role('admin', 'trainer', 'team_lead')) {
            $snapshot = ReportController::summary(visible_team_ids());
        }

        return view('dashboard', [
            'user' => $u,
            'active' => $active,
            'completed' => $completed,
            'resume' => $resume,
            'certificates' => $certificates,
            'snapshot' => $snapshot,
            'title' => 'Dashboard',
        ]);
    }
}
