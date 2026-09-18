/*
 * 海南网络广播电视台 直播（www.hnntv.cn / ps.hnntv.cn）酷9 JS 脚本
 * ---------------------------------------------------------------------------
 * 链路（逆向自 live.js + config.js）：
 *   1) GET https://www.hnntv.cn/api/channel?type=1
 *        -> {businessCode:"00000", resultSet:[{id, name, code, liveUrl, replayUrl}, ...]}
 *   2) GET https://ps.hnntv.cn/ps/livePlayUrl?appCode=&token=&channelCode={code}
 *        -> {businessCode:200, resultSet:[{url}]}   url 形如 .../xxx.m3u8?_upt=八位hex+十位过期时间戳
 *
 * 关键：live2.hnntv.cn 主机上的 m3u8 不带 _upt 会返回 403（防盗链），
 *       必须走 livePlayUrl 换取带签名的地址。_upt 的有效期约 2 小时。
 *       三沙卫视在 livessws.hnntv.cn，无防盗链，裸 liveUrl 也能播。
 *
 * 用法（酷9 频道地址，路径须含 /k-web/ku9/js/ 识别串）：
 *   ?id=list                    返回全部频道 m3u8（订阅用）
 *   ?id=<channelId|名称|序号>     返回单频道播放地址
 *                                如 13（海南卫视）/ 海南卫视 / 1
 *   默认（无 id）                等同 ?id=list
 *
 * 海南台频道（channelId / 名称）：
 *   13 海南卫视 | 5 三沙卫视 | 1 海南自贸 | 3 海南新闻 | 4 海南社会与法 | 6 海南文旅 | 7 海南少儿
 * ---------------------------------------------------------------------------
 */

var API_BASE = "https://www.hnntv.cn/api/";
var PS_BASE  = "https://ps.hnntv.cn/ps/";
var CH_TYPE  = 1;   // 1 = 电视直播（广播为 2）

var UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

var HEADERS = {
    "User-Agent": UA,
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Referer": "https://www.hnntv.cn/live.html",
    "Origin": "https://www.hnntv.cn"
};

// 拉频道列表（含 id / name / code / liveUrl）
function fetchChannels() {
    var res = ku9.get(API_BASE + "channel?type=" + CH_TYPE, HEADERS);
    var d = JSON.parse(res);
    if (d && (d.businessCode === "00000" || d.businessCode === 200) && d.resultSet) {
        return d.resultSet;
    }
    return [];
}

// 用 channelCode 换取带 _upt 防盗链签名的播放地址
function fetchPlayUrl(code) {
    if (!code) return "";
    var url = PS_BASE + "livePlayUrl?appCode=&token=&channelCode=" + encodeURIComponent(code);
    var res = ku9.get(url, HEADERS);
    var d = JSON.parse(res);
    if (d && (d.businessCode === 200 || d.businessCode === "00000") &&
        d.resultSet && d.resultSet.length > 0) {
        return d.resultSet[0].url || "";
    }
    return "";
}

// 取地址：优先 livePlayUrl 的签名地址；失败则退回频道自带 liveUrl（无防盗链主机才有效）
function resolveUrl(ch) {
    var url = "";
    try {
        url = fetchPlayUrl(ch.code);
    } catch (e) {
        url = "";
    }
    if (!url) url = ch.liveUrl || "";
    return url;
}

// 按 id 找频道：优先 channelId，其次序号，再次名称 / code
function findChannel(list, id) {
    for (var i = 0; i < list.length; i++) {
        if (String(list[i].id) === id) return list[i];
    }
    if (/^\d+$/.test(id)) {
        var n = parseInt(id, 10);
        if (n >= 1 && n <= list.length) return list[n - 1];
    }
    for (var j = 0; j < list.length; j++) {
        var c = list[j];
        if (c.name && (c.name.indexOf(id) >= 0 || id.indexOf(c.name) >= 0)) return c;
        if (c.code === id) return c;
    }
    return null;
}

function availableText(list) {
    var arr = [];
    for (var i = 0; i < list.length; i++) {
        arr.push(list[i].name + "(" + list[i].id + ")");
    }
    return arr.join("、");
}

// ===== 入口 =====
function main(item) {
    var id = (item && item.id) ? String(item.id) : "";
    try {
        var list = fetchChannels();
        if (!list || !list.length) {
            return { error: "未获取到海南台频道列表，请稍后重试" };
        }

        // 列表模式
        if (!id || id === "list") {
            var lines = ["#EXTM3U"];
            for (var i = 0; i < list.length; i++) {
                var u = resolveUrl(list[i]);
                if (!u) continue;   // 取不到地址的频道跳过
                lines.push('#EXTINF:-1 tvg-name="' + list[i].name + '",group-title="海南广电",' + list[i].name);
                lines.push(u);
            }
            if (lines.length <= 1) {
                return { error: "频道列表为空，未能取到任何播放地址" };
            }
            return { m3u8: lines.join("\n") };
        }

        // 单频道模式：每次点击重新换取签名地址，规避 _upt 过期
        var target = findChannel(list, id);
        if (!target) {
            return { error: "未找到频道：「" + id + "」。可用：" + availableText(list) };
        }
        var url = resolveUrl(target);
        if (!url) {
            return { error: "频道「" + target.name + "」暂未取到播放地址" };
        }
        return {
            url: url,
            headers: { "User-Agent": UA, "Referer": "https://www.hnntv.cn/live.html" }
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
