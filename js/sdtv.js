/*
 * sdtv.js —— 山东广播电视台 直播源解析脚本（酷9）
 * ---------------------------------------------------------------------------
 * 频道：山东卫视、山东少儿
 *
 * 数据来源：v.iqilu.com 直播页的鉴权交换接口
 *
 *   POST https://feiying.litenews.cn/api/v1/auth/exchange?t=<毫秒时间戳>&s=<签名>
 *        Body = AES-128-CBC( '{"channelMark":"<频道号>"}' )   逐字节干净，不能有任何多余字符
 *        请求头：必须带 Referer 含 iqilu.com 且 User-Agent 非空（否则 CDN 层 403）
 *
 *   - s        = md5( channelMark + t + 'QZMVKTRHPLXADJNE' )   小写十六进制
 *   - AES 密钥 = 'BWRFYSNCOGIXUTPA'，IV = 16 个 '0'，CBC + PKCS7，输出 base64
 *   - Content-Type 必须是 text/plain / application/json / application/octet-stream 之一
 *     一旦被当成 application/x-www-form-urlencoded 解析，服务端一定报 decrypt body fail!
 * 响应也是同一套 AES 加密的 base64，解出后 JSON 形如
 *        {"code":1,"data":"https://.../playlist.m3u8?k=...&t=..."}
 * 参数不对时服务端返回**明文** JSON，如 {"code":0,"errmsg":"md5 check fail!"}
 *
 * 用法（脚本放仓库 js/sdtv.js）：
 *   单频道：.../sdtv.js?id=sdtv       山东卫视
 *           .../sdtv.js?id=sepd       山东少儿
 *           id 也可填 频道号(24581/24605)、序号(1/2)、中文名(山东卫视/山东少儿)
 *   列表：  .../sdtv.js?id=list       返回 #EXTM3U（就是上面这 2 个频道）
 *   诊断：  .../sdtv.js?id=debug      出错时返回更详细的排查信息
 *
 * 注：播放地址带 CDN 签名（k/t）会过期。单频道模式每次点击都重新换取新签名。
 *     实测播放 m3u8 与分片不需要任何请求头。
 * ---------------------------------------------------------------------------
 */

// ---------------------------------------------------------------------------
// 配置区
// ---------------------------------------------------------------------------

var API_URL = 'https://feiying.litenews.cn/api/v1/auth/exchange';

// 签名盐（页面里变量名 mxpx）
var SIGN_SALT = 'QZMVKTRHPLXADJNE';

// AES 参数（页面里 key 叫 aly，IV 是 16 个 '0'）
var AES_KEY = 'BWRFYSNCOGIXUTPA';
var AES_IV = '0000000000000000';

var UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';

// Referer 决定 403 与否（必须带 iqilu 域名）；UA 不能为空。
// Content-Type 依次尝试，前两个实测都可用；绝不能落到 x-www-form-urlencoded。
var CONTENT_TYPES = ['text/plain', 'application/json', 'application/octet-stream'];

// 频道表（只做这两个台）
var CHANNELS = [
    { key: 'sdtv', mark: '24581', name: '山东卫视' },
    { key: 'sepd', mark: '24605', name: '山东少儿' },
];

// ---------------------------------------------------------------------------
// 编码工具
// ---------------------------------------------------------------------------

function utf8Bytes(str) {
    var s = String(str);
    var out = [];
    for (var i = 0; i < s.length; i++) {
        var c = s.charCodeAt(i);
        if (c < 0x80) {
            out.push(c);
        } else if (c < 0x800) {
            out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
        } else if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) {
            var c2 = s.charCodeAt(++i);
            var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
            out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
        } else {
            out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
        }
    }
    return out;
}

function utf8Decode(bytes) {
    var out = '';
    var i = 0;
    while (i < bytes.length) {
        var b = bytes[i++];
        var cp;
        if (b < 0x80) {
            cp = b;
        } else if (b >= 0xc0 && b < 0xe0) {
            cp = ((b & 0x1f) << 6) | (bytes[i++] & 0x3f);
        } else if (b >= 0xe0 && b < 0xf0) {
            cp = ((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
        } else {
            cp =
                ((b & 0x07) << 18) |
                ((bytes[i++] & 0x3f) << 12) |
                ((bytes[i++] & 0x3f) << 6) |
                (bytes[i++] & 0x3f);
        }
        if (cp > 0xffff) {
            cp -= 0x10000;
            out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
        } else {
            out += String.fromCharCode(cp);
        }
    }
    return out;
}

var B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function b64encode(bytes) {
    var out = '';
    var i;
    for (i = 0; i + 2 < bytes.length; i += 3) {
        var n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
        out +=
            B64_CHARS.charAt((n >> 18) & 63) +
            B64_CHARS.charAt((n >> 12) & 63) +
            B64_CHARS.charAt((n >> 6) & 63) +
            B64_CHARS.charAt(n & 63);
    }
    var rest = bytes.length - i;
    if (rest === 1) {
        var n1 = bytes[i] << 16;
        out += B64_CHARS.charAt((n1 >> 18) & 63) + B64_CHARS.charAt((n1 >> 12) & 63) + '==';
    } else if (rest === 2) {
        var n2 = (bytes[i] << 16) | (bytes[i + 1] << 8);
        out +=
            B64_CHARS.charAt((n2 >> 18) & 63) +
            B64_CHARS.charAt((n2 >> 12) & 63) +
            B64_CHARS.charAt((n2 >> 6) & 63) +
            '=';
    }
    return out;
}

// 先把非 base64 字符与尾部 '=' 全部剥掉，再进 4 字符一组的主循环，
// 避免循环里对 '=' 求 indexOf 得 -1 就 break、静默少解出字节。
function b64decode(str) {
    var clean = String(str).replace(/[^A-Za-z0-9+/]/g, '');
    var out = [];
    var i;
    for (i = 0; i + 3 < clean.length; i += 4) {
        var n =
            (B64_CHARS.indexOf(clean.charAt(i)) << 18) |
            (B64_CHARS.indexOf(clean.charAt(i + 1)) << 12) |
            (B64_CHARS.indexOf(clean.charAt(i + 2)) << 6) |
            B64_CHARS.indexOf(clean.charAt(i + 3));
        out.push((n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff);
    }
    var rest = clean.length - i;
    if (rest === 2) {
        var m2 = (B64_CHARS.indexOf(clean.charAt(i)) << 18) | (B64_CHARS.indexOf(clean.charAt(i + 1)) << 12);
        out.push((m2 >> 16) & 0xff);
    } else if (rest === 3) {
        var m3 =
            (B64_CHARS.indexOf(clean.charAt(i)) << 18) |
            (B64_CHARS.indexOf(clean.charAt(i + 1)) << 12) |
            (B64_CHARS.indexOf(clean.charAt(i + 2)) << 6);
        out.push((m3 >> 16) & 0xff, (m3 >> 8) & 0xff);
    }
    return out;
}

// ---------------------------------------------------------------------------
// MD5
// ---------------------------------------------------------------------------

var MD5_K = (function () {
    var k = [];
    for (var i = 0; i < 64; i++) k.push(Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296));
    return k;
})();

var MD5_S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

function rotl32(x, c) {
    return (x << c) | (x >>> (32 - c));
}

function md5hex(str) {
    var data = utf8Bytes(str);
    var bitLen = data.length * 8;

    var buf = data.slice(0);
    buf.push(0x80);
    while (buf.length % 64 !== 56) buf.push(0);
    var lo = bitLen >>> 0;
    var hi = Math.floor(bitLen / 4294967296);
    buf.push(lo & 0xff, (lo >>> 8) & 0xff, (lo >>> 16) & 0xff, (lo >>> 24) & 0xff);
    buf.push(hi & 0xff, (hi >>> 8) & 0xff, (hi >>> 16) & 0xff, (hi >>> 24) & 0xff);

    var a0 = 1732584193, b0 = -271733879, c0 = -1732584194, d0 = 271733878;

    for (var off = 0; off < buf.length; off += 64) {
        var m = [];
        for (var j = 0; j < 16; j++) {
            m.push(
                buf[off + j * 4] |
                    (buf[off + j * 4 + 1] << 8) |
                    (buf[off + j * 4 + 2] << 16) |
                    (buf[off + j * 4 + 3] << 24)
            );
        }
        var a = a0, b = b0, c = c0, d = d0;
        for (var i = 0; i < 64; i++) {
            var f, g;
            if (i < 16) {
                f = (b & c) | (~b & d);
                g = i;
            } else if (i < 32) {
                f = (d & b) | (~d & c);
                g = (5 * i + 1) % 16;
            } else if (i < 48) {
                f = b ^ c ^ d;
                g = (3 * i + 5) % 16;
            } else {
                f = c ^ (b | ~d);
                g = (7 * i) % 16;
            }
            var tmp = d;
            d = c;
            c = b;
            b = (b + rotl32((a + f + MD5_K[i] + m[g]) | 0, MD5_S[i])) | 0;
            a = tmp;
        }
        a0 = (a0 + a) | 0;
        b0 = (b0 + b) | 0;
        c0 = (c0 + c) | 0;
        d0 = (d0 + d) | 0;
    }

    function word2hex(n) {
        var s = '';
        for (var k = 0; k < 4; k++) {
            var byte = (n >>> (k * 8)) & 0xff;
            s += (byte < 16 ? '0' : '') + byte.toString(16);
        }
        return s;
    }
    return word2hex(a0) + word2hex(b0) + word2hex(c0) + word2hex(d0);
}

// ---------------------------------------------------------------------------
// AES-128（ECB 轮函数 + CBC + PKCS7；S 盒运行时生成，避免抄错常量表）
// ---------------------------------------------------------------------------

function gfMul(a, b) {
    var p = 0;
    for (var i = 0; i < 8; i++) {
        if (b & 1) p ^= a;
        var hi = a & 0x80;
        a = (a << 1) & 0xff;
        if (hi) a ^= 0x1b;
        b >>= 1;
    }
    return p & 0xff;
}

function gfPow(a, n) {
    var r = 1;
    while (n > 0) {
        if (n & 1) r = gfMul(r, a);
        a = gfMul(a, a);
        n >>= 1;
    }
    return r;
}

function rotl8(x, n) {
    return ((x << n) | (x >>> (8 - n))) & 0xff;
}

var AES_SBOX = (function () {
    var s = [];
    for (var i = 0; i < 256; i++) {
        var x = i === 0 ? 0 : gfPow(i, 254);
        s.push((x ^ rotl8(x, 1) ^ rotl8(x, 2) ^ rotl8(x, 3) ^ rotl8(x, 4) ^ 0x63) & 0xff);
    }
    return s;
})();

var AES_INV_SBOX = (function () {
    var inv = [];
    for (var i = 0; i < 256; i++) inv[AES_SBOX[i]] = i;
    return inv;
})();

function xtime(a) {
    return ((a << 1) ^ (a & 0x80 ? 0x1b : 0)) & 0xff;
}

function aesExpandKey(key) {
    var w = [];
    var i, j, t;
    for (i = 0; i < 4; i++) w.push([key[i * 4], key[i * 4 + 1], key[i * 4 + 2], key[i * 4 + 3]]);
    var rcon = 1;
    for (i = 4; i < 44; i++) {
        t = w[i - 1].slice(0);
        if (i % 4 === 0) {
            t = [AES_SBOX[t[1]] ^ rcon, AES_SBOX[t[2]], AES_SBOX[t[3]], AES_SBOX[t[0]]];
            rcon = xtime(rcon);
        }
        for (j = 0; j < 4; j++) t[j] ^= w[i - 4][j];
        w.push(t);
    }
    return w;
}

function addRoundKey(s, w, round) {
    for (var col = 0; col < 4; col++) {
        var word = w[round * 4 + col];
        for (var row = 0; row < 4; row++) s[4 * col + row] ^= word[row];
    }
}

function shiftRows(s) {
    var o = [];
    for (var row = 0; row < 4; row++)
        for (var col = 0; col < 4; col++) o[4 * col + row] = s[4 * ((col + row) % 4) + row];
    return o;
}

function invShiftRows(s) {
    var o = [];
    for (var row = 0; row < 4; row++)
        for (var col = 0; col < 4; col++) o[4 * col + row] = s[4 * ((col - row + 4) % 4) + row];
    return o;
}

function mixColumns(s) {
    var o = [];
    for (var c = 0; c < 4; c++) {
        var a0 = s[4 * c], a1 = s[4 * c + 1], a2 = s[4 * c + 2], a3 = s[4 * c + 3];
        var t = a0 ^ a1 ^ a2 ^ a3;
        o[4 * c] = a0 ^ t ^ xtime(a0 ^ a1);
        o[4 * c + 1] = a1 ^ t ^ xtime(a1 ^ a2);
        o[4 * c + 2] = a2 ^ t ^ xtime(a2 ^ a3);
        o[4 * c + 3] = a3 ^ t ^ xtime(a3 ^ a0);
    }
    return o;
}

function invMixColumns(s) {
    var o = [];
    for (var c = 0; c < 4; c++) {
        var a0 = s[4 * c], a1 = s[4 * c + 1], a2 = s[4 * c + 2], a3 = s[4 * c + 3];
        o[4 * c] = gfMul(a0, 14) ^ gfMul(a1, 11) ^ gfMul(a2, 13) ^ gfMul(a3, 9);
        o[4 * c + 1] = gfMul(a0, 9) ^ gfMul(a1, 14) ^ gfMul(a2, 11) ^ gfMul(a3, 13);
        o[4 * c + 2] = gfMul(a0, 13) ^ gfMul(a1, 9) ^ gfMul(a2, 14) ^ gfMul(a3, 11);
        o[4 * c + 3] = gfMul(a0, 11) ^ gfMul(a1, 13) ^ gfMul(a2, 9) ^ gfMul(a3, 14);
    }
    return o;
}

function aesEncryptBlock(block, w) {
    var s = block.slice(0);
    addRoundKey(s, w, 0);
    for (var r = 1; r <= 10; r++) {
        for (var i = 0; i < 16; i++) s[i] = AES_SBOX[s[i]];
        s = shiftRows(s);
        if (r !== 10) s = mixColumns(s);
        addRoundKey(s, w, r);
    }
    return s;
}

function aesDecryptBlock(block, w) {
    var s = block.slice(0);
    addRoundKey(s, w, 10);
    for (var r = 9; r >= 0; r--) {
        s = invShiftRows(s);
        for (var i = 0; i < 16; i++) s[i] = AES_INV_SBOX[s[i]];
        addRoundKey(s, w, r);
        if (r !== 0) s = invMixColumns(s);
    }
    return s;
}

function aesEncrypt(plainText, keyStr, ivStr) {
    var key = utf8Bytes(keyStr);
    var prev = utf8Bytes(ivStr);
    var w = aesExpandKey(key);

    var data = utf8Bytes(plainText);
    var padLen = 16 - (data.length % 16);
    for (var p = 0; p < padLen; p++) data.push(padLen);

    var out = [];
    for (var off = 0; off < data.length; off += 16) {
        var blk = data.slice(off, off + 16);
        for (var x = 0; x < 16; x++) blk[x] ^= prev[x];
        blk = aesEncryptBlock(blk, w);
        for (var y = 0; y < 16; y++) out.push(blk[y]);
        prev = blk;
    }
    return b64encode(out);
}

function aesDecrypt(b64, keyStr, ivStr) {
    var key = utf8Bytes(keyStr);
    var prev = utf8Bytes(ivStr);
    var w = aesExpandKey(key);

    var data = b64decode(b64);
    var out = [];
    for (var off = 0; off + 16 <= data.length; off += 16) {
        var blk = data.slice(off, off + 16);
        var dec = aesDecryptBlock(blk, w);
        for (var x = 0; x < 16; x++) out.push(dec[x] ^ prev[x]);
        prev = blk; // 必须是原始密文块
    }
    if (out.length > 0) {
        var pad = out[out.length - 1];
        if (pad > 0 && pad <= 16 && pad <= out.length) out = out.slice(0, out.length - pad);
    }
    return utf8Decode(out);
}

// ---------------------------------------------------------------------------
// HTTP 层
// ---------------------------------------------------------------------------
// 说明：酷9 不同版本对内建请求函数的定义并不一致，官方 Script.js 里是
//   var res = ku9.post( url , headers , "***" );      // 返回 String
// 而新版本以及大量实战脚本用的是
//   var res = ku9.request( url, "POST", headers, body, true );  // 返回 {code, body}
//   甚至 ku9.get(url) 也会返回 {code, body}
// 所以这里不写死某一种，而是按候选顺序逐个试，用「能否解出 code:1」当判据。

// 把各种可能的返回值统一抽成 body 字符串
function extractBody(raw) {
    if (raw === null || raw === undefined) return '';
    if (typeof raw === 'string') return raw;
    if (typeof raw === 'object') {
        if (typeof raw.body === 'string') return raw.body;
        if (typeof raw.data === 'string') return raw.data;
        if (typeof raw.text === 'string') return raw.text;
        if (typeof raw.result === 'string') return raw.result;
        try {
            return JSON.stringify(raw);
        } catch (e) {
            return '';
        }
    }
    return String(raw);
}

// 候选调用方式。name 只用于出错时提示。
var POST_APIS = [
    { name: 'post(url,headers,body)', fn: function (u, h, b) { return ku9.post(u, h, b); } },
    { name: 'request(url,POST,headers,body,true)', fn: function (u, h, b) { return ku9.request(u, 'POST', h, b, true); } },
    { name: 'request(url,POST,headers,body)', fn: function (u, h, b) { return ku9.request(u, 'POST', h, b); } },
    {
        name: 'request({url,method,headers,body})',
        fn: function (u, h, b) { return ku9.request({ url: u, method: 'POST', headers: h, body: b }); },
    },
    { name: 'getHeaders(url,headers,false,POST,body)', fn: function (u, h, b) { return ku9.getHeaders(u, h, false, 'POST', b); } },
];

function apiHeaders(contentType) {
    return {
        'User-Agent': UA,
        'Content-Type': contentType,
        Referer: 'https://v.iqilu.com/',
        Origin: 'https://v.iqilu.com',
    };
}

// 单次请求。返回 { ok, body, note, thrown }
function callOnce(apiIdx, contentType, url, body) {
    var api = POST_APIS[apiIdx];
    var raw;
    try {
        raw = api.fn(url, apiHeaders(contentType), body);
    } catch (e) {
        // 该版本没有这个函数（TypeError）——后续就不用再试它了
        return { ok: false, body: '', thrown: true, note: api.name + ' 不存在' };
    }
    var text = extractBody(raw);
    if (!text) {
        return { ok: false, body: '', note: api.name + ' 返回空(' + (raw === null ? 'null' : typeof raw) + ')' };
    }
    return { ok: true, body: text, note: api.name };
}

// 把服务端返回解析成播放地址
// 返回 { url } 或 { err, kind }
function parseResponse(text) {
    var t = String(text).replace(/^\s+|\s+$/g, '');

    // CDN 防盗链拦截
    if (t.indexOf('403 Forbidden') >= 0 || t.indexOf('<html') === 0 || t.indexOf('<!DOCTYPE') === 0) {
        return { kind: 'auth', err: '被 CDN 拦截(403)' };
    }
    // 明文错误 JSON
    if (t.charAt(0) === '{') {
        var msg = t;
        try {
            var ej = JSON.parse(t);
            msg = ej.errmsg || ej.msg || t;
        } catch (e) {
            /* 保留原文 */
        }
        return { kind: 'plain', err: msg };
    }
    // 密文
    var plain;
    try {
        plain = aesDecrypt(t, AES_KEY, AES_IV);
    } catch (e2) {
        return { kind: 'dec', err: '解密异常' };
    }
    var json;
    try {
        json = JSON.parse(plain);
    } catch (e3) {
        // 解出来不是 JSON，通常意味着响应根本没经过这套 AES，或请求头/请求体没送达
        return { kind: 'shape', err: '响应无法解析（请求头或请求体可能未正常送达）' };
    }
    if (json && json.code === 1 && json.data && String(json.data).indexOf('http') === 0) {
        return { url: String(json.data) };
    }
    return { kind: 'shape', err: '接口返回 code≠1' };
}

// 换取某频道播放地址
// 逐一尝试「Content-Type × 请求函数」的全部组合，任一组能解出 code:1 就返回。
// 正常情况下第一个组合就成，只有出问题时才会把矩阵跑完（用于最大化命中率）。
function requestPlayUrl(mark, verbose) {
    var body = aesEncrypt(JSON.stringify({ channelMark: mark }), AES_KEY, AES_IV);
    var deadApi = {}; // 已确认不存在的请求函数，后续跳过
    var notes = [];
    var lastErr = '';

    for (var c = 0; c < CONTENT_TYPES.length; c++) {
        for (var i = 0; i < POST_APIS.length; i++) {
            if (deadApi[i]) continue;

            var t = new Date().getTime();
            var s = md5hex(mark + t + SIGN_SALT);
            var url = API_URL + '?t=' + t + '&s=' + s;

            var r = callOnce(i, CONTENT_TYPES[c], url, body);
            if (!r.ok) {
                if (r.thrown) deadApi[i] = 1;
                else if (notes.length < 4) notes.push(r.note);
                continue;
            }

            var res = parseResponse(r.body);
            if (res.url) return { url: res.url };

            if (!lastErr) lastErr = res.err;
            if (notes.length < 4) {
                notes.push((c === 0 ? '' : CONTENT_TYPES[c] + '/') + POST_APIS[i].name + '→' + res.err);
            }
        }
    }

    if (!lastErr) {
        return {
            error: '接口无响应（' + (notes[0] || '所有请求方式均失败') + '）',
            detail: verbose ? notes.join(' | ') : '',
        };
    }
    return { error: lastErr, detail: verbose ? notes.join(' | ') : '' };
}

// ---------------------------------------------------------------------------
// 业务逻辑
// ---------------------------------------------------------------------------

function findChannel(id) {
    if (!id) return null;
    var s = String(id);
    var i;
    for (i = 0; i < CHANNELS.length; i++) if (CHANNELS[i].key === s) return CHANNELS[i];
    for (i = 0; i < CHANNELS.length; i++) if (CHANNELS[i].mark === s) return CHANNELS[i];
    for (i = 0; i < CHANNELS.length; i++) if (CHANNELS[i].name === s) return CHANNELS[i];
    var n = parseInt(s, 10);
    if (!isNaN(n) && String(n) === s && n >= 1 && n <= CHANNELS.length) return CHANNELS[n - 1];
    for (i = 0; i < CHANNELS.length; i++) if (CHANNELS[i].name.indexOf(s) >= 0) return CHANNELS[i];
    return null;
}

function channelHint() {
    var a = [];
    for (var i = 0; i < CHANNELS.length; i++) a.push(CHANNELS[i].key);
    return a.join(' / ');
}

function main(item) {
    var params = item || {};
    var id = params.id ? String(params.id) : 'list';
    var verbose = id === 'debug';

    if (id === 'list' || verbose) {
        var lines = ['#EXTM3U'];
        var firstErr = '';
        for (var i = 0; i < CHANNELS.length; i++) {
            var ch = CHANNELS[i];
            var r;
            try {
                r = requestPlayUrl(ch.mark, verbose);
            } catch (e) {
                r = { error: String(e) };
            }
            if (r.url) {
                lines.push('#EXTINF:-1,' + ch.name);
                lines.push(r.url);
            } else if (!firstErr) {
                firstErr = ch.name + '：' + r.error + (r.detail || '');
            }
        }
        if (lines.length === 1) {
            return { error: '获取失败（' + firstErr + '）' };
        }
        return { m3u8: lines.join('\n') };
    }

    var c = findChannel(id);
    if (!c) {
        return { error: '未找到频道：' + id + '（可用：' + channelHint() + '，也可填频道名或序号）' };
    }

    var res;
    try {
        res = requestPlayUrl(c.mark, verbose);
    } catch (e2) {
        return { error: '获取「' + c.name + '」直播地址异常：' + e2 };
    }
    if (!res.url) {
        return { error: '「' + c.name + '」获取失败：' + res.error + (res.detail || '') };
    }

    return { url: res.url, headers: {} };
}

// 兼容导出：网络脚本（eval / Function 包装）外层也要能拿到 main
(function (g) {
    g = g || (typeof globalThis !== 'undefined' ? globalThis : this);
    g.main = main;
})(typeof globalThis !== 'undefined' ? globalThis : this);
