<?php
$id = isset($_GET['id'])?$_GET['id']:'cdxw';
$n = [
'cdxw' =>[563,'cdtv1','CDTV1'], //CDTV-1 新闻综合频道
'cdjj' =>[562,'cdtv2','CDTV2'], //CDTV-2 经济资讯频道
'cdds' =>[561,'cdtv3','CDTV3'], //CCDTV-3 都市生活频道
'cdys' =>[560,'cdtv4','CDTV4'], //CDTV-4 影视文艺频道
'cdgg' =>[559,'cdtv5','CDTV5'], //CDTV-5 公共频道
'cdse' =>[558,'cdtv6','CDTV6'], //CDTV-6 少儿频道
'rcxf' =>[592,'dangjiao','dangjiao'], //蓉城先锋
'mrgw' =>[595,'cdtv8','CDTV8'], //每日购物

//strtoupper()
];

$url='https://cstvweb.cdmp.candocloud.cn/live/getLiveUrl?url=https://cdn1.cditv.cn/'.$n[$id][1].'high/'.$n[$id][2].'High.flv/playlist.m3u8';
$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, FALSE);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, FALSE);
curl_setopt($ch, CURLOPT_REFERER,'https://www.cditv.cn/show/4845-'.$n[$id][0].'.html');
$playurl= curl_exec($ch);       
curl_close($ch);


header('Location:'.json_decode($playurl)->data->url);
//echo $playurl;
?>