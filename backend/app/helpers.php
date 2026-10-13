<?php
declare(strict_types=1);

// ---------------------------------------------------------------------------
// General
// ---------------------------------------------------------------------------

const ROLES = [
    'admin'     => 'Administrator',
    'trainer'   => 'Trainer',
    'team_lead' => 'Team Lead',
    'agent'     => 'Agent',
];

function config(string $key, mixed $default = null): mixed
{
    return $GLOBALS['config'][$key] ?? $default;
}

function e(mixed $v): string
{
    return htmlspecialchars((string)($v ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function now(): string
{
    return date('Y-m-d H:i:s');
}

function today(): string
{
    return date('Y-m-d');
}

function base_url(): string
{
    $b = (string)config('base_url', '');
    if ($b === '') {
        $script = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '');
        $b = rtrim(dirname($script), '/');
        if ($b === '.' || $b === '/') {
            $b = '';
        }
    }
    return rtrim($b, '/');
}

function url(string $path = '/', array $query = []): string
{
    $u = base_url() . '/' . ltrim($path, '/');
    return $query ? $u . '?' . http_build_query($query) : $u;
}

function absolute_url(string $path = '/'): string
{
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    return ($https ? 'https' : 'http') . '://' . $host . url($path);
}

function asset(string $path): string
{
    $file = FRONTEND . '/public/assets/' . $path;
    $v = is_file($file) ? filemtime($file) : 1;
    return url('assets/' . $path) . '?v=' . $v;
}

function redirect(string $path, array $query = []): never
{
    header('Location: ' . url($path, $query));
    exit;
}

function back(string $fallback = '/'): never
{
    $ref = $_SERVER['HTTP_REFERER'] ?? '';
    $host = $_SERVER['HTTP_HOST'] ?? '';
    if ($ref && parse_url($ref, PHP_URL_HOST) === $host) {
        header('Location: ' . $ref);
        exit;
    }
    redirect($fallback);
}

function abort(int $code, string $message = ''): never
{
    http_response_code($code);
    $titles = [403 => 'Access denied', 404 => 'Page not found', 419 => 'Session expired', 500 => 'Something went wrong'];
    echo view('error', ['code' => $code, 'title' => $titles[$code] ?? 'Error', 'message' => $message]);
    exit;
}

function input(string $key, mixed $default = ''): mixed
{
    $v = $_POST[$key] ?? $_GET[$key] ?? $default;
    return is_string($v) ? trim($v) : $v;
}

function input_int(string $key, ?int $default = null): ?int
{
    $v = input($key, '');
    return ($v === '' || !is_numeric($v)) ? $default : (int)$v;
}

function checked(string $key): int
{
    return isset($_POST[$key]) && $_POST[$key] !== '0' ? 1 : 0;
}

function is_post(): bool
{
    return ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST';
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function view(string $name, array $data = [], ?string $layout = 'layout'): string
{
    $render = function (string $__file, array $__data): string {
        extract($__data, EXTR_SKIP);
        ob_start();
        require $__file;
        return (string)ob_get_clean();
    };
    $content = $render(FRONTEND . '/views/' . $name . '.php', $data);
    if ($layout === null) {
        return $content;
    }
    return $render(FRONTEND . '/views/' . $layout . '.php', $data + ['content' => $content]);
}

function partial(string $name, array $data = []): string
{
    return view($name, $data, null);
}

// ---------------------------------------------------------------------------
// Session, flash messages, CSRF
// ---------------------------------------------------------------------------

function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    session_name('shaggar_lms');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => preg_replace('#/public$#', '', base_url()) ?: '/',
        'httponly' => true,
        'secure' => $https,
        'samesite' => 'Lax',
    ]);
    session_start();
}

function flash(string $type, string $message): void
{
    $_SESSION['flash'][] = ['type' => $type, 'message' => $message];
}

function take_flashes(): array
{
    $f = $_SESSION['flash'] ?? [];
    unset($_SESSION['flash']);
    return $f;
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function csrf_field(): string
{
    return '<input type="hidden" name="_csrf" value="' . e(csrf_token()) . '">';
}

function verify_csrf(): void
{
    $sent = (string)($_POST['_csrf'] ?? '');
    if ($sent === '' || !hash_equals(csrf_token(), $sent)) {
        abort(419, 'Your session expired or the form was out of date. Please go back, refresh the page and try again.');
    }
}

// ---------------------------------------------------------------------------
// Authentication and roles
// ---------------------------------------------------------------------------

function user(): ?array
{
    static $cache = null;
    if ($cache !== null && ($cache['id'] ?? 0) === ($_SESSION['user_id'] ?? -1)) {
        return $cache;
    }
    if (empty($_SESSION['user_id'])) {
        return null;
    }
    $u = DB::one('SELECT u.*, t.name AS team_name FROM users u LEFT JOIN teams t ON t.id = u.team_id WHERE u.id = ? AND u.active = 1', [$_SESSION['user_id']]);
    if (!$u) {
        unset($_SESSION['user_id']);
        return null;
    }
    $u['id'] = (int)$u['id'];
    return $cache = $u;
}

function uid(): int
{
    return (int)(user()['id'] ?? 0);
}

function has_role(string ...$roles): bool
{
    $u = user();
    return $u !== null && in_array($u['role'], $roles, true);
}

function require_login(): array
{
    $u = user();
    if (!$u) {
        $_SESSION['intended'] = $_SERVER['REQUEST_URI'] ?? '';
        redirect('/login');
    }
    return $u;
}

function require_role(string ...$roles): array
{
    $u = require_login();
    if (!in_array($u['role'], $roles, true)) {
        abort(403, 'You do not have permission to open this page.');
    }
    return $u;
}

function is_staff(): bool
{
    return has_role('admin', 'trainer');
}

/**
 * Team ids whose people the current user may see in reports.
 * null = every team (admin and trainer).
 */
function visible_team_ids(): ?array
{
    if (has_role('admin', 'trainer')) {
        return null;
    }
    if (has_role('team_lead')) {
        return array_map('intval', array_column(DB::all('SELECT id FROM teams WHERE lead_id = ?', [uid()]), 'id'));
    }
    return [];
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function fmt_date(?string $d, string $format = 'j M Y'): string
{
    if (!$d) {
        return '—';
    }
    $t = strtotime($d);
    return $t ? date($format, $t) : '—';
}

function fmt_datetime(?string $d): string
{
    return fmt_date($d, 'j M Y, H:i');
}

function initials(string $name): string
{
    $parts = preg_split('/\s+/u', trim($name)) ?: [];
    $s = '';
    foreach (array_slice($parts, 0, 2) as $p) {
        $s .= mb_strtoupper(mb_substr($p, 0, 1));
    }
    return $s ?: '?';
}

function plural(int $n, string $one, ?string $many = null): string
{
    return $n . ' ' . ($n === 1 ? $one : ($many ?? $one . 's'));
}

function pct_class(int $pct): string
{
    return $pct >= 100 ? 'done' : ($pct >= 50 ? 'mid' : ($pct > 0 ? 'low' : 'none'));
}

/**
 * Very small, safe Markdown subset for lesson text:
 * # / ## / ### headings, **bold**, *italic*, `code`, [links](https://…),
 * "- " bullet lists, "1. " numbered lists, "> " notes, blank-line paragraphs.
 * Everything is escaped first, so trainers cannot inject HTML or scripts.
 */
function render_text(?string $text): string
{
    $text = str_replace(["\r\n", "\r"], "\n", (string)$text);
    $lines = explode("\n", $text);
    $html = '';
    $para = [];
    $list = null;

    $inline = function (string $s): string {
        $s = e($s);
        $s = preg_replace('/\*\*(.+?)\*\*/u', '<strong>$1</strong>', $s);
        $s = preg_replace('/(?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?![*\w])/u', '<em>$1</em>', $s);
        $s = preg_replace('/`([^`]+)`/u', '<code>$1</code>', $s);
        $s = preg_replace_callback('/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/u', function ($m) {
            return '<a href="' . $m[2] . '" target="_blank" rel="noopener noreferrer">' . $m[1] . '</a>';
        }, $s);
        return $s;
    };
    $flushPara = function () use (&$para, &$html, $inline) {
        if ($para) {
            $html .= '<p>' . implode('<br>', array_map($inline, $para)) . "</p>\n";
            $para = [];
        }
    };
    $closeList = function () use (&$list, &$html) {
        if ($list) {
            $html .= "</$list>\n";
            $list = null;
        }
    };

    foreach ($lines as $line) {
        $t = rtrim($line);
        if ($t === '') {
            $flushPara();
            $closeList();
            continue;
        }
        if (preg_match('/^(#{1,3})\s+(.*)$/u', $t, $m)) {
            $flushPara();
            $closeList();
            $lvl = strlen($m[1]) + 1; // # -> h2
            $html .= "<h$lvl>" . $inline($m[2]) . "</h$lvl>\n";
        } elseif (preg_match('/^\s*[-*]\s+(.*)$/u', $t, $m)) {
            $flushPara();
            if ($list !== 'ul') {
                $closeList();
                $html .= "<ul>\n";
                $list = 'ul';
            }
            $html .= '<li>' . $inline($m[1]) . "</li>\n";
        } elseif (preg_match('/^\s*\d+[.)]\s+(.*)$/u', $t, $m)) {
            $flushPara();
            if ($list !== 'ol') {
                $closeList();
                $html .= "<ol>\n";
                $list = 'ol';
            }
            $html .= '<li>' . $inline($m[1]) . "</li>\n";
        } elseif (preg_match('/^>\s?(.*)$/u', $t, $m)) {
            $flushPara();
            $closeList();
            $html .= '<blockquote>' . $inline($m[1]) . "</blockquote>\n";
        } else {
            $closeList();
            $para[] = $t;
        }
    }
    $flushPara();
    $closeList();
    return $html;
}

/** Returns embeddable HTML for a YouTube / Vimeo / direct video URL, or '' if unsupported. */
function video_embed(?string $url): string
{
    $url = trim((string)$url);
    if ($url === '') {
        return '';
    }
    if (preg_match('~(?:youtube\.com/(?:watch\?(?:.*&)?v=|embed/|shorts/)|youtu\.be/)([A-Za-z0-9_-]{11})~', $url, $m)) {
        return '<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/' . $m[1] . '" title="Lesson video" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>';
    }
    if (preg_match('~vimeo\.com/(?:video/)?(\d+)~', $url, $m)) {
        return '<div class="video"><iframe src="https://player.vimeo.com/video/' . $m[1] . '" title="Lesson video" allow="fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>';
    }
    if (preg_match('~^https?://\S+\.(mp4|webm|ogg)(\?\S*)?$~i', $url)) {
        return '<div class="video"><video controls preload="metadata" src="' . e($url) . '"></video></div>';
    }
    return '';
}

/** Allowed lesson file types => MIME type. */
const UPLOAD_TYPES = [
    'pdf' => 'application/pdf',
    'mp4' => 'video/mp4', 'webm' => 'video/webm', 'mp3' => 'audio/mpeg', 'm4a' => 'audio/mp4', 'wav' => 'audio/wav',
    'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'gif' => 'image/gif',
    'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'txt' => 'text/plain', 'csv' => 'text/csv',
];

function file_kind(?string $name): string
{
    $ext = strtolower(pathinfo((string)$name, PATHINFO_EXTENSION));
    return match (true) {
        $ext === 'pdf' => 'pdf',
        in_array($ext, ['mp4', 'webm'], true) => 'video',
        in_array($ext, ['mp3', 'm4a', 'wav'], true) => 'audio',
        in_array($ext, ['png', 'jpg', 'jpeg', 'gif'], true) => 'image',
        default => 'download',
    };
}

/**
 * Stores an uploaded file under the uploads directory.
 * Returns [stored_name, original_name] or throws RuntimeException with a user-facing message.
 */
function store_upload(array $file): array
{
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        $msg = match ($file['error'] ?? 0) {
            UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'The file is larger than the server allows (upload_max_filesize in php.ini).',
            UPLOAD_ERR_PARTIAL => 'The upload was interrupted. Please try again.',
            default => 'The file could not be uploaded.',
        };
        throw new RuntimeException($msg);
    }
    $max = (int)config('max_upload_mb', 200) * 1024 * 1024;
    if ($file['size'] > $max) {
        throw new RuntimeException('The file is larger than ' . config('max_upload_mb') . ' MB.');
    }
    $orig = basename((string)$file['name']);
    $ext = strtolower(pathinfo($orig, PATHINFO_EXTENSION));
    if (!isset(UPLOAD_TYPES[$ext])) {
        throw new RuntimeException('That file type is not allowed. Allowed: ' . implode(', ', array_keys(UPLOAD_TYPES)) . '.');
    }
    $dir = (string)config('uploads_dir');
    if (!is_dir($dir) && !mkdir($dir, 0775, true)) {
        throw new RuntimeException('The uploads folder could not be created. Check folder permissions.');
    }
    $stored = bin2hex(random_bytes(16)) . '.' . $ext;
    if (!move_uploaded_file($file['tmp_name'], $dir . '/' . $stored)) {
        throw new RuntimeException('The file could not be saved. Check that the uploads folder is writable.');
    }
    return [$stored, $orig];
}

function delete_upload(?string $stored): void
{
    if ($stored && preg_match('/^[a-f0-9]{32}\.[a-z0-9]+$/', $stored)) {
        @unlink(config('uploads_dir') . '/' . $stored);
    }
}

/** Streams a file with HTTP Range support so videos can be seeked. */
function send_file(string $path, string $downloadName, bool $inline): never
{
    if (!is_file($path)) {
        abort(404, 'The file is missing on the server.');
    }
    $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
    $mime = UPLOAD_TYPES[$ext] ?? 'application/octet-stream';
    $size = filesize($path);
    $start = 0;
    $end = $size - 1;

    while (ob_get_level()) {
        ob_end_clean();
    }
    header('Content-Type: ' . $mime);
    header('Accept-Ranges: bytes');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, max-age=3600');
    $safeName = str_replace(['"', "\r", "\n"], '', $downloadName);
    header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . '; filename="' . $safeName . '"; filename*=UTF-8\'\'' . rawurlencode($downloadName));

    if (isset($_SERVER['HTTP_RANGE']) && preg_match('/bytes=(\d*)-(\d*)/', $_SERVER['HTTP_RANGE'], $m)) {
        if ($m[1] === '' && $m[2] !== '') {
            $start = max(0, $size - (int)$m[2]);
        } else {
            $start = (int)$m[1];
            if ($m[2] !== '') {
                $end = min((int)$m[2], $size - 1);
            }
        }
        if ($start > $end || $start >= $size) {
            http_response_code(416);
            header("Content-Range: bytes */$size");
            exit;
        }
        http_response_code(206);
        header("Content-Range: bytes $start-$end/$size");
    }
    $length = $end - $start + 1;
    header('Content-Length: ' . $length);

    $fp = fopen($path, 'rb');
    fseek($fp, $start);
    $left = $length;
    while ($left > 0 && !feof($fp)) {
        $chunk = fread($fp, (int)min(1024 * 256, $left));
        echo $chunk;
        $left -= strlen($chunk);
        flush();
    }
    fclose($fp);
    exit;
}

function csv_download(string $filename, array $header, iterable $rows): never
{
    header('Content-Type: text/csv; charset=UTF-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF"); // BOM so Excel reads Amharic and other UTF-8 text correctly
    fputcsv($out, $header, ',', '"', '');
    foreach ($rows as $r) {
        // Neutralise spreadsheet formulas in user-entered text
        $r = array_map(fn($v) => is_string($v) && preg_match('/^[=+\-@\t\r]/', $v) ? "'" . $v : $v, $r);
        fputcsv($out, $r, ',', '"', '');
    }
    fclose($out);
    exit;
}

function random_password(int $len = 10): string
{
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    $p = '';
    for ($i = 0; $i < $len; $i++) {
        $p .= $chars[random_int(0, strlen($chars) - 1)];
    }
    return $p;
}

// ---------------------------------------------------------------------------
// Small UI helpers used by the views
// ---------------------------------------------------------------------------

/** Inline SVG icons (no external icon font, so pages stay light on slow connections). */
function icon(string $name, string $class = 'icon'): string
{
    static $paths = [
        'home' => '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
        'book' => '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/><path d="M8 7h7"/>',
        'award' => '<circle cx="12" cy="9" r="6"/><path d="M8.5 14l-1.5 7 5-3 5 3-1.5-7"/>',
        'edit' => '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
        'users' => '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5a5 5 0 0 1 5.5 5.5"/>',
        'team' => '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M9 4v16"/>',
        'chart' => '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>',
        'key' => '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9"/><path d="M17 6l3 3"/>',
        'logout' => '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h10"/>',
        'check' => '<path d="M5 12.5l4.5 4.5L19 7"/>',
        'play' => '<path d="M7 4l13 8-13 8z"/>',
        'file' => '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>',
        'text' => '<path d="M5 6h14"/><path d="M5 11h14"/><path d="M5 16h9"/>',
        'quiz' => '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
        'clock' => '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
        'plus' => '<path d="M12 5v14"/><path d="M5 12h14"/>',
        'trash' => '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
        'up' => '<path d="M6 15l6-6 6 6"/>',
        'down' => '<path d="M6 9l6 6 6-6"/>',
        'arrow-right' => '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
        'arrow-left' => '<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>',
        'download' => '<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/>',
        'search' => '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
        'alert' => '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
        'lock' => '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
        'eye' => '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
        'upload' => '<path d="M12 20V9"/><path d="M7 14l5-5 5 5"/><path d="M5 4h14"/>',
        'menu' => '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>',
        'x' => '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
        'print' => '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="1.5"/><path d="M7 14h10v7H7z"/>',
    ];
    return '<svg class="' . e($class) . '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' . ($paths[$name] ?? '') . '</svg>';
}

function progress_bar(int $pct, string $label = ''): string
{
    $pct = max(0, min(100, $pct));
    return '<div class="progress ' . pct_class($pct) . '" role="progressbar" aria-valuenow="' . $pct . '" aria-valuemin="0" aria-valuemax="100"' . ($label ? ' aria-label="' . e($label) . '"' : '') . '><span style="width:' . $pct . '%"></span></div>';
}

function badge(string $text, string $tone = 'neutral'): string
{
    return '<span class="badge badge-' . e($tone) . '">' . e($text) . '</span>';
}

function enrolment_badge(?string $completedAt, ?string $dueDate, int $pct): string
{
    if ($completedAt) {
        return badge('Completed', 'success');
    }
    if ($dueDate && $dueDate < today()) {
        return badge('Overdue', 'danger');
    }
    return $pct > 0 ? badge('In progress', 'info') : badge('Not started', 'neutral');
}

function lesson_icon(string $type): string
{
    return icon(['video' => 'play', 'file' => 'file'][$type] ?? 'text');
}

/** Renders a small POST form with a single button (delete, move, etc.). */
function post_button(string $action, string $label, string $class = 'btn btn-ghost', ?string $confirm = null, array $fields = [], ?string $aria = null): string
{
    $h = '<form method="post" action="' . e(url($action)) . '" class="inline-form"' . ($confirm ? ' data-confirm="' . e($confirm) . '"' : '') . '>' . csrf_field();
    foreach ($fields as $k => $v) {
        $h .= '<input type="hidden" name="' . e($k) . '" value="' . e($v) . '">';
    }
    return $h . '<button type="submit" class="' . e($class) . '"' . ($aria ? ' aria-label="' . e($aria) . '" title="' . e($aria) . '"' : '') . '>' . $label . '</button></form>';
}
