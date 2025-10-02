<?php
/**
 * 云南网络电视台m3u8代理
 * 半成品，需要验证SSL
 */

// 频道首字母缩写映射表
$channelMap = [
    'ynws' => 'yunnanweishi',   // 云南卫视
    'ynds' => 'yunnandushi',   // 云南都市
    'ynyl' => 'yunnanyule',    // 云南娱乐
    'yngg' => 'yunnangonggong',// 云南公共
    'ynse' => 'yunnanshaoer'   // 云南少儿
];

// 获取请求的频道参数（首字母缩写）
$shortChannel = isset($_GET['c']) ? $_GET['c'] : '';

// 验证频道是否合法
if (empty($shortChannel) || !isset($channelMap[$shortChannel])) {
    http_response_code(400);
    echo "错误：无效的频道参数，请使用以下合法缩写：" . implode(', ', array_keys($channelMap));
    exit;
}

// 获取真实频道名称
$channel = $channelMap[$shortChannel];

// API请求URL
$apiUrl = "https://yntv-api.yntv.cn/index/jmd/getRq?name={$channel}";

// 设置请求头，模拟浏览器请求
$headers = [
    'Accept: application/json, text/javascript, */*; q=0.01',
    'Accept-Encoding: gzip, deflate, br, zstd',
    'Accept-Language: zh-CN,zh;q=0.9',
    'Connection: keep-alive',
    'DNT: 1',
    'Host: yntv-api.yntv.cn',
    'Origin: https://www.yntv.cn',
    'Referer: https://www.yntv.cn/',
    'Sec-Fetch-Dest: empty',
    'Sec-Fetch-Mode: cors',
    'Sec-Fetch-Site: same-site',
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
// 禁用SSL证书验证（解决自签名证书问题）
// curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
// curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
curl_setopt($ch, CURLOPT_ENCODING, 'gzip, deflate'); // 处理压缩

// 执行请求
$response = curl_exec($ch);

// 检查请求是否成功
if ($response === false) {
    http_response_code(500);
    echo "错误：获取频道数据失败 - " . curl_error($ch);
    curl_close($ch);
    exit;
}
curl_close($ch);

// 解析JSON响应
$data = json_decode($response, true);

// 检查JSON解析是否成功
if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(500);
    echo "错误：解析频道数据失败 - " . json_last_error_msg();
    exit;
}

// 检查必要的字段是否存在
if (!isset($data['url'], $data['string'], $data['time'])) {
    http_response_code(500);
    echo "错误：频道数据不完整，无法生成播放链接";
    exit;
}

// 拼接m3u8播放链接
$m3u8Url = "https://tvlive.yntv.cn{$data['url']}?wsSecret={$data['string']}&wsTime={$data['time']}";

// 重定向到播放链接
header("Location: {$m3u8Url}");
exit;