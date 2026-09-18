/*
 * CCTV 央视 1-17 频道 + CCTV-5+ 直播 · 酷9 专用 JS 脚本
 * ---------------------------------------------------------------------------
 * 用法：
 *   ?id=list            一次返回全部 18 个频道的 #EXTM3U（默认行为）
 *   ?id=cctv1           单频道（推荐：每次点击重新取一次地址）
 *   ?id=1               用序号也行（1-17，5+ 用 5plus）
 *   ?id=5plus           CCTV-5+ 体育赛事
 *   ?id=综合 / 财经 …   用频道名关键词也行
 *
 * 识别串说明：
 *   URL 里那串 /k-web/ku9/js/ 只是酷9 的「网络脚本」识别标记，
 *   不是真实路径 —— 酷9 会把它剥掉再去请求真实文件。
 *
 * 逆向要点（实测得来）：
 *   1) 频道列表接口无独立入口，走 VDN 播放接口：
 *      http://vdn.live.cntv.cn/api2/live.do?channel=pw://cctv_p2p_hd<code>
 *      code 不是纯粹 cctvN：CCTV-9 纪录 → cctvjilu，CCTV-14 少儿 → cctvchild
 *   2) 该接口的 tsp 签名参数服务端**不校验**（乱填/留空都返回 ack=yes），
 *      所以脚本里不做 md5，直接给个占位即可。有 ku9.md5 时会顺手算真值。
 *   3) 返回的 hls_url 里 hls1/hls2 是可用 m3u8（hls3 是"yangshi?"占位，
 *      hls5 是 png 封面，hls6 是纯音频，都要跳过）。
 *   4) 地址带带宽窗口参数 b=<min>-<max>，默认只给到 640x360；
 *      改成 b=200-4000 即可解锁 1080p（_pd）/720p（_td）等 5 档。
 *   5) 播放地址无防盗链签名、无需 Referer，可直接交给酷9 拉流。
 * ---------------------------------------------------------------------------
 */

// 各频道配置：id 是给用户填的，code 是 VDN 接口要的频道代码
var CHANNELS = [
    { id: '1', code: 'cctv1', name: 'CCTV-1 综合' },
    { id: '2', code: 'cctv2', name: 'CCTV-2 财经' },
    { id: '3', code: 'cctv3', name: 'CCTV-3 综艺' },
    { id: '4', code: 'cctv4', name: 'CCTV-4 中文国际' },
    { id: '5', code: 'cctv5', name: 'CCTV-5 体育' },
    { id: '5plus', code: 'cctv5plus', name: 'CCTV-5+ 体育赛事' },
    { id: '6', code: 'cctv6', name: 'CCTV-6 电影' },
    { id: '7', code: 'cctv7', name: 'CCTV-7 国防军事' },
    { id: '8', code: 'cctv8', name: 'CCTV-8 电视剧' },
    { id: '9', code: 'cctvjilu', name: 'CCTV-9 纪录' },
    { id: '10', code: 'cctv10', name: 'CCTV-10 科教' },
    { id: '11', code: 'cctv11', name: 'CCTV-11 戏曲' },
    { id: '12', code: 'cctv12', name: 'CCTV-12 社会与法' },
    { id: '13', code: 'cctv13', name: 'CCTV-13 新闻' },
    { id: '14', code: 'cctvchild', name: 'CCTV-14 少儿' },
    { id: '15', code: 'cctv15', name: 'CCTV-15 音乐' },
    { id: '16', code: 'cctv16', name: 'CCTV-16 奥林匹克' },
    { id: '17', code: 'cctv17', name: 'CCTV-17 农业农村' }
];

// VDN 接口常量
var VDN_API = 'http://vdn.live.cntv.cn/api2/live.do';
var VC = 'a4220a71b31746908fa3e7fdd7a6852a';
// 带宽窗口：默认接口只给 640x360，改成这个可拿到 1080p/720p/576p/480p/360p 全 5 档
var BANDWIDTH = '200-4000';

var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

var REQ_HEADERS = {
    'User-Agent': UA,
    'Referer': 'https://tv.cctv.com/',
    'Origin': 'https://tv.cctv.com'
};

var PLAY_HEADERS = {
    'User-Agent': UA,
    'Referer': 'https://tv.cctv.com/'
};

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

// 按 id / code / 序号 / 中文名 找频道
function findChannel(id) {
    if (id === undefined || id === null) return null;

    var q = String(id).trim();
    if (q === '') return null;

    var lower = q.toLowerCase();
    var i;

    // 1. 精确匹配 id（"1" / "5plus"）
    for (i = 0; i < CHANNELS.length; i++) {
        if (CHANNELS[i].id === lower) return CHANNELS[i];
    }

    // 2. 精确匹配 code（"cctv1" / "cctvchild"）
    for (i = 0; i < CHANNELS.length; i++) {
        if (CHANNELS[i].code === lower) return CHANNELS[i];
    }

    // 2b. "cctv9" / "cctv14" 这类按序号写的（它们的真实 code 是 cctvjilu / cctvchild）
    if (lower.indexOf('cctv') === 0) {
        var tail = lower.slice(4);
        for (i = 0; i < CHANNELS.length; i++) {
            if (CHANNELS[i].id === tail) return CHANNELS[i];
        }
    }

    // 3. 纯数字按「第几个」处理（3 → CCTV-3）
    if (/^\d+$/.test(lower)) {
        var n = parseInt(lower, 10);
        if (n >= 1 && n <= CHANNELS.length) return CHANNELS[n - 1];
    }

    // 4. 名称关键词（"综合" / "纪录" / "5+"）
    for (i = 0; i < CHANNELS.length; i++) {
        if (CHANNELS[i].name.indexOf(q) >= 0) return CHANNELS[i];
    }

    return null;
}

// tsp 参数。服务端不校验，算不出真值就留空，不影响取流。
function buildTsp(channel) {
    var sec = Math.floor(new Date().getTime() / 1000);
    var rnd = Math.floor(Math.random() * 900) + 100;
    var sig = '';
    try {
        if (typeof ku9 !== 'undefined' && typeof ku9.md5 === 'function') {
            sig = ku9.md5(channel + sec + rnd + VC);
        }
    } catch (e) {
        sig = '';
    }
    if (!sig) return '';
    return sec + '-' + rnd + '-' + sig;
}

// 把带宽窗口换成最大，解锁 1080p
function widenBandwidth(url) {
    if (/[?&]b=/.test(url)) {
        return url.replace(/([?&])b=[^&]*/, '$1b=' + BANDWIDTH);
    }
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'b=' + BANDWIDTH;
}

// 调 VDN 接口取真实播放地址
function fetchVdnUrl(code) {
    var channel = 'pw://cctv_p2p_hd' + code;
    var api = VDN_API +
        '?channel=' + channel +
        '&client=html5&im=0' +
        '&tsp=' + buildTsp(channel) +
        '&vn=1&vc=' + VC +
        '&uid=&wlan=';

    var raw = ku9.get(api, REQ_HEADERS);
    if (!raw) return '';

    var data;
    try {
        data = JSON.parse(raw);
    } catch (e) {
        return '';
    }

    if (!data || data.ack !== 'yes') return '';

    var hls = data.hls_url || {};
    var keys = ['hls1', 'hls2', 'hls4', 'hls3'];
    for (var i = 0; i < keys.length; i++) {
        var u = hls[keys[i]];
        // hls3 是 "yangshi?..." 这类占位串，只认 http 开头的真地址
        if (u && u.indexOf('http') === 0) {
            return widenBandwidth(u);
        }
    }
    return '';
}

// 接口异常时的兜底：按已知命名规律直连腾讯云 CDN
function fallbackUrl(channel) {
    var tag = channel.code.replace(/^cctv/, '');
    return 'http://ldncctvwbcdtxy.liveplay.myqcloud.com/ldncctvwbcd/cdrmldcctv' +
        tag + '_1/index.m3u8?b=' + BANDWIDTH;
}

// 取某频道的最终播放地址
function getPlayUrl(channel) {
    var url = '';
    try {
        url = fetchVdnUrl(channel.code);
    } catch (e) {
        url = '';
    }
    if (!url) url = fallbackUrl(channel);
    return url;
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

function main(item) {
    item = item || {};
    var id = item.id;
    if (id === undefined || id === null || String(id).trim() === '') id = 'list';

    var key = String(id).trim().toLowerCase();

    // 列表模式
    if (key === 'list' || key === 'all' || key === '全部') {
        var lines = ['#EXTM3U'];
        for (var i = 0; i < CHANNELS.length; i++) {
            var ch = CHANNELS[i];
            var u;
            try {
                u = getPlayUrl(ch);
            } catch (e) {
                u = '';
            }
            if (u) {
                lines.push('#EXTINF:-1,' + ch.name);
                lines.push(u);
            }
            // 取不到地址的频道直接跳过，不写进列表
        }
        if (lines.length <= 1) {
            return { error: '所有频道地址获取失败，请检查网络后重试' };
        }
        return { m3u8: lines.join('\n') };
    }

    // 单频道模式
    var target = findChannel(key);
    if (!target) {
        var names = [];
        for (var j = 0; j < CHANNELS.length; j++) {
            names.push(CHANNELS[j].id + '=' + CHANNELS[j].name);
        }
        return {
            error: '频道不存在：' + id + '。可用 id：' + names.join('、') + '，或用 id=list 取全部'
        };
    }

    var playUrl = getPlayUrl(target);
    if (!playUrl) {
        return { error: '取流失败：' + target.name + '，请稍后重试' };
    }

    // 地址无防盗链、无需 Referer，headers 只是稳妥起见带上
    return {
        url: playUrl,
        headers: PLAY_HEADERS
    };
}

// 兼容导出：无论酷9 用 eval 还是 Function 包装，都能从外层拿到 main
(function () {
    var g = (typeof globalThis !== 'undefined' && globalThis) ||
        (typeof window !== 'undefined' && window) ||
        (typeof global !== 'undefined' && global) ||
        this;
    if (g) g.main = main;
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { main: main };
}
