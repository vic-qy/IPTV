<?php
// 半成品
// 定义API地址
$apiUrl = 'https://mapi.ahtv.cn/api/v1/channel.php?is_audio=0&category_id=1%2C2';

// 定义频道标识与名称的映射关系
$channelMap = [
    'ahws' => '安徽卫视',
    'jjsh' => '经济生活',
    'zyty' => '综艺体育',
    'yspd' => '影视频道',
    'ahgg' => '安徽公共',
    'nykj' => '农业·科教',
    'ahgj' => '安徽国际',
    'ydds' => '移动电视'
];

// 定义需要发送的请求头
$streamHeaders = [
    'Accept: */*',
    'Accept-Encoding: gzip, deflate, br, zstd',
    'Accept-Language: zh-CN,zh;q=0.9',
    'DNT: 1',
    'Origin: https://www.ahtv.cn',
    'Referer: https://www.ahtv.cn/',
    'Sec-Ch-Ua: "Chromium";v="139", "Not;A=Brand";v="99"',
    'Sec-Ch-Ua-Mobile: ?0',
    'Sec-Ch-Ua-Platform: "Windows"',
    'Sec-Fetch-Dest: empty',
    'Sec-Fetch-Mode: cors',
    'Sec-Fetch-Site: same-site',
    'Sec-Gpc: 1',
    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'
];

try {
    // 处理TS片段请求
    if (isset($_GET['ts']) && !empty($_GET['ts'])) {
        $tsUrl = urldecode($_GET['ts']);
        
        // 初始化cURL代理请求TS内容
        $ch = curl_init();
        
        // 解析URL获取主机名，设置Host头
        $urlParts = parse_url($tsUrl);
        $hostHeader = 'Host: ' . $urlParts['host'];
        $tsHeaders = $streamHeaders;
        array_unshift($tsHeaders, $hostHeader);
        
        curl_setopt_array($ch, [
            CURLOPT_URL => $tsUrl,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $tsHeaders,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => false,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_ENCODING => ''
        ]);
        
        $tsContent = curl_exec($ch);
        
        // 检查cURL错误
        if(curl_errno($ch)) {
            throw new Exception('请求TS片段失败: ' . curl_error($ch));
        }
        
        // 获取HTTP状态码和响应头
        $tsHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE) ?: 'video/MP2T';
        
        curl_close($ch);
        
        // 转发状态码
        http_response_code($tsHttpCode);
        
        // 设置正确的Content-Type
        header('Content-Type: ' . $contentType);
        header('Cache-Control: no-cache');
        header('Pragma: no-cache');
        
        echo $tsContent;
        exit;
    }
    
    // 获取请求参数
    $channel = isset($_GET['channel']) ? $_GET['channel'] : '';
    
    if (empty($channel)) {
        throw new Exception('请指定频道参数，例如: ?channel=ahws');
    }
    
    if (!isset($channelMap[$channel])) {
        throw new Exception('未知的频道标识，请使用以下之一: ' . implode(', ', array_keys($channelMap)));
    }
    
    // 初始化cURL获取频道列表
    $ch = curl_init();
    
    // 设置cURL选项
    curl_setopt_array($ch, [
        CURLOPT_URL => $apiUrl,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Accept: application/json, text/javascript, */*; q=0.01',
            'Accept-Encoding: gzip, deflate, br, zstd',
            'Accept-Language: zh-CN,zh;q=0.9',
            'Connection: keep-alive',
            'DNT: 1',
            'Host: mapi.ahtv.cn',
            'Origin: https://www.ahtv.cn',
            'Referer: https://www.ahtv.cn/',
            'Sec-Fetch-Dest: empty',
            'Sec-Fetch-Mode: cors',
            'Sec-Fetch-Site: same-site',
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
            'sec-ch-ua: "Chromium";v="139", "Not;A=Brand";v="99"',
            'sec-ch-ua-mobile: ?0',
            'sec-ch-ua-platform: "Windows"',
            'sec-gpc: 1'
        ],
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_ENCODING => ''
    ]);
    
    // 执行请求并获取响应
    $response = curl_exec($ch);
    
    // 检查cURL错误
    if(curl_errno($ch)) {
        throw new Exception('请求API失败: ' . curl_error($ch));
    }
    
    // 获取HTTP状态码
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if ($httpCode != 200) {
        throw new Exception('API返回非200状态码: ' . $httpCode);
    }
    
    // 关闭cURL
    curl_close($ch);
    
    // 处理空响应
    if (empty($response)) {
        throw new Exception('API返回空响应');
    }
    
    // 处理响应内容
    $response = preg_replace('/[^\P{C}\n\t\r]/u', '', $response);
    $response = mb_convert_encoding($response, 'UTF-8', 'UTF-8,GBK,GB2312,ISO-8859-1');
    
    // 解析JSON响应
    $channels = json_decode($response, true);
    
    // 检查JSON解析错误
    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new Exception('解析API响应失败: ' . json_last_error_msg() . '，原始响应: ' . substr($response, 0, 200));
    }
    
    // 查找对应的频道
    $targetChannel = null;
    $targetName = $channelMap[$channel];
    foreach ($channels as $item) {
        if ($item['name'] === $targetName) {
            $targetChannel = $item;
            break;
        }
    }
    
    if (!$targetChannel) {
        throw new Exception('未找到指定的频道: ' . $targetName);
    }
    
    // 检查是否有m3u8链接
    if (empty($targetChannel['m3u8'])) {
        throw new Exception('该频道没有可用的播放链接');
    }
    
    $m3u8Url = $targetChannel['m3u8'];
    
    // 初始化cURL代理请求m3u8内容
    $ch = curl_init();
    
    // 解析URL获取主机名，设置Host头
    $urlParts = parse_url($m3u8Url);
    $hostHeader = 'Host: ' . $urlParts['host'];
    $m3u8Headers = $streamHeaders;
    array_unshift($m3u8Headers, $hostHeader);
    
    curl_setopt_array($ch, [
        CURLOPT_URL => $m3u8Url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $m3u8Headers,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_ENCODING => ''
    ]);
    
    $streamContent = curl_exec($ch);
    
    // 检查cURL错误
    if(curl_errno($ch)) {
        throw new Exception('请求视频流失败: ' . curl_error($ch));
    }
    
    // 获取HTTP状态码和响应头
    $streamHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE) ?: 'application/x-mpegURL';
    
    curl_close($ch);
    
    // 转发状态码
    http_response_code($streamHttpCode);
    
    // 确保设置正确的Content-Type
    header('Content-Type: ' . $contentType);
    header('Cache-Control: no-cache');
    header('Pragma: no-cache');
    
    // 对于m3u8文件，需要替换其中的TS片段URL为代理URL
    if (strpos($contentType, 'mpegURL') !== false) {
        // 提取基础URL
        $baseUrl = $urlParts['scheme'] . '://' . $urlParts['host'] . (isset($urlParts['path']) ? dirname($urlParts['path']) : '');
        $proxyBase = $_SERVER['PHP_SELF'] . '?channel=' . $channel . '&ts=';
        
        // 替换m3u8中的TS文件链接为代理链接
        $streamContent = preg_replace_callback(
            '/(https?:\/\/[^\/]+)?([^"\'\s]+?\.ts[^"\'\s]*)/i',
            function($matches) use ($baseUrl, $proxyBase) {
                $tsUrl = $matches[2];
                // 如果是相对路径，拼接基础URL
                if (empty($matches[1])) {
                    $tsUrl = rtrim($baseUrl, '/') . '/' . ltrim($tsUrl, '/');
                } else {
                    $tsUrl = $matches[1] . $tsUrl;
                }
                // 返回代理链接，将TS URL进行URL编码
                return $proxyBase . urlencode($tsUrl);
            },
            $streamContent
        );
    }
    
    echo $streamContent;
    exit;
    
} catch (Exception $e) {
    // 输出错误信息
    header('Content-Type: application/json; charset=utf-8');
    http_response_code(400);
    echo json_encode([
        'error' => true,
        'message' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
    exit;
}
?>
