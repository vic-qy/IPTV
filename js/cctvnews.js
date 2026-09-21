/*
 * 本文件由 js/cctvnews.js（mytv 版）反向移植而来，供酷9 使用。不参与 git 提交（K9/ 在 .gitignore）。
 */

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
        var bytes = (msg && typeof msg === "object" && msg.__raw) ? msg.__raw : toBytes(msg);
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

// 3. 内联 CryptoJS（AES-CBC / enc.Hex / pad.Pkcs7）
// ===========================================================================
var n = function () { return function () {}; };
n.n = function (f) { return f; };
var yt;
yt=yt||function(t,e){var n={},r=n.lib={},i=function(){},o=r.Base={extend:function(t){i.prototype=this;var e=new i;return t&&e.mixIn(t),e.hasOwnProperty("init")||(e.init=function(){e.$super.init.apply(this,arguments)}),e.init.prototype=e,e.$super=this,e},create:function(){var t=this.extend();return t.init.apply(t,arguments),t},init:function(){},mixIn:function(t){for(var e in t)t.hasOwnProperty(e)&&(this[e]=t[e]);t.hasOwnProperty("toString")&&(this.toString=t.toString)},clone:function(){return this.init.prototype.extend(this)}},a=r.WordArray=o.extend({init:function(t,n){t=this.words=t||[],this.sigBytes=n!=e?n:4*t.length},toString:function(t){return(t||c).stringify(this)},concat:function(t){var e=this.words,n=t.words,r=this.sigBytes;if(t=t.sigBytes,this.clamp(),r%4)for(var i=0;i<t;i++)e[r+i>>>2]|=(n[i>>>2]>>>24-i%4*8&255)<<24-(r+i)%4*8;else if(65535<n.length)for(i=0;i<t;i+=4)e[r+i>>>2]=n[i>>>2];else e.push.apply(e,n);return this.sigBytes+=t,this},clamp:function(){var e=this.words,n=this.sigBytes;e[n>>>2]&=4294967295<<32-n%4*8,e.length=t.ceil(n/4)},clone:function(){var t=o.clone.call(this);return t.words=this.words.slice(0),t},random:function(e){for(var n=[],r=0;r<e;r+=4)n.push(4294967296*t.random()|0);return new a.init(n,e)}}),s=n.enc={},c=s.Hex={stringify:function(t){var e=t.words;t=t.sigBytes;for(var n=[],r=0;r<t;r++){var i=e[r>>>2]>>>24-r%4*8&255;n.push((i>>>4).toString(16)),n.push((15&i).toString(16))}return n.join("")},parse:function(t){for(var e=t.length,n=[],r=0;r<e;r+=2)n[r>>>3]|=parseInt(t.substr(r,2),16)<<24-r%8*4;return new a.init(n,e/2)}},u=s.Latin1={stringify:function(t){var e=t.words;t=t.sigBytes;for(var n=[],r=0;r<t;r++)n.push(String.fromCharCode(e[r>>>2]>>>24-r%4*8&255));return n.join("")},parse:function(t){for(var e=t.length,n=[],r=0;r<e;r++)n[r>>>2]|=(255&t.charCodeAt(r))<<24-r%4*8;return new a.init(n,e)}},l=s.Utf8={stringify:function(t){try{return decodeURIComponent(escape(u.stringify(t)))}catch(e){throw Error("Malformed UTF-8 data")}},parse:function(t){return u.parse(unescape(encodeURIComponent(t)))}},f=r.BufferedBlockAlgorithm=o.extend({reset:function(){this._data=new a.init,this._nDataBytes=0},_append:function(t){"string"==typeof t&&(t=l.parse(t)),this._data.concat(t),this._nDataBytes+=t.sigBytes},_process:function(e){var n=this._data,r=n.words,i=n.sigBytes,o=this.blockSize,s=i/(4*o);if(s=e?t.ceil(s):t.max((0|s)-this._minBufferSize,0),e=s*o,i=t.min(4*e,i),e){for(var c=0;c<e;c+=o)this._doProcessBlock(r,c);c=r.splice(0,e),n.sigBytes-=i}return new a.init(c,i)},clone:function(){var t=o.clone.call(this);return t._data=this._data.clone(),t},_minBufferSize:0});r.Hasher=f.extend({cfg:o.extend(),init:function(t){this.cfg=this.cfg.extend(t),this.reset()},reset:function(){f.reset.call(this),this._doReset()},update:function(t){return this._append(t),this._process(),this},finalize:function(t){return t&&this._append(t),this._doFinalize()},blockSize:16,_createHelper:function(t){return function(e,n){return new t.init(n).finalize(e)}},_createHmacHelper:function(t){return function(e,n){return new p.HMAC.init(t,n).finalize(e)}}});var p=n.algo={};return n}(Math);(function(){var t=yt,e=t.lib.WordArray;t.enc.Base64={stringify:function(t){var e=t.words,n=t.sigBytes,r=this._map;t.clamp(),t=[];for(var i=0;i<n;i+=3)for(var o=(e[i>>>2]>>>24-i%4*8&255)<<16|(e[i+1>>>2]>>>24-(i+1)%4*8&255)<<8|e[i+2>>>2]>>>24-(i+2)%4*8&255,a=0;4>a&&i+.75*a<n;a++)t.push(r.charAt(o>>>6*(3-a)&63));if(e=r.charAt(64))for(;t.length%4;)t.push(e);return t.join("")},parse:function(t){var n=t.length,r=this._map,i=r.charAt(64);i&&(i=t.indexOf(i),-1!=i&&(n=i)),i=[];for(var o=0,a=0;a<n;a++)if(a%4){var s=r.indexOf(t.charAt(a-1))<<a%4*2,c=r.indexOf(t.charAt(a))>>>6-a%4*2;i[o>>>2]|=(s|c)<<24-o%4*8,o++}return e.create(i,o)},_map:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="}})(),function(t){function e(t,e,n,r,i,o,a){return t=t+(e&n|~e&r)+i+a,(t<<o|t>>>32-o)+e}function n(t,e,n,r,i,o,a){return t=t+(e&r|n&~r)+i+a,(t<<o|t>>>32-o)+e}function r(t,e,n,r,i,o,a){return t=t+(e^n^r)+i+a,(t<<o|t>>>32-o)+e}function i(t,e,n,r,i,o,a){return t=t+(n^(e|~r))+i+a,(t<<o|t>>>32-o)+e}for(var o=yt,a=o.lib,s=a.WordArray,c=a.Hasher,u=(a=o.algo,[]),l=0;64>l;l++)u[l]=4294967296*t.abs(t.sin(l+1))|0;a=a.MD5=c.extend({_doReset:function(){this._hash=new s.init([1732584193,4023233417,2562383102,271733878])},_doProcessBlock:function(t,o){for(var a=0;16>a;a++){var s=o+a,c=t[s];t[s]=16711935&(c<<8|c>>>24)|4278255360&(c<<24|c>>>8)}a=this._hash.words,s=t[o+0],c=t[o+1];var l=t[o+2],f=t[o+3],p=t[o+4],d=t[o+5],h=t[o+6],v=t[o+7],y=t[o+8],g=t[o+9],m=t[o+10],b=t[o+11],w=t[o+12],_=t[o+13],x=t[o+14],S=t[o+15],C=a[0],E=a[1],T=a[2],A=a[3];C=e(C,E,T,A,s,7,u[0]),A=e(A,C,E,T,c,12,u[1]),T=e(T,A,C,E,l,17,u[2]),E=e(E,T,A,C,f,22,u[3]),C=e(C,E,T,A,p,7,u[4]),A=e(A,C,E,T,d,12,u[5]),T=e(T,A,C,E,h,17,u[6]),E=e(E,T,A,C,v,22,u[7]),C=e(C,E,T,A,y,7,u[8]),A=e(A,C,E,T,g,12,u[9]),T=e(T,A,C,E,m,17,u[10]),E=e(E,T,A,C,b,22,u[11]),C=e(C,E,T,A,w,7,u[12]),A=e(A,C,E,T,_,12,u[13]),T=e(T,A,C,E,x,17,u[14]),E=e(E,T,A,C,S,22,u[15]),C=n(C,E,T,A,c,5,u[16]),A=n(A,C,E,T,h,9,u[17]),T=n(T,A,C,E,b,14,u[18]),E=n(E,T,A,C,s,20,u[19]),C=n(C,E,T,A,d,5,u[20]),A=n(A,C,E,T,m,9,u[21]),T=n(T,A,C,E,S,14,u[22]),E=n(E,T,A,C,p,20,u[23]),C=n(C,E,T,A,g,5,u[24]),A=n(A,C,E,T,x,9,u[25]),T=n(T,A,C,E,f,14,u[26]),E=n(E,T,A,C,y,20,u[27]),C=n(C,E,T,A,_,5,u[28]),A=n(A,C,E,T,l,9,u[29]),T=n(T,A,C,E,v,14,u[30]),E=n(E,T,A,C,w,20,u[31]),C=r(C,E,T,A,d,4,u[32]),A=r(A,C,E,T,y,11,u[33]),T=r(T,A,C,E,b,16,u[34]),E=r(E,T,A,C,x,23,u[35]),C=r(C,E,T,A,c,4,u[36]),A=r(A,C,E,T,p,11,u[37]),T=r(T,A,C,E,v,16,u[38]),E=r(E,T,A,C,m,23,u[39]),C=r(C,E,T,A,_,4,u[40]),A=r(A,C,E,T,s,11,u[41]),T=r(T,A,C,E,f,16,u[42]),E=r(E,T,A,C,h,23,u[43]),C=r(C,E,T,A,g,4,u[44]),A=r(A,C,E,T,w,11,u[45]),T=r(T,A,C,E,S,16,u[46]),E=r(E,T,A,C,l,23,u[47]),C=i(C,E,T,A,s,6,u[48]),A=i(A,C,E,T,v,10,u[49]),T=i(T,A,C,E,x,15,u[50]),E=i(E,T,A,C,d,21,u[51]),C=i(C,E,T,A,w,6,u[52]),A=i(A,C,E,T,f,10,u[53]),T=i(T,A,C,E,m,15,u[54]),E=i(E,T,A,C,c,21,u[55]),C=i(C,E,T,A,y,6,u[56]),A=i(A,C,E,T,S,10,u[57]),T=i(T,A,C,E,h,15,u[58]),E=i(E,T,A,C,_,21,u[59]),C=i(C,E,T,A,p,6,u[60]),A=i(A,C,E,T,b,10,u[61]),T=i(T,A,C,E,l,15,u[62]),E=i(E,T,A,C,g,21,u[63]),a[0]=a[0]+C|0,a[1]=a[1]+E|0,a[2]=a[2]+T|0,a[3]=a[3]+A|0},_doFinalize:function(){var e=this._data,n=e.words,r=8*this._nDataBytes,i=8*e.sigBytes;n[i>>>5]|=128<<24-i%32;var o=t.floor(r/4294967296);for(n[15+(i+64>>>9<<4)]=16711935&(o<<8|o>>>24)|4278255360&(o<<24|o>>>8),n[14+(i+64>>>9<<4)]=16711935&(r<<8|r>>>24)|4278255360&(r<<24|r>>>8),e.sigBytes=4*(n.length+1),this._process(),e=this._hash,n=e.words,r=0;4>r;r++)i=n[r],n[r]=16711935&(i<<8|i>>>24)|4278255360&(i<<24|i>>>8);return e},clone:function(){var t=c.clone.call(this);return t._hash=this._hash.clone(),t}}),o.MD5=c._createHelper(a),o.HmacMD5=c._createHmacHelper(a)}(Math),function(){var t=yt,e=t.lib,n=e.Base,r=e.WordArray,i=(e=t.algo,e.EvpKDF=n.extend({cfg:n.extend({keySize:4,hasher:e.MD5,iterations:1}),init:function(t){this.cfg=this.cfg.extend(t)},compute:function(t,e){var n=this.cfg,i=n.hasher.create(),o=r.create(),a=o.words,s=n.keySize;for(n=n.iterations;a.length<s;){c&&i.update(c);var c=i.update(t).finalize(e);i.reset();for(var u=1;u<n;u++)c=i.finalize(c),i.reset();o.concat(c)}return o.sigBytes=4*s,o}}));t.EvpKDF=function(t,e,n){return i.create(n).compute(t,e)}}(),yt.lib.Cipher||function(t){var e=yt,n=e.lib,r=n.Base,i=n.WordArray,o=n.BufferedBlockAlgorithm,a=e.enc.Base64,s=e.algo.EvpKDF,c=n.Cipher=o.extend({cfg:r.extend(),createEncryptor:function(t,e){return this.create(this._ENC_XFORM_MODE,t,e)},createDecryptor:function(t,e){return this.create(this._DEC_XFORM_MODE,t,e)},init:function(t,e,n){this.cfg=this.cfg.extend(n),this._xformMode=t,this._key=e,this.reset()},reset:function(){o.reset.call(this),this._doReset()},process:function(t){return this._append(t),this._process()},finalize:function(t){return t&&this._append(t),this._doFinalize()},keySize:4,ivSize:4,_ENC_XFORM_MODE:1,_DEC_XFORM_MODE:2,_createHelper:function(t){return{encrypt:function(e,n,r){return("string"==typeof n?h:d).encrypt(t,e,n,r)},decrypt:function(e,n,r){return("string"==typeof n?h:d).decrypt(t,e,n,r)}}}});n.StreamCipher=c.extend({_doFinalize:function(){return this._process(!0)},blockSize:1});var u=e.mode={},l=function(e,n,r){var i=this._iv;i?this._iv=t:i=this._prevBlock;for(var o=0;o<r;o++)e[n+o]^=i[o]},f=(n.BlockCipherMode=r.extend({createEncryptor:function(t,e){return this.Encryptor.create(t,e)},createDecryptor:function(t,e){return this.Decryptor.create(t,e)},init:function(t,e){this._cipher=t,this._iv=e}})).extend();f.Encryptor=f.extend({processBlock:function(t,e){var n=this._cipher,r=n.blockSize;l.call(this,t,e,r),n.encryptBlock(t,e),this._prevBlock=t.slice(e,e+r)}}),f.Decryptor=f.extend({processBlock:function(t,e){var n=this._cipher,r=n.blockSize,i=t.slice(e,e+r);n.decryptBlock(t,e),l.call(this,t,e,r),this._prevBlock=i}}),u=u.CBC=f,f=(e.pad={}).Pkcs7={pad:function(t,e){for(var n=4*e,r=(n-=t.sigBytes%n,n<<24|n<<16|n<<8|n),o=[],a=0;a<n;a+=4)o.push(r);n=i.create(o,n),t.concat(n)},unpad:function(t){t.sigBytes-=255&t.words[t.sigBytes-1>>>2]}},n.BlockCipher=c.extend({cfg:c.cfg.extend({mode:u,padding:f}),reset:function(){c.reset.call(this);var t=this.cfg,e=t.iv;if(t=t.mode,this._xformMode==this._ENC_XFORM_MODE)var n=t.createEncryptor;else n=t.createDecryptor,this._minBufferSize=1;this._mode=n.call(t,this,e&&e.words)},_doProcessBlock:function(t,e){this._mode.processBlock(t,e)},_doFinalize:function(){var t=this.cfg.padding;if(this._xformMode==this._ENC_XFORM_MODE){t.pad(this._data,this.blockSize);var e=this._process(!0)}else e=this._process(!0),t.unpad(e);return e},blockSize:4});var p=n.CipherParams=r.extend({init:function(t){this.mixIn(t)},toString:function(t){return(t||this.formatter).stringify(this)}}),d=(u=(e.format={}).OpenSSL={stringify:function(t){var e=t.ciphertext;return t=t.salt,(t?i.create([1398893684,1701076831]).concat(t).concat(e):e).toString(a)},parse:function(t){t=a.parse(t);var e=t.words;if(1398893684==e[0]&&1701076831==e[1]){var n=i.create(e.slice(2,4));e.splice(0,4),t.sigBytes-=16}return p.create({ciphertext:t,salt:n})}},n.SerializableCipher=r.extend({cfg:r.extend({format:u}),encrypt:function(t,e,n,r){r=this.cfg.extend(r);var i=t.createEncryptor(n,r);return e=i.finalize(e),i=i.cfg,p.create({ciphertext:e,key:n,iv:i.iv,algorithm:t,mode:i.mode,padding:i.padding,blockSize:t.blockSize,formatter:r.format})},decrypt:function(t,e,n,r){return r=this.cfg.extend(r),e=this._parse(e,r.format),t.createDecryptor(n,r).finalize(e.ciphertext)},_parse:function(t,e){return"string"==typeof t?e.parse(t,this):t}})),h=(e=(e.kdf={}).OpenSSL={execute:function(t,e,n,r){return r||(r=i.random(8)),t=s.create({keySize:e+n}).compute(t,r),n=i.create(t.words.slice(e),4*n),t.sigBytes=4*e,p.create({key:t,iv:n,salt:r})}},n.PasswordBasedCipher=d.extend({cfg:d.cfg.extend({kdf:e}),encrypt:function(t,e,n,r){return r=this.cfg.extend(r),n=r.kdf.execute(n,t.keySize,t.ivSize),r.iv=n.iv,t=d.encrypt.call(this,t,e,n.key,r),t.mixIn(n),t},decrypt:function(t,e,n,r){return r=this.cfg.extend(r),e=this._parse(e,r.format),n=r.kdf.execute(n,t.keySize,t.ivSize,e.salt),r.iv=n.iv,d.decrypt.call(this,t,e,n.key,r)}}))}(),function(){for(var t=yt,e=t.lib.BlockCipher,n=t.algo,r=[],i=[],o=[],a=[],s=[],c=[],u=[],l=[],f=[],p=[],d=[],h=0;256>h;h++)d[h]=128>h?h<<1:h<<1^283;var v=0,y=0;for(h=0;256>h;h++){var g=y^y<<1^y<<2^y<<3^y<<4;g=g>>>8^255&g^99,r[v]=g,i[g]=v;var m=d[v],b=d[m],w=d[b],_=257*d[g]^16843008*g;o[v]=_<<24|_>>>8,a[v]=_<<16|_>>>16,s[v]=_<<8|_>>>24,c[v]=_,_=16843009*w^65537*b^257*m^16843008*v,u[g]=_<<24|_>>>8,l[g]=_<<16|_>>>16,f[g]=_<<8|_>>>24,p[g]=_,v?(v=m^d[d[d[w^m]]],y^=d[d[y]]):v=y=1}var x=[0,1,2,4,8,16,32,64,128,27,54];n=n.AES=e.extend({_doReset:function(){for(var t=this._key,e=t.words,n=t.sigBytes/4,i=(t=4*((this._nRounds=n+6)+1),this._keySchedule=[]),o=0;o<t;o++)if(o<n)i[o]=e[o];else{var a=i[o-1];o%n?6<n&&4==o%n&&(a=r[a>>>24]<<24|r[a>>>16&255]<<16|r[a>>>8&255]<<8|r[255&a]):(a=a<<8|a>>>24,a=r[a>>>24]<<24|r[a>>>16&255]<<16|r[a>>>8&255]<<8|r[255&a],a^=x[o/n|0]<<24),i[o]=i[o-n]^a}for(e=this._invKeySchedule=[],n=0;n<t;n++)o=t-n,a=n%4?i[o]:i[o-4],e[n]=4>n||4>=o?a:u[r[a>>>24]]^l[r[a>>>16&255]]^f[r[a>>>8&255]]^p[r[255&a]]},encryptBlock:function(t,e){this._doCryptBlock(t,e,this._keySchedule,o,a,s,c,r)},decryptBlock:function(t,e){var n=t[e+1];t[e+1]=t[e+3],t[e+3]=n,this._doCryptBlock(t,e,this._invKeySchedule,u,l,f,p,i),n=t[e+1],t[e+1]=t[e+3],t[e+3]=n},_doCryptBlock:function(t,e,n,r,i,o,a,s){for(var c=this._nRounds,u=t[e]^n[0],l=t[e+1]^n[1],f=t[e+2]^n[2],p=t[e+3]^n[3],d=4,h=1;h<c;h++){var v=r[u>>>24]^i[l>>>16&255]^o[f>>>8&255]^a[255&p]^n[d++],y=r[l>>>24]^i[f>>>16&255]^o[p>>>8&255]^a[255&u]^n[d++],g=r[f>>>24]^i[p>>>16&255]^o[u>>>8&255]^a[255&l]^n[d++];p=r[p>>>24]^i[u>>>16&255]^o[l>>>8&255]^a[255&f]^n[d++],u=v,l=y,f=g}v=(s[u>>>24]<<24|s[l>>>16&255]<<16|s[f>>>8&255]<<8|s[255&p])^n[d++],y=(s[l>>>24]<<24|s[f>>>16&255]<<16|s[p>>>8&255]<<8|s[255&u])^n[d++],g=(s[f>>>24]<<24|s[p>>>16&255]<<16|s[u>>>8&255]<<8|s[255&l])^n[d++],p=(s[p>>>24]<<24|s[u>>>16&255]<<16|s[l>>>8&255]<<8|s[255&f])^n[d++],t[e]=v,t[e+1]=y,t[e+2]=g,t[e+3]=p},keySize:8}),t.AES=e._createHelper(n)}();

// ===========================================================================

/*
 * cctvnews.js —— 央视新闻 App 直播（CCTV 频道）酷9 JS 脚本
 * ---------------------------------------------------------------------------
 * 协议（逆向自 js/cctvnews.js 混淆脚本 + 沙箱 E2E，2026-09-19 核对）：
 *   1) GET https://emas-api.cctvnews.cctv.com/h5/emas.feed.article.live.detail/1.0.0
 *         ?articleId=<id>&scene_type=6
 *      头：x-emas-gw-sign = HmacSHA256(
 *            "&&&20000009&" + md5("articleId=<id>&scene_type=6") + "&" + <秒级ts>
 *            + "&emas.feed.article.live.detail&1.0.0&&&&&",
 *            "emasgatewayh5")                          （小写 hex）
 *          cookieuid = md5(<秒级ts>)
 *          x-emas-gw-t = <秒级ts>，x-req-ts = <毫秒ts>
 *          from-client: h5，referer: https://m-live.cctvnews.cctv.com/
 *   2) 响应体 { response: base64(JSON) }，内含
 *      data.dk（AES 密钥材料）与
 *      data.live_room.liveCameraList[0].pullUrlList[0].authResultUrl[0].authUrl（加密地址）
 *      注意：服务端概率性不下发 dk/authUrl（cctv1 实测可高达 4/5）—— 脚本内置 5 次重试
 *   3) AES-128-CBC-PKCS7 解密 authUrl：
 *      key = dk前8位 + ts末8位；iv = dk末8位 + ts前8位   （ts 为请求时的秒级时间戳）
 *      得 https://live-play-hls.cctvnews.cctv.com/...m3u8?auth_key=...（官方源，关键帧对齐不花屏）
 *   4) 播放地址对 UA/Referer 无强校验（实测 200），但脚本仍返回 UA/Referer 头以防收紧
 *
 * 用法（酷9 频道地址）：
 *   ?id=cctv1 | cctv2 | cctv4 | cctv7 | cctv9 | cctv10 | cctv12 | cctv13 | cctv17 | cctv4k
 *   ?id=list   返回全部 10 频道 m3u8（逐频道实时签名）
 *   默认（无 id）等同 cctv1
 * ---------------------------------------------------------------------------
 */

// ============================ 常量 ============================
var ARTICLE_IDS = {
    "cctv1":  "11200132825562653886",
    "cctv2":  "12030532124776958103",
    "cctv4":  "10620168294224708952",
    "cctv7":  "8516529981177953694",
    "cctv9":  "7252237247689203957",
    "cctv10": "14589146016461298119",
    "cctv12": "13180385922471124325",
    "cctv13": "16265686808730585228",
    "cctv17": "4496917190172866934",
    "cctv4k": "2127841942201075403"
};
var API_BASE = "https://emas-api.cctvnews.cctv.com/h5/emas.feed.article.live.detail/1.0.0";
var HMAC_KEY = "emasgatewayh5";
var APPKEY = "20000009";
var AUTH_PATH_PART = "&emas.feed.article.live.detail&1.0.0&&&&&";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

// ============================ HMAC-SHA256 ============================
// RFC 2104。内层：ipad+message 均为 ASCII（key 为 ASCII、异或 0x36 后仍 < 0x80），
// 可直接走 sha256hex 的 UTF-8 编码；外层含 32 字节二进制摘要，用 {__raw: 字节数组} 喂入。
function hmacSha256hex(message, key) {
    var k = key, i, ipad = "", outer = [];
    if (k.length > 64) k = sha256hex(k);
    for (i = 0; i < 64; i++) {
        var kb = i < k.length ? k.charCodeAt(i) : 0;
        ipad += String.fromCharCode(kb ^ 0x36);
        outer.push(kb ^ 0x5c);
    }
    var innerHex = sha256hex(ipad + message);
    for (i = 0; i < 64; i += 2) outer.push(parseInt(innerHex.substring(i, i + 2), 16));
    return sha256hex({ __raw: outer });
}

// ============================ 协议 ============================
// 单次请求：返回 { data } 或 null（dk/auth 缺失即视为失败）
function fetchLiveOnce(articleId) {
    var ts = Math.floor(Date.now() / 1000);
    var tsStr = String(ts);
    var query = "articleId=" + articleId + "&scene_type=6";
    var md5hex = yt.MD5(query).toString();
    var signStr = "&&&" + APPKEY + "&" + md5hex + "&" + tsStr + AUTH_PATH_PART;
    var sign = hmacSha256hex(signStr, HMAC_KEY);
    var url = API_BASE + "?" + query;
    var headers = {
        "User-Agent": UA,
        "cookieuid": yt.MD5(tsStr).toString(),
        "from-client": "h5",
        "referer": "https://m-live.cctvnews.cctv.com/",
        "x-emas-gw-appkey": APPKEY,
        "x-emas-gw-pv": "6.1",
        "x-emas-gw-sign": sign,
        "x-emas-gw-t": tsStr,
        "x-req-ts": String(ts * 1000)
    };
    var body = "";
    try { body = ku9.get(url, headers) || ""; } catch (e) { return null; }
    var j = null;
    try { j = JSON.parse(body); } catch (e) { return null; }
    if (!j || !j.response) return null;
    var inner = null;
    try { inner = JSON.parse(yt.enc.Utf8.stringify(yt.enc.Base64.parse(j.response))); } catch (e) { return null; }
    if (!inner || !inner.data) return null;
    var d = inner.data;
    var authUrl = "";
    try {
        authUrl = d.live_room.liveCameraList[0].pullUrlList[0].authResultUrl[0].authUrl || "";
    } catch (e) { authUrl = ""; }
    if (!authUrl || !d.dk) return null;
    return { authUrl: authUrl, dk: d.dk, ts: ts };
}

// 解密 authUrl：AES-128-CBC-PKCS7，key/iv 由 dk 与请求 ts 拼接
function decryptAuthUrl(authUrlB64, dk, ts) {
    var tsStr = String(ts);
    var key = dk.substring(0, 8) + tsStr.substring(tsStr.length - 8);
    var iv = dk.substring(dk.length - 8) + tsStr.substring(0, 8);
    var cp = yt.lib.CipherParams.create({ ciphertext: yt.enc.Base64.parse(authUrlB64) });
    var dec = yt.AES.decrypt(cp, yt.enc.Utf8.parse(key), {
        iv: yt.enc.Utf8.parse(iv),
        mode: yt.mode.CBC,
        padding: yt.pad.Pkcs7
    });
    return yt.enc.Utf8.stringify(dec);
}

// 取单频道地址（5 次重试，服务端概率性拒发，个别频道可高达 4/5）
function resolveLiveUrl(articleId) {
    var last = null, i, r;
    for (i = 0; i < 5; i++) {
        r = fetchLiveOnce(articleId);
        if (!r) { last = "接口未返回认证数据"; continue; }
        var url = "";
        try { url = decryptAuthUrl(r.authUrl, r.dk, r.ts); } catch (e) { last = "地址解密失败"; continue; }
        if (url && url.indexOf("http") === 0) return { url: url };
        last = "解密结果无效";
    }
    return { error: "取流失败（重试 5 次）：" + last };
}

// ============================ 入口 ============================
function main(item) {
    var id = (item && item.id) ? String(item.id) : "cctv1";
    try {
        if (id === "list") {
            var lines = ["#EXTM3U"];
            for (var k in ARTICLE_IDS) {
                if (!Object.prototype.hasOwnProperty.call(ARTICLE_IDS, k)) continue;
                var r = resolveLiveUrl(ARTICLE_IDS[k]);
                if (r && r.url) {
                    lines.push('#EXTINF:-1 tvg-name="' + k.toUpperCase() + '" group-title="央视新闻app",' + k.toUpperCase());
                    lines.push(r.url);
                }
            }
            if (lines.length <= 1) return { error: "所有频道均获取失败，请稍后重试" };
            return { m3u8: lines.join("\n") };
        }
        var articleId = ARTICLE_IDS[id];
        if (!articleId) {
            var keys = [], k2;
            for (k2 in ARTICLE_IDS) if (Object.prototype.hasOwnProperty.call(ARTICLE_IDS, k2)) keys.push(k2);
            return { error: "无效的频道ID: " + id + "，可用：" + keys.join("、") + "、list" };
        }
        var one = resolveLiveUrl(articleId);
        if (one.error) return one;
        return { url: one.url, headers: { "User-Agent": UA, "Referer": "https://m-live.cctvnews.cctv.com/" } };
    } catch (e) {
        return { error: "JS脚本执行出错：" + e.message };
    }
}
