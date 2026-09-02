/**
 * xian.js —— 西安广播电视台（XA City）直播源解析脚本
 *
 * 由 xian.php 移植而来，频道映射、请求头、改写逻辑与 php 版保持一致。
 * 用法（酷9 频道地址）：
 *     http://你的服务器/ku9/js/xian.js?id=1   // 西安新闻综合
 *     http://你的服务器/ku9/js/xian.js?id=2   // 西安都市频道
 *     http://你的服务器/ku9/js/xian.js?id=7   // 西安移动电视
 *     http://你的服务器/ku9/js/xian.js?id=list // 全部频道 m3u8 列表
 *
 * id 可取值：1 / 2 / 7 / list；不传 id 时默认返回 list。
 *
 * 用到的酷9内置函数：ku9.get(url, headers)
 */

// ---------------------------------------------------------------------------
// 配置区
// ---------------------------------------------------------------------------

// 频道 ID -> 原始 m3u8 地址（同 xian.php $channels）
const CHANNEL_MAP = {
    '1': 'https://stream.xiancity.cn/live/1/index.m3u8', // 西安新闻综合
    '2': 'https://stream.xiancity.cn/live/2/index.m3u8', // 西安都市频道
    '7': 'https://stream.xiancity.cn/live/7/index.m3u8', // 西安移动电视
};

// 频道 ID -> 显示名称（列表分组用）
const CHANNEL_NAME_MAP = {
    '1': '西安新闻综合',
    '2': '西安都市频道',
    '7': '西安移动电视',
};

// 访问 stream.xiancity.cn 必须携带的请求头（反盗链，同 xian.php fetchRemote）
const PLAY_HEADERS = {
    'Accept': '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Origin': 'https://v.xiancity.cn',
    'Referer': 'https://v.xiancity.cn/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0',
};

// 分片代理地址（可选，强烈推荐）。
// 留空 = 模式2：直接把 m3u8 交给酷9 播放（依赖酷9 把上面的 headers 透传到每个 TS 分片）。
// 若填你在 phpstudy 上 xian.php 的地址（如 http://内网或公网IP/iptv.org/xian.php），
// 则进入模式1：把 m3u8 内分片/key/map 的地址改写为经该代理转发，由代理注入 headers ——
// 不依赖酷9 是否透传，最稳。结尾不要带 '?'。
const PROXY_BASE = '';

// 本脚本自身的公开地址（list 模式用它生成自引用的子项）。
// 例如脚本放在 http://你的服务器/ku9/js/xian.js，就填这个完整地址。
const SCRIPT_BASE = '';

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/** 判断 obj 自身是否含有 key 属性（避免原型链污染误判） */
function has(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

/** 纯 JS 标准 base64 编码（不依赖 btoa，保证与 php base64_decode 互通） */
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64encode(str) {
    let out = '';
    let i = 0;
    const n = str.length;
    while (i < n) {
        const c1 = str.charCodeAt(i++);
        const c2 = i < n ? str.charCodeAt(i++) : NaN;
        const c3 = i < n ? str.charCodeAt(i++) : NaN;
        const e1 = c1 >> 2;
        const e2 = ((c1 & 3) << 4) | (isNaN(c2) ? 0 : (c2 >> 4));
        const e3 = isNaN(c2) ? 64 : (((c2 & 15) << 2) | (isNaN(c3) ? 0 : (c3 >> 6)));
        const e4 = isNaN(c3) ? 64 : (c3 & 63);
        out += B64_CHARS.charAt(e1) + B64_CHARS.charAt(e2) +
            (e3 === 64 ? '=' : B64_CHARS.charAt(e3)) +
            (e4 === 64 ? '=' : B64_CHARS.charAt(e4));
    }
    return out;
}

/** 将相对/绝对路径转成绝对 URL（同 xian.php toAbsoluteUrl） */
function toAbsoluteUrl(url, baseUrl) {
    if (/^https?:\/\//i.test(url)) return url;                 // 已是绝对地址
    if (url.length > 0 && url[0] === '/') {                   // 以 / 开头，相对于域名根
        const m = /^([a-z]+:\/\/[^/]+)/i.exec(baseUrl);
        const schemeHost = m ? m[1] : 'https://stream.xiancity.cn';
        return schemeHost + url;
    }
    return baseUrl.replace(/\/+$/, '') + '/' + url.replace(/^\/+/, ''); // 普通相对路径
}

/** 构建代理 URL（同 xian.php buildProxyUrl） */
function buildProxyUrl(absUrl) {
    return PROXY_BASE + '?seg=' + encodeURIComponent(b64encode(absUrl));
}

/** 重写 m3u8：把分片/key/map 的 URI 改为走代理（同 xian.php rewriteM3u8） */
function rewriteM3u8(content, baseUrl) {
    const lines = content.split('\n');
    const out = [];
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].replace(/\r$/, '');
        if (/^#EXT-X-KEY:/.test(line) || /^#EXT-X-MAP:/.test(line)) {
            // 处理 URI="..." 标签
            out.push(line.replace(/URI="([^"]+)"/g, function (m, u) {
                return 'URI="' + buildProxyUrl(toAbsoluteUrl(u, baseUrl)) + '"';
            }));
        } else if (line.length > 0 && line[0] !== '#') {
            // 普通资源行（TS / 子 m3u8 等）
            out.push(buildProxyUrl(toAbsoluteUrl(line, baseUrl)));
        } else {
            // 注释、#EXTINF 等原样保留
            out.push(line);
        }
    }
    return out.join('\n');
}

// ---------------------------------------------------------------------------
// 核心逻辑
// ---------------------------------------------------------------------------

/**
 * 解析单个频道，返回可直接交给酷9 的描述
 * @param {string} id 频道 ID（'1'/'2'/'7'）
 * @returns {object} {m3u8} | {url, headers} | {error}
 */
function resolveChannel(id) {
    if (!has(CHANNEL_MAP, id)) return null;
    const m3u8Url = CHANNEL_MAP[id];

    // 先探测源是否可达（带 headers），并取回内容用于改写
    let content;
    try {
        content = ku9.get(m3u8Url, PLAY_HEADERS);
    } catch (e) {
        return { error: '获取频道 ' + id + ' 的直播流异常：' + e };
    }
    if (typeof content !== 'string' || content.trim().length === 0) {
        return { error: '获取频道 ' + id + ' 的直播流失败（源不可达或未返回内容）' };
    }

    if (PROXY_BASE) {
        // 模式1：改写分片走代理，返回重写后的 m3u8 文本
        const baseUrl = m3u8Url.replace(/\/[^/]*$/, '/'); // dirname
        return { m3u8: rewriteM3u8(content, baseUrl) };
    }

    // 模式2：直接返回 m3u8 地址 + headers（依赖酷9 透传到分片）
    return { url: m3u8Url, headers: PLAY_HEADERS };
}

/**
 * 生成全部频道的 m3u8 列表（自引用子项，由酷9 再次调用本脚本）
 * @returns {object} {m3u8} | {error}
 */
function buildList() {
    if (!SCRIPT_BASE) {
        return { error: 'list 模式需要配置 SCRIPT_BASE（本脚本的公开地址）' };
    }
    const lines = ['#EXTM3U'];
    Object.keys(CHANNEL_MAP).forEach(function (id) {
        lines.push('#EXTINF:-1,' + CHANNEL_NAME_MAP[id]);
        lines.push(SCRIPT_BASE + '?id=' + id);
    });
    return { m3u8: lines.join('\n') };
}

/**
 * 酷9 JS 脚本入口
 * @param {object} item 传入参数对象，取 item.id 作为频道标识
 * @returns {object} {url, headers} | {m3u8} | {error}
 */
function main(item) {
    const params = item || {};
    const id = params.id || 'list';

    // 列表请求
    if (id === 'list') return buildList();

    // 单频道请求
    return resolveChannel(id) || { error: '无效的频道ID: ' + id + '，可用：1, 2, 7' };
}

// 兼容导出：确保无论酷9以何种方式加载脚本（eval / Function 包装等），
// 外层的 main 调用都能找到本函数。
(function () {
    var g = (typeof globalThis !== 'undefined') ? globalThis
          : (typeof global !== 'undefined') ? global
          : this;
    if (g) { g.main = main; }
    if (typeof module !== 'undefined' && module.exports) { module.exports = { main: main }; }
})();
