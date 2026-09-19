/*
 * sdtv.js —— 山东广播电视台（齐鲁网 v.iqilu.com）直播源解析脚本（酷9）
 * ---------------------------------------------------------------------------
 * 数据来源：v.iqilu.com 直播页的鉴权交换接口
 *
 *   POST https://feiying.litenews.cn/api/v1/auth/exchange?t=<毫秒时间戳>&s=<签名>
 *        Content-Type: text/plain
 *        Body = AES-128-CBC( '{"channelMark":"<频道号>"}' )
 *        必要请求头：Origin 或 Referer 至少给一个（都给会 403）
 *
 *   - s        = md5( channelMark + t + 'QZMVKTRHPLXADJNE' )   小写十六进制
 *               （服务端强校验：签名与 body 里的 channelMark 必须匹配，否则 md5 check fail）
 *   - AES 密钥 = 'BWRFYSNCOGIXUTPA'，IV = 16 个 '0'，CBC + PKCS7，输出 base64
 * 响应也是同一套 AES 加密的 base64，解出后 JSON 形如
 *        {"code":1,"data":"https://.../playlist.m3u8?k=...&t=..."}
 * 若参数有问题，服务端返回**明文** JSON，如 {"code":0,"errmsg":"md5 check fail!"}
 *
 * 用法（脚本放仓库 js/sdtv.js，走 jsDelivr 等直链）：
 *   单频道：.../sdtv.js?id=sdtv      山东卫视
 *           或 .../sdtv.js?id=山东卫视  .../sdtv.js?id=1  （名称 / 序号 / 频道号都能认）
 *   列表：  .../sdtv.js?id=list       返回 #EXTM3U，全部 9 个频道一次给齐
 *   默认不传 id 等同 id=list
 *
 * 说明：播放地址带 CDN 签名（k/n 与时间戳 m/t），会过期。
 *       单频道模式每次点击都会重新换取新签名；列表模式是订阅时的快照，
 *       若长时间后某个台播不出，刷新一次订阅即可。
 *       实测播放 m3u8 与分片**不需要任何请求头**，所以列表模式也能直接播。
 *
 * 用到的酷9内置函数：ku9.post(url, headers, body)、ku9.get(url, headers)
 * ---------------------------------------------------------------------------
 */

// ---------------------------------------------------------------------------
// 配置区
// ---------------------------------------------------------------------------

// 鉴权交换接口
var API_URL = 'https://feiying.litenews.cn/api/v1/auth/exchange';

// 签名盐（页面里叫 mxpx）
var SIGN_SALT = 'QZMVKTRHPLXADJNE';

// AES 参数（页面里 key 叫 aly，IV 是 16 个 '0'）
var AES_KEY = 'BWRFYSNCOGIXUTPA';
var AES_IV = '0000000000000000';

// 调接口用的请求头。Origin / Referer 缺一不可（服务端 403），
// 实测只给其中一个就能过，这里两个都给，稳一点。
var API_HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
    'Content-Type': 'text/plain',
    Origin: 'https://v.iqilu.com',
    Referer: 'https://v.iqilu.com/',
};

// 播放时的请求头（实测可留空，保留只为保险）
var PLAY_HEADERS = {
    Referer: 'https://v.iqilu.com/',
};

// 频道表：key（英文字段）/ mark（_pdCid 频道号）/ name（中文名）
// mark 来自各直播页里的 var _pdCid = "xxxxx";
var CHANNELS = [
    { key: 'sdtv', mark: '24581', name: '山东卫视' },
    { key: 'qlpd', mark: '24584', name: '齐鲁频道' },
    { key: 'ggpd', mark: '24602', name: '新闻频道' },
    { key: 'typd', mark: '24587', name: '体育休闲' },
    { key: 'shpd', mark: '24596', name: '生活频道' },
    { key: 'zypd', mark: '24593', name: '综艺频道' },
    { key: 'nkpd', mark: '24599', name: '农科频道' },
    { key: 'yspd', mark: '24590', name: '文旅频道' },
    { key: 'sepd', mark: '24605', name: '少儿频道' },
];

// ---------------------------------------------------------------------------
// 编码工具（纯 JS，不依赖酷9 之外的任何库）
// ---------------------------------------------------------------------------

// 字符串 -> UTF-8 字节数组
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
            // 代理对（emoji 等）
            var c2 = s.charCodeAt(++i);
            var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
            out.push(
                0xf0 | (cp >> 18),
                0x80 | ((cp >> 12) & 0x3f),
                0x80 | ((cp >> 6) & 0x3f),
                0x80 | (cp & 0x3f)
            );
        } else {
            out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
        }
    }
    return out;
}

// UTF-8 字节数组 -> 字符串
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

// 注意：先把非 base64 字符与尾部 '=' 全部剥掉，再进 4 字符一组的主循环。
// 若在循环里对 '=' 求 indexOf 得 -1 就 break，会静默少解出几个字节。
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
// MD5（用于接口签名 s）
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

// 返回小写十六进制摘要
function md5hex(str) {
    var data = utf8Bytes(str);
    var bitLen = data.length * 8;

    // 补位：0x80 + 若干 0，使长度 ≡ 56 (mod 64)，再接 8 字节小端长度
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
            // 先 |0 把和压成 int32（JS 的 & / | 结果是有符号数），再循环左移
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
// AES-128（纯 JS：ECB 轮函数 + CBC 模式 + PKCS7）
// 实现说明：S 盒用 GF(2^8) 求逆 + 仿射变换在运行时生成，避免抄错 256 项常量表。
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
        var x = i === 0 ? 0 : gfPow(i, 254); // 乘法逆元
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

// 密钥扩展：16 字节 key -> 44 个字（每字 4 字节）
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

// state 采用列优先：state[4*col + row]
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
// 业务逻辑
// ---------------------------------------------------------------------------

// 换取某个频道的带签名播放地址，失败返回 { error: '...' }
function requestPlayUrl(mark) {
    var t = new Date().getTime();
    var s = md5hex(mark + t + SIGN_SALT);
    var url = API_URL + '?t=' + t + '&s=' + s;
    var body = aesEncrypt(JSON.stringify({ channelMark: mark }), AES_KEY, AES_IV);

    var raw = ku9.post(url, API_HEADERS, body);
    if (raw === null || raw === undefined || raw === '') {
        return { error: '接口无响应' };
    }

    var text = String(raw).replace(/^\s+|\s+$/g, '');

    // 服务端的防盗链拦截：说明 Origin / Referer 没送出去
    if (text.indexOf('403 Forbidden') >= 0 || text.indexOf('<html') === 0) {
        return { error: '接口返回 403，请求头未生效（需确认酷9 的 post 是否透传 headers）' };
    }

    // 参数不对时服务端返回明文 JSON，直接把 errmsg 抛出来，方便排查
    if (text.charAt(0) === '{') {
        var msg = text;
        try {
            var ej = JSON.parse(text);
            msg = ej.errmsg || ej.msg || text;
        } catch (e) {
            /* 保留原文 */
        }
        return { error: '接口返回错误：' + msg };
    }

    var plain;
    try {
        plain = aesDecrypt(text, AES_KEY, AES_IV);
    } catch (e) {
        return { error: '响应解密失败：' + e };
    }

    var json;
    try {
        json = JSON.parse(plain);
    } catch (e2) {
        return { error: '响应不是合法 JSON：' + plain };
    }

    if (json && json.code === 1 && json.data && String(json.data).indexOf('http') === 0) {
        return { url: String(json.data) };
    }
    return { error: '接口返回异常：' + plain };
}

// 按 key / 频道号 / 序号(从1) / 名称模糊 定位频道
function findChannel(id) {
    if (!id) return null;
    var s = String(id);
    var i;

    // 1) key 精确（sdtv / sepd ...）
    for (i = 0; i < CHANNELS.length; i++) {
        if (CHANNELS[i].key === s) return CHANNELS[i];
    }
    // 2) 频道号精确（24581 ...）
    for (i = 0; i < CHANNELS.length; i++) {
        if (CHANNELS[i].mark === s) return CHANNELS[i];
    }
    // 3) 名称精确
    for (i = 0; i < CHANNELS.length; i++) {
        if (CHANNELS[i].name === s) return CHANNELS[i];
    }
    // 4) 序号（从 1 开始）
    var n = parseInt(s, 10);
    if (!isNaN(n) && String(n) === s && n >= 1 && n <= CHANNELS.length) return CHANNELS[n - 1];
    // 5) 名称模糊（山东卫视 / 少儿 ...）
    for (i = 0; i < CHANNELS.length; i++) {
        if (CHANNELS[i].name.indexOf(s) >= 0) return CHANNELS[i];
    }
    return null;
}

function channelKeys() {
    var a = [];
    for (var i = 0; i < CHANNELS.length; i++) a.push(CHANNELS[i].key);
    return a.join(' / ');
}

// 列出全部频道 id 供报错提示
function main(item) {
    var params = item || {};
    var id = params.id ? String(params.id) : 'list';

    // 列表模式：逐台换取，任何一个失败就跳过（不写入列表）
    if (id === 'list') {
        var lines = ['#EXTM3U'];
        var firstErr = '';
        for (var i = 0; i < CHANNELS.length; i++) {
            var ch = CHANNELS[i];
            var r;
            try {
                r = requestPlayUrl(ch.mark);
            } catch (e) {
                r = { error: String(e) };
            }
            if (r.url) {
                lines.push('#EXTINF:-1,' + ch.name);
                lines.push(r.url);
            } else if (!firstErr) {
                firstErr = ch.name + '：' + r.error;
            }
        }
        if (lines.length === 1) {
            return { error: '全部频道获取失败（' + firstErr + '）' };
        }
        return { m3u8: lines.join('\n') };
    }

    // 单频道模式：每次点击重新换取，拿最新签名
    var c = findChannel(id);
    if (!c) {
        return {
            error: '未找到频道：' + id + '（可用：' + channelKeys() + '，也可填频道名或序号）',
        };
    }

    var res;
    try {
        res = requestPlayUrl(c.mark);
    } catch (e2) {
        return { error: '获取「' + c.name + '」直播地址异常：' + e2 };
    }
    if (!res.url) {
        return { error: '获取「' + c.name + '」直播地址失败：' + res.error };
    }

    return { url: res.url, headers: PLAY_HEADERS };
}

// 兼容导出：保证网络脚本（eval / Function 包装）外层也能找到 main
(function (g) {
    g = g || (typeof globalThis !== 'undefined' ? globalThis : this);
    g.main = main;
})(typeof globalThis !== 'undefined' ? globalThis : this);
