/*
 * 广州电视台 酷9 脚本 (gz.js)
 * ---------------------------------------------------------------------------
 * 数据来源：一次请求 queryLiveChannelList 即返回全部频道，data[].httpUrl 为
 *           可直接播放的 m3u8（腾讯云 txSecret/txTime 鉴权）。
 *
 * 用法（脚本放仓库 k-web/ku9/js/gz.js，走 jsDelivr 等直链）：
 *   单频道：.../gz.js?id=3001        （id 支持 code / 序号 / 频道名模糊匹配）
 *           或 .../gz.js?id=综合       .../gz.js?id=2
 *   列表：  .../gz.js?id=list         返回 #EXTM3U，所有频道一次给齐
 *   默认不传 id 等同 id=list
 *
 * 说明：直播地址带签名会过期，单频道模式每次点击都会重新请求拿新签名；
 *      列表模式是在订阅时取一次快照，若长时间后某个台播不出，刷新订阅即可。
 * ---------------------------------------------------------------------------
 */

// 一次请求返回全部频道
var API_URL =
    'https://gzbn.gztv.com:7443/media-cloud-manage-app/liveChannel/queryLiveChannelList?type=1';

// 调接口用的请求头（与官网网页一致）
var API_HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',
    Origin: 'https://www.gztv.com',
    Referer: 'https://www.gztv.com/',
    Accept: 'application/json, text/plain, */*',
    'Accept-Encoding': 'identity', // 避免服务端返回 gzip 导致 JSON.parse 失败
};

// 播放 m3u8 时带的请求头（源站 tencentplaywebsite.gztv.com 同样认 gztv.com）
var PLAY_HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',
    Origin: 'https://www.gztv.com',
    Referer: 'https://www.gztv.com/',
};

// 拉取频道列表，失败返回 null
function fetchChannelList() {
    var resp = ku9.get(API_URL, API_HEADERS);
    if (!resp) return null;
    var json;
    try {
        json = JSON.parse(resp);
    } catch (e) {
        return null;
    }
    if (!json || json.code !== 200 || !json.data) return null;
    return json.data;
}

// 按 code / 序号(从1) / 名称模糊 定位频道
function findChannel(data, id) {
    if (!id) return null;
    var s = String(id);
    var i;
    // 1) code 精确（如 3001）
    for (i = 0; i < data.length; i++) {
        if (String(data[i].code) === s) return data[i];
    }
    // 2) 序号（如 1 / 2 / 3）
    var n = parseInt(s, 10);
    if (!isNaN(n) && n >= 1 && n <= data.length) return data[n - 1];
    // 3) 名称模糊（如 “综合” / “南国”）
    var low = s.toLowerCase();
    for (i = 0; i < data.length; i++) {
        if (String(data[i].name).toLowerCase().indexOf(low) >= 0) return data[i];
    }
    return null;
}

function main(item) {
    var id = item && item.id ? item.id : 'list';

    var data = fetchChannelList();
    if (!data) {
        return { error: '获取广州电视台频道列表失败，请检查网络或稍后重试' };
    }

    // 列表模式：一次请求把所有频道写进 #EXTM3U
    if (id === 'list') {
        var lines = ['#EXTM3U'];
        for (var i = 0; i < data.length; i++) {
            var ch = data[i];
            if (ch.httpUrl) {
                lines.push('#EXTINF:-1,' + ch.name);
                lines.push(ch.httpUrl);
            }
        }
        return { m3u8: lines.join('\n') };
    }

    // 单频道模式：重新请求拿最新签名，返回播放地址
    var c = findChannel(data, id);
    if (!c || !c.httpUrl) {
        var codes = [];
        for (var j = 0; j < data.length; j++) codes.push(data[j].code);
        return {
            error:
                '未找到频道：' +
                id +
                '（可用 code：' +
                codes.join(' / ') +
                '，或填序号/频道名）',
        };
    }

    return {
        url: c.httpUrl,
        headers: PLAY_HEADERS,
    };
}

// 兼容导出：保证网络脚本（eval/Function 包装）外层也能找到 main
(function (g) {
    g = g || (typeof globalThis !== 'undefined' ? globalThis : this);
    g.main = main;
})(typeof globalThis !== 'undefined' ? globalThis : this);
