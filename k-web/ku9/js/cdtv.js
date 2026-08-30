/**
 * cdtv.js —— 成都广播电视台（CDTV）直播源解析脚本
 *
 * 由 cdtv.py 移植而来，频道映射、接口地址、返回结构与 py 版保持一致。
 * 用法（酷9 频道地址）：
 *     http://127.0.0.1:9978/ku9/js/cdtv.js?id=cdxw   // 单个频道
 *     http://127.0.0.1:9978/ku9/js/cdtv.js?id=list   // 全部频道 m3u8 列表
 *
 * id 可取值：cdxw / cdjj / cdds / cdys / cdgg / cdse / list
 * 不传 id 时默认返回 list。
 *
 * 用到的酷9内置函数：ku9.get(url, headers)
 */

'use strict';

// ---------------------------------------------------------------------------
// 配置区
// ---------------------------------------------------------------------------

// 频道标识 -> 频道 ID（同 cdtv.py channel_map）
const CHANNEL_MAP = {
    cdxw: 563, // 成都新闻综合
    cdjj: 562, // 成都经济资讯
    cdds: 561, // 成都都市生活
    cdys: 560, // 成都影视文艺
    cdgg: 559, // 成都公共频道
    cdse: 558, // 成都少儿频道
};

// 频道标识 -> 频道名称（列表分组显示用）
const CHANNEL_NAME_MAP = {
    cdxw: '成都新闻综合',
    cdjj: '成都经济资讯',
    cdds: '成都都市生活',
    cdys: '成都影视文艺',
    cdgg: '成都公共频道',
    cdse: '成都少儿频道',
};

// 频道标识 -> 拉流路径参数（小写名 / 大写名）
// 拼装规则：https://cdn1.cditv.cn/{low}high/{up}High.flv/playlist.m3u8
const CHANNEL_STREAM_MAP = {
    cdxw: { low: 'cdtv1', up: 'CDTV1' },
    cdjj: { low: 'cdtv2', up: 'CDTV2' },
    cdds: { low: 'cdtv3', up: 'CDTV3' },
    cdys: { low: 'cdtv4', up: 'CDTV4' },
    cdgg: { low: 'cdtv5', up: 'CDTV5' },
    cdse: { low: 'cdtv6', up: 'CDTV6' },
};

// 调用 getLiveUrl 接口时的请求头
const API_HEADERS = {
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'DNT': '1',
    'Origin': 'https://www.cditv.cn',
    'Referer': 'https://cstvweb.cdmp.candocloud.cn/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0',
};

// 播放器实际拉流时附带的请求头
const PLAY_HEADERS = {
    'Referer': 'https://www.cditv.cn/',
    'User-Agent': 'Mozilla/5.0',
};

// 鉴权地址换取接口
const API_URL = 'https://cstvweb.cdmp.candocloud.cn/live/getLiveUrl';

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/** 判断 obj 自身是否含有 key 属性（避免原型链污染误判） */
function has(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

// ---------------------------------------------------------------------------
// 核心逻辑
// ---------------------------------------------------------------------------

/**
 * 根据频道标识换取真实播放地址
 * @param {string} key 频道标识，如 'cdxw'
 * @returns {string|null} 成功返回带鉴权参数的 m3u8 地址，失败返回 null
 */
function fetchLiveUrl(key) {
    if (!has(CHANNEL_MAP, key)) return null;

    const stream = CHANNEL_STREAM_MAP[key];
    if (!stream) return null;

    // 原始拉流地址（未鉴权，需经接口换取带 wsSecret/wsTime 的临时地址）
    const source =
        'https://cdn1.cditv.cn/' + stream.low + 'high/' + stream.up + 'High.flv/playlist.m3u8';

    const url = API_URL + '?url=' + encodeURIComponent(source);

    // 发起请求，兼容返回字符串或已解析对象的情况
    const res = ku9.get(url, API_HEADERS);
    const data = typeof res === 'string' ? JSON.parse(res) : res;

    if (
        data &&
        data.data &&
        typeof data.data.url === 'string' &&
        data.data.url.length > 0
    ) {
        return data.data.url;
    }
    return null;
}

/**
 * 生成全部频道的 m3u8 列表
 * @returns {object} {m3u8: string} 或 {error: string}
 */
function buildList() {
    const lines = ['#EXTM3U'];

    Object.keys(CHANNEL_MAP).forEach(function (key) {
        const url = fetchLiveUrl(key);
        if (url) {
            lines.push('#EXTINF:-1,' + CHANNEL_NAME_MAP[key]);
            lines.push(url);
        }
        // 获取失败的频道直接跳过，不写入列表
    });

    if (lines.length === 1) {
        return { error: '无法获取任何频道，请检查API或网络' };
    }
    return { m3u8: lines.join('\n') };
}

/**
 * 酷9 JS 脚本入口
 * @param {object} item 传入参数对象，取 item.id 作为频道标识
 * @returns {object} {url, headers} | {m3u8} | {error}
 */
function main(item) {
    const params = item || {};
    const channelId = params.id || 'list';

    // 列表请求：返回全部频道的 m3u8
    if (channelId === 'list') {
        return buildList();
    }

    // 单频道请求
    if (!has(CHANNEL_MAP, channelId)) {
        return {
            error:
                '无效的频道ID: ' +
                channelId +
                '，可用：cdxw, cdjj, cdds, cdys, cdgg, cdse',
        };
    }

    const liveUrl = fetchLiveUrl(channelId);
    if (!liveUrl) {
        return { error: '获取频道 ' + channelId + ' 的直播地址失败' };
    }

    // 地址自带 wsSecret/wsTime 鉴权，直接交给酷9拉流即可
    return {
        url: liveUrl,
        headers: PLAY_HEADERS,
    };
}
