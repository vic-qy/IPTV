/**
 * ysp.js —— 央视频（YangShipin）直播源解析脚本
 *
 * 频道（仅这 4 个）：
 *   cctv6  CCTV6 电影        pid=600108442
 *   tj     天津卫视           pid=600152137
 *   xj     新疆卫视           pid=600152138
 *   jy1    中国教育电视台1频道 pid=600171827
 *
 * 用法（酷9 频道地址）：
 *   http://127.0.0.1:9978/ku9/js/ysp.js?id=cctv6
 *   http://127.0.0.1:9978/ku9/js/ysp.js?id=list     // 全部频道 m3u8
 *
 * 协议要点（全部在脚本内纯 JS 完成，无浏览器、无 wasm）：
 *   1) guid 固定
 *   2) rnd  = md5(appid + ";" + version + ";" + guid + ";" + ts + ";")
 *   3) SDK token: GET h5access.yangshipin.cn/web/open/token（静态 vappid/vsecret）
 *   4) 播放令牌: POST /v1/player/auth，signature = md5(默认排序 kv + "n@7QKk%YeSjfw%22")
 *   5) cKey : AES-CBC(内联 CryptoJS) 结果，由内联的原站混淆函数生成
 *   6) body signature = md5(默认排序 kv（不含 signature）+ "0f$IVHi9Qno?G")
 *   7) yspsdkinput = md5(localeCompare 排序 kv，排除 rand_str/signature)
 *   8) yspsdksign  = md5(guid;host;token;protocol;appid;signInput;) + "-" + signInput
 *   9) yspticket   = 参考 ticket + ts 覆盖（字节 10..19）
 */


// ===========================================================================
// 1. 纯 JS MD5
// ===========================================================================
var md5hex = (function(){
  function safeAdd(x, y) { var lsw = (x & 0xFFFF) + (y & 0xFFFF); var msw = (x >> 16) + (y >> 16) + (lsw >> 16); return (msw << 16) | (lsw & 0xFFFF); }
  function bitRol(num, cnt) { return (num << cnt) | (num >>> (32 - cnt)); }
  function md5cmn(q, a, b, x, s, t) { return safeAdd(bitRol(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b); }
  function md5ff(a,b,c,d,x,s,t){ return md5cmn((b & c) | (~b & d), a, b, x, s, t); }
  function md5gg(a,b,c,d,x,s,t){ return md5cmn((b & d) | (c & ~d), a, b, x, s, t); }
  function md5hh(a,b,c,d,x,s,t){ return md5cmn(b ^ c ^ d, a, b, x, s, t); }
  function md5ii(a,b,c,d,x,s,t){ return md5cmn(c ^ (b | ~d), a, b, x, s, t); }
  function binlMD5(x, len) {
    x[len >> 5] |= 0x80 << (len % 32);
    x[(((len + 64) >>> 9) << 4) + 14] = len;
    var i, olda, oldb, oldc, oldd, a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
    for (i = 0; i < x.length; i += 16) {
      olda = a; oldb = b; oldc = c; oldd = d;
      a = md5ff(a,b,c,d,x[i],7,-680876936); d = md5ff(d,a,b,c,x[i+1],12,-389564586); c = md5ff(c,d,a,b,x[i+2],17,606105819); b = md5ff(b,c,d,a,x[i+3],22,-1044525330);
      a = md5ff(a,b,c,d,x[i+4],7,-176418897); d = md5ff(d,a,b,c,x[i+5],12,1200080426); c = md5ff(c,d,a,b,x[i+6],17,-1473231341); b = md5ff(b,c,d,a,x[i+7],22,-45705983);
      a = md5ff(a,b,c,d,x[i+8],7,1770035416); d = md5ff(d,a,b,c,x[i+9],12,-1958414417); c = md5ff(c,d,a,b,x[i+10],17,-42063); b = md5ff(b,c,d,a,x[i+11],22,-1990404162);
      a = md5ff(a,b,c,d,x[i+12],7,1804603682); d = md5ff(d,a,b,c,x[i+13],12,-40341101); c = md5ff(c,d,a,b,x[i+14],17,-1502002290); b = md5ff(b,c,d,a,x[i+15],22,1236535329);
      a = md5gg(a,b,c,d,x[i+1],5,-165796510); d = md5gg(d,a,b,c,x[i+6],9,-1069501632); c = md5gg(c,d,a,b,x[i+11],14,643717713); b = md5gg(b,c,d,a,x[i],20,-373897302);
      a = md5gg(a,b,c,d,x[i+5],5,-701558691); d = md5gg(d,a,b,c,x[i+10],9,38016083); c = md5gg(c,d,a,b,x[i+15],14,-660478335); b = md5gg(b,c,d,a,x[i+4],20,-405537848);
      a = md5gg(a,b,c,d,x[i+9],5,568446438); d = md5gg(d,a,b,c,x[i+14],9,-1019803690); c = md5gg(c,d,a,b,x[i+3],14,-187363961); b = md5gg(b,c,d,a,x[i+8],20,1163531501);
      a = md5gg(a,b,c,d,x[i+13],5,-1444681467); d = md5gg(d,a,b,c,x[i+2],9,-51403784); c = md5gg(c,d,a,b,x[i+7],14,1735328473); b = md5gg(b,c,d,a,x[i+12],20,-1926607734);
      a = md5hh(a,b,c,d,x[i+5],4,-378558); d = md5hh(d,a,b,c,x[i+8],11,-2022574463); c = md5hh(c,d,a,b,x[i+11],16,1839030562); b = md5hh(b,c,d,a,x[i+14],23,-35309556);
      a = md5hh(a,b,c,d,x[i+1],4,-1530992060); d = md5hh(d,a,b,c,x[i+4],11,1272893353); c = md5hh(c,d,a,b,x[i+7],16,-155497632); b = md5hh(b,c,d,a,x[i+10],23,-1094730640);
      a = md5hh(a,b,c,d,x[i+13],4,681279174); d = md5hh(d,a,b,c,x[i],11,-358537222); c = md5hh(c,d,a,b,x[i+3],16,-722521979); b = md5hh(b,c,d,a,x[i+6],23,76029189);
      a = md5hh(a,b,c,d,x[i+9],4,-640364487); d = md5hh(d,a,b,c,x[i+12],11,-421815835); c = md5hh(c,d,a,b,x[i+15],16,530742520); b = md5hh(b,c,d,a,x[i+2],23,-995338651);
      a = md5ii(a,b,c,d,x[i],6,-198630844); d = md5ii(d,a,b,c,x[i+7],10,1126891415); c = md5ii(c,d,a,b,x[i+14],15,-1416354905); b = md5ii(b,c,d,a,x[i+5],21,-57434055);
      a = md5ii(a,b,c,d,x[i+12],6,1700485571); d = md5ii(d,a,b,c,x[i+3],10,-1894986606); c = md5ii(c,d,a,b,x[i+10],15,-1051523); b = md5ii(b,c,d,a,x[i+1],21,-2054922799);
      a = md5ii(a,b,c,d,x[i+8],6,1873313359); d = md5ii(d,a,b,c,x[i+15],10,-30611744); c = md5ii(c,d,a,b,x[i+6],15,-1560198380); b = md5ii(b,c,d,a,x[i+13],21,1309151649);
      a = md5ii(a,b,c,d,x[i+4],6,-145523070); d = md5ii(d,a,b,c,x[i+11],10,-1120210379); c = md5ii(c,d,a,b,x[i+2],15,718787259); b = md5ii(b,c,d,a,x[i+9],21,-343485551);
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
  function str2rstrUTF8(input) { var u = encodeURIComponent(input), o = "", i = 0, c; while (i < u.length) { c = u.charAt(i); if (c === "%") { o += String.fromCharCode(parseInt(u.substr(i + 1, 2), 16)); i += 3; } else { o += c; i += 1; } } return o; }
  function rawMD5(s) { return rstrMD5(str2rstrUTF8(s)); }
  function hexMD5(s) { return rstr2hex(rawMD5(s)); }
  return hexMD5;
})();

// ===========================================================================
// 2. 常量
// ===========================================================================
var YSP = {
  appid: '519748109',
  vappid: '59306155',
  vsecret: 'b42702bf7309a179d102f3d51b1add2fda0bc7ada64cb801',
  saltInfo: '0f$IVHi9Qno?G',
  saltAuth: 'n@7QKk%YeSjfw%22',
  host: 'www.yangshipin.cn',
  proto: 'https:',
  platform: '5910204',
  guid: 'mu7uu2f3_o8dvritlbvi',
  ver: 'V1.0.0',
  ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
  sdkExclude: ['rand_str', 'signature']
};

// 频道表：id -> {名称, livepid, cnlid}
var CHANNELS = {
  cctv6: { name: 'CCTV6电影',          pid: '600108442', cnlid: '2013693901' },
  tj:    { name: '天津卫视',            pid: '600152137', cnlid: '2019927003' },
  xj:    { name: '新疆卫视',            pid: '600152138', cnlid: '2019927403' },
  jy1:   { name: '中国教育电视台1频道', pid: '600171827', cnlid: '2022823801' }
};

// 参考 ticket（同 guid 抓取），[ticket, 生成时使用的 auth ts]
var REF_TICKET = {
  '600108442': ['5c40d99d3044f80c7e0e99bac51b26e7fb54797aeceec8560d8d655481b5a3adf09297c20662a1d257a186f612b12d17c1efd3a9fac432d3b00e7e5035d5', '1789790201'],
  '600152137': ['5c40d99d354efd0b7b0e99bac51b26e7fb577e72eceec8560d8d655481b5a3adf09297c20662a1d257a186f612b12d17c1efd3a9cca723c48d346f2524e8', '1789790179'],
  '600152138': ['5c40d99d354efd0b740e99bac51b26e7fb547b78eceec8560d8d655481b5a3adf09297c20662a1d257a186f612b12d17c1efd3a9e5b235f6890f692c71de', '1789790224'],
  '600171827': ['5c40d99d374df40a7b0e99bac51b26e7fb577a7deceec8560d8d655481b5a3adf09297c20662a1d257a186f612b12d17c1efd3a99fcd34c5b4386b0471c3', '1789790136']
};

// ===========================================================================
// 3. 内联 CryptoJS（AES-CBC / enc.Hex / pad.Pkcs7）
// ===========================================================================
var n = function () { return function () {}; };
n.n = function (f) { return f; };
var yt;
yt=yt||function(t,e){var n={},r=n.lib={},i=function(){},o=r.Base={extend:function(t){i.prototype=this;var e=new i;return t&&e.mixIn(t),e.hasOwnProperty("init")||(e.init=function(){e.$super.init.apply(this,arguments)}),e.init.prototype=e,e.$super=this,e},create:function(){var t=this.extend();return t.init.apply(t,arguments),t},init:function(){},mixIn:function(t){for(var e in t)t.hasOwnProperty(e)&&(this[e]=t[e]);t.hasOwnProperty("toString")&&(this.toString=t.toString)},clone:function(){return this.init.prototype.extend(this)}},a=r.WordArray=o.extend({init:function(t,n){t=this.words=t||[],this.sigBytes=n!=e?n:4*t.length},toString:function(t){return(t||c).stringify(this)},concat:function(t){var e=this.words,n=t.words,r=this.sigBytes;if(t=t.sigBytes,this.clamp(),r%4)for(var i=0;i<t;i++)e[r+i>>>2]|=(n[i>>>2]>>>24-i%4*8&255)<<24-(r+i)%4*8;else if(65535<n.length)for(i=0;i<t;i+=4)e[r+i>>>2]=n[i>>>2];else e.push.apply(e,n);return this.sigBytes+=t,this},clamp:function(){var e=this.words,n=this.sigBytes;e[n>>>2]&=4294967295<<32-n%4*8,e.length=t.ceil(n/4)},clone:function(){var t=o.clone.call(this);return t.words=this.words.slice(0),t},random:function(e){for(var n=[],r=0;r<e;r+=4)n.push(4294967296*t.random()|0);return new a.init(n,e)}}),s=n.enc={},c=s.Hex={stringify:function(t){var e=t.words;t=t.sigBytes;for(var n=[],r=0;r<t;r++){var i=e[r>>>2]>>>24-r%4*8&255;n.push((i>>>4).toString(16)),n.push((15&i).toString(16))}return n.join("")},parse:function(t){for(var e=t.length,n=[],r=0;r<e;r+=2)n[r>>>3]|=parseInt(t.substr(r,2),16)<<24-r%8*4;return new a.init(n,e/2)}},u=s.Latin1={stringify:function(t){var e=t.words;t=t.sigBytes;for(var n=[],r=0;r<t;r++)n.push(String.fromCharCode(e[r>>>2]>>>24-r%4*8&255));return n.join("")},parse:function(t){for(var e=t.length,n=[],r=0;r<e;r++)n[r>>>2]|=(255&t.charCodeAt(r))<<24-r%4*8;return new a.init(n,e)}},l=s.Utf8={stringify:function(t){try{return decodeURIComponent(escape(u.stringify(t)))}catch(e){throw Error("Malformed UTF-8 data")}},parse:function(t){return u.parse(unescape(encodeURIComponent(t)))}},f=r.BufferedBlockAlgorithm=o.extend({reset:function(){this._data=new a.init,this._nDataBytes=0},_append:function(t){"string"==typeof t&&(t=l.parse(t)),this._data.concat(t),this._nDataBytes+=t.sigBytes},_process:function(e){var n=this._data,r=n.words,i=n.sigBytes,o=this.blockSize,s=i/(4*o);if(s=e?t.ceil(s):t.max((0|s)-this._minBufferSize,0),e=s*o,i=t.min(4*e,i),e){for(var c=0;c<e;c+=o)this._doProcessBlock(r,c);c=r.splice(0,e),n.sigBytes-=i}return new a.init(c,i)},clone:function(){var t=o.clone.call(this);return t._data=this._data.clone(),t},_minBufferSize:0});r.Hasher=f.extend({cfg:o.extend(),init:function(t){this.cfg=this.cfg.extend(t),this.reset()},reset:function(){f.reset.call(this),this._doReset()},update:function(t){return this._append(t),this._process(),this},finalize:function(t){return t&&this._append(t),this._doFinalize()},blockSize:16,_createHelper:function(t){return function(e,n){return new t.init(n).finalize(e)}},_createHmacHelper:function(t){return function(e,n){return new p.HMAC.init(t,n).finalize(e)}}});var p=n.algo={};return n}(Math);(function(){var t=yt,e=t.lib.WordArray;t.enc.Base64={stringify:function(t){var e=t.words,n=t.sigBytes,r=this._map;t.clamp(),t=[];for(var i=0;i<n;i+=3)for(var o=(e[i>>>2]>>>24-i%4*8&255)<<16|(e[i+1>>>2]>>>24-(i+1)%4*8&255)<<8|e[i+2>>>2]>>>24-(i+2)%4*8&255,a=0;4>a&&i+.75*a<n;a++)t.push(r.charAt(o>>>6*(3-a)&63));if(e=r.charAt(64))for(;t.length%4;)t.push(e);return t.join("")},parse:function(t){var n=t.length,r=this._map,i=r.charAt(64);i&&(i=t.indexOf(i),-1!=i&&(n=i)),i=[];for(var o=0,a=0;a<n;a++)if(a%4){var s=r.indexOf(t.charAt(a-1))<<a%4*2,c=r.indexOf(t.charAt(a))>>>6-a%4*2;i[o>>>2]|=(s|c)<<24-o%4*8,o++}return e.create(i,o)},_map:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="}})(),function(t){function e(t,e,n,r,i,o,a){return t=t+(e&n|~e&r)+i+a,(t<<o|t>>>32-o)+e}function n(t,e,n,r,i,o,a){return t=t+(e&r|n&~r)+i+a,(t<<o|t>>>32-o)+e}function r(t,e,n,r,i,o,a){return t=t+(e^n^r)+i+a,(t<<o|t>>>32-o)+e}function i(t,e,n,r,i,o,a){return t=t+(n^(e|~r))+i+a,(t<<o|t>>>32-o)+e}for(var o=yt,a=o.lib,s=a.WordArray,c=a.Hasher,u=(a=o.algo,[]),l=0;64>l;l++)u[l]=4294967296*t.abs(t.sin(l+1))|0;a=a.MD5=c.extend({_doReset:function(){this._hash=new s.init([1732584193,4023233417,2562383102,271733878])},_doProcessBlock:function(t,o){for(var a=0;16>a;a++){var s=o+a,c=t[s];t[s]=16711935&(c<<8|c>>>24)|4278255360&(c<<24|c>>>8)}a=this._hash.words,s=t[o+0],c=t[o+1];var l=t[o+2],f=t[o+3],p=t[o+4],d=t[o+5],h=t[o+6],v=t[o+7],y=t[o+8],g=t[o+9],m=t[o+10],b=t[o+11],w=t[o+12],_=t[o+13],x=t[o+14],S=t[o+15],C=a[0],E=a[1],T=a[2],A=a[3];C=e(C,E,T,A,s,7,u[0]),A=e(A,C,E,T,c,12,u[1]),T=e(T,A,C,E,l,17,u[2]),E=e(E,T,A,C,f,22,u[3]),C=e(C,E,T,A,p,7,u[4]),A=e(A,C,E,T,d,12,u[5]),T=e(T,A,C,E,h,17,u[6]),E=e(E,T,A,C,v,22,u[7]),C=e(C,E,T,A,y,7,u[8]),A=e(A,C,E,T,g,12,u[9]),T=e(T,A,C,E,m,17,u[10]),E=e(E,T,A,C,b,22,u[11]),C=e(C,E,T,A,w,7,u[12]),A=e(A,C,E,T,_,12,u[13]),T=e(T,A,C,E,x,17,u[14]),E=e(E,T,A,C,S,22,u[15]),C=n(C,E,T,A,c,5,u[16]),A=n(A,C,E,T,h,9,u[17]),T=n(T,A,C,E,b,14,u[18]),E=n(E,T,A,C,s,20,u[19]),C=n(C,E,T,A,d,5,u[20]),A=n(A,C,E,T,m,9,u[21]),T=n(T,A,C,E,S,14,u[22]),E=n(E,T,A,C,p,20,u[23]),C=n(C,E,T,A,g,5,u[24]),A=n(A,C,E,T,x,9,u[25]),T=n(T,A,C,E,f,14,u[26]),E=n(E,T,A,C,y,20,u[27]),C=n(C,E,T,A,_,5,u[28]),A=n(A,C,E,T,l,9,u[29]),T=n(T,A,C,E,v,14,u[30]),E=n(E,T,A,C,w,20,u[31]),C=r(C,E,T,A,d,4,u[32]),A=r(A,C,E,T,y,11,u[33]),T=r(T,A,C,E,b,16,u[34]),E=r(E,T,A,C,x,23,u[35]),C=r(C,E,T,A,c,4,u[36]),A=r(A,C,E,T,p,11,u[37]),T=r(T,A,C,E,v,16,u[38]),E=r(E,T,A,C,m,23,u[39]),C=r(C,E,T,A,_,4,u[40]),A=r(A,C,E,T,s,11,u[41]),T=r(T,A,C,E,f,16,u[42]),E=r(E,T,A,C,h,23,u[43]),C=r(C,E,T,A,g,4,u[44]),A=r(A,C,E,T,w,11,u[45]),T=r(T,A,C,E,S,16,u[46]),E=r(E,T,A,C,l,23,u[47]),C=i(C,E,T,A,s,6,u[48]),A=i(A,C,E,T,v,10,u[49]),T=i(T,A,C,E,x,15,u[50]),E=i(E,T,A,C,d,21,u[51]),C=i(C,E,T,A,w,6,u[52]),A=i(A,C,E,T,f,10,u[53]),T=i(T,A,C,E,m,15,u[54]),E=i(E,T,A,C,c,21,u[55]),C=i(C,E,T,A,y,6,u[56]),A=i(A,C,E,T,S,10,u[57]),T=i(T,A,C,E,h,15,u[58]),E=i(E,T,A,C,_,21,u[59]),C=i(C,E,T,A,p,6,u[60]),A=i(A,C,E,T,b,10,u[61]),T=i(T,A,C,E,l,15,u[62]),E=i(E,T,A,C,g,21,u[63]),a[0]=a[0]+C|0,a[1]=a[1]+E|0,a[2]=a[2]+T|0,a[3]=a[3]+A|0},_doFinalize:function(){var e=this._data,n=e.words,r=8*this._nDataBytes,i=8*e.sigBytes;n[i>>>5]|=128<<24-i%32;var o=t.floor(r/4294967296);for(n[15+(i+64>>>9<<4)]=16711935&(o<<8|o>>>24)|4278255360&(o<<24|o>>>8),n[14+(i+64>>>9<<4)]=16711935&(r<<8|r>>>24)|4278255360&(r<<24|r>>>8),e.sigBytes=4*(n.length+1),this._process(),e=this._hash,n=e.words,r=0;4>r;r++)i=n[r],n[r]=16711935&(i<<8|i>>>24)|4278255360&(i<<24|i>>>8);return e},clone:function(){var t=c.clone.call(this);return t._hash=this._hash.clone(),t}}),o.MD5=c._createHelper(a),o.HmacMD5=c._createHmacHelper(a)}(Math),function(){var t=yt,e=t.lib,n=e.Base,r=e.WordArray,i=(e=t.algo,e.EvpKDF=n.extend({cfg:n.extend({keySize:4,hasher:e.MD5,iterations:1}),init:function(t){this.cfg=this.cfg.extend(t)},compute:function(t,e){var n=this.cfg,i=n.hasher.create(),o=r.create(),a=o.words,s=n.keySize;for(n=n.iterations;a.length<s;){c&&i.update(c);var c=i.update(t).finalize(e);i.reset();for(var u=1;u<n;u++)c=i.finalize(c),i.reset();o.concat(c)}return o.sigBytes=4*s,o}}));t.EvpKDF=function(t,e,n){return i.create(n).compute(t,e)}}(),yt.lib.Cipher||function(t){var e=yt,n=e.lib,r=n.Base,i=n.WordArray,o=n.BufferedBlockAlgorithm,a=e.enc.Base64,s=e.algo.EvpKDF,c=n.Cipher=o.extend({cfg:r.extend(),createEncryptor:function(t,e){return this.create(this._ENC_XFORM_MODE,t,e)},createDecryptor:function(t,e){return this.create(this._DEC_XFORM_MODE,t,e)},init:function(t,e,n){this.cfg=this.cfg.extend(n),this._xformMode=t,this._key=e,this.reset()},reset:function(){o.reset.call(this),this._doReset()},process:function(t){return this._append(t),this._process()},finalize:function(t){return t&&this._append(t),this._doFinalize()},keySize:4,ivSize:4,_ENC_XFORM_MODE:1,_DEC_XFORM_MODE:2,_createHelper:function(t){return{encrypt:function(e,n,r){return("string"==typeof n?h:d).encrypt(t,e,n,r)},decrypt:function(e,n,r){return("string"==typeof n?h:d).decrypt(t,e,n,r)}}}});n.StreamCipher=c.extend({_doFinalize:function(){return this._process(!0)},blockSize:1});var u=e.mode={},l=function(e,n,r){var i=this._iv;i?this._iv=t:i=this._prevBlock;for(var o=0;o<r;o++)e[n+o]^=i[o]},f=(n.BlockCipherMode=r.extend({createEncryptor:function(t,e){return this.Encryptor.create(t,e)},createDecryptor:function(t,e){return this.Decryptor.create(t,e)},init:function(t,e){this._cipher=t,this._iv=e}})).extend();f.Encryptor=f.extend({processBlock:function(t,e){var n=this._cipher,r=n.blockSize;l.call(this,t,e,r),n.encryptBlock(t,e),this._prevBlock=t.slice(e,e+r)}}),f.Decryptor=f.extend({processBlock:function(t,e){var n=this._cipher,r=n.blockSize,i=t.slice(e,e+r);n.decryptBlock(t,e),l.call(this,t,e,r),this._prevBlock=i}}),u=u.CBC=f,f=(e.pad={}).Pkcs7={pad:function(t,e){for(var n=4*e,r=(n-=t.sigBytes%n,n<<24|n<<16|n<<8|n),o=[],a=0;a<n;a+=4)o.push(r);n=i.create(o,n),t.concat(n)},unpad:function(t){t.sigBytes-=255&t.words[t.sigBytes-1>>>2]}},n.BlockCipher=c.extend({cfg:c.cfg.extend({mode:u,padding:f}),reset:function(){c.reset.call(this);var t=this.cfg,e=t.iv;if(t=t.mode,this._xformMode==this._ENC_XFORM_MODE)var n=t.createEncryptor;else n=t.createDecryptor,this._minBufferSize=1;this._mode=n.call(t,this,e&&e.words)},_doProcessBlock:function(t,e){this._mode.processBlock(t,e)},_doFinalize:function(){var t=this.cfg.padding;if(this._xformMode==this._ENC_XFORM_MODE){t.pad(this._data,this.blockSize);var e=this._process(!0)}else e=this._process(!0),t.unpad(e);return e},blockSize:4});var p=n.CipherParams=r.extend({init:function(t){this.mixIn(t)},toString:function(t){return(t||this.formatter).stringify(this)}}),d=(u=(e.format={}).OpenSSL={stringify:function(t){var e=t.ciphertext;return t=t.salt,(t?i.create([1398893684,1701076831]).concat(t).concat(e):e).toString(a)},parse:function(t){t=a.parse(t);var e=t.words;if(1398893684==e[0]&&1701076831==e[1]){var n=i.create(e.slice(2,4));e.splice(0,4),t.sigBytes-=16}return p.create({ciphertext:t,salt:n})}},n.SerializableCipher=r.extend({cfg:r.extend({format:u}),encrypt:function(t,e,n,r){r=this.cfg.extend(r);var i=t.createEncryptor(n,r);return e=i.finalize(e),i=i.cfg,p.create({ciphertext:e,key:n,iv:i.iv,algorithm:t,mode:i.mode,padding:i.padding,blockSize:t.blockSize,formatter:r.format})},decrypt:function(t,e,n,r){return r=this.cfg.extend(r),e=this._parse(e,r.format),t.createDecryptor(n,r).finalize(e.ciphertext)},_parse:function(t,e){return"string"==typeof t?e.parse(t,this):t}})),h=(e=(e.kdf={}).OpenSSL={execute:function(t,e,n,r){return r||(r=i.random(8)),t=s.create({keySize:e+n}).compute(t,r),n=i.create(t.words.slice(e),4*n),t.sigBytes=4*e,p.create({key:t,iv:n,salt:r})}},n.PasswordBasedCipher=d.extend({cfg:d.cfg.extend({kdf:e}),encrypt:function(t,e,n,r){return r=this.cfg.extend(r),n=r.kdf.execute(n,t.keySize,t.ivSize),r.iv=n.iv,t=d.encrypt.call(this,t,e,n.key,r),t.mixIn(n),t},decrypt:function(t,e,n,r){return r=this.cfg.extend(r),e=this._parse(e,r.format),n=r.kdf.execute(n,t.keySize,t.ivSize,e.salt),r.iv=n.iv,d.decrypt.call(this,t,e,n.key,r)}}))}(),function(){for(var t=yt,e=t.lib.BlockCipher,n=t.algo,r=[],i=[],o=[],a=[],s=[],c=[],u=[],l=[],f=[],p=[],d=[],h=0;256>h;h++)d[h]=128>h?h<<1:h<<1^283;var v=0,y=0;for(h=0;256>h;h++){var g=y^y<<1^y<<2^y<<3^y<<4;g=g>>>8^255&g^99,r[v]=g,i[g]=v;var m=d[v],b=d[m],w=d[b],_=257*d[g]^16843008*g;o[v]=_<<24|_>>>8,a[v]=_<<16|_>>>16,s[v]=_<<8|_>>>24,c[v]=_,_=16843009*w^65537*b^257*m^16843008*v,u[g]=_<<24|_>>>8,l[g]=_<<16|_>>>16,f[g]=_<<8|_>>>24,p[g]=_,v?(v=m^d[d[d[w^m]]],y^=d[d[y]]):v=y=1}var x=[0,1,2,4,8,16,32,64,128,27,54];n=n.AES=e.extend({_doReset:function(){for(var t=this._key,e=t.words,n=t.sigBytes/4,i=(t=4*((this._nRounds=n+6)+1),this._keySchedule=[]),o=0;o<t;o++)if(o<n)i[o]=e[o];else{var a=i[o-1];o%n?6<n&&4==o%n&&(a=r[a>>>24]<<24|r[a>>>16&255]<<16|r[a>>>8&255]<<8|r[255&a]):(a=a<<8|a>>>24,a=r[a>>>24]<<24|r[a>>>16&255]<<16|r[a>>>8&255]<<8|r[255&a],a^=x[o/n|0]<<24),i[o]=i[o-n]^a}for(e=this._invKeySchedule=[],n=0;n<t;n++)o=t-n,a=n%4?i[o]:i[o-4],e[n]=4>n||4>=o?a:u[r[a>>>24]]^l[r[a>>>16&255]]^f[r[a>>>8&255]]^p[r[255&a]]},encryptBlock:function(t,e){this._doCryptBlock(t,e,this._keySchedule,o,a,s,c,r)},decryptBlock:function(t,e){var n=t[e+1];t[e+1]=t[e+3],t[e+3]=n,this._doCryptBlock(t,e,this._invKeySchedule,u,l,f,p,i),n=t[e+1],t[e+1]=t[e+3],t[e+3]=n},_doCryptBlock:function(t,e,n,r,i,o,a,s){for(var c=this._nRounds,u=t[e]^n[0],l=t[e+1]^n[1],f=t[e+2]^n[2],p=t[e+3]^n[3],d=4,h=1;h<c;h++){var v=r[u>>>24]^i[l>>>16&255]^o[f>>>8&255]^a[255&p]^n[d++],y=r[l>>>24]^i[f>>>16&255]^o[p>>>8&255]^a[255&u]^n[d++],g=r[f>>>24]^i[p>>>16&255]^o[u>>>8&255]^a[255&l]^n[d++];p=r[p>>>24]^i[u>>>16&255]^o[l>>>8&255]^a[255&f]^n[d++],u=v,l=y,f=g}v=(s[u>>>24]<<24|s[l>>>16&255]<<16|s[f>>>8&255]<<8|s[255&p])^n[d++],y=(s[l>>>24]<<24|s[f>>>16&255]<<16|s[p>>>8&255]<<8|s[255&u])^n[d++],g=(s[f>>>24]<<24|s[p>>>16&255]<<16|s[u>>>8&255]<<8|s[255&l])^n[d++],p=(s[p>>>24]<<24|s[u>>>16&255]<<16|s[l>>>8&255]<<8|s[255&f])^n[d++],t[e]=v,t[e+1]=y,t[e+2]=g,t[e+3]=p},keySize:8}),t.AES=e._createHelper(n)}();

// ===========================================================================
// 4. cKey 生成（原站混淆实现，环境指纹已固化为常量）
// ===========================================================================
var ns=1752,rs=2583,is=2750,os=4770,as=4654,ss=2835,cs=-9510,us=-8276,ls=1953,fs=-1327,ps=-6310,ds=-9811,hs=5882,vs=1336,ys=4360,gs=-2903,ms=-599,bs=-4087,ws=7543,_s=4288,xs=-1957,Ss=8125,Cs=-9831,Es=-7526,Ts=7040,As=-286,Os=-9876,ks=6978,Ps=-7385,js=774,Rs=-4798,Is=-2185,Ms=370,Bs=8600,Ls=3167,$s=-180,Ns=-1030,Fs=9290,Ds=-4195,zs=3557,Us=2682,Vs=8641,qs=8865,Hs=-5325,Ws=-4838,Gs=5633,Ys=5313,Js=-3152,Xs=2219,Ks=-4937,Qs=353,Zs=-3167,tc=-3377,ec=-707,nc=7233,rc=5244,ic=-7082,oc=3733,ac=1214;
var gt="fr",mt="ha",bt="ngt",wt="fr",_t="e",xt="ЧЬХж",St="n",Ct="惡惶",Et="fromCharCo",Tt="eAt",At="ng",Ot="th",kt="from",Pt="C",jt="rCodeAt",Rt="h",It="rCo",Mt="deAt",Bt="th",Lt="o",$t="c",Nt="leng",Ft="fro",Dt="mCh",zt="arCode",Ut="r",Vt="CodeAt",qt="ᖺᖺᖯᖸᖉᖫᖹ",Ht="l",Wt="gth",Gt="fromC",Yt="harCo",Jt="ch",Xt="CodeAt",Kt="le",Qt="n",Zt="gth",te="de",ee="⃷⃽⃤⃼⃱",ne="⃦⃠⃱⃬",re="⃠",ie="n",oe="gth",ae="fr",se="de",ce="o",ue="deAt",le="ㅞㅕㅘㅉ",fe="ㅂㅋ",pe="ngt",de="eAt",he="len",ve="g",ye="from",ge="CharCo",me="de",be="cha",we="黕黝",_e="le",xe="n",Se="rCo",Ce="놿",Ee="놮",Te="e",Ae="fro",Oe="harCode",ke="cha",Pe="rCodeA",je="t",Re="",Ie="",Me="",Be="leng",Le="h",$e="c",Ne="harCo",Fe="deAt",De="뒢",ze="뒣",Ue="l",Ve="engt",qe="h",He="fr",We="Code",Ge="charCod",Ye="e",Je="捰",Xe="fro",Ke="cha",Qe="rCo",Ze="deAt",tn="祥",en="礼",nn="﨓晴",rn="l",on="from",an="Cha",sn="rCode",cn="t",un="l",ln="en",fn="gth",pn="fromC",dn="harCod",hn="arCode",vn="At",yn="◥",gn="◴◧◦",mn="t",bn="char",wn="t",_n="Ꭰ",xn="t",Sn="from",Cn="e",En="arCode",Tn="괸",An="n",On="harCode",kn="charCo",Pn="쀌",jn="쀝쀎쀏",Rn="쀙",In="gth",Mn="rCode",Bn="rCod",Ln="題",$n="h",Nn="c",Fn="harCod",Dn="椨",zn="椣",Un="椮",Vn="le",qn="ng",Hn="紊絒約絖約絗紁紀紅紂紃紁紅紅絑紂絗紊絕絑絕",Wn="紊紋",Gn="engt",Yn="h",Jn="omCha",Xn="c",Kn="har",Qn="᷷᷻ᶦ᷺ᷲ᷻᷶ᶢᷴ",Zn="h",tr="romC",er="cha",nr="rCo",rr="l",ir="h",or="fromCh",ar="c",sr="eAt",cr="뾐뾛뾒뾁뾰",ur="뾲뾇",lr="len",fr="fromCh",pr="charCod",dr="⢬⢥⢮⢧",hr="⢴",vr="fro",yr="mC",gr="CodeA",mr="⊢",br="ode",wr="c",_r="eng",xr="th",Sr="fromCha",Cr="CodeA",Er="l",Tr="engt",Ar="f",Or="ode",kr="charC",Pr="gth",jr="fromCha",Rr="rCo",Ir="charC",Mr="odeA",Br="en",Lr="gth",$r="f",Nr="romCharCod",Fr="arCodeA",Dr="t",zr="l",Ur="eng",Vr="omCharCo",qr="de",Hr="arCodeAt",Wr="ໜຎຊໜໟ",Gr="th",Yr="f",Jr="ro",Xr="harCod",Kr="en",Qr="gth",Zr="fromCh",ti="ar",ei="harCodeA",ni="fromCha",ri="de",ii="charC",oi="eAt",ai="le",si="charC",ci="deAt",ui="l",li="h",fi="harC",pi="eAt",di="l",hi="engt",vi="fromC",yi="e",gi="d",mi="eAt",bi="eng",wi="a",_i="CodeA",xi="le",Si="ng",Ci="th",Ei="fromC",Ti="le",Ai="ng",Oi="th",ki="charC",Pi="t",ji="됶됻됮됼됵",Ri="됨됷",Ii="l",Mi="th",Bi="fromChar",Li="Cod",$i="t",Ni="뱠뱯뱸",Fi="뱧뱩뱯뱺뱡",Di="뱼",zi="fromCha",Ui="r",Vi="Code",qi="arCodeA",Hi="ꖮ",Wi="t",Gi="from",Yi="Char",Ji="Code",Xi="char",Ki="CodeA",Qi="䂽",Zi="䂦䂻",to="h",eo="omCh",no="arCode",ro="c",io="har",oo="CodeAt",ao="趹趖趚趒",so="g",co="fr",uo="d",lo="狹狶",fo="狶狣狸狥",po="l",ho="h",vo="rCod",yo="cha",go="At",mo="면",bo="멮",wo="멹멺",_o="le",xo="e",So="At",Co="쎈쎝쎀쎆",Eo="le",To="ng",Ao="th",Oo="romC",ko="harCode",Po="ch",jo="t",Ro="arCode",Io="矻",Mo="矡",Bo="矶矵",Lo="en",$o="gth",No="fr",Fo="arCodeA",Do="",zo="",Uo="ngt",Vo="h",qo="Cod",Ho="e",Wo="ch",Go="odeAt",Yo="ǟǖǝǔ",Jo="Ǜ",Xo="n",Ko="ar",Qo="charCod",Zo="\udde6\uddf1\uddf2\uddf1\udde6",ta="h",ea="C",na="ode",ra="ch",ia="arCodeA",oa="t",aa="䑓䑘䑑",sa="l",ca="Ch",ua="c",la="rCodeAt",fa="衺衭",pa="衺",da="le",ha="n",va="omCha",ya="ch",ga="rCodeAt",ma="l",ba="engt",wa="h",_a="fr",xa="omC",Sa="harCode",Ca="arCode",Ea="At",Ta="긌긞",Aa="le",Oa="h",ka="fromC",Pa="arCode",ja="Code",Ra="At",Ia="崙遼倫裏療遼",Ma="杻戮",Ba="t",La="Code",$a="c",Na="har",Fa="ßÐ",Da="ÇØÖÐÅ",za="gt",Ua="mCharC",Va="ch",qa="㐄",Ha="㐃",Wa="t",Ga="h",Ya="fro",Ja="mCharCo",Xa="de",Ka="char",Qa="䜞뢙胇ጩጶ⑋鐥辌⒍⃭鼔淺尹펙\udff3쾂⠮唨";function Za(t){for(var e=28;void 0!==e;)switch(e%8){case 0:var n,r,i,o,a,s,c,u,l,f,p,d,h;n=3339,r=-400,i=-5062,o=1783,e=6;break;case 1:e=18;break;case 2:e=8;break;case 3:!function(t){switch(e/8|0){case 0:e=3391;break;case 1:p="",d=n+ns-5091,h="",e=35;break;case 2:d++,e=35;break;case 3:p+=String[gt+"omCharCode"](i+as+45814^h["c"+mt+"rCodeAt"](d)),e=19;break;case 4:e=d<h["le"+bt+"h"]?27:51;break;case 5:e=6806;break;case 6:e=47;break;case 7:e=3140}}();break;case 4:e=41;break;case 5:!function(t){switch(e/8|0){case 0:u+=String[wt+"omCharCod"+_t](r+os+n-6619^f.charCodeAt(l)),e=45;break;case 1:e=11;break;case 2:e=6934;break;case 3:u="",l=is-2750,f="Ю"+xt+"Ъ",e=37;break;case 4:e=l<f["le"+St+"gth"]?5:13;break;case 5:l++,e=37;break;case 6:e=8326;break;case 7:e=9847}}();break;case 6:!function(t){switch(e/8|0){case 0:a="",s=n+ns-5091,c="惧"+Ct+"惧惠惦",e=38;break;case 1:s++,e=38;break;case 2:e=29;break;case 3:a+=String[Et+"de"](r+rs+22541^c["charCod"+Tt](s)),e=14;break;case 4:e=s<c.length?30:22;break;case 5:e=1906;break;case 6:e=4858;break;case 7:e=2450}}();break;case 7:return t?t[u]>as+o-6413?t[a](as+ss-7489,r+rs-2159):t:p}}function ts(t,e,n,r,i){var o,a,s,c,u,l,f,p,d,h,v,y,g,m,b,w,_,x,S,C,E,T,A,O,k,P,j,R,I,M,B,L,$,N,F,D,z,U,V,q,H,W,G,Y,J,X,K,Q,Z,tt,et,nt,rt,it,ot,at,st,ct,ut,lt,ft,pt,dt,ht,vt,gt,mt,bt,wt,_t,xt,St,Ct,Et,Tt,ts,es,sc,cc,uc,lc,fc,pc,dc,hc,vc,yc,gc,mc,bc,wc,_c,xc,Sc,Cc,Ec,Tc,Ac,Oc,kc,Pc,jc,Rc,Ic,Mc,Bc,Lc,$c,Nc,Fc,Dc,zc,Uc,Vc,qc,Hc,Wc,Gc,Yc,Jc,Xc,Kc,Qc,Zc,tu,eu,nu,ru,iu,ou,au,su,cu,uu,lu,fu,pu,du,hu,vu,yu,gu,mu,bu,wu,_u,xu,Su,Cu,Eu,Tu,Au,Ou,ku,Pu,ju,Ru,Iu,Mu,Bu,Lu,$u,Nu,Fu,Du,zu,Uu,Vu,qu,Hu,Wu,Gu,Yu,Ju,Xu,Ku,Qu,Zu,tl,el,nl,rl,il,ol,al,sl,cl,ul,ll,fl,pl,dl,hl,vl,yl,gl,ml,bl,wl,_l,xl,Sl,Cl,El,Tl,Al,Ol,kl,Pl="A";for(o=6568,a=-7917,s=6464,c=-8090,u=4956,l=-6253,f=-7677,p=1524,d=-5454,h="",v=0,y=Qa.slice(0,1);v<y["le"+At+Ot];v++)h+=String[kt+Pt+"harCode"](cs+71046^y["cha"+jt](v));for(g="",m=344+us+6796+1136,b=Qa.slice(1,2);m<b["lengt"+Rt];m++)g+=String.fromCharCode(ss+15387^b["cha"+It+Mt](m));for(w="",_=13136+os-17906,x=Qa.slice(2,3);_<x["leng"+Bt];_++)w+=String["fromCharC"+Lt+"de"](os+42514^x[$t+"harCodeAt"](_));for(S="",C=0,E=Qa.slice(3,4);C<E[Nt+"th"];C++)S+=String[Ft+Dt+zt](ss+30167^E["cha"+Ut+Vt](C));for(T="",A=ls+ls-3906,O="ᖾᖥᖟ"+qt+"ᖯ";A<O[Ht+"en"+Wt];A++)T+=String[Gt+Yt+"de"](a+s+fs+8358^O[Jt+"ar"+Xt](A));for(k="",P=0,j="酃酘酤酃酅酞酙酐";P<j[Kt+Qt+Zt];P++)k+=String["fromCharCo"+te](37175^j.charCodeAt(P));for(R="",I=0,M=ee+ne+re;I<M["le"+ie+oe];I++)R+=String[ae+"omCharCo"+se](as+s-2778^M["charC"+ce+ue](I));for(B="",L=0,$=le+fe+"ㅏ";L<$["le"+pe+"h"];L++)B+=String.fromCharCode(fs+c+7866+14154^$["charCod"+de](L));for(N="",F=a+us+344+15849,D="ᬿᬻᬭ";F<D[he+ve+"th"];F++)N+=String[ye+ge+me](s+os+-9080+4884^D[be+"rCodeAt"](F));for(z="",U=ps+7866-1556,V="黮"+we+"黍麉";U<V[_e+xe+"gth"];U++)z+=String["fromCha"+Se+"de"](ds+l+7606+49096^V.charCodeAt(U));for(q="",H=o+hs-12450,W=Ce+Ee+"놫";H<W["l"+Te+"ngth"];H++)q+=String[Ae+"mC"+Oe](cs+55029^W[ke+Pe+je](H));for(G="",Y=0,J=Re+Ie+Me;Y<J[Be+"t"+Le];Y++)G+=String.fromCharCode(os+55450^J[$e+Ne+Fe](Y));for(X="",K=0,Q="뒣"+De+ze;K<Q[Ue+Ve+qe];K++)X+=String[He+"omChar"+We](vs+44968^Q[Ge+Ye+"At"](K));for(Z="",tt=0,et="捲"+Je+"捻捺";tt<et.length;tt++)Z+=String[Xe+"mCharCode"](25375^et[Ke+Qe+Ze](tt));for(nt="",rt=us+ys+gs+6819,it=tn+en+nn;rt<it[rn+"ength"];rt++)nt+=String[on+an+sn](is+61369^it["charCodeA"+cn](rt));for(ot="",at=-2982+ds+12793,st=Qa.slice(4,6);at<st[un+ln+fn];at++)ot+=String[pn+dn+"e"](-1497+gs+9328^st["ch"+hn+vn](at));for(ct="",ut=ms+6796-6197,lt=yn+gn+"◰";ut<lt["leng"+mn+"h"];ut++)ct+=String.fromCharCode(vs+8285^lt[bn+"CodeA"+wn](ut));for(ft="",pt=bs+4087,dt="ᎍ"+_n+"Ꮍ";pt<dt["leng"+xn+"h"];pt++)ft+=String[Sn+"CharCod"+Cn](5061^dt["ch"+En+"At"](pt));for(ht="",vt=ls+ws-9496,gt=Tn+"괳괾";vt<gt["le"+An+"gth"];vt++)ht+=String["fromC"+On](ws+f+44515^gt[kn+"deAt"](vt));for(mt="",bt=as+s-11118,wt=Pn+jn+Rn;bt<wt["len"+In];bt++)mt+=String["fromCha"+Mn](_s+-4812+49800^wt["cha"+Bn+"eAt"](bt));for(_t="",xt=xs+fs+l+9537,St="顼顑"+Ln;xt<St["lengt"+$n];xt++)_t+=String.fromCharCode(Ss+-3982+34821^St[Nn+Fn+"eAt"](xt));for(Ct="",Et=us+8276,Tt=Dn+zn+Un;Et<Tt[Vn+qn+"th"];Et++)Ct+=String.fromCharCode(26957^Tt["charCode"+Pl+"t"](Et));for(ts="",es=0,sc=Hn+Wn+"紆紋紂紀紋紇絗紊紁";es<sc["l"+Gn+Yn];es++)ts+=String["fr"+Jn+"rCode"](Cs+3692+os+33420^sc[Xn+Kn+"CodeAt"](es));for(cc="",uc=0,lc=Qn+"᷷ᶢᶦᷱᷲᶠ᷺ᷴᷱᶡ᷺ᷳᶠᶠᶦ᷻ᶢᶥ᷵ᶠ᷻ᶡᶦ";uc<lc["lengt"+Zn];uc++)cc+=String["f"+tr+"harCode"](7619^lc[er+nr+"deAt"](uc));for(fc="",pc=ss+Es+4691,dc=Qa.slice(6,7);pc<dc[rr+"engt"+ir];pc++)fc+=String[or+"arCode"](9271^dc[ar+"harCod"+sr](pc));for(hc="",vc=ss+a+Ts-1958,yc=cr+"뾜뾗뾖"+ur;vc<yc[lr+"gth"];vc++)hc+=String[fr+"arCode"](ns+is+-4812+49449^yc[pr+"eAt"](vc));for(gc="",mc=0,bc=dr+hr+"⢨";mc<bc.length;mc++)gc+=String[vr+yr+"harCode"](10432^bc["char"+gr+"t"](mc));for(wc="",_c=As+3578+us+4984,xc="⊫"+mr+"⊩⊠⊳⊯";_c<xc.length;_c++)wc+=String["fromCharC"+br](8903^xc[wr+"harCodeAt"](_c));for(Sc="",Cc=-18803+hs+12921,Ec=Qa.slice(7,8);Cc<Ec["l"+_r+xr];Cc++)Sc+=String[Sr+"rCode"](ds+1751+46037^Ec["char"+Cr+"t"](Cc));for(Tc="",Ac=Os+9876,Oc=Qa.slice(8,9);Ac<Oc[Er+Tr+"h"];Ac++)Tc+=String[Ar+"romCharC"+Or](ys+ps+38798^Oc[kr+"odeAt"](Ac));for(kc="",Pc=ss+4512-7347,jc=Qa.slice(9,10);Pc<jc["len"+Pr];Pc++)kc+=String[jr+Rr+"de"](9457^jc[Ir+Mr+"t"](Pc));for(Rc="",Ic=3430+ds+ks-597,Mc=Qa.slice(10,11);Ic<Mc["l"+Br+Lr];Ic++)Rc+=String[$r+Nr+"e"](Ps+Os+js+24824^Mc["ch"+Fr+Dr](Ic));for(Bc="",Lc=0,$c=Qa.slice(11,12);Lc<$c[zr+Ur+"th"];Lc++)Bc+=String["fr"+Vr+qr](Rs+Ps+3580+49411^$c["ch"+Hr](Lc));for(Nc="",Fc=_s+s+a-2835,Dc="໓໙ຍໝຍ"+Wr;Fc<Dc["leng"+Gr];Fc++)Nc+=String[Yr+Jr+"mCharCode"](13121+Is-7162^Dc["c"+Xr+"eAt"](Fc));for(zc="",Uc=0,Vc=Qa.slice(12,13);Uc<Vc["l"+Kr+Qr];Uc++)zc+=String[Zr+ti+"Code"](7606+Ms+20062^Vc["c"+ei+"t"](Uc));for(qc="",Hc=Bs-8600,Wc=Qa.slice(13,14);Hc<Wc.length;Hc++)qc+=String[ni+"rCo"+ri](8165+Ls+ls+10336^Wc[ii+"od"+oi](Hc));for(Gc="",Yc=rs-2583,Jc=Qa.slice(14,15);Yc<Jc[ai+"ngth"];Yc++)Gc+=String.fromCharCode(54245^Jc[si+"o"+ci](Yc));for(Xc="",Kc=0,Qc=Qa.slice(15,16);Kc<Qc[ui+"engt"+li];Kc++)Xc+=String["fromC"+fi+"ode"](-6324+Es+$s+71261^Qc["charCod"+pi](Kc));for(Zc="",tu=0,eu=Qa.slice(16,17);tu<eu[di+hi+"h"];tu++)Zc+=String[vi+"harCod"+yi](u+Ns+Fs+46874^eu["charCo"+gi+mi](tu));for(nu="",ru=0,iu=Qa.slice(17,18);ru<iu["l"+bi+"th"];ru++)nu+=String["fromCh"+wi+"rCode"](Ds+57441^iu["char"+_i+"t"](ru));for(ou="",au=gs+u-2053,su=Qa.slice(18,19);au<su[xi+Si+Ci];au++)ou+=String[Ei+"harCode"](ps+d+zs+18529^su.charCodeAt(au));for(cu="",uu=-2749+_s-1539,lu=Qa.slice(19,20);uu<lu[Ti+Ai+Oi];uu++)cu+=String.fromCharCode(d+Us+Vs+15975^lu[ki+"odeA"+Pi](uu));for(fu="",pu=p+qs-10389,du="됪"+ji+Ri;pu<du[Ii+"eng"+Mi];pu++)fu+=String[Bi+Li+"e"](-7502+Hs+58997^du["charCodeA"+$i](pu));for(hu="",vu=0,yu=Ni+Fi+Di;vu<yu.length;vu++)hu+=String[zi+Ui+Vi](rs+45559^yu["ch"+qi+"t"](vu));for(gu="",mu=Ws+4838,bu="ꖮꖿꖿꖁ"+Hi+"ꖢꖪ";mu<bu["leng"+Wi+"h"];mu++)gu+=String[Gi+Yi+Ji](42447^bu[Xi+Ki+"t"](mu));for(wu="",_u=0,xu="䂧䂨䂿䂠䂮䂨"+Qi+Zi;_u<xu["lengt"+to];_u++)wu+=String["fr"+eo+no](Ds+-8838+c+37708^xu[ro+io+oo](_u));for(Su="",Cu=Vs+Gs+o-20842,Eu="趖趇趇趴趘趓趒"+ao;Cu<Eu["len"+so+"th"];Cu++)Su+=String[co+"omCharCode"](as+31689^Eu["charCo"+uo+"eAt"](Cu));for(Tu="",Au=Ys+-4610-703,Ou=lo+"狡狾狰"+fo;Au<Ou[po+"engt"+ho];Au++)Tu+=String["fromCha"+vo+"e"](-4517+ys+29492^Ou[yo+"rCode"+go](Au));for(ku="",Pu=3645+Ss+-4600-7170,ju=mo+bo+wo;Pu<ju[_o+"ngth"];Pu++)ku+=String.fromCharCode(47644^ju["charCod"+xo+So](Pu));for(Ru="",Iu=0,Mu="쎅쎆쎊"+Co+"쎇";Iu<Mu[Eo+To+Ao];Iu++)Ru+=String["f"+Oo+ko](ls+-4582+Js+55934^Mu[Po+"arCodeAt"](Iu));for(Bu="",Lu=0,$u="ㇱㇸㇳㇺ㇩ㇵ";Lu<$u["leng"+jo+"h"];Lu++)Bu+=String["fromCh"+Ro](12701^$u.charCodeAt(Lu));for(Nu="",Fu=9689+Es-2163,Du=Io+Mo+Bo;Fu<Du["l"+Lo+$o];Fu++)Nu+=String[No+"omCharCode"](a+Xs+Ks+41246^Du["ch"+Fo+"t"](Fu));for(zu="",Uu=Xs-2219,Vu=Do+""+zo;Uu<Vu["le"+Uo+Vo];Uu++)zu+=String["fromChar"+qo+Ho](60657^Vu[Wo+"arC"+Go](Uu));for(qu="",Hu=xs+1957,Wu=Yo+"Ǉ"+Jo;Hu<Wu["le"+Xo+"gth"];Hu++)qu+=String["fromCh"+Ko+"Code"](Qs+82^Wu[Qo+"eAt"](Hu));for(Gu="",Yu=0,Ju=Zo+"\udde6\uddf1\udde6";Yu<Ju["lengt"+ta];Yu++)Gu+=String["fromChar"+ea+na](Hs+62049^Ju[ra+ia+oa](Yu));for(Xu="",Ku=4865+Zs+tc+1679,Qu="䑚"+aa+"䑂䑞";Ku<Qu[sa+"ength"];Ku++)Xu+=String["from"+ca+"arCode"](Qs+344+ec+17472^Qu[ua+"ha"+la](Ku));for(Zu="",tl=0,el=fa+"衮衭衺衺衭"+pa;tl<el[da+ha+"gth"];tl++)Zu+=String["fr"+va+"rCode"](9384+nc+18207^el[ya+"a"+ga](tl));for(nl="",rl=0,"";rl<""[ma+ba+wa];rl++)nl+=String[_a+xa+Sa](gs+15376^""["ch"+Ca+Ea](rl));for(il="",ol=ps+Is+1023+7472,al="긙긂긡긂긚금긟긮"+Ta+"금";ol<al[Aa+"ngt"+Oa];ol++)il+=String[ka+"h"+Pa](-3703+rc+43112^al["char"+ja+Ra](ol));for(sl="",cl=0,ul="陸"+Ia+Ma;cl<ul["leng"+Ba+"h"];cl++)sl+=String["fromChar"+La](63910^ul[$a+Na+"CodeAt"](cl));for(ll="",fl=0,pl=Fa+Da+"ÞÃ";fl<pl["len"+za+"h"];fl++)ll+=String["fro"+Ua+"ode"](gs+-2702+-2332+8114^pl[Va+"arCodeAt"](fl));for(dl="",hl=Es+ic+zs+11051,vl=qa+Ha+"㐝";hl<vl["leng"+Wa+Ga];hl++)dl+=String[Ya+Ja+Xa](13393^vl[Ka+"CodeAt"](hl));yl="https://www.yangshipin.c",gl="mozilla/5.0 (windows nt ",ml="";try{for(var jl=21;void 0!==jl;)switch(jl%5){case 0:jl=19;break;case 1:jl=10;break;case 2:!function(t){switch(jl/5|0){case 0:jl=0==ml[qu]&&opener[zu][Nu][Bu]>0?7:void 0;break;case 1:ml=opener[Ru][ku],jl=void 0;break;case 2:jl=8553;break;case 3:jl=2710;break;case 4:jl=555}}();break;case 3:jl=2;break;case 4:jl=8}}catch(Pl){}if(bl="Mozilla",wl="Netscape",_l="Win32",El=Ds+oc+462,0==(Sl=xl=Gc+t+qc+e+zc+Nc+Bc+n+Rc+r+kc+i+Tc+(yl+cu+gl+ou+ml+nu+bl+Zc+wl+Xc+_l)+Sc)[wc])Cl=El;else{for(var Rl=ac+As+1489-2417;Rl<Sl[gc];Rl++)El=(El<<5)-El+Sl[hc](Rl),El&=El;Cl=El}return Tl=fc+Cl+xl,Al=cc,Ol=ts,Al=yt[Ct][_t][mt](Al),Ol=yt[ht][ft][ct](Ol),(kl={})[ot]=Ol,kl[nt]=yt[Z][X],kl[G]=yt[q][z],S+w+g+h+yt[N][B](Tl,Al,kl)[R][k]()[T]()}

// ===========================================================================
// 5. 工具
// ===========================================================================
function yspRand(n) {
  var c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', s = '', i;
  for (i = 0; i < n; i++) s += c.charAt(Math.floor(Math.random() * c.length));
  return s;
}
function yspKV(obj, keys) {
  var out = [], i;
  for (i = 0; i < keys.length; i++) out.push(keys[i] + '=' + decodeURI(String(obj[keys[i]])));
  return out.join('&');
}
function yspSort(a) { return a.slice().sort(); }
function yspSortLoc(a) { return a.slice().sort(function (x, y) { return x.localeCompare(y); }); }
function yspKeys(o) { var k = [], x; for (x in o) if (Object.prototype.hasOwnProperty.call(o, x)) k.push(x); return k; }

// 统一 HTTP：兼容 ku9.request / ku9.post / ku9.get
function yspHttp(url, method, headers, body) {
  var res = null;
  try {
    if (typeof ku9.request === 'function') res = ku9.request(url, method, headers, body, true);
    else if (method === 'POST' && typeof ku9.post === 'function') res = ku9.post(url, headers, body);
    else res = ku9.get(url, headers);
  } catch (e) { return { code: 0, text: '' }; }
  if (res === null || res === undefined) return { code: 0, text: '' };
  if (typeof res === 'string') return { code: 200, text: res };
  var txt = res.body;
  if (typeof txt !== 'string') txt = txt === undefined || txt === null ? '' : JSON.stringify(txt);
  return { code: typeof res.code === 'number' ? res.code : 200, text: txt };
}
function yspJson(txt) { try { return JSON.parse(txt); } catch (e) { return null; } }
function yspBaseHeaders() {
  return {
    'sec-ch-ua-platform': '"Windows"',
    'sec-ch-ua': '"Chromium";v="139", "Not?A_Brand";v="24", "Google Chrome";v="139"',
    'sec-ch-ua-mobile': '?0',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'Origin': 'https://www.yangshipin.cn',
    'Referer': 'https://www.yangshipin.cn/',
    'User-Agent': YSP.ua,
    'Cookie': yspCookie()
  };
}
// 完整浏览器 Cookie（缺了它会 401，实测）
function yspCookie(extra) {
  return 'guid=' + YSP.guid +
    '; ysp_uv=1; versionName=99.99.99; versionCode=999999; vplatform=109; platformVersion=Chrome' +
    '; deviceModel=152; newLogin=1; pc_version=1.1.16; ysp_uinfo_pc=' + (extra || '');
}
// ticket：参考值 + ts 覆盖
// 票为 62 字节，ts 明文在字节 10..19（对应 hex 下标 20..39）。
// 覆盖时只需改动每个字节的【低半字节】(hex 下标 21+2i)：因为数字字符 XOR 结果恒 <= 0x0F。
function yspTicket(pid, newTs) {
  var ref = REF_TICKET[pid];
  if (!ref) return '';
  var oldTs = ref[1], s = String(newTs);
  if (s.length !== 10) return ref[0];
  var arr = ref[0].split(''), i, idx, v;
  for (i = 0; i < 10; i++) {
    idx = 21 + 2 * i;
    v = (parseInt(arr[idx], 16) ^ (oldTs.charCodeAt(i) ^ s.charCodeAt(i))) & 15;
    arr[idx] = v.toString(16);
  }
  return arr.join('');
}

// ===========================================================================
// 6. 协议流程
// ===========================================================================
var SDK_CACHE = { token: '', exp: 0 };
function yspSdkToken() {
  if (SDK_CACHE.token && Date.now() < SDK_CACHE.exp) return SDK_CACHE.token;
  var ts = Date.now();
  var rnd = md5hex(YSP.appid + ';v1;' + YSP.guid + ';' + ts + ';');
  var url = 'https://h5access.yangshipin.cn/web/open/token' +
    '?yspappid=' + YSP.appid + '&guid=' + YSP.guid + '&vappid=' + YSP.vappid +
    '&vsecret=' + YSP.vsecret + '&raw=1&version=v1&ts=' + ts + '&rnd=' + rnd;
  var r = yspHttp(url, 'GET', {
    'Referer': 'https://www.yangshipin.cn/', 'Origin': 'https://www.yangshipin.cn', 'User-Agent': YSP.ua
  });
  var j = yspJson(r.text);
  if (j && j.data && j.data.token) {
    SDK_CACHE.token = j.data.token;
    SDK_CACHE.exp = Date.now() + 240000;   // 服务端 5 分钟有效，这里留 4 分钟
    return SDK_CACHE.token;
  }
  return '';
}

function yspPlayerToken(pid) {
  var o = { pid: pid, guid: YSP.guid, appid: 'ysp_pc', rand_str: yspRand(10) };
  o.signature = md5hex(yspKV(o, yspSort(yspKeys(o))) + YSP.saltAuth);
  var form = [], k;
  for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) form.push(k + '=' + o[k]);
  var h = yspBaseHeaders();
  h['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
  h['yspappid'] = YSP.appid;
  var r = yspHttp('https://player-api.yangshipin.cn/v1/player/auth', 'POST', h, form.join('&'));
  var j = yspJson(r.text);
  if (j && j.data && j.data.token) return { token: j.data.token, ts: j.data.ts };
  return null;
}

function yspPlayUrl(ch, sdkToken, pt) {
  var pid = ch.pid, cnlid = ch.cnlid;
  var nowSec = Math.round(Date.now() / 1000);
  var cKey;
  try { cKey = ts(cnlid, nowSec, YSP.ver, YSP.guid, YSP.platform); }
  catch (e) { return { error: 'cKey 生成失败: ' + e.message }; }

  var body = {
    cnlid: cnlid, livepid: pid, stream: '2', guid: YSP.guid, cKey: cKey,
    adjust: 1, sphttps: '1', platform: YSP.platform, cmd: '2', encryptVer: '8.1', dtype: '1',
    devid: 'devid', otype: 'ojson', appVer: YSP.ver, app_version: YSP.ver,
    channel: 'ysp_tx', defn: 'fhd', rand_str: yspRand(10)
  };
  var allKeys = yspKeys(body);
  body.signature = md5hex(yspKV(body, yspSort(allKeys)) + YSP.saltInfo);

  var sdkKeys = [], i;
  for (i = 0; i < allKeys.length; i++) if (YSP.sdkExclude.indexOf(allKeys[i]) < 0) sdkKeys.push(allKeys[i]);
  var sdkInput = md5hex(yspKV(body, yspSortLoc(sdkKeys)));
  var seqId = String(Math.floor(Math.random() * 5) + 1);
  var rid = '999999' + yspRand(10) + Date.now();
  var signInput = sdkInput + '-' + YSP.guid + '-' + seqId + '-' + rid;
  var sdkSign = md5hex(YSP.guid + ';' + YSP.host + ';' + sdkToken + ';' + YSP.proto + ';' +
                      YSP.appid + ';' + signInput + ';') + '-' + signInput;

  var h = yspBaseHeaders();
  h['Content-Type'] = 'application/json;charset=UTF-8';
  h['yspappid'] = YSP.appid;
  h['yspticket'] = yspTicket(pid, pt.ts);
  h['yspsdkinput'] = sdkInput;
  h['yspsdksign'] = sdkSign;
  h['seqId'] = seqId;
  h['request-id'] = rid;
  h['yspPlayerToken'] = pt.token;
  h['Cookie'] = yspCookie('; nseqId=' + seqId + '; nrequest-id=' + rid);

  var r = yspHttp('https://player-api.yangshipin.cn/v1/player/get_live_info', 'POST', h, JSON.stringify(body));
  var j = yspJson(r.text);
  if (j && j.data && j.data.playurl) {
    return { url: j.data.playurl + (j.data.extended_param || ''), defn: j.data.defn, cdn: j.data.cdn_name };
  }
  var detail = j ? ('code=' + j.code + ' / ' + (j.data ? (j.data.code + ' ' + (j.data.errinfo || '')) : '')) : ('HTTP ' + r.code);
  return { error: '取流失败 (' + detail + ')' };
}

function yspFetchOne(key) {
  var ch = CHANNELS[key];
  if (!ch) return null;
  var sdkToken = yspSdkToken();
  if (!sdkToken) return { error: 'SDK token 获取失败' };
  var pt = yspPlayerToken(ch.pid);
  if (!pt || !pt.token) return { error: '播放令牌获取失败' };
  return yspPlayUrl(ch, sdkToken, pt);
}

function yspBuildList() {
  var lines = ['#EXTM3U'], k, r, cnt = 0;
  for (k in CHANNELS) {
    if (!Object.prototype.hasOwnProperty.call(CHANNELS, k)) continue;
    r = yspFetchOne(k);
    if (r && r.url) { lines.push('#EXTINF:-1,' + CHANNELS[k].name); lines.push(r.url); cnt++; }
  }
  if (!cnt) return { error: '所有频道均获取失败' };
  return { m3u8: lines.join('\n') };
}

// ===========================================================================
// 7. 入口
// ===========================================================================
function main(item) {
  var id = (item && item.id) ? String(item.id) : 'list';
  if (id === 'list') return yspBuildList();
  if (!Object.prototype.hasOwnProperty.call(CHANNELS, id)) {
    return { error: '无效的频道ID: ' + id + '，可用：cctv6, tj, xj, jy1, list' };
  }
  var r = yspFetchOne(id);
  if (!r) return { error: '获取失败' };
  if (r.error) return r;
  return { url: r.url, headers: { 'User-Agent': YSP.ua, 'Referer': 'https://www.yangshipin.cn/' } };
}

// 兼容导出
(function () {
  var g = (typeof globalThis !== 'undefined') ? globalThis
        : (typeof global !== 'undefined') ? global : this;
  if (g) { g.main = main; }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { main: main }; }
})();
