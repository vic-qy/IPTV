<?php
// 河南，半成品
// 允许跨域请求
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET");

// 获取URL参数中的频道ID（格式为.php?id）
$id = key($_GET) ?? '';

// 验证ID有效性
$validIds = [145, 149, 141, 146, 147, 151, 152, 148, 154];
$idMap = [
    145 => '河南卫视',
    149 => '河南新闻',
    141 => '河南都市',
    146 => '河南民生',
    147 => '河南法治',
    151 => '河南公共',
    152 => '河南乡村',
    148 => '河南电视剧',
    154 => '梨园频道'
];

if (empty($id) || !in_array((int)$id, $validIds)) {
    http_response_code(400);
    echo "无效的频道ID，请使用以下合法ID：\n";
    foreach ($idMap as $key => $name) {
        echo "{$key} => {$name}\n";
    }
    exit;
}

// 生成当前Unix时间戳（秒级）
$timestamp = time();

// 构建新的API请求URL（根据最新路径调整）
$apiUrl = "https://pubmod.hntv.tv/program/getAuth/channel/channelIds/1/{$id}/{$timestamp}";

// 注意：sign参数需要根据实际算法生成，以下为固定值示例
// 从提供的JS代码可知使用了SHA-256，推测签名可能由id、timestamp、密钥等组合计算得出
// 例如：$sign = hash('sha256', "{$id}{$timestamp}密钥"); （实际密钥和组合方式需进一步分析）
$sign = "24cc9e5082aa4b57407efe5b62062d84605fb2d9e5353eed1a5117ca6ddaa514";

// 设置最新的请求头信息
$headers = [
    'Accept: application/json, text/javascript, */*; q=0.01',
    'Accept-Encoding: gzip, deflate, br, zstd',
    'Accept-Language: zh-CN,zh;q=0.9',
    'Connection: keep-alive',
    'DNT: 1',
    'Host: pubmod.hntv.tv',
    'Origin: http://tv.zimtv.cn',
    'Referer: http://tv.zimtv.cn/',
    'Sec-Fetch-Dest: empty',
    'Sec-Fetch-Mode: cors',
    'Sec-Fetch-Site: cross-site',
    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
    'sec-ch-ua: "Chromium";v="139", "Not;A=Brand";v="99"',
    'sec-ch-ua-mobile: ?0',
    'sec-ch-ua-platform: "Windows"',
    'sec-gpc: 1',
    "sign: {$sign}",
    "timestamp: {$timestamp}"
];

// 发送API请求
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $apiUrl);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // 生产环境建议开启SSL验证
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
$response = curl_exec($ch);

// 检查请求错误
if (curl_errno($ch)) {
    http_response_code(500);
    echo "请求失败: " . curl_error($ch);
    curl_close($ch);
    exit;
}
curl_close($ch);

// 解析JSON响应
$data = json_decode($response, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(500);
    echo "JSON解析失败: " . json_last_error_msg() . "\n响应内容: " . $response;
    exit;
}

// 提取并跳转至直播链接
if (!empty($data[0]['video_streams'][0])) {
    $streamUrl = $data[0]['video_streams'][0];
    header("Location: {$streamUrl}");
    exit;
} elseif (!empty($data[0]['streams'][0])) {
    // 备选流地址
    $streamUrl = $data[0]['streams'][0];
    header("Location: {$streamUrl}");
    exit;
} else {
    http_response_code(404);
    echo "未找到可用的直播流\n响应数据: " . print_r($data, true);
    exit;
}
?>