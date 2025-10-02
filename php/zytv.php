<?php
// 资阳电视台网络直播PHP代理
// 十分卡顿

// 获取请求的ID参数，默认为1
$id = isset($_GET['id']) ? intval($_GET['id']) : 1;

// 验证ID是否为允许的值（1或4）
if (!in_array($id, [1, 4])) {
    http_response_code(400);
    echo "无效的ID，仅支持1（资阳新闻综合）和4（雁江频道）";
    exit;
}

// API接口URL
$apiUrl = "https://appmgr.zyrb.com.cn/tvradio/Tvfront/getTvInfo?tv_id={$id}";

// 设置请求头信息
$headers = [
    'Accept: application/json, text/javascript, */*; q=0.01',
    'Accept-Encoding: gzip, deflate, br, zstd',
    'Accept-Language: zh-CN,zh;q=0.9',
    'Connection: keep-alive',
    'DNT: 1',
    'Host: appmgr.zyrb.com.cn',
    'Origin: https://www.zyrb.com.cn',
    'Referer: https://www.zyrb.com.cn/',
    'Sec-Fetch-Dest: empty',
    'Sec-Fetch-Mode: cors',
    'Sec-Fetch-Site: same-site',
    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
    'content-type: application/json',
    'sec-ch-ua: "Chromium";v="139", "Not;A=Brand";v="99"',
    'sec-ch-ua-mobile: ?0',
    'sec-ch-ua-platform: "Windows"',
    'sec-gpc: 1'
];

// 初始化cURL
$ch = curl_init();

// 设置cURL选项
curl_setopt($ch, CURLOPT_URL, $apiUrl);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
curl_setopt($ch, CURLOPT_ENCODING, 'gzip, deflate, br, zstd');

// 执行请求并获取响应
$response = curl_exec($ch);

// 检查是否有错误
if(curl_errno($ch)) {
    http_response_code(500);
    echo "请求失败: " . curl_error($ch);
    curl_close($ch);
    exit;
}

// 关闭cURL
curl_close($ch);

// 解析JSON响应
$data = json_decode($response, true);

// 检查JSON解析是否成功
if(json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(500);
    echo "解析失败: 无法解析API响应的JSON数据";
    exit;
}

// 检查API返回是否成功并提取m3u8地址
if(isset($data['code']) && $data['code'] == 200 && !empty($data['data']['m3u8'])) {
    // 直接重定向到m3u8播放地址
    header("Location: " . $data['data']['m3u8']);
    exit;
} else {
    http_response_code(404);
    echo "无法获取播放地址，错误信息: " . (isset($data['msg']) ? $data['msg'] : '未知错误');
    exit;
}
?>
