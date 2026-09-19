/*
 * 浙江广电 新蓝网直播（www.cztv.com/liveTV）酷9 JS 脚本
 * ---------------------------------------------------------------------------
 * 链路（逆向自 directSeedingTV-DpN52kBg.js + CDP 抓包）：
 *   1) GET https://zlive-das.cztv.com/zapp/live/tv/channel/playInfo?channelId={code}&platform=WEB
 *        -> {data:{multiBitrateStreamList:[{bitrateCode:"1080P", urlList:[4个CDN地址]}, ...]}}
 *        （接口无签名、无 Cookie 要求，裸调即可；另有 p.cztv.com/api/paas/channel/tv 可拉频道表）
 *   2) 播放地址是阿里云 CDN，A 鉴权防盗链，密钥硬编码在页面 JS 里：
 *        zwebl01-07.cztv.com  -> CHWr9VybUeBZE1VB
 *        zhfivel01-07.cztv.com -> 9T08yiAoqM4eeCwV
 *      auth_key = <过期时间戳>-<32位随机>-0-md5(<path>-<ts>-<rand>-0-<key>)
 *      （官网用 ~3 分钟有效期，这里给 1 小时；实测过期时间给远期即可）
 *   3) m3u8 / 分片对 UA、Referer 均无要求（okhttp/ffmpeg 都能直接拉）
 *
 * 用法（酷9 频道地址，路径须含 /k-web/ku9/js/ 识别串）：
 *   ?id=list                    返回全部频道 m3u8（订阅用，签名 1 小时有效）
 *   ?id=<key|频道号|序号|名称>    返回单频道播放地址（每次点击重新签名）
 *      key: zjws 浙江卫视 | qjds 钱江都市 | jjsh 经济生活 | jkys 教科影视 | msxx 民生休闲
 *           xwpd 新闻 | sepd 少儿频道 | gjpd 浙江国际 | hyg 好易购 | zjjl 之江纪录
 *   默认（无 id）                等同 ?id=list
 * ---------------------------------------------------------------------------
 */

var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

var API_PLAY = "https://zlive-das.cztv.com/zapp/live/tv/channel/playInfo?platform=WEB&channelId=";

// CDN 鉴权密钥（来自官网页面 directSeedingTV chunk 的 cdnAuthParams）
var CDN_KEYS = [
    { prefix: "zwebl",   key: "CHWr9VybUeBZE1VB" },
    { prefix: "zhfivel", key: "9T08yiAoqM4eeCwV" }
];

// 频道表（station_code 来自 p.cztv.com/api/paas/channel/tv，2026-09-19 核对）
var CHANNELS = [
    { key: "zjws", num: "101", name: "浙江卫视" },
    { key: "qjds", num: "102", name: "钱江都市" },
    { key: "jjsh", num: "103", name: "经济生活" },
    { key: "jkys", num: "104", name: "教科影视" },
    { key: "msxx", num: "106", name: "民生休闲" },
    { key: "xwpd", num: "107", name: "新闻" },
    { key: "sepd", num: "108", name: "少儿频道" },
    { key: "gjpd", num: "110", name: "浙江国际" },
    { key: "hyg",  num: "111", name: "好易购" },
    { key: "zjjl", num: "112", name: "之江纪录" }
];

var AUTH_TTL = 3600;   // 签名有效期（秒）

// ============================ 纯 JS MD5 ============================
var md5 = (function () {
    function safeAdd(x, y) { var lsw = (x & 0xFFFF) + (y & 0xFFFF); var msw = (x >> 16) + (y >> 16) + (lsw >> 16); return (msw << 16) | (lsw & 0xFFFF); }
    function bitRol(num, cnt) { return (num << cnt) | (num >>> (32 - cnt)); }
    function md5cmn(q, a, b, x, s, t) { return safeAdd(bitRol(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b); }
    function md5ff(a, b, c, d, x, s, t) { return md5cmn((b & c) | (~b & d), a, b, x, s, t); }
    function md5gg(a, b, c, d, x, s, t) { return md5cmn((b & d) | (c & ~d), a, b, x, s, t); }
    function md5hh(a, b, c, d, x, s, t) { return md5cmn(b ^ c ^ d, a, b, x, s, t); }
    function md5ii(a, b, c, d, x, s, t) { return md5cmn(c ^ (b | ~d), a, b, x, s, t); }
    function binlMD5(x, len) {
        x[len >> 5] |= 0x80 << (len % 32);
        x[(((len + 64) >>> 9) << 4) + 14] = len;
        var i, olda, oldb, oldc, oldd, a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
        for (i = 0; i < x.length; i += 16) {
            olda = a; oldb = b; oldc = c; oldd = d;
            a = md5ff(a, b, c, d, x[i], 7, -680876936); d = md5ff(d, a, b, c, x[i + 1], 12, -389564586); c = md5ff(c, d, a, b, x[i + 2], 17, 606105819); b = md5ff(b, c, d, a, x[i + 3], 22, -1044525330);
            a = md5ff(a, b, c, d, x[i + 4], 7, -176418897); d = md5ff(d, a, b, c, x[i + 5], 12, 1200080426); c = md5ff(c, d, a, b, x[i + 6], 17, -1473231341); b = md5ff(b, c, d, a, x[i + 7], 22, -45705983);
            a = md5ff(a, b, c, d, x[i + 8], 7, 1770035416); d = md5ff(d, a, b, c, x[i + 9], 12, -1958414417); c = md5ff(c, d, a, b, x[i + 10], 17, -42063); b = md5ff(b, c, d, a, x[i + 11], 22, -1990404162);
            a = md5ff(a, b, c, d, x[i + 12], 7, 1804603682); d = md5ff(d, a, b, c, x[i + 13], 12, -40341101); c = md5ff(c, d, a, b, x[i + 14], 17, -1502002290); b = md5ff(b, c, d, a, x[i + 15], 22, 1236535329);
            a = md5gg(a, b, c, d, x[i + 1], 5, -165796510); d = md5gg(d, a, b, c, x[i + 6], 9, -1069501632); c = md5gg(c, d, a, b, x[i + 11], 14, 643717713); b = md5gg(b, c, d, a, x[i], 20, -373897302);
            a = md5gg(a, b, c, d, x[i + 5], 5, -701558691); d = md5gg(d, a, b, c, x[i + 10], 9, 38016083); c = md5gg(c, d, a, b, x[i + 15], 14, -660478335); b = md5gg(b, c, d, a, x[i + 4], 20, -405537848);
            a = md5gg(a, b, c, d, x[i + 9], 5, 568446438); d = md5gg(d, a, b, c, x[i + 14], 9, -1019803690); c = md5gg(c, d, a, b, x[i + 3], 14, -187363961); b = md5gg(b, c, d, a, x[i + 8], 20, 1163531501);
            a = md5gg(a, b, c, d, x[i + 13], 5, -1444681467); d = md5gg(d, a, b, c, x[i + 2], 9, -51403784); c = md5gg(c, d, a, b, x[i + 7], 14, 1735328473); b = md5gg(b, c, d, a, x[i + 12], 20, -1926607734);
            a = md5hh(a, b, c, d, x[i + 5], 4, -378558); d = md5hh(d, a, b, c, x[i + 8], 11, -2022574463); c = md5hh(c, d, a, b, x[i + 11], 16, 1839030562); b = md5hh(b, c, d, a, x[i + 14], 23, -35309556);
            a = md5hh(a, b, c, d, x[i + 1], 4, -1530992060); d = md5hh(d, a, b, c, x[i + 4], 11, 1272893353); c = md5hh(c, d, a, b, x[i + 7], 16, -155497632); b = md5hh(b, c, d, a, x[i + 10], 23, -1094730640);
            a = md5hh(a, b, c, d, x[i + 13], 4, 681279174); d = md5hh(d, a, b, c, x[i], 11, -358537222); c = md5hh(c, d, a, b, x[i + 3], 16, -722521979); b = md5hh(b, c, d, a, x[i + 6], 23, 76029189);
            a = md5hh(a, b, c, d, x[i + 9], 4, -640364487); d = md5hh(d, a, b, c, x[i + 12], 11, -421815835); c = md5hh(c, d, a, b, x[i + 15], 16, 530742520); b = md5hh(b, c, d, a, x[i + 2], 23, -995338651);
            a = md5ii(a, b, c, d, x[i], 6, -198630844); d = md5ii(d, a, b, c, x[i + 7], 10, 1126891415); c = md5ii(c, d, a, b, x[i + 14], 15, -1416354905); b = md5ii(b, c, d, a, x[i + 5], 21, -57434055);
            a = md5ii(a, b, c, d, x[i + 12], 6, 1700485571); d = md5ii(d, a, b, c, x[i + 3], 10, -1894986606); c = md5ii(c, d, a, b, x[i + 10], 15, -1051523); b = md5ii(b, c, d, a, x[i + 1], 21, -2054922799);
            a = md5ii(a, b, c, d, x[i + 8], 6, 1873313359); d = md5ii(d, a, b, c, x[i + 15], 10, -30611744); c = md5ii(c, d, a, b, x[i + 6], 15, -1560198380); b = md5ii(b, c, d, a, x[i + 13], 21, 1309151649);
            a = md5ii(a, b, c, d, x[i + 4], 6, -145523070); d = md5ii(d, a, b, c, x[i + 11], 10, -1120210379); c = md5ii(c, d, a, b, x[i + 2], 15, 718787259); b = md5ii(b, c, d, a, x[i + 9], 21, -343485551);
            a = safeAdd(a, olda); b = safeAdd(b, oldb); c = safeAdd(c, oldc); d = safeAdd(d, oldd);
        }
        return [a, b, c, d];
    }
    function binl2rstr(input) { var i, output = ''; var length32 = input.length * 32; for (i = 0; i < length32; i += 8) output += String.fromCharCode((input[i >> 5] >>> (i % 32)) & 0xFF); return output; }
    function rstr2binl(input) {
        var i, output = [];
        output[(input.length >> 2) - 1] = undefined;
        for (i = 0; i < output.length; i += 1) output[i] = 0;
        var length8 = input.length * 8;
        for (i = 0; i < length8; i += 8) output[i >> 5] |= (input.charCodeAt(i / 8) & 0xFF) << (i % 32);
        return output;
    }
    function rstrMD5(s) { return binl2rstr(binlMD5(rstr2binl(s), s.length * 8)); }
    function rstr2hex(input) { var hexTab = '0123456789abcdef', output = '', x, i; for (i = 0; i < input.length; i += 1) { x = input.charCodeAt(i); output += hexTab.charAt((x >>> 4) & 0x0F) + hexTab.charAt(x & 0x0F); } return output; }
    // 手写 UTF-8 编码，避免 unescape（部分酷9 沙箱内核没有该函数）
    function str2rstrUTF8(input) {
        var out = '', i, code, c2;
        for (i = 0; i < input.length; i++) {
            code = input.charCodeAt(i);
            if (code < 0x80) out += String.fromCharCode(code);
            else if (code < 0x800) out += String.fromCharCode(0xC0 | (code >> 6), 0x80 | (code & 63));
            else if (code >= 0xD800 && code <= 0xDBFF && i + 1 < input.length) {
                c2 = input.charCodeAt(i + 1);
                if (c2 >= 0xDC00 && c2 <= 0xDFFF) {
                    code = 0x10000 + ((code - 0xD800) << 10) + (c2 - 0xDC00); i++;
                    out += String.fromCharCode(0xF0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
                } else out += String.fromCharCode(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
            }
            else out += String.fromCharCode(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
        }
        return out;
    }
    function rawMD5(s) { return rstrMD5(str2rstrUTF8(s)); }
    function hexMD5(s) { return rstr2hex(rawMD5(s)); }
    return hexMD5;
})();

// ============================ 工具 ============================

// 把 ku9 各种可能的返回值统一抽成 body 字符串（各版本酷9 返回类型不一致）
function extractBody(raw) {
    if (raw === null || raw === undefined) return '';
    if (typeof raw === 'string') return raw;
    if (typeof raw === 'object') {
        if (typeof raw.body === 'string') return raw.body;
        if (typeof raw.data === 'string') return raw.data;
        if (typeof raw.text === 'string') return raw.text;
        if (typeof raw.result === 'string') return raw.result;
        try { return JSON.stringify(raw); } catch (e) { return ''; }
    }
    return String(raw);
}

function httpGetText(url) {
    return extractBody(ku9.get(url, { "User-Agent": UA }));
}

// 32 位随机 hex（不依赖 crypto）
function randHex32() {
    var s = '', chars = '0123456789abcdef', i;
    for (i = 0; i < 32; i++) s += chars.charAt(Math.floor(Math.random() * 16));
    return s;
}

function cdnKeyForHost(host) {
    for (var i = 0; i < CDN_KEYS.length; i++) {
        if (host.indexOf(CDN_KEYS[i].prefix) === 0) return CDN_KEYS[i].key;
    }
    return '';
}

// 阿里云 CDN A 鉴权：auth_key = ts-rand-uid-md5(path-ts-rand-uid-key)
function signUrl(u) {
    var idx = u.indexOf('://');
    var rest = u.substring(idx + 3);
    var slash = rest.indexOf('/');
    var host = rest.substring(0, slash);
    var pathQ = rest.substring(slash);
    var qIdx = pathQ.indexOf('?');
    var path = qIdx >= 0 ? pathQ.substring(0, qIdx) : pathQ;
    var key = cdnKeyForHost(host);
    if (!key) return u;   // 不认识的 CDN 主机，原样返回
    var exp = Math.floor(new Date().getTime() / 1000) + AUTH_TTL;
    var rand = randHex32();
    var sig = md5(path + '-' + exp + '-' + rand + '-0-' + key);
    var sep = u.indexOf('?') >= 0 ? '&' : '?';
    return u + sep + 'auth_key=' + exp + '-' + rand + '-0-' + sig;
}

// 换取播放地址：playInfo -> 选码率 -> 逐个 CDN 试到能拉到 m3u8 为止
function resolvePlayUrl(num) {
    var body = httpGetText(API_PLAY + num);
    var j = null;
    try { j = JSON.parse(body); } catch (e) { return { error: 'playInfo 响应解析失败：' + body.slice(0, 80) }; }
    var list = (j && j.data && j.data.multiBitrateStreamList) || [];
    if (!list.length) return { error: '频道「' + num + '」未返回码率列表' };
    var pick = null, i;
    for (i = 0; i < list.length; i++) if (list[i].bitrateCode === '1080P') { pick = list[i]; break; }
    if (!pick) for (i = 0; i < list.length; i++) if (list[i].bitrateCode === '720P') { pick = list[i]; break; }
    if (!pick) pick = list[0];
    var urls = pick.urlList || [];
    if (!urls.length) return { error: '频道「' + num + '」未返回播放地址' };
    // 逐个 CDN 试（最多 3 个），校验确实能拿到 m3u8
    for (i = 0; i < urls.length && i < 3; i++) {
        var signed = signUrl(urls[i]);
        try {
            var t = httpGetText(signed);
            if (t && t.indexOf('#EXTM3U') === 0) return { url: signed };
        } catch (e) { /* 换下一个 CDN */ }
    }
    // 都没验通也返回第一个签名地址（可能是网络抖动，交给播放器重试）
    return { url: signUrl(urls[0]) };
}

// 按 id 找频道：key 精确 -> 频道号精确 -> 序号 -> 名称模糊
function findChannel(id) {
    var i, c;
    for (i = 0; i < CHANNELS.length; i++) if (CHANNELS[i].key === id) return CHANNELS[i];
    for (i = 0; i < CHANNELS.length; i++) if (CHANNELS[i].num === id) return CHANNELS[i];
    if (/^\d+$/.test(id)) {
        var n = parseInt(id, 10);
        if (n >= 1 && n <= CHANNELS.length) return CHANNELS[n - 1];
    }
    for (i = 0; i < CHANNELS.length; i++) {
        c = CHANNELS[i];
        if (c.name.indexOf(id) >= 0 || id.indexOf(c.name) >= 0) return c;
    }
    return null;
}

function availableText() {
    var arr = [], i;
    for (i = 0; i < CHANNELS.length; i++) arr.push(CHANNELS[i].name + '(' + CHANNELS[i].key + ')');
    return arr.join('、');
}

// ============================ 入口 ============================
function main(item) {
    var id = (item && item.id) ? String(item.id) : "";
    try {
        // 列表模式：逐频道签名（1 小时有效，过期后刷新订阅或点单频道重新签名）
        if (!id || id === "list") {
            var lines = ["#EXTM3U"];
            for (var i = 0; i < CHANNELS.length; i++) {
                var r = resolvePlayUrl(CHANNELS[i].num);
                if (!r.url) continue;
                lines.push('#EXTINF:-1 tvg-name="' + CHANNELS[i].name + '" group-title="浙江广电",' + CHANNELS[i].name);
                lines.push(r.url);
            }
            if (lines.length <= 1) return { error: "未能取到任何频道的播放地址，请稍后重试" };
            return { m3u8: lines.join("\n") };
        }

        // 单频道模式：每次点击重新签名，规避过期
        var target = findChannel(id);
        if (!target) return { error: "未找到频道：「" + id + "」。可用：" + availableText() };
        var pr = resolvePlayUrl(target.num);
        if (pr.error) return { error: pr.error };
        return { url: pr.url, headers: { "User-Agent": UA } };
    } catch (e) {
        return { error: "JS脚本执行出错：" + e.message };
    }
}

// 兼容导出（酷9 网络脚本经 eval 后需在外层可见 main）
(function (g) {
    g.main = main;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { main: main };
    }
})(typeof globalThis !== "undefined" ? globalThis : this);
