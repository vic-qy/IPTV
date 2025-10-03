<?php
// 芜湖，可用
// 允许跨域请求
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET");

// 获取并验证频道ID
$queryString = trim($_SERVER['QUERY_STRING']);
$validIds = ['7', '9'];

if (!in_array($queryString, $validIds)) {
    http_response_code(400);
    echo json_encode([
        'error' => '请提供有效的频道ID，支持的访问方式：*.php?7 或 *.php?9'
    ]);
    exit;
}
$channelId = $queryString;

$apiUrl = "https://mapi.wuhunews.cn/api/v1/channel.php?a=show&fetch_live=1&channel_id={$channelId}";

// 关键修复：只保留libcurl明确支持的编码格式
$headers = [
    'Accept: application/json, text/javascript, */*; q=0.01',
    'Accept-Encoding: gzip, deflate', // 移除br和zstd，只保留确定支持的编码
    'Accept-Language: zh-CN,zh;q=0.9',
    'Connection: keep-alive',
    'DNT: 1',
    'Host: mapi.wuhunews.cn',
    'Origin: https://www.wuhubtv.com',
    'Referer: https://www.wuhubtv.com/',
    'Sec-Fetch-Dest: empty',
    'Sec-Fetch-Mode: cors',
    'Sec-Fetch-Site: cross-site',
    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
    'sec-ch-ua: "Chromium";v="139", "Not;A=Brand";v="99"',
    'sec-ch-ua-mobile: ?0',
    'sec-ch-ua-platform: "Windows"',
    'sec-gpc: 1'
];

// 初始化cURL
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $apiUrl);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);

// 强制指定支持的编码，不依赖自动处理
curl_setopt($ch, CURLOPT_ENCODING, 'gzip, deflate');

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

// 检查cURL错误
if (curl_errno($ch)) {
    http_response_code(500);
    echo json_encode([
        'error' => '请求API失败',
        'details' => curl_error($ch),
        'http_code' => $httpCode,
        'curl_errno' => curl_errno($ch)
    ]);
    curl_close($ch);
    exit;
}
curl_close($ch);

// 解析JSON响应
$data = json_decode($response, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(500);
    echo json_encode([
        'error' => '解析JSON失败',
        'details' => json_last_error_msg(),
        'response' => $response
    ]);
    exit;
}

// 提取m3u8链接（根据提供的JSON结构）
$m3u8Url = null;
if (!empty($data[0]['m3u8'])) {
    $m3u8Url = $data[0]['m3u8'];
} elseif (!empty($data[0]['channel_stream'][0]['m3u8'])) {
    $m3u8Url = $data[0]['channel_stream'][0]['m3u8'];
} elseif (!empty($data[0]['channel_stream'][0]['url'])) {
    $m3u8Url = $data[0]['channel_stream'][0]['url'];
}

if (empty($m3u8Url) || !filter_var($m3u8Url, FILTER_VALIDATE_URL)) {
    http_response_code(404);
    echo json_encode([
        'error' => '无法获取有效的播放链接',
        'response_data' => $data
    ]);
    exit;
}

// 重定向到播放链接
header("Location: {$m3u8Url}");
exit;
?>