/*
 * 江苏广电荔枝网直播（live.jstv.com）酷9 JS 脚本
 * ---------------------------------------------------------------------------
 * 移植自 jstv.py（完整逆向链，三步）：
 *   1. POST  api-auth-lizhi.jstv.com/JwtAuth/GetWebToken  -> 匿名换取 JWT Bearer
 *      （URL 需带 AppID / TT / Sign 三个签名参数，Sign 由 APP_SECRET + 路径 + 参数 + 时间戳 做 md5）
 *   2. GET   publish-lizhi.jstv.com/nav/8385             -> 频道列表（Header 带 Bearer）
 *   3. 把频道地址域名换成 litchi-play-encrypted-site.jstv.com，再做腾讯云防盗链签名
 *
 * 用法（酷9 频道地址，路径须含 /k-web/ku9/js/ 识别串）：
 *   ?id=list            返回全部频道 m3u8（订阅用）
 *   ?id=<en|序号|名称>   返回单频道播放地址（如 jsws / 1 / 江苏卫视 / 江苏新闻）
 *   默认（无 id）        等同 ?id=list
 *
 * 注意：本脚本已把 jstv.py 里被前端混淆的常量解码后硬编码，无需运行时 base64 解码。
 *   APP_SECRET_ID / APP_ID = 3b93c452b851431c8b3a076789ab1e14
 *   APP_SECRET          = 9dd4b0400f6e4d558f2b3497d734c2b4
 *   TX_KEY              = wrf2yJaCwC8HX3cfJz8P
 * ---------------------------------------------------------------------------
 */

// ===== 常量 =====
var API_AUTH    = "https://api-auth-lizhi.jstv.com";
var API_PUBLISH = "https://publish-lizhi.jstv.com";
var NAV_ID      = 8385;
var PLAY_HOST   = "litchi-play-encrypted-site.jstv.com";   // 前端 handleReplaceDomain 的真实目标域名

var APP_SECRET_ID = "3b93c452b851431c8b3a076789ab1e14";
var APP_SECRET    = "9dd4b0400f6e4d558f2b3497d734c2b4";
var APP_ID        = "3b93c452b851431c8b3a076789ab1e14";
var TX_KEY        = "wrf2yJaCwC8HX3cfJz8P";

// [en 标识, channelId, 中文名, 备用播放地址]（与 jstv.py LIVE_LIST 一致）
var LIVE_LIST = [
    ["jsws", 534, "江苏卫视",     "https://" + PLAY_HOST + "/applive/jswspro.m3u8"],
    ["jscs", 535, "江苏城市",     "https://" + PLAY_HOST + "/applive/jscspro.m3u8"],
    ["jsxw", 536, "江苏新闻",     "https://" + PLAY_HOST + "/applive/jsxwpro.m3u8"],
    ["jszy", 556, "江苏综艺",     "https://" + PLAY_HOST + "/applive/jszypro.m3u8"],
    ["jsys", 542, "江苏影视",     "https://" + PLAY_HOST + "/applive/jsyspro.m3u8"],
    ["jsxx", 537, "江苏体育休闲", "https://" + PLAY_HOST + "/applive/jsxxpro.m3u8"],
    ["jsjy", 545, "江苏教育",     "https://" + PLAY_HOST + "/applive/jsjypro.m3u8"],
    ["jsgj", 544, "江苏国际",     "https://" + PLAY_HOST + "/applive/jsgjpro.m3u8"],
    ["ymkt", 543, "优漫卡通",     "https://" + PLAY_HOST + "/applive/ymktpro.m3u8"]
];

var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
         "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// 签名有效期（秒）。原 py 用 180；这里放宽到 3600 让列表模式下播放地址更耐放，实测仍可通过。
var TTL = 3600;

// ===== 工具 =====
function md5(text) {
    return ku9.md5(text);
}

// 还原前端 _pack_ts：字节变换 + int32 有符号输出
function packTs(ts) {
    var b = [ts & 0xFF, (ts >> 8) & 0xFF, (ts >> 16) & 0xFF, (ts >> 24) & 0xFF];
    for (var i = 0; i < 4; i++) {
        b[i] = ((0xF0 & b[i]) ^ 0xF0) | ((1 + (0x0F & b[i])) & 0x0F);
    }
    var res = (b[3] | (b[2] << 8) | (b[1] << 16) | (b[0] << 24)) >>> 0;
    if (res >= 0x80000000) res = res - 0x100000000;
    return res;
}

// 还原前端 _flatten：字典按 key 排序递归拼接
function flatten(obj) {
    if (obj !== null && typeof obj === "object" && !Array.isArray(obj)) {
        return Object.keys(obj).sort().map(function (k) {
            return k + flatten(obj[k]);
        }).join("");
    }
    if (Array.isArray(obj)) {
        return obj.map(flatten).join("");
    }
    return String(obj);
}

// 还原前端 get_valid_url：给 URL 拼签名参数
function getValidUrl(url, params) {
    var signed = url + (url.indexOf("?") >= 0 ? "&" : "?") + "AppID=" + APP_SECRET_ID;
    var after = signed.split("//")[1];          // 去掉协议头
    var slash = after.indexOf("/");
    var pathPart = after.substring(slash);       // 含查询串的路径部分（与 py 一致）
    var ts = Math.floor(Date.now() / 1000);
    var raw = APP_SECRET + pathPart + flatten(params) + String(ts);
    return signed + "&TT=" + packTs(ts) + "&Sign=" + md5(raw);
}

// 还原前端 handleReplaceDomain：只换 hostname，路径保持不变
function replaceDomain(url, host) {
    host = host || PLAY_HOST;
    var m = url.match(/^([a-zA-Z]+:\/\/)[^\/]+(\/.*)?$/);
    if (!m) return url;
    return m[1] + host + (m[2] || "");
}

// 还原前端 handleLiveList 的匹配逻辑
function resolvePlayUrl(appHls, channelId) {
    var result = appHls;
    for (var i = 0; i < LIVE_LIST.length; i++) {
        var en = LIVE_LIST[i][0], cid = LIVE_LIST[i][1], hls = LIVE_LIST[i][3];
        if (appHls.indexOf(en) >= 0) {
            result = replaceDomain(appHls);
        } else if (channelId === cid) {
            result = hls;
        }
    }
    return result;
}

// 解析查询串为对象（保留空值）
function parseQuery(q) {
    var m = {};
    if (!q) return m;
    q.split("&").forEach(function (pair) {
        if (!pair) return;
        var kv = pair.split("=");
        var k = decodeURIComponent(kv[0]);
        m[k] = kv.length > 1 ? decodeURIComponent(kv[1]) : "";
    });
    return m;
}

// 还原前端 encodeLiveUrl：腾讯云防盗链签名
function signLiveUrl(url, ttl) {
    ttl = (ttl === undefined) ? TTL : ttl;
    var txTime = (Math.floor(Date.now() / 1000) + ttl).toString(16);   // 小写十六进制
    var qIdx = url.indexOf("?");
    var pathOnly = qIdx >= 0 ? url.substring(0, qIdx) : url;
    var query = qIdx >= 0 ? url.substring(qIdx + 1) : "";
    var schemeMatch = url.match(/^([a-zA-Z]+):/);
    var isRtmp = schemeMatch && schemeMatch[1].toLowerCase() === "rtmp";
    var last = pathOnly.replace(/\/+$/, "").split("/").pop();
    var streamId = isRtmp ? last : last.split(".")[0];
    var txSecret = md5(TX_KEY + streamId + txTime);

    var pars = parseQuery(query);
    var out = [];
    for (var k in pars) {
        if (k !== "txSecret" && k !== "txTime") {
            out.push(encodeURIComponent(k) + "=" + encodeURIComponent(pars[k]));
        }
    }
    out.push("txSecret=" + txSecret);
    out.push("txTime=" + txTime);
    return pathOnly + "?" + out.join("&");
}

// ===== 接口 =====
function randUuid() {
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    var s = "";
    for (var i = 0; i < 32; i++) {
        s += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return s;
}

function fetchToken() {
    var payload = { platform: 41, uuid: randUuid(), appId: APP_ID };
    var url = getValidUrl(API_AUTH + "/JwtAuth/GetWebToken", payload);
    var headers = {
        "Content-Type": "application/json",
        "User-Agent": UA,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Origin": "https://live.jstv.com",
        "Referer": "https://live.jstv.com/"
    };
    var body = JSON.stringify(payload);
    var res = ku9.post(url, headers, body);   // ku9.post(url, headers, body)
    var json = JSON.parse(res);
    return json.data.accessToken;
}

function fetchChannels(token) {
    var url = API_PUBLISH + "/nav/" + NAV_ID;
    var headers = {
        "Authorization": "Bearer " + token,
        "User-Agent": UA,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Origin": "https://live.jstv.com",
        "Referer": "https://live.jstv.com/"
    };
    var res = ku9.get(url, headers);
    var json = JSON.parse(res);
    return json.data.articles;
}

// 从本地常量构造频道（不依赖接口，作为接口失败时的兜底）
function getLiveListFromConst(ttl) {
    var channels = [];
    for (var i = 0; i < LIVE_LIST.length; i++) {
        var en = LIVE_LIST[i][0], cid = LIVE_LIST[i][1], name = LIVE_LIST[i][2], hls = LIVE_LIST[i][3];
        channels.push({
            id: cid, name: name, en: en, idx: i + 1,
            playing: "", next: "",
            play: signLiveUrl(hls, ttl)
        });
    }
    return channels;
}

// 第 3 步：整合出可直接播放的签名地址
function getLiveList(ttl) {
    ttl = (ttl === undefined) ? TTL : ttl;
    var token, articles;
    try {
        token = fetchToken();
        articles = fetchChannels(token);
    } catch (e) {
        // 接口不可用（网络/签名被拒）时，退回本地常量构造，保证仍能出播放地址
        return getLiveListFromConst(ttl);
    }
    var channels = [];
    for (var i = 0; i < articles.length; i++) {
        var a = articles[i];
        var extraJson = a.extraJson;
        var extra = {};
        if (extraJson) {
            try {
                extra = (typeof extraJson === "string") ? JSON.parse(extraJson) : extraJson;
            } catch (e2) {
                extra = {};
            }
        }
        var appHls = extra.url || "";
        if (!appHls) continue;
        var en = "";
        for (var k = 0; k < LIVE_LIST.length; k++) {
            if (appHls.indexOf(LIVE_LIST[k][0]) >= 0) { en = LIVE_LIST[k][0]; break; }
        }
        var playUrl = resolvePlayUrl(appHls, parseInt(a.extraId || 0, 10));
        channels.push({
            id: a.extraId,
            name: a.title,
            en: en,
            idx: channels.length + 1,
            playing: extra.playing,
            next: extra.nextPlay,
            raw: appHls,
            play: signLiveUrl(playUrl, ttl)
        });
    }
    return channels.length ? channels : getLiveListFromConst(ttl);
}

// 按 id 找频道：支持 en / 序号 / 名称 / channelId
function findChannel(channels, id) {
    if (/^\d+$/.test(id)) {
        var n = parseInt(id, 10);
        if (n >= 1 && n <= channels.length) return channels[n - 1];
    }
    for (var i = 0; i < channels.length; i++) {
        var c = channels[i];
        if (String(c.id) === id) return c;
        if (c.en && c.en === id) return c;
        if (c.name && (c.name.indexOf(id) >= 0 || id.indexOf(c.name) >= 0)) return c;
    }
    return null;
}

// ===== 入口 =====
function main(item) {
    var id = (item && item.id) ? String(item.id) : "";
    try {
        var channels = getLiveList(TTL);

        if (!id || id === "list") {
            var lines = ["#EXTM3U"];
            for (var i = 0; i < channels.length; i++) {
                var c = channels[i];
                var title = c.name + (c.playing ? " - " + c.playing : "");
                lines.push('#EXTINF:-1 tvg-name="' + c.name + '",group-title="江苏广电",' + title);
                lines.push(c.play);
            }
            return { m3u8: lines.join("\n") };
        }

        var target = findChannel(channels, id);
        if (!target) {
            return {
                error: "未找到频道：「" + id + "」。可用 en：" +
                       LIVE_LIST.map(function (x) { return x[0]; }).join("/") +
                       "，或填序号 1-" + LIVE_LIST.length
            };
        }
        // 单频道：每次点击重新签名，规避防盗链过期
        return {
            url: signLiveUrl(target.play, TTL),
            headers: { "User-Agent": UA, "Referer": "https://live.jstv.com/" }
        };
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
