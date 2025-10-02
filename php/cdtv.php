<?php
// 成都电视台网络直播
// 目前可用
// 1. 接收参数（兼容id和直接数字参数，更灵活）
$id = '';
// 优先识别?id=xxx格式
if (isset($_GET['id'])) {
    $id = $_GET['id'];
}
// 其次识别直接?1/?2格式（更符合使用习惯）
elseif (!empty($_SERVER['QUERY_STRING'])) {
    $id = $_SERVER['QUERY_STRING'];
}
// 默认值（CDTV1）
if (empty($id)) {
    $id = 'cdxw';
}

// 2. 频道映射表（键名支持两种格式：缩写和数字，方便访问）
$channels = [
    // 缩写形式（原代码的键名）
    'cdxw' => [563, 'cdtv1', 'CDTV1'], // CDTV1
    'cdjj' => [562, 'cdtv2', 'CDTV2'], // CDTV2
    'cdds' => [561, 'cdtv3', 'CDTV3'], // CDTV3
    'cdys' => [560, 'cdtv4', 'CDTV4'], // CDTV4
    'cdgg' => [559, 'cdtv5', 'CDTV5'], // CDTV5
    'cdse' => [558, 'cdtv6', 'CDTV6'], // CDTV6
    // 数字形式（更直观，对应频道1-6）
    '1' => [563, 'cdtv1', 'CDTV1'],
    '2' => [562, 'cdtv2', 'CDTV2'],
    '3' => [561, 'cdtv3', 'CDTV3'],
    '4' => [560, 'cdtv4', 'CDTV4'],
    '5' => [559, 'cdtv5', 'CDTV5'],
    '6' => [558, 'cdtv6', 'CDTV6']
];

// 3. 关键：检查参数是否有效（无效则报错，避免默认到CDTV1）
if (!isset($channels[$id])) {
    http_response_code(400);
    echo "无效的频道参数！支持的参数：<br>";
    echo "CDTV1：?id=cdxw 或 ?1<br>";
    echo "CDTV2：?id=cdjj 或 ?2<br>";
    echo "CDTV3：?id=cdds 或 ?3<br>";
    echo "CDTV4：?id=cdys 或 ?4<br>";
    echo "CDTV5：?id=cdgg 或 ?5<br>";
    echo "CDTV6：?id=cdse 或 ?6";
    exit;
}

// 4. 拼接API请求地址（使用匹配到的频道信息）
$channelInfo = $channels[$id];
$apiUrl = "https://cstvweb.cdmp.candocloud.cn/live/getLiveUrl?url=https://cdn1.cditv.cn/{$channelInfo[1]}high/{$channelInfo[2]}High.flv/playlist.m3u8";

// 5. 发起请求获取真实直播地址
$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL => $apiUrl,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_SSL_VERIFYHOST => false,
    CURLOPT_REFERER => "https://www.cditv.cn/show/4845-{$channelInfo[0]}.html", // 防盗链Referer
    CURLOPT_TIMEOUT => 10
]);
$response = curl_exec($ch);
curl_close($ch);

// 6. 解析API返回结果（容错处理）
$jsonData = json_decode($response);
if (json_last_error() !== JSON_ERROR_NONE || !isset($jsonData->data->url)) {
    http_response_code(500);
    echo "获取直播源失败！可能原因：<br>";
    echo "1. 频道API已更新（需检查链接格式）<br>";
    echo "2. Referer防盗链验证失败<br>";
    echo "3. 网络问题导致请求超时";
    exit;
}

// 7. 跳转到真实直播地址
header("Location: {$jsonData->data->url}");
exit;
?>