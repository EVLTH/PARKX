<?php
/* =====================================================================
   PARKX – serveur de données partagé (api.php)
   À déposer avec le site sur l'hébergement (FTP). Nécessite PHP 7.4 ou plus.
   Les données sont enregistrées dans le dossier « donnees » (créé automatiquement) :
     - parkx-donnees.php : toutes les données du projet (illisibles depuis le web) ;
     - fichiers/         : photos et documents (noms impossibles à deviner) ;
     - sauvegardes/      : une copie automatique par jour (30 jours conservés).
   by Matthias AS Evan G
   ===================================================================== */

// ----- RÉGLAGES -------------------------------------------------------
// Code d'accès de l'équipe. Laissez '' pour un accès libre à toute personne qui a l'adresse du site.
// Exemple : $CODE_ACCES = 'parking2026';
$CODE_ACCES = '';

// Taille maximale d'une photo ou d'un document envoyé (en Mo).
$TAILLE_MAX_MO = 40;
// ---------------------------------------------------------------------

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex, nofollow');

// Première ligne de chaque fichier de données : ouvert depuis le web, il ne renvoie rien.
define('GARDE', "<?php http_response_code(404); exit; __halt_compiler();\n");
define('JSON_OPTS', JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);

$DIR = __DIR__ . '/donnees';
$DB = "$DIR/parkx-donnees.php";
$FILES = "$DIR/fichiers";
$SAUV = "$DIR/sauvegardes";
$COLLS = ['tasks', 'pcbs', 'photos', 'documents', 'journal', 'places', 'planVersions', 'activity'];
$KVS = ['project', 'planConfig', 'led', 'team'];

function reponse($data, $code = 200)
{
    http_response_code($code);
    echo json_encode($data, JSON_OPTS);
    exit;
}

function id_valide($id)
{
    return is_string($id) && preg_match('/^[A-Za-z0-9_-]{1,80}$/', $id) === 1;
}

function lire_garde($f)
{
    if (!is_file($f)) return null;
    $raw = @file_get_contents($f);
    if ($raw === false) return false;
    if (strncmp($raw, GARDE, strlen(GARDE)) === 0) return substr($raw, strlen(GARDE));
    return $raw;
}

function ecrire_garde($f, $contenu)
{
    $tmp = $f . '.tmp.php';
    if (@file_put_contents($tmp, GARDE . $contenu) === false) { @unlink($tmp); return false; }
    if (!@rename($tmp, $f)) {
        if (!@copy($tmp, $f)) { @unlink($tmp); return false; }
        @unlink($tmp);
    }
    return true;
}

function proteger($d)
{
    if (!is_dir($d)) @mkdir($d, 0755, true);
    if (is_dir($d) && !file_exists("$d/index.html")) @file_put_contents("$d/index.html", '');
}

function preparer($dir)
{
    proteger($dir);
    proteger("$dir/fichiers");
    proteger("$dir/sauvegardes");
    if (is_dir($dir) && !file_exists("$dir/.htaccess")) {
        @file_put_contents("$dir/.htaccess", "# Dossier privé de PARKX : aucun accès direct depuis le web\n<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n");
    }
    return is_dir($dir) && is_writable($dir) && is_dir("$dir/fichiers") && is_writable("$dir/fichiers");
}

/** Clé secrète propre à l'installation : sert à nommer les fichiers envoyés. */
function cle($dir)
{
    $f = "$dir/cle.php";
    $k = trim((string) lire_garde($f));
    if (strlen($k) >= 32) return $k;
    $k = bin2hex(random_bytes(20));
    $h = @fopen($f, 'x'); // création exclusive : une seule clé, même si deux requêtes arrivent ensemble
    if ($h) {
        fwrite($h, GARDE . $k);
        fclose($h);
        return $k;
    }
    usleep(200000);
    $k = trim((string) lire_garde($f));
    if (strlen($k) < 32) reponse(['error' => 'Clé de stockage illisible sur le serveur.'], 500);
    return $k;
}

function chemin($id)
{
    global $FILES, $CLE;
    return "$FILES/" . substr(hash('sha256', $CLE . '|' . $id), 0, 40);
}

function lire_base($db)
{
    $vide = ['rev' => 0, 'items' => [], 'kv' => []];
    $raw = lire_garde($db);
    if ($raw === null) return $vide;
    $j = $raw === false ? null : json_decode($raw, true);
    if (!is_array($j)) {
        // On ne réécrit jamais par-dessus un fichier illisible : rien n'est perdu
        reponse(['error' => "Fichier de données illisible sur le serveur : aucune modification n'a été faite. Voir « En cas de problème » dans INSTALLATION-FTP.txt."], 500);
    }
    return $j + $vide;
}

function ecrire_base($db, $data)
{
    $s = json_encode($data, JSON_OPTS);
    if ($s === false || !ecrire_garde($db, $s)) {
        reponse(['error' => "Écriture impossible dans le dossier « donnees » (espace disque ou droits) : rien n'a été modifié."], 500);
    }
}

function sauvegarde_du_jour($sauv, $db)
{
    $f = "$sauv/parkx-" . date('Y-m-d') . '.php';
    if (file_exists($f) || !is_file($db)) return;
    @copy($db, $f);
    $all = glob("$sauv/parkx-*.php") ?: [];
    sort($all);
    while (count($all) > 30) @unlink(array_shift($all));
}

function date_de($r)
{
    if (!is_array($r)) return '';
    return (string) ($r['updatedAt'] ?? ($r['at'] ?? ($r['_at'] ?? '')));
}

/** Date de la modification retenue par le serveur (la plus récente l'emporte). */
function t_de($r)
{
    return (string) ($r['_t'] ?? date_de($r));
}

function sortie($c, $id, $r)
{
    $t = t_de($r);
    if (!empty($r['_del'])) return ['c' => $c, 'id' => (string) $id, 'del' => true, 'at' => (string) ($r['_at'] ?? $t), 't' => $t];
    unset($r['_rev'], $r['_t']);
    return ['c' => $c, 'r' => $r, 't' => $t];
}

function supprimer_fichier($id)
{
    $p = chemin($id);
    @unlink("$p.bin");
    @unlink("$p.type");
}

// =====================================================================
$a = (string) ($_GET['a'] ?? '');

if ($a === 'ping') {
    reponse(['app' => 'PARKX', 'version' => 2, 'protected' => $CODE_ACCES !== '', 'stockage' => preparer($DIR)]);
}

if ($CODE_ACCES !== '' && !hash_equals((string) $CODE_ACCES, (string) ($_SERVER['HTTP_X_PARKX_CODE'] ?? ''))) {
    reponse(['error' => 'Code d’accès requis'], 401);
}

if (!preparer($DIR)) {
    reponse(['error' => "Le dossier « donnees » ne peut pas être créé ou modifié sur l'hébergement : donnez les droits d'écriture (755 ou 775) au dossier du site."], 500);
}

$ecriture = in_array($a, ['push', 'upload'], true);
if ($ecriture && ($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') reponse(['error' => 'Méthode non autorisée'], 405);
// En-tête ajouté par l'application : empêche un autre site d'envoyer des données à la place d'un membre
if ($ecriture && empty($_SERVER['HTTP_X_PARKX'])) reponse(['error' => 'Requête refusée'], 403);

if (in_array($a, ['push', 'upload', 'file'], true)) $CLE = cle($DIR);

$verrou = @fopen("$DIR/.verrou", 'c');
if (!$verrou) reponse(['error' => "Le dossier « donnees » n'est pas accessible en écriture."], 500);

// ----- Lecture des modifications depuis une révision donnée -----
if ($a === 'pull') {
    flock($verrou, LOCK_SH);
    $base = lire_base($DB);
    flock($verrou, LOCK_UN);
    $since = max(0, (int) ($_GET['since'] ?? 0));
    $items = [];
    foreach ($base['items'] as $c => $recs) {
        if (!is_array($recs)) continue;
        foreach ($recs as $id => $r) {
            if (is_array($r) && ($r['_rev'] ?? 0) > $since) $items[] = sortie($c, (string) $id, $r);
        }
    }
    $kv = [];
    foreach ($base['kv'] as $k => $e) {
        if (is_array($e) && ($e['_rev'] ?? 0) > $since) $kv[$k] = ['v' => $e['v'] ?? null, 'at' => (string) ($e['at'] ?? '')];
    }
    reponse(['rev' => (int) $base['rev'], 'items' => $items, 'kv' => (object) $kv]);
}

// ----- Envoi de modifications (la modification la plus récente l'emporte) -----
if ($a === 'push') {
    $raw = (string) file_get_contents('php://input');
    if (strlen($raw) > 20 * 1048576) reponse(['error' => 'Envoi trop volumineux'], 413);
    $corps = json_decode($raw, true);
    if (!is_array($corps)) reponse(['error' => 'Requête invalide'], 400);
    flock($verrou, LOCK_EX);
    $base = lire_base($DB);
    sauvegarde_du_jour($SAUV, $DB);
    $appliques = 0;
    $conflits = [];
    $kvConflits = [];
    foreach ((array) ($corps['changes'] ?? []) as $ch) {
        if (!is_array($ch)) continue;
        $c = (string) ($ch['c'] ?? '');
        if (!in_array($c, $COLLS, true)) continue;
        $suppr = !empty($ch['del']);
        $r = $suppr ? null : ($ch['r'] ?? null);
        if (!$suppr && !is_array($r)) continue;
        $id = $suppr ? ($ch['id'] ?? '') : ($r['id'] ?? '');
        if (!id_valide($id)) continue;
        $t = (string) ($suppr ? ($ch['at'] ?? '') : ($ch['t'] ?? date_de($r)));
        $cur = $base['items'][$c][$id] ?? null;
        if (is_array($cur)) {
            $ct = t_de($cur);
            if ($ct > $t) { $conflits[] = sortie($c, $id, $cur); continue; } // version du serveur plus récente : conservée
            if ($ct === $t && empty($cur['_del']) !== $suppr) continue;       // déjà à jour
        }
        $base['rev']++;
        if ($suppr) {
            $base['items'][$c][$id] = ['_del' => true, '_at' => $t, '_t' => $t, '_rev' => $base['rev']];
            if ($c === 'photos' || $c === 'documents') supprimer_fichier($id);
        } else {
            unset($r['_rev'], $r['_t'], $r['_del'], $r['blob']);
            $r['_t'] = $t;
            $r['_rev'] = $base['rev'];
            $base['items'][$c][$id] = $r;
        }
        $appliques++;
    }
    foreach ((array) ($corps['kv'] ?? []) as $k => $e) {
        if (!in_array($k, $KVS, true) || !is_array($e)) continue;
        $at = (string) ($e['at'] ?? '');
        $cur = $base['kv'][$k] ?? null;
        if (is_array($cur)) {
            $ca = (string) ($cur['at'] ?? '');
            if ($ca > $at) { $kvConflits[$k] = ['v' => $cur['v'] ?? null, 'at' => $ca]; continue; }
            if ($ca === $at) continue;
        }
        $base['rev']++;
        $base['kv'][$k] = ['v' => $e['v'] ?? null, 'at' => $at, '_rev' => $base['rev']];
        $appliques++;
    }
    // Journal d'activité limité aux 1000 entrées les plus récentes
    if (isset($base['items']['activity']) && is_array($base['items']['activity']) && count($base['items']['activity']) > 1200) {
        uasort($base['items']['activity'], function ($x, $y) { return strcmp(date_de($y), date_de($x)); });
        $base['items']['activity'] = array_slice($base['items']['activity'], 0, 1000, true);
    }
    if ($appliques) ecrire_base($DB, $base);
    flock($verrou, LOCK_UN);
    reponse(['rev' => (int) $base['rev'], 'applied' => $appliques, 'conflicts' => $conflits, 'kvConflicts' => (object) $kvConflits]);
}

// ----- Envoi d'un fichier (photo, document) -----
if ($a === 'upload') {
    $id = (string) ($_GET['id'] ?? '');
    if (!id_valide($id)) reponse(['error' => 'Identifiant invalide'], 400);
    $max = (int) ($TAILLE_MAX_MO * 1048576);
    $annonce = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($annonce > $max) reponse(['error' => "Fichier trop volumineux (maximum $TAILLE_MAX_MO Mo)"], 413);
    $p = chemin($id);
    $in = @fopen('php://input', 'rb');
    $out = @fopen("$p.part", 'wb');
    if (!$in || !$out) reponse(['error' => "Écriture impossible dans le dossier « donnees/fichiers »."], 500);
    $n = stream_copy_to_stream($in, $out, $max + 1);
    fclose($out);
    fclose($in);
    if ($n === false || $n > $max) { @unlink("$p.part"); reponse(['error' => "Fichier trop volumineux (maximum $TAILLE_MAX_MO Mo)"], 413); }
    if ($annonce > 0 && $n === 0) {
        // L'hébergement a refusé le contenu (limite post_max_size de PHP)
        @unlink("$p.part");
        reponse(['error' => 'Fichier refusé par l’hébergement (limite PHP post_max_size = ' . ini_get('post_max_size') . ')'], 413);
    }
    if (!@rename("$p.part", "$p.bin")) { @copy("$p.part", "$p.bin"); @unlink("$p.part"); }
    $type = preg_replace('/[^A-Za-z0-9.+\/-]/', '', (string) ($_SERVER['CONTENT_TYPE'] ?? '')) ?: 'application/octet-stream';
    @file_put_contents("$p.type", substr($type, 0, 100));
    reponse(['ok' => true, 'size' => $n]);
}

// ----- Lecture d'un fichier -----
if ($a === 'file') {
    $id = (string) ($_GET['id'] ?? '');
    if (!id_valide($id)) reponse(['error' => 'Introuvable'], 404);
    $p = chemin($id);
    if (!is_file("$p.bin")) reponse(['error' => 'Introuvable'], 404);
    $type = preg_replace('/[^A-Za-z0-9.+\/-]/', '', (string) @file_get_contents("$p.type")) ?: 'application/octet-stream';
    header('Content-Type: ' . $type);
    header('Content-Length: ' . filesize("$p.bin"));
    header('Content-Disposition: attachment; filename="parkx-' . $id . '"');
    header("Content-Security-Policy: default-src 'none'; sandbox");
    header('Cache-Control: private, max-age=86400');
    readfile("$p.bin");
    exit;
}

reponse(['error' => 'Action inconnue'], 400);
