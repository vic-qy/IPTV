<?php
/**
 * 广东，半成品
 */

/**
 * 实时获取最新node2（每次调用都请求tcdn-api，保证时效性）
 * @return string|false 成功返回node2，失败返回false
 */
function getLatestNode2() {
    $nodeApiUrl = 'https://tcdn-api.itouchtv.cn/getParam';
    $nodeHeaders = [
        'Authority: tcdn-api.itouchtv.cn',
        'Method: GET',
        'Path: /getParam',
        'Scheme: https',
        'Accept: application/json, text/plain, */*',
        'Accept-Encoding: gzip, deflate, br, zstd',
        'Accept-Language: zh-CN,zh;q=0.9',
        'Content-Type: application/json',
        'Dnt: 1',
        'Origin: https://www.gdtv.cn',
        'Priority: u=1, i',
        'Referer: https://www.gdtv.cn/',
        'Sec-Ch-Ua: "Chromium";v="139", "Not;A=Brand";v="99"',
        'Sec-Ch-Ua-Mobile: ?0',
        'Sec-Ch-Ua-Platform: "Windows"',
        'Sec-Fetch-Dest: empty',
        'Sec-Fetch-Mode: cors',
        'Sec-Fetch-Site: cross-site',
        'Sec-Gpc: 1',
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
        'X-Itouchtv-Ca-Key: 89541943007407288657755311868534',
        'X-Itouchtv-Ca-Signature: nR95WiQlbdski2pefXmUN0Hx/+cEGhwTuv6sr4v0Xjs=',
        'X-Itouchtv-Ca-Timestamp: 1759421263614',
        'X-Itouchtv-Device-Id: WEB_e8b3d130-8af3-11f0-910f-3919097e7996'
    ];

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $nodeApiUrl,
        CURLOPT_HTTPHEADER => $nodeHeaders,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_TIMEOUT => 8
    ]);
    $response = curl_exec($ch);
    $error = curl_errno($ch) ? curl_error($ch) : '';
    curl_close($ch);

    if ($error) {
        echo "[错误] 获取node失败：{$error}<br/>";
        return false;
    }
    $nodeData = json_decode($response, true);
    if (json_last_error() !== JSON_ERROR_NONE || !isset($nodeData['node'])) {
        echo "[错误] 解析node失败，原始响应：{$response}<br/>";
        return false;
    }
    return base64_encode(urldecode($nodeData['node']));
}

/**
 * 用“频道ID+最新node2”获取该频道专属m3u8
 * @param int $channelId 频道ID
 * @param string $node2 实时获取的node2
 * @return array|false 成功返回[频道名, m3u8链接]，失败返回false
 */
function getChannelM3u8($channelId, $node2) {
    $tvApiUrl = str_replace(
        ['{id}', '{node}'],
        [$channelId, $node2],
        'https://gdtv-api.gdtv.cn/api/tv/v2/tvChannel/{id}?tvChannelPk={id}&node={node}'
    );
    $tvHeaders = [
        'Authority: gdtv-api.gdtv.cn',
        'Method: GET',
        'Scheme: https',
        'Accept: application/json, text/plain, */*',
        'Accept-Encoding: gzip, deflate, br, zstd',
        'Accept-Language: zh-CN,zh;q=0.9',
        'Content-Type: application/json',
        'Dnt: 1',
        'Origin: https://www.gdtv.cn',
        'Priority: u=1, i',
        'Referer: https://www.gdtv.cn/',
        'Sec-Ch-Ua: "Chromium";v="139", "Not;A=Brand";v="99"',
        'Sec-Ch-Ua-Mobile: ?0',
        'Sec-Ch-Ua-Platform: "Windows"',
        'Sec-Fetch-Dest: empty',
        'Sec-Fetch-Mode: cors',
        'Sec-Fetch-Site: same-site',
        'Sec-Gpc: 1',
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'
    ];

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $tvApiUrl,
        CURLOPT_HTTPHEADER => $tvHeaders,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_TIMEOUT => 8
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        echo "[频道{$channelId}] 请求失败，状态码：{$httpCode}<br/>";
        return false;
    }
    $tvData = json_decode($response, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        echo "[频道{$channelId}] 响应解析失败（非JSON格式）<br/>";
        return false;
    }
    if (!isset($tvData['playUrl']) || empty($tvData['playUrl'])) {
        echo "[频道{$channelId}] 未找到playUrl字段<br/>";
        return false;
    }
    $playUrlJson = json_decode($tvData['playUrl'], true);
    if (!isset($playUrlJson['hd']) || strpos($playUrlJson['hd'], '.m3u8') === false) {
        echo "[频道{$channelId}] 未提取到有效m3u8链接<br/>";
        return false;
    }
    return [
        'name' => $tvData['name'] ?? '未知频道',
        'm3u8' => $playUrlJson['hd']
    ];
}

// 主程序逻辑
// 1. 读取并验证URL参数中的频道ID
$targetChannelId = $_GET['channel_id'] ?? '';
$validChannelIds = [15,16,42,43,44,45,46,47,48,51,53,54,66,74,75,94,99,102,111];

if (empty($targetChannelId) || !is_numeric($targetChannelId) || !in_array((int)$targetChannelId, $validChannelIds)) {
    die("<h3>请指定有效频道ID！</h3>
         <p>有效ID列表：" . implode('、', $validChannelIds) . "</p>
         <p>示例：访问 <code>?channel_id=75</code> 观看GRTN文化频道</p>");
}
$targetChannelId = (int)$targetChannelId;

// 2. 获取该频道专属的最新node2
echo "<h3>正在处理频道ID：{$targetChannelId}</h3>";
echo "<p>1. 为该频道获取最新node...</p>";
$node2 = getLatestNode2();
if (!$node2) die("<p style='color:red;'>获取node失败，无法继续！</p>");
echo "<p>✅ 该频道专属node2：<code>" . substr($node2, 0, 30) . "...</code></p>";

// 3. 提取该频道的m3u8播放链接
echo "<p>2. 提取该频道的m3u8播放链接...</p>";
$channelInfo = getChannelM3u8($targetChannelId, $node2);
if (!$channelInfo) die("<p style='color:red;'>提取m3u8失败！</p>");

// 4. 输出结果
echo "<h3 style='color:green;'>✅ 频道信息与播放链接</h3>";
echo "<table border='1' cellpadding='8' cellspacing='0' width='80%'>";
echo "<tr><th>频道ID</th><th>频道名称</th><th>m3u8播放链接</th></tr>";
echo "<tr>";
echo "<td>{$targetChannelId}</td>";
echo "<td>{$channelInfo['name']}</td>";
echo "<td><a href='{$channelInfo['m3u8']}' target='_blank' style='color:blue;'>{$channelInfo['m3u8']}</a></td>";
echo "</tr>";
echo "</table>";
echo "<p style='margin-top:10px;'>点击链接后，浏览器需安装m3u8插件（如Chrome的“Native HLS Playback”），或用VLC播放器打开链接。</p>";
?>
