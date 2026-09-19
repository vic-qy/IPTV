/**
 * 内蒙古广播电视台（奔腾融媒）直播源 —— 酷9 (ku9) JS 脚本
 *
 * 来源页面：https://www.nmtv.cn/liveTv
 *
 * ---------------------------------------------------------------------------
 * 接口链路（两步，实为一步）
 *   1) GET  https://api-bt.nmtv.cn/broadcast/list?type=1&size=100
 *      → 返回体是「XXTEA 加密后的 base64 字符串」，
 *        密钥 5b28bae827e651b3，解密后是 JSON，data[] 就是频道数组
 *   2) 每个频道的 data.streamUrl 即播放地址（腾讯云 txSecret/txTime + token 签名）
 *
 *   注意：POST 同一路径也返回相同数据，但 POST 需要 body 加密，
 *        而 GET 完全等价（已实测两版数据一致），所以本脚本走 GET，
 *        只用 ku9.get 一个内置函数，不依赖 ku9.post 的 body 传参行为。
 *
 * 关于鉴权（实测结论，别删参数）
 *   - 裸地址 https://livestream-bt.nmtv.cn/nmtv/{id}general.m3u8       → 403
 *   - 带 txSecret + txTime 但缺 token                                   → 403
 *   - 带 txSecret + txTime + token                                      → 200
 *   所以必须走接口取地址，没有静态拼地址的兜底方案。
 *   好消息：接口下发的 txTime 是长期值（实测 2028 / 2033 年），列表模式可长期用。
 *
 * 用法
 *   ?id=list        （或省略）→ 返回全部 20 个频道的 #EXTM3U
 *   ?id=2316        → 按频道 id
 *   ?id=新闻综合     → 按频道名（支持包含匹配，如「新闻」「卫视」）
 *   ?id=3           → 按序号（1 起）
 *
 * 频道 sourceId 见文件末尾 CHANNEL_INDEX 注释。
 * ---------------------------------------------------------------------------
 */

// ===========================================================================
// 配置
// ===========================================================================
var API_BASE = 'https://api-bt.nmtv.cn';
var XXTEA_KEY = '5b28bae827e651b3';

var API_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Encoding': 'identity',
    'Client-Type': 'web',
    'Origin': 'https://www.nmtv.cn',
    'Referer': 'https://www.nmtv.cn/'
};

// 播放地址所需的请求头（m3u8 与分片均可直连，带上是保险）
var PLAY_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0',
    'Referer': 'https://www.nmtv.cn/'
};

// ===========================================================================
// XXTEA 实现（对齐 xxtea-js 语义：encryptToString / decryptToString）
//   本脚本只需要 decryptToString，但保留 encrypt 以便必要时切换 POST。
// ===========================================================================
var _DELTA = 0x9E3779B9;

function _str2bytes(s) {
    var out = [], i, c, c2, cp;
    for (i = 0; i < s.length; i++) {
        c = s.charCodeAt(i);
        if (c < 0x80) {
            out.push(c);
        } else if (c < 0x800) {
            out.push(0xC0 | (c >> 6));
            out.push(0x80 | (c & 63));
        } else if (c < 0xD800 || c >= 0xE000) {
            out.push(0xE0 | (c >> 12));
            out.push(0x80 | ((c >> 6) & 63));
            out.push(0x80 | (c & 63));
        } else {
            i++;
            c2 = s.charCodeAt(i);
            cp = 0x10000 + (((c & 0x3FF) << 10) | (c2 & 0x3FF));
            out.push(0xF0 | (cp >> 18));
            out.push(0x80 | ((cp >> 12) & 63));
            out.push(0x80 | ((cp >> 6) & 63));
            out.push(0x80 | (cp & 63));
        }
    }
    return out;
}

function _bytes2str(b) {
    var out = [], i = 0, n = b.length, c, c2, c3, c4, cp;
    while (i < n) {
        c = b[i++];
        if (c < 0x80) {
            out.push(c);
        } else if (c < 0xE0) {
            out.push(((c & 31) << 6) | (b[i++] & 63));
        } else if (c < 0xF0) {
            c2 = b[i++]; c3 = b[i++];
            out.push(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
        } else {
            c2 = b[i++]; c3 = b[i++]; c4 = b[i++];
            cp = (((c & 7) << 18) | ((c2 & 63) << 12) | ((c3 & 63) << 6) | (c4 & 63)) - 0x10000;
            out.push(0xD800 + (cp >> 10));
            out.push(0xDC00 + (cp & 0x3FF));
        }
    }
    // 分块拼接，避免超大数组触发 apply 参数上限
    var s = '', CH = 8192;
    for (i = 0; i < out.length; i += CH) {
        s += String.fromCharCode.apply(String, out.slice(i, i + CH));
    }
    return s;
}

var _B64MAP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function _b64decode(str) {
    var s = String(str).replace(/[^A-Za-z0-9+/=]/g, '');
    var n = s.length, out = [], i, a, b, c, d;
    // 先剥掉尾部 '='（不能留在循环里，否则 indexOf 返回 -1 会中断解码）
    var pad = 0;
    while (n > 0 && s.charAt(n - 1) === '=') { pad++; n--; }
    var body = s.substring(0, n);
    for (i = 0; i + 4 <= n; i += 4) {
        a = _B64MAP.indexOf(body.charAt(i));
        b = _B64MAP.indexOf(body.charAt(i + 1));
        c = _B64MAP.indexOf(body.charAt(i + 2));
        d = _B64MAP.indexOf(body.charAt(i + 3));
        out.push((a << 2) | (b >> 4));
        out.push(((b & 15) << 4) | (c >> 2));
        out.push(((c & 3) << 6) | d);
    }
    // 尾部残留 2 / 3 个字符
    var rem = n - i;
    if (rem === 2) {
        a = _B64MAP.indexOf(body.charAt(i));
        b = _B64MAP.indexOf(body.charAt(i + 1));
        out.push((a << 2) | (b >> 4));
    } else if (rem === 3) {
        a = _B64MAP.indexOf(body.charAt(i));
        b = _B64MAP.indexOf(body.charAt(i + 1));
        c = _B64MAP.indexOf(body.charAt(i + 2));
        out.push((a << 2) | (b >> 4));
        out.push(((b & 15) << 4) | (c >> 2));
    }
    return out;
}

function _b64encode(bytes) {
    var out = [], i, b0, b1, b2, n = bytes.length;
    for (i = 0; i < n; i += 3) {
        b0 = bytes[i];
        b1 = i + 1 < n ? bytes[i + 1] : 0;
        b2 = i + 2 < n ? bytes[i + 2] : 0;
        out.push(_B64MAP.charAt(b0 >> 2));
        out.push(_B64MAP.charAt(((b0 & 3) << 4) | (b1 >> 4)));
        out.push(i + 1 < n ? _B64MAP.charAt(((b1 & 15) << 2) | (b2 >> 6)) : '=');
        out.push(i + 2 < n ? _B64MAP.charAt(b2 & 63) : '=');
    }
    return out.join('');
}

function _fixKeyBytes(kb) {
    var r = kb.slice(0);
    while (r.length < 16) r.push(0);
    return r;
}

function _toUint32(bytes, includeLength) {
    var n = bytes.length;
    var len = (n >> 2) + ((n & 3) ? 1 : 0);
    var total = includeLength ? len + 1 : len;
    var out = new Array(total), i;
    for (i = 0; i < total; i++) out[i] = 0;
    if (includeLength) out[len] = n;
    for (i = 0; i < n; i++) {
        // 注意：必须用 >>> 0（无符号），JS 的 `& 0xFFFFFFFF` 返回的是有符号数
        out[i >> 2] = (out[i >> 2] | (bytes[i] << ((i & 3) << 3))) >>> 0;
    }
    return out;
}

function _toBytes(words, includeLength) {
    var n = words.length;
    var len = n << 2, i, last;
    if (includeLength) {
        len -= 4;
        last = words[n - 1] >>> 0;                        // 用无符号比较，避免负数误判
        if (last < len - 3 || last > len) return null;   // 密钥错 / 数据损坏
        len = last;
    }
    var out = new Array(len);
    for (i = 0; i < len; i++) {
        out[i] = (words[i >> 2] >>> ((i & 3) << 3)) & 0xFF;
    }
    return out;
}

function _mx(sum, y, z, p, e, k) {
    return ((((z >>> 5) ^ (y << 2)) + ((y >>> 3) ^ (z << 4))) ^ ((sum ^ y) + (k[(p & 3) ^ e] ^ z)));
}

function _encryptWords(v, k) {
    var n = v.length;
    if (n < 2) return v;
    var rounds = 6 + Math.floor(52 / n);
    var sum = 0, e, p, y, z = v[n - 1], i;
    for (i = 0; i < rounds; i++) {
        sum = (sum + _DELTA) >>> 0;
        e = (sum >>> 2) & 3;
        for (p = 0; p < n - 1; p++) {
            y = v[p + 1];
            v[p] = (v[p] + _mx(sum, y, z, p, e, k)) >>> 0;
            z = v[p];
        }
        y = v[0];
        v[n - 1] = (v[n - 1] + _mx(sum, y, z, n - 1, e, k)) >>> 0;
        z = v[n - 1];
    }
    return v;
}

function _decryptWords(v, k) {
    var n = v.length;
    if (n < 2) return v;
    var rounds = 6 + Math.floor(52 / n);
    var sum = (rounds * _DELTA) >>> 0;
    var e, p, y = v[0], z, i;
    for (i = 0; i < rounds; i++) {
        e = (sum >>> 2) & 3;
        for (p = n - 1; p > 0; p--) {
            z = v[p - 1];
            v[p] = (v[p] - _mx(sum, y, z, p, e, k)) >>> 0;
            y = v[p];
        }
        z = v[n - 1];
        v[0] = (v[0] - _mx(sum, y, z, 0, e, k)) >>> 0;
        y = v[0];
        sum = (sum - _DELTA) >>> 0;
    }
    return v;
}

function xxteaDecryptToString(b64, keyStr) {
    var data = _b64decode(b64);
    if (!data || data.length === 0) return '';
    var v = _toUint32(data, false);
    var k = _toUint32(_fixKeyBytes(_str2bytes(keyStr)), false);
    var bytes = _toBytes(_decryptWords(v, k), true);
    if (!bytes) return '';
    return _bytes2str(bytes);
}

function xxteaEncryptToString(plain, keyStr) {
    var bytes = _str2bytes(plain);
    if (!bytes.length) return '';
    var v = _toUint32(bytes, true);
    var k = _toUint32(_fixKeyBytes(_str2bytes(keyStr)), false);
    return _b64encode(_toBytes(_encryptWords(v, k), false));
}

// ===========================================================================
// 业务
// ===========================================================================

/** 抹掉外层引号并取出可解码的密文串 */
function normalizeBody(raw) {
    var t = String(raw == null ? '' : raw).replace(/^\s+|\s+$/g, '');
    if (t.length > 1 && t.charAt(0) === '"' && t.charAt(t.length - 1) === '"') {
        try {
            t = JSON.parse(t);
        } catch (e) {
            t = t.substring(1, t.length - 1);
        }
    }
    return t;
}

/** 解密接口响应；已经是明文 JSON 时直接解析 */
function parseResponse(raw) {
    var t = normalizeBody(raw);
    if (!t) return null;
    var first = t.charAt(0);
    if (first === '{' || first === '[') {
        return JSON.parse(t);          // 少数情况返回明文（如 500 错误体）
    }
    var plain = xxteaDecryptToString(t, XXTEA_KEY);
    if (!plain) return null;
    return JSON.parse(plain);
}

/** 拉取频道列表（GET 优先，失败再退回 POST 加密 body） */
function fetchChannels() {
    var url = API_BASE + '/broadcast/list?type=1&size=100';
    var resp, data = null;

    try {
        resp = ku9.get(url, API_HEADERS);
        data = parseResponse(resp);
    } catch (e) {
        data = null;
    }

    if (!data || !data.data || !data.data.length) {
        try {
            var body = xxteaEncryptToString('{"type":1,"size":100}', XXTEA_KEY);
            var h2 = {};
            for (var kk in API_HEADERS) {
                if (API_HEADERS.hasOwnProperty(kk)) h2[kk] = API_HEADERS[kk];
            }
            h2['Content-Type'] = 'application/json';
            resp = ku9.post(API_BASE + '/broadcast/list', h2, body);
            data = parseResponse(resp);
        } catch (e2) {
            data = null;
        }
    }

    if (!data || !data.data || !data.data.length) return [];

    var out = [], i, c, inner, url2;
    for (i = 0; i < data.data.length; i++) {
        c = data.data[i];
        inner = c && c.data ? c.data : null;
        url2 = inner ? inner.streamUrl : '';
        if (!url2 || String(url2).indexOf('http') !== 0) continue;
        out.push({
            id: String(c.id),
            name: String(c.title || c.subTitle || c.id),
            url: url2,
            image: c.image || ''
        });
    }
    return out;
}

/** 按 id / 序号 / 名称定位频道 */
function findChannel(chs, key) {
    var k = String(key).replace(/^\s+|\s+$/g, '');
    var kl = k.toLowerCase(), i, c;

    // 1) 精确 id
    for (i = 0; i < chs.length; i++) {
        if (chs[i].id === k) return chs[i];
    }
    // 2) 精确名称
    for (i = 0; i < chs.length; i++) {
        if (chs[i].name.toLowerCase() === kl) return chs[i];
    }
    // 3) 名称包含（如「新闻」「卫视」「呼和」）
    for (i = 0; i < chs.length; i++) {
        if (chs[i].name.toLowerCase().indexOf(kl) !== -1) return chs[i];
    }
    // 4) 纯数字按「第几个」处理（1 起）
    if (/^\d+$/.test(k)) {
        var idx = parseInt(k, 10);
        if (idx >= 1 && idx <= chs.length) return chs[idx - 1];
    }
    return null;
}

function buildM3U(chs) {
    var lines = ['#EXTM3U'], i, c;
    for (i = 0; i < chs.length; i++) {
        c = chs[i];
        lines.push('#EXTINF:-1 tvg-id="' + c.id + '" tvg-name="' + c.name + '" tvg-logo="' + c.image + '" group-title="内蒙古",' + c.name);
        lines.push(c.url);
    }
    return lines.join('\n');
}

function main(item) {
    try {
        var id = item && item.id != null ? String(item.id) : 'list';
        if (id === '') id = 'list';

        var chs = fetchChannels();
        if (!chs.length) {
            return { error: '内蒙古电视台：获取频道列表失败（接口无数据或密钥变更）。' };
        }

        if (id === 'list' || id === 'all') {
            return { m3u8: buildM3U(chs) };
        }

        var ch = findChannel(chs, id);
        if (!ch) {
            var names = [], i;
            for (i = 0; i < chs.length; i++) names.push(chs[i].name);
            return { error: '内蒙古电视台：未找到频道「' + id + '」。\n可用频道：' + names.join('、') };
        }

        return { url: ch.url, headers: PLAY_HEADERS };
    } catch (e) {
        return { error: '内蒙古电视台脚本运行出错：' + (e && e.message ? e.message : e) };
    }
}

// 兼容酷9 的加载方式（eval 后在外部作用域取 main），勿加 'use strict'
(function (g) { g.main = main; })(
    typeof globalThis !== 'undefined' ? globalThis
        : typeof window !== 'undefined' ? window
            : typeof global !== 'undefined' ? global : this
);

/* ---------------------------------------------------------------------------
 * 频道速查（?id= 可用值）
 *   3621481 内蒙古卫视        2358 包头        2353 通辽
 *   2315    内蒙古蒙古语卫视   2355 乌海        2346 锡林郭勒
 *   2316    新闻综合          2351 赤峰        2354 乌兰察布
 *   2317    经济生活          2356 呼伦贝尔     2349 鄂尔多斯
 *   2318    少儿频道          2357 兴安盟       2348 巴彦淖尔
 *   2319    文体娱乐                           2347 阿拉善
 *   2320    农牧频道
 *   2321    内蒙古蒙古语文化频道
 *   2331    呼和浩特
 * --------------------------------------------------------------------------- */
