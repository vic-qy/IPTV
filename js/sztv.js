/*
 * 深圳广电集团 第一现场电视直播（www.sztv.com.cn/dianshi.shtml）酷9 JS 脚本
 * ---------------------------------------------------------------------------
 * 链路（逆向自 v3/js/dianshi.js + pindao/js/player/LSDPlayer.js + CDP 抓包）：
 *   1) GET https://hls-api.sztv.com.cn/getCutvHlsLiveKey?t=<秒>&id=<liveId>&token=<md5>&at=1
 *        token = md5(t + liveId + "cutvLiveStream|Dream2017")     （盐硬编码在 LSDPlayer 的
 *        混淆 keys 表里，Z() 解码 = 旋转 + 反转 + base64）
 *        响应 = json 字符串（如 "\"WQ3QDM==AMl9\""），经 Z() 变换得 key（如 047Aoe0）：
 *        Z(s) = base64_decode( reverse( s 旋转：前 ceil(len/2) 个字符移到末尾 ) )
 *   2) path = /<liveId>/500/<key>.m3u8
 *      sign = md5("ejow6p6p6hmrm9g96beh2knecdq5kyw9bp0zxyg7" + path + <t_hex>)
 *      t_hex = (now + 7200秒).toString(16)   （2 小时有效期）
 *      最终地址 = https://sztv-live.sztv.com.cn<path>?sign=<sign>&t=<t_hex>
 *   3) m3u8/分片对 UA、Referer 无要求（实测无头裸拉全 200）
 *
 *   注：官网 CMS 接口（apix.scms.sztv.com.cn 频道表）需要 HMAC-SHA512 签名，
 *   但 liveId 是固定值，已直接内置，酷9 端全程只用 md5。
 *   官网还有个 4K 频道实际也是 500 码率线路（与卫视同源不同 liveId）。
 *
 * 用法（酷9 频道地址，路径须含 /k-web/ku9/js/ 识别串）：
 *   ?id=list                    返回全部 8 频道 m3u8（订阅用，签名 2 小时有效）
 *   ?id=<key|数字id|序号|名称>    返回单频道播放地址（每次点击实时签名）
 *      key: tv4k 深圳卫视4K | tv 深圳卫视 | ds 都市 | dsj 电视剧 | se 少儿 |
 *           ydds 移动电视 | yhg 宜和购物 | gj 国际
 *   默认（无 id）                等同 ?id=list
 * ---------------------------------------------------------------------------
 */

var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

var KEY_API = "https://hls-api.sztv.com.cn/getCutvHlsLiveKey?at=1";
var LIVE_BASE = "https://sztv-live.sztv.com.cn";
var SIGN_KEY = "ejow6p6p6hmrm9g96beh2knecdq5kyw9bp0zxyg7";   // LSDPlayer 签名常量 {K}
var LIVE_SALT = "cutvLiveStream|Dream2017";                   // LSDPlayer token 盐 {t[6]}
var RATE = "500";                                             // 官网 liveRate 唯一档
var TTL = 7200;                                               // sign 有效期 2 小时（与官网一致）

// 频道表（liveId 来自 apix CMS getCatalogList，2026-09-20 核对；财经频道 7871 官网已下线）
var CHANNELS = [
    { key: "tv4k", id: "24725", liveId: "R77mK1v",  name: "深圳卫视4K超高清" },
    { key: "tv",   id: "7867",  liveId: "AxeFRth",  name: "深圳卫视" },
    { key: "ds",   id: "7868",  liveId: "ZwxzUXr",  name: "都市频道" },
    { key: "dsj",  id: "7880",  liveId: "4azbkoY",  name: "电视剧频道" },
    { key: "se",   id: "7881",  liveId: "1SIQj6s",  name: "少儿频道" },
    { key: "ydds", id: "7869",  liveId: "wDF6KJ3",  name: "移动电视" },
    { key: "yhg",  id: "7878",  liveId: "BJ5u5k2",  name: "宜和购物频道" },
    { key: "gj",   id: "7944",  liveId: "sztvgjpd", name: "国际频道" }
];

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

// 纯 JS base64 解码（先把尾部 = 剥掉再进 quad 循环，避免静默少解字节）
function b64decode(input) {
    var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var s = input.replace(/[\r\n\s=]/g, '');
    var out = '', i, a, b, c, d;
    for (i = 0; i + 3 < s.length; i += 4) {
        a = B64.indexOf(s.charAt(i));
        b = B64.indexOf(s.charAt(i + 1));
        c = B64.indexOf(s.charAt(i + 2));
        d = B64.indexOf(s.charAt(i + 3));
        out += String.fromCharCode((a << 2) | (b >> 4));
        if (i + 2 < s.length || c >= 0) out += String.fromCharCode(((b & 15) << 4) | (c >> 2));
        if (i + 3 < s.length || d >= 0) out += String.fromCharCode(((c & 3) << 6) | d);
    }
    // 残余 2~3 个字符
    var rest = s.length - Math.floor(s.length / 4) * 4;
    if (rest === 2) {
        a = B64.indexOf(s.charAt(s.length - 2)); b = B64.indexOf(s.charAt(s.length - 1));
        out += String.fromCharCode((a << 2) | (b >> 4));
    } else if (rest === 3) {
        a = B64.indexOf(s.charAt(s.length - 3)); b = B64.indexOf(s.charAt(s.length - 2)); c = B64.indexOf(s.charAt(s.length - 1));
        out += String.fromCharCode((a << 2) | (b >> 4));
        out += String.fromCharCode(((b & 15) << 4) | (c >> 2));
    }
    return out;
}

// LSDPlayer 的 Z() 变换：旋转（前 ceil(len/2) 个字符移到末尾）+ 整串反转 + base64 解码
function zDecode(a) {
    var b = a.length - Math.floor(a.length / 2);
    a = a.substr(b) + a.substr(0, b);
    var rev = '';
    for (var i = a.length - 1; i >= 0; i--) rev += a.charAt(i);
    return b64decode(rev);
}

// 换取播放地址（key 请求 + sign 拼接）
function resolvePlayUrl(liveId) {
    var t = Math.floor(new Date().getTime() / 1000);
    var token = md5(t + "" + liveId + LIVE_SALT);
    var body = httpGetText(KEY_API + "&t=" + t + "&id=" + liveId + "&token=" + token);
    var key = '';
    try { key = zDecode(JSON.parse(body)); } catch (e) {
        try { key = zDecode(body.replace(/^\"|\"$/g, '')); } catch (e2) { return { error: '密钥接口响应异常：' + body.slice(0, 60) }; }
    }
    if (!key) return { error: '未取到频道密钥（token 校验失败或网络异常）' };
    var tHex = (t + TTL).toString(16);
    var path = '/' + liveId + '/' + RATE + '/' + key + '.m3u8';
    var sign = md5(SIGN_KEY + path + tHex);
    return { url: LIVE_BASE + path + '?sign=' + sign + '&t=' + tHex };
}

// 按 id 找频道：key 精确 -> 数字 id 精确 -> 序号 -> 名称模糊
function findChannel(id) {
    var i, c;
    for (i = 0; i < CHANNELS.length; i++) if (CHANNELS[i].key === id) return CHANNELS[i];
    for (i = 0; i < CHANNELS.length; i++) if (CHANNELS[i].id === id) return CHANNELS[i];
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
        // 列表模式：签名 2 小时有效，过期后刷新订阅
        if (!id || id === "list") {
            var lines = ["#EXTM3U"];
            for (var i = 0; i < CHANNELS.length; i++) {
                var r = resolvePlayUrl(CHANNELS[i].liveId);
                if (!r.url) continue;
                lines.push('#EXTINF:-1 tvg-name="' + CHANNELS[i].name + '" group-title="深圳广电",' + CHANNELS[i].name);
                lines.push(r.url);
            }
            if (lines.length <= 1) return { error: "未能取到任何频道的播放地址，请稍后重试" };
            return { m3u8: lines.join("\n") };
        }

        // 单频道模式：每次点击实时签名，规避过期
        var target = findChannel(id);
        if (!target) return { error: "未找到频道：「" + id + "」。可用：" + availableText() };
        var pr = resolvePlayUrl(target.liveId);
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
