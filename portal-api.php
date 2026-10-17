<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$path = (string) ($_GET['path'] ?? '');
if (! preg_match('#^/api/v1/portal(?:/|$)#', $path)) {
    http_response_code(400);
    echo json_encode(['error' => 'Ungültiger Portalpfad.']);
    exit;
}

$target = 'https://api.eigenheimverwalter.de'.$path;
$curl = curl_init($target);
$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$body = file_get_contents('php://input');
$headers = ['Accept: application/json'];
$authorization = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? '');
if ($authorization !== '') $headers[] = 'Authorization: '.$authorization;
if ($body !== '' && $body !== false) $headers[] = 'Content-Type: application/json';

curl_setopt_array($curl, [
    CURLOPT_CUSTOMREQUEST => $method,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_CONNECTTIMEOUT => 5,
    CURLOPT_TIMEOUT => 25,
    CURLOPT_HTTPHEADER => $headers,
    CURLOPT_HEADER => true,
    CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
]);
if ($body !== '' && $body !== false) curl_setopt($curl, CURLOPT_POSTFIELDS, $body);
$response = curl_exec($curl);
if ($response === false) {
    http_response_code(502);
    echo json_encode(['error' => 'Die zentrale API ist vorübergehend nicht erreichbar.']);
    curl_close($curl);
    exit;
}
$status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
$headerSize = (int) curl_getinfo($curl, CURLINFO_HEADER_SIZE);
$contentType = (string) curl_getinfo($curl, CURLINFO_CONTENT_TYPE);
$responseBody = substr($response, $headerSize);
curl_close($curl);
http_response_code($status ?: 502);
if (str_starts_with(strtolower($contentType), 'application/json')) header('Content-Type: application/json; charset=utf-8');
echo $responseBody;
