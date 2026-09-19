/*
 * 河南广播电视台 大象新闻「看电视」直播（static.hntv.tv/kds）酷9 JS 脚本
 * ---------------------------------------------------------------------------
 * 链路（逆向自 kds.8f560788.js + CDP 抓包）：
 *   唯一接口：
 *   GET https://pubmod.hntv.tv/program/getAuth/live/class/program/11/
 *       头: sign = sha256("6ca114a836ac7d73" + timestamp)   （小写 hex）
 *           timestamp = 秒级 unix
 *       -> [{cid, name, live, video_streams:[签名m3u8], streams:[备用]}, ...] 共 14 频道
 *   （官网源码里 key="6ca114a836ac7d73"、sign 用 js-sha256 模块，chunk-vendors 8519 号模块）
 *
 *   video_streams 的 wsSecret/wsTime 有效期 4 小时（tokenstarttime~tokenendtime）。
 *   播放是两级 m3u8：master(tvcdn.stream3.hndt.com) -> 100ycdn 加速节点 -> 2 秒分片。
 *   对 UA / Referer / Origin 无要求（实测无头裸拉全部 200）。
 *
 * 用法（酷9 频道地址，路径须含 /k-web/ku9/js/ 识别串）：
 *   ?id=list                    返回全部 14 频道 m3u8（订阅用，签名 4 小时有效）
 *   ?id=<key|cid|序号|名称>      返回单频道播放地址（每次点击实时签名）
 *      key: hnws 河南卫视 | xwpd 新闻 | dspd 都市 | mspd 民生 | fzpd 法治 | ggpd 公共 |
 *           xcpd 乡村 | dsjpd 电视剧 | lypd 梨园 | wwbk 文物宝库 | wspd 武术 |
 *           jczy 睛彩中原 | gxpd 国学 | htgw 欢腾购物
 *   默认（无 id）                等同 ?id=list
 * ---------------------------------------------------------------------------
 */

var API = "https://pubmod.hntv.tv/program/getAuth/live/class/program/11/";
var SIGN_KEY = "6ca114a836ac7d73";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// 频道表（cid 来自 getAuth 接口，2026-09-19 核对）
var CHANNELS = [
    { key: "hnws",  cid: 145, name: "河南卫视" },
    { key: "xwpd",  cid: 149, name: "新闻频道" },
    { key: "dspd",  cid: 141, name: "都市频道" },
    { key: "mspd",  cid: 146, name: "民生频道" },
    { key: "fzpd",  cid: 147, name: "法治频道" },
    { key: "ggpd",  cid: 151, name: "公共频道" },
    { key: "xcpd",  cid: 152, name: "河南乡村频道" },
    { key: "dsjpd", cid: 148, name: "电视剧频道" },
    { key: "lypd",  cid: 154, name: "梨园频道" },
    { key: "wwbk",  cid: 155, name: "文物宝库" },
    { key: "wspd",  cid: 156, name: "武术频道" },
    { key: "jczy",  cid: 157, name: "睛彩中原" },
    { key: "gxpd",  cid: 194, name: "国学频道" },
    { key: "htgw",  cid: 150, name: "欢腾购物" }
];

// ============================ 纯 JS SHA-256 ============================
var sha256hex = (function () {
    var K = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
    // 消息 -> 字节数组（手写 UTF-8，避免 unescape）
    function toBytes(input) {
        var out = [], i, code, c2;
        for (i = 0; i < input.length; i++) {
            code = input.charCodeAt(i);
            if (code < 0x80) out.push(code);
            else if (code < 0x800) out.push(0xC0 | (code >> 6), 0x80 | (code & 63));
            else if (code >= 0xD800 && code <= 0xDBFF && i + 1 < input.length) {
                c2 = input.charCodeAt(i + 1);
                if (c2 >= 0xDC00 && c2 <= 0xDFFF) {
                    code = 0x10000 + ((code - 0xD800) << 10) + (c2 - 0xDC00); i++;
                    out.push(0xF0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
                } else out.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
            }
            else out.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
        }
        return out;
    }
    return function (msg) {
        var bytes = toBytes(msg);
        var bitLen = bytes.length * 8;
        bytes.push(0x80);
        while (bytes.length % 64 !== 56) bytes.push(0);
        // 64 位大端长度（高位恒 0，只写低 32 位）
        bytes.push(0, 0, 0, 0, (bitLen >>> 24) & 255, (bitLen >>> 16) & 255, (bitLen >>> 8) & 255, bitLen & 255);
        var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
        var w = new Array(64);
        var i, j, t1, t2, a, b, c, d, e, f, g, h;
        for (i = 0; i < bytes.length; i += 64) {
            for (j = 0; j < 16; j++) {
                w[j] = (bytes[i + j * 4] << 24) | (bytes[i + j * 4 + 1] << 16) | (bytes[i + j * 4 + 2] << 8) | bytes[i + j * 4 + 3];
            }
            for (j = 16; j < 64; j++) {
                var s0 = rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3);
                var s1 = rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
                w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
            }
            a = H[0]; b = H[1]; c = H[2]; d = H[3]; e = H[4]; f = H[5]; g = H[6]; h = H[7];
            for (j = 0; j < 64; j++) {
                var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
                var ch = (e & f) ^ (~e & g);
                t1 = (h + S1 + ch + K[j] + w[j]) | 0;
                var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
                var maj = (a & b) ^ (a & c) ^ (b & c);
                t2 = (S0 + maj) | 0;
                h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
            }
            H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
            H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
        }
        var hex = '';
        for (i = 0; i < 8; i++) {
            hex += ((H[i] >>> 28) & 15).toString(16) + ((H[i] >>> 24) & 15).toString(16) +
                   ((H[i] >>> 20) & 15).toString(16) + ((H[i] >>> 16) & 15).toString(16) +
                   ((H[i] >>> 12) & 15).toString(16) + ((H[i] >>> 8) & 15).toString(16) +
                   ((H[i] >>> 4) & 15).toString(16) + (H[i] & 15).toString(16);
        }
        return hex;
    };
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

// 拉频道列表（一次拿到全部 14 台的签名地址）
function fetchList() {
    var ts = String(Math.floor(new Date().getTime() / 1000));
    var r = ku9.get(API, { "User-Agent": UA, "sign": sha256hex(SIGN_KEY + ts), "timestamp": ts });
    var body = extractBody(r);
    var j = null;
    try { j = JSON.parse(body); } catch (e) { return null; }
    if (!j || !j.length) return null;
    var map = {}, i, k;
    for (i = 0; i < j.length; i++) {
        var vs = (j[i].video_streams && j[i].video_streams[0]) || '';
        var s = (j[i].streams && j[i].streams[0]) || '';
        map[j[i].cid] = {
            primary: vs.replace(/^http:\/\//, 'https://'),
            backup: s.replace(/^http:\/\//, 'https://')
        };
    }
    return map;
}

// 取某频道的可用地址：优先 video_streams（4h 签名），拉不到 m3u8 时用备用 streams
function resolveUrl(map, cid) {
    var e = map[cid];
    if (!e) return { error: '接口未返回该频道的地址' };
    if (e.primary) {
        try {
            var t = httpGetText(e.primary);
            if (t && t.indexOf('#EXTM3U') === 0) return { url: e.primary };
        } catch (err) { /* 落到备用 */ }
    }
    if (e.backup) {
        try {
            var t2 = httpGetText(e.backup);
            if (t2 && t2.indexOf('#EXTM3U') === 0) return { url: e.backup };
        } catch (err) { }
    }
    // 都没验通也返回主地址（可能是网络抖动，交给播放器重试）
    if (e.primary) return { url: e.primary };
    return { error: '该频道暂无可用地址' };
}

// 按 id 找频道：key 精确 -> cid 精确 -> 序号 -> 名称模糊
function findChannel(id) {
    var i, c;
    for (i = 0; i < CHANNELS.length; i++) if (CHANNELS[i].key === id) return CHANNELS[i];
    for (i = 0; i < CHANNELS.length; i++) if (String(CHANNELS[i].cid) === id) return CHANNELS[i];
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
        var map = fetchList();
        if (!map) return { error: "频道接口请求失败（sign/网络），请稍后重试" };

        // 列表模式：接口签名地址 4 小时有效，过期后刷新订阅
        if (!id || id === "list") {
            var lines = ["#EXTM3U"];
            for (var i = 0; i < CHANNELS.length; i++) {
                var e = map[CHANNELS[i].cid];
                if (!e || !e.primary) continue;
                lines.push('#EXTINF:-1 tvg-name="' + CHANNELS[i].name + '" group-title="河南广电",' + CHANNELS[i].name);
                lines.push(e.primary);
            }
            if (lines.length <= 1) return { error: "未能取到任何频道的播放地址，请稍后重试" };
            return { m3u8: lines.join("\n") };
        }

        // 单频道模式：每次点击实时签名，规避过期
        var target = findChannel(id);
        if (!target) return { error: "未找到频道：「" + id + "」。可用：" + availableText() };
        var r = resolveUrl(map, target.cid);
        if (r.error) return { error: r.error };
        return { url: r.url, headers: { "User-Agent": UA } };
    } catch (e) {
        return { error: "JS脚本执行出错：" + e.message };
    }
}

// 兼容导出（酷9 网络脚本经 eval 后需在外层可见 main）
(function (g) {
    g.main = main;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { main: main, sha256hex: sha256hex };
    }
})(typeof globalThis !== "undefined" ? globalThis : this);
