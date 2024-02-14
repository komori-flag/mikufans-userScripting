// 构建录播姬脚本运行的部分环境
const sharedStorage = new (require('node-localstorage').LocalStorage)('./localStorage');
/**
 * 录播姬的事件
 */
var recorderEvents = {
    /**
     * @description 按下测试按钮。
     * @param {object} alert 录播姬测试弹窗 
     * @returns {void}
     */
    onTest: (alert = new Function()) => void 0,

    /**
     * 过滤弹幕消息。
     * 写入 XML 文件之前会调用，如果返回 false 就不会写入。
     * @description 过滤弹幕消息。
     * @param {string} json 接收到的 JSON 信息
     * @returns {boolean | null} true|null：接收此弹幕（默认） 、false：丢弃此弹幕
     */
    onDanmaku: (json) => true || false || null,

    /**
     * 获取直播流地址，每次尝试开始录播调用一次。  
     * 如果返回了 null 会使用录播姬默认逻辑获取直播流地址。  
     * 如果返回了 string 则无条件使用脚本给的地址。
     */
    onFetchStreamUrl: ({ roomid, qn }) => null,

    /**
     * 修改直播流地址，每次连接直播服务器（包括 HTTP 302 跳转后）都会调用一次。  
     * 可以返回 null 意为不做修改  
     * 或返回 string 修改后的直播流地址  
     * 或返回 {url:string, ip?:string} 在修改直播流地址的同时指定连接的 IP 地址
     */
    onTransformStreamUrl: (originalUrl) => null,

    /**
     * 修改发给弹幕服务器的握手包 JSON。
     * 需要注意握手包会影响到弹幕服务器返回的消息格式，导致直播服务器返回录播姬不支持的数据。
     * @param roomInfo 当前直播间信息
     * @param json 原握手包 JSON
     * @returns 返回 null 意为不做修改，或返回修改后的 JSON 文本
     */
    onDanmakuHandshake: (roomInfo, json) => null,
}




// 录播姬脚本正文开头 ------
recorderEvents.onTest = () => {
    // 模拟正常请求中需要保存暂存数据的情况
    // const item = new Storage(storageName);
    // item.set_roomData(3, JSON.stringify({
    //     "storageName": storageName,
    //     "roomid": 3,
    //     "data": {
    //         "waitTime_HLS": 333,
    //         "oldUrl": {
    //             "flv": [
    //                 { "expires": 332, "url": "http://127.0.0.1/flv1", "repeatNum": 0 },
    //                 { "expires": 99, "url": "http://127.0.0.1/flv1", "repeatNum": 0 },
    //             ],
    //             "hls": []
    //         }
    //     }
    // }), storageName);
    // console.log(JSON.stringify(oldUrl(3, 10000, {
    //     "flv": "http://127.0.0.1/_1500",
    //     "hls": "http://127.0.0.1"
    // })))
    // console.log(JSON.stringify(new Storage(storageName).get_roomData(`name=${storageName}&roomid=3`)));
    
    const getOldUrl = oldUrl(8664667, 10000, {
        "flv": 'http://127.0.0.1/flv1',
        "hls": 'http://127.0.0.1/hls1'
    });


}


// debug 信息显示开关
const switch_DEBUG = true; // true：开启，false：关闭
// 旧直播流地址复用开关（默认值：false）。关闭则获取到的直播流地址将直接输出而不做暂存
// 开启此项功能，需要您安装的录播姬版本位于 2.6.0 及以上
const switch_oldUrl = true; // true：开启，false：关闭
const storageName = "FF0";

// const current_qn = v1_data?.data?.current_qn;
// const playurl = v1_data?.data?.durl.map(x => x?.url);
// playurl.forEach(x => {
//     if (/_(\d+)(?=\.flv)/.exec(x) && (Number(/_(\d+)(?=\.flv)/.exec(x)[1]) / 10) < current_qn) {
//         console.warn(`[画质选择]返回直播流地址的画质是 ${Number(/_(\d+)(?=\.flv)/.exec(x)[1]) / 10} 而不是请求的 ${current_qn}`)
//     }
// });

/**
 * @function
 * @description 旧直播流地址复用
 * @param {number} roomid 房间 ID 值
 * @param {number} qn 画质 qn 值
 * @param {object} streamUrl 请求的直播流地址
 * @param {string} streamUrl.flv FLV 流地址
 * @param {string} streamUrl.hls HLS_FMP4 流地址
 * @returns {object} ok: 运行状态；message: 信息；oldStream: 此房间相对应的旧直播流地址数据
 */
const oldUrl = (roomid, qn, streamUrl) => {
    // 对是否开启“旧直播流地址复用”功能进行检测
    if (!switch_oldUrl) return {
        "ok": false,
        "message": "[旧直播流地址复用]您并未开启“旧直播流地址复用”功能",
        "oldUrl": null
    }

    // 正常获取到暂存数据中的房间数据后，就可以对获取的直播流地址进行鉴别了
    // 对 qn 值为非原画（10000）
    if (qn !== 10000) {
        switch_DEBUG ? console.warn("[旧直播流地址复用]当前房间请求的画质为非原画（qn 不等于 10000），故不对此次请求的直播流地址进行复用操作和保存") : null;
        return {
            "ok": false,
            "message": "[旧直播流地址复用]当前房间请求的画质为非原画（qn 不等于 10000），故不对此次请求的直播流地址进行复用操作和保存",
            "oldUrl": null
        }
    }

    /**
     * @description 直播流地址状态
     * @param {boolean} status_streamUrl.blurayUrl 是否为二压原画[地址带有“_bluray”字样]
     * @param {boolean} status_streamUrl.not_10000 是否为未登录“原画”画质[qn为10000但获取的是150等]
     */
    const status_streamUrl = {
        "blurayUrl": false,
        "not_10000": false
    }

    // 对直播流地址为 hevc 地址
    if (/_minihevc/.test(streamUrl?.flv) || /_minihevc/.test(streamUrl?.hls)) {
        switch_DEBUG ? console.warn("[旧直播流地址复用]当前获取到的为 HEVC 地址，故不对此次请求的直播流地址进行复用操作和保存") : null;
        return {
            "ok": false,
            "message": "[旧直播流地址复用]当前获取到的为 HEVC 地址，故不对此次请求的直播流地址进行复用操作和保存",
            "oldUrl": null
        }
    }

    // 对直播流地址带“_bluray”的二压画质
    if (/_bluray/.test(streamUrl?.flv) || /_bluray/.test(streamUrl?.hls)) {
        status_streamUrl.blurayUrl = true;
        switch_DEBUG ? console.warn("[旧直播流地址复用]当前获取到的直播流地址为二压原画[地址带有“_bluray”字样]") : null;
    }

    // 对未登录“原画”画质
    if (/_(800|1500|2500|4000)/.test(streamUrl?.flv) || /_(800|1500|2500|4000)/.test(streamUrl.hls)) {
        status_streamUrl.not_10000 = true;
        switch_DEBUG ? console.warn(`[旧直播流地址复用]当前获取到的直播流地址画质不是请求中的 ${qn.toString()}（${qnConvert(qn)}）`) : null;
    }

    /** 暂存的房间数据 */
    let roomData = null;
    const oldUrl_storage = class extends Storage {
        constructor(storage_name = storageName) {
            super(storage_name);
        }
        write(roomid, roomData) {
            return this.set_roomData(storageName, roomid, JSON.stringify(roomData));
        }
        read(roomid) {
            const roomData_sign = this.storage?.roomData?.filter(x => x?.roomid === roomid)[0]?.sign;
            if (!roomData_sign) return { "ok": false, "message": `没有暂存此房间（${roomid}）的标识符` }
            return this.get_roomData(roomData_sign);
        }
    }

    try {
        const storage = new oldUrl_storage();
        let temp = storage.read(roomid);

        if (!temp.ok) {
            roomData = storage.write(roomid, {
                storageName,
                roomid,
                "data": {
                    "waitTime_HLS": 0,
                    "oldUrl": {
                        "flv": [],
                        "hls": []
                    }
                }
            })?.data;
        } else {
            roomData = temp?.data;
        }
    } catch (error) {
        return {
            "ok": false,
            "message": `[旧直播流地址复用]在操作暂存的房间数据时出现了错误：${error.toString()}`,
            "oldUrl": null
        }
    }


    /**
     * @description 暂存房间数据 - 地址过期时间检测
     * @param {object} roomData 房间数据
     */
    const oldUrl_expiresTest = (roomData) => {
        /**
         * 过期检测
         * 1. 检查过期的地址，并分拣出来
         * 2. 将过期的地址从数组当中剔除
         * 3. 调用暂存数据的“set_roomData”功能将经过过期检测的地址进行写入
         */

        let temp = JSON.parse(JSON.stringify(roomData));
        temp.data.oldUrl.flv = roomData?.data?.oldUrl?.flv.filter(x => Number(x.expires) < (Date.now() / 1000) + 10);
        temp.data.oldUrl.hls = roomData?.data?.oldUrl?.hls.filter(x => Number(x.expires) < (Date.now() / 1000) + 10);

        try {
            new oldUrl_storage(storageName).write(roomid, temp);
        } catch (error) {
            return {
                "ok": false,
                "message": `[旧直播流地址复用]在写入暂存的房间数据时出现了错误：${error.toString()}`
            }
        }

        return {
            "ok": true,
            "message": ""
        }
    }

    /**
     * @description 暂存房间数据 - 存入新的真原画直播流地址
     * @param {object} roomData 房间数据
     * @param {object} streamUrl 请求的直播流地址
     * @param {string} streamUrl.flv FLV 流地址
     * @param {string} streamUrl.hls HLS_FMP4 流地址
     */
    const oldUrl_set = (roomData, streamUrl) => {
        /**
         * 写入真原画直播流地址
         * 1. 初始化三个参数：expires（直播流过期时间）、url（直播流地址）、repeatNum（直播流使用次数）
         * 2. 从请求的直播流地址当中提取 expires
         * 3. 组合进一个对象当中，调用暂存数据的“set_roomData”功能将新真原画地址进行写入
         */
        // flv
        roomData?.data?.oldUrl?.flv.push({
            "expires": Number(new URL(streamUrl?.flv).searchParams.get('expires')),
            "url": streamUrl?.flv,
            "repeatNum": 0
        });

        // hls
        roomData?.data?.oldUrl?.hls.push({
            "expires": Number(new URL(streamUrl?.hls).searchParams.get('expires')),
            "url": streamUrl?.hls,
            "repeatNum": 0
        });

        try {
            return new oldUrl_storage(storageName).write(roomid, roomData);
        } catch (error) {
            return {
                "ok": false,
                "message": `[旧直播流地址复用]在写入暂存的房间数据时出现了错误：${error.toString()}`
            }
        }
    }

    // 地址过期时间检测
    oldUrl_expiresTest(roomData);

    // 发现有新真原画直播流地址，执行写入
    if ((!status_streamUrl.blurayUrl) && (!status_streamUrl.not_10000)) {
        oldUrl_set(roomData, streamUrl);
    }

    return {
        "ok": true,
        "message": "0",
        roomData
    }
}

/**
 * @description 旧直播流地址获取
 * @param {number} roomid 房间 ID 值
 * @param {number} qn 画质 qn 值
 * @param {object} streamUrl 请求的直播流地址
 * @param {string} streamUrl.flv FLV 流地址
 * @param {string} streamUrl.hls HLS_FMP4 流地址
 * @returns {object}
 */
const OldUrl = class {
    /**
     * @param {boolean} ok 状态
     */
    ok = true;
    /**
     * @param {string} message 消息
     */
    message = "0";
    /**
     * @param {object | null} oldStream 房间相对应的旧直播流地址
     */
    oldStream = null;
    /**
     * @param {object} streamStatus 获取到的直播流地址状态
     * @param {boolean} streamStatus.blurayUrl 是否为二压原画[地址带有“_bluray”字样]
     * @param {boolean} streamStatus.not_10000 是否为未登录“原画”画质[qn为10000但获取的是150等] 
    */
    #streamStatus = {
        /**
         * 是否为二压原画[地址带有“_bluray”字样]
         */
        blurayUrl: false,
        /**
         * 是否为未登录“原画”画质[qn为10000但获取的是150等]
         */
        not_10000: false
    }

    /**
     * @description 旧直播流地址复用
     * @param {number} roomid 房间 ID 值
     * @param {number} qn 画质 qn 值
     * @param {object} streamUrl 请求的直播流地址
     * @param {string} streamUrl.flv FLV 流地址
     * @param {string} streamUrl.hls HLS_FMP4 流地址
     */
    constructor(roomid, qn, streamUrl) {
        // 对是否开启“旧直播流地址复用”功能进行检测
        if (!switch_oldUrl) {
            this.message = "[旧直播流地址复用]您并未开启“旧直播流地址复用”功能";
            this.ok = false;
            return
        }

        // 对获取到的直播流地址进行状态检查
        this.streamUrl_statusCheck(streamUrl, qn);

        // 对检查后出现的状态异常直接输出而不做接下来的操作
        if (!this.ok) return;

        
    }

    /**
     * @description 检测获取到的直播流地址状态
     * @param {object} streamUrl 获取的直播流地址
     * @param {string} streamUrl.flv FLV 流地址
     * @param {string} streamUrl.hls HLS_FMP4 流地址
     * @param {number} qn 画质 qn 值
     * @returns {object} 输出处理后的对象 
     */
    streamUrl_statusCheck(streamUrl, qn){
        // 对直播流地址为 hevc 地址
        if (/_minihevc/.test(streamUrl?.flv) || /_minihevc/.test(streamUrl?.hls)) {
            switch_DEBUG ? console.warn("[旧直播流地址复用]当前获取到的为 HEVC 地址，故不对此次请求的直播流地址进行复用操作和保存") : null;
            this.message = "[旧直播流地址复用]当前获取到的为 HEVC 地址，故不对此次请求的直播流地址进行复用操作和保存";
            this.ok = false;
            return;
        }

        // 正常获取到暂存数据中的房间数据后，就可以对获取的直播流地址进行鉴别了
        // 对 qn 值为非原画（10000）
        if (qn !== 10000) {
            switch_DEBUG ? console.warn("[旧直播流地址复用]当前房间请求的画质为非原画（qn 不等于 10000），故不对此次请求的直播流地址进行复用操作和保存") : null;
            this.message = "[旧直播流地址复用]当前房间请求的画质为非原画（qn 不等于 10000），故不对此次请求的直播流地址进行复用操作和保存";
            this.ok = false;
            return;
        }

        // 对直播流地址为 hevc 地址
        if (/_minihevc/.test(streamUrl?.flv) || /_minihevc/.test(streamUrl?.hls)) {
            switch_DEBUG ? console.warn("[旧直播流地址复用]当前获取到的为 HEVC 地址，故不对此次请求的直播流地址进行复用操作和保存") : null;
            this.message = "[旧直播流地址复用]当前获取到的为 HEVC 地址，故不对此次请求的直播流地址进行复用操作和保存";
            this.ok = false;
            return;
        }

        // 对直播流地址带“_bluray”的二压画质
        if (/_bluray/.test(streamUrl?.flv) || /_bluray/.test(streamUrl?.hls)) {
            this.#streamStatus.blurayUrl = true;
            switch_DEBUG ? console.warn("[旧直播流地址复用]当前获取到的直播流地址为二压原画[地址带有“_bluray”字样]") : null;
        }

        // 对未登录“原画”画质
        if (/_(800|1500|2500|4000)/.test(streamUrl?.flv) || /_(800|1500|2500|4000)/.test(streamUrl.hls)) {
            this.#streamStatus.not_10000 = true;
            switch_DEBUG ? console.warn(`[旧直播流地址复用]当前获取到的直播流地址画质不是请求中的 ${qn.toString()}（${qnConvert(qn)}）`) : null;
        }
    }

}

/**
 * @description 流地址选择
 * @param {number} roomid 房间号 ID 值
 * @param {object} streamUrl 获取的直播流地址
 * @param {string} streamUrl.FLV FLV 流地址
 * @param {string} streamUrl.HLS HLS_FMP4 流地址
 * @param {object} oldUrl 旧直播流地址
 * @returns {string} 选择后的流地址
 */
const addressSelect_stream = (roomid, streamUrl, oldUrl = null) => {
    /**
     * 流地址选择
     * 1. 输入获取到的直播流地址与旧直播流地址
     * 2. 检测是否返回已存在的旧直播流地址，没有 --> 两流选择
     * 3. 已存在的旧直播流地址，读取两流的数组
     * 4. 筛选两流数组，将超出复用次数的直播流筛去
     * 5. 随机优先从数组中选择复用次数少的直播流地址 --> 两流选择
     * 6. 两流选择的关键在于 HLS 流等待时间，通过
     */
    return ""
}


/**
 * @function
 * @description qn-->画质名
 * @param {number} qn 画质 qn 值
 * @returns {string} 输出 qn 值相对应的文字
 */
const qnConvert = qn => {
    // 初始化Map对象
    const myMap = new Map([[30000, "杜比"], [20000, "4K"], [10000, "原画"], [401, "蓝光(杜比)"], [400, "蓝光"], [250, "超清"], [150, "高清"], [80, "流畅"]]);
    let item = null;

    if (qn && typeof qn === 'number') {
        item = myMap.get(qn);
        if (!item) return "未知";
        return item;
    }
    return "未知";
}


/**
 * @class
 * @description 暂存数据
 * @returns {object}
 */
const Storage = class {
    ok = true;
    storage = null;

    /**
     * @description 暂存数据 - 默认执行方法
     * @param {string} storageName 暂存数据标识名
     */
    constructor(storageName) {
        if (typeof sharedStorage === "undefined") {
            if (switch_DEBUG) console.error("[暂存数据]执行脚本内部不存在 sharedStorage 接口，请升级录播姬核心版本到 2.6.0 及以上");
            this.ok = false;
            throw ("执行脚本内部不存在 sharedStorage 接口，请升级录播姬核心版本到 2.6.0 及以上");
        }

        // 通过用户设定的标识名读取“sharedStorage”接口中的内容
        try {
            this.storage = JSON.parse(sharedStorage.getItem(`name=${storageName}`));

            if (!this.storage) throw (`没有保存此标识符（${storageName}）的暂存数据`);

            // 检查所存的暂存数据格式是否合法
            this.#check_storage(storageName, this.storage);

            // 返回对象以及执行方法
            return;
        } catch (error) { console.error(`[暂存数据]读取默认暂存数据时出现了错误：${error.toString()}`) }

        // 未存储、存储的数据格式不合法或修改了暂存数据的标识名
        try {
            // 先清空暂存在录播姬内部的暂存数据
            sharedStorage.clear();
            console.log("[暂存数据]已执行暂存数据清空操作");
            // 再注入新数据
            const storage_json = JSON.stringify({ storageName, "roomData": [] });
            this.storage = JSON.parse(storage_json);
            sharedStorage.setItem(`name=${storageName}`, storage_json);
            console.log("[暂存数据]注入新数据成功");
        } catch (error) { throw (`[暂存数据]操作暂存数据时出现了错误：${error.toString()}`) }
    }

    /**
     * @description 暂存数据 - 获取房间数据
     * @param {string} sign 房间数据标识符
     * @returns 
     */
    get_roomData(sign) {
        const signData = queryStringToObject(sign);
        let item = null;

        // 读取暂存的房间数据
        try {
            item = JSON.parse(sharedStorage.getItem(sign))
        } catch (error) {
            return {
                "ok": false,
                "message": `[暂存数据-房间数据]在读取数据时出现了错误：${error.toString()}`,
                "data": null
            }
        }

        // 检测是否存在暂存的房间数据
        if (!item) {
            return {
                "ok": false,
                "message": "[暂存数据-获取房间数据]暂时没有保存此房间号的暂存数据"
            };
        }

        // 校验暂存数据格式
        try {
            this.#check_roomData(signData?.name, signData?.roomid, item);
        } catch (error) {
            return {
                "ok": false,
                "message": `[暂存数据-房间数据]在校验暂存的房间数据时出现了错误：${error.toString()}`,
                "data": null
            }
        }
        return { "ok": true, "message": "", "data": item }
    }

    /**
     * @description 暂存数据 - 写入房间数据
     * @param {string} storageName 暂存的数据标识名
     * @param {number} roomid 房间 ID 值
     * @param {string} setData 需要保存的 JSON 数据
     * @param {object|null} callback 回调函数
     */
    set_roomData(storageName, roomid, setData, callback = null) {
        // 格式化房间数据的标识符
        const sign = `name=${storageName}&roomid=${roomid}`;

        try {
            // 写入房间数据
            sharedStorage.setItem(sign, setData);

            if (!this.storage.roomData.filter(x => x.sign == sign).length) {
                // 修改默认暂存数据，添加新的房间数据
                this.storage.roomData.push({
                    sign,
                    roomid,
                    "oldUrl_FLV": Number(JSON.parse(setData)?.data?.oldUrl?.flv?.length),
                    "oldUrl_HLS": Number(JSON.parse(setData)?.data?.oldUrl?.hls?.length)
                });
            } else {
                let temp = this.storage.roomData.filter(x => x.sign == sign)[0];
                temp["oldUrl_FLV"] = Number(JSON.parse(setData)?.data?.oldUrl?.flv?.length);
                temp["oldUrl_HLS"] = Number(JSON.parse(setData)?.data?.oldUrl?.hls?.length);
            }

            sharedStorage.setItem(`name=${storageName}`, JSON.stringify(this.storage));
        } catch (error) {
            return {
                "ok": false,
                "message": `[暂存数据-写入房间数据]在写入房间数据时出现了问题 ${error.toString()}`,
                "data": null
            }
        }

        return callback ? callback(this.storage) : this.get_roomData(sign);
    }

    /**
     * @description 暂存数据 - 删除房间数据
     * @param {string} sign 房间数据标识符
     */
    remove_roomData(sign) {
        const getData = sharedStorage.getItem(sign);
        if (!getData) return { "ok": false, "message": `[暂存数据-删除房间数据]没有获取到此标识符（${sign.toString()}）对应下的房间数据` };
        sharedStorage.removeItem(sign);
        return { "ok": true, "message": "0" }
    }

    /**
     * @description 暂存数据格式检测 - 默认方法
     * @param {string} storageName 暂存数据标识名
     * @param {object} storage_obj 暂存的对象数据
     */
    #check_storage(storageName, storage_obj) {
        if (storage_obj?.storageName !== storageName)
            throw (`默认暂存数据标识名不一致。用户设置的标识名：${storageName}，默认暂存数据当中的标识名：${storage_obj?.storageName}`);

        if (!Array.isArray(storage_obj?.roomData))
            throw (`默认暂存数据-房间数据非法。应为 [object Array]，值类型为：${Object.prototype.toString.call(storage_obj?.roomData)}`);

        storage_obj.roomData.forEach((x, i) => {
            if (!x?.sign)
                throw (`默认暂存数据-房间数据（索引：${i}），数据缺少必要的标识符，读取到的标识符为：${x?.sign}`);
        })

        return true
    }

    /**
     * @description 暂存数据格式检测 - 房间数据
     * @param {string} storageName 暂存数据标识名
     * @param {number} roomid 房间 ID 值
     * @param {object} storage_obj 暂存的房间数据
     */
    #check_roomData(storageName, roomid, storage_obj) {
        if (storage_obj?.storageName !== storageName && storage_obj?.roomid !== roomid)
            throw (`暂存房间数据（标识名：${storageName}，房间号：${roomid}）的标识或房间号不一致。暂存数据中的标识名：${storage_obj?.storageName}，房间号：${storage_obj?.roomid}`);

        if (typeof storage_obj?.data?.waitTime_HLS !== 'number')
            throw (`暂存房间数据（标识名：${storageName}，房间号：${roomid}，数据：waitTime_HLS）非法，应当为 [object Number]，值类型为：${Object.prototype.toString.call(storage_obj?.data?.waitTime_HLS)}`);

        if (!Array.isArray(storage_obj.data?.oldUrl?.flv) || !Array.isArray(storage_obj.data?.oldUrl?.hls))
            throw (`暂存房间数据（标识名：${storageName}，房间号：${roomid}，数据：oldUrl_${!Array.isArray(storage_obj.data?.oldUrl?.flv) ? "flv" : "hls"}）非法，应为 [object Array]，值类型为 ${!Array.isArray(storage_obj.data?.oldUrl?.flv) ? Object.prototype.toString.call(storage_obj.data?.oldUrl?.flv) : Object.prototype.toString.call(storage_obj.data?.oldUrl?.hls)}`);

        const oldUrl_forEach = (arr, name) => arr.forEach((x, i) => {
            if (typeof x?.expires !== 'number' || typeof x?.url !== 'string' || typeof x?.repeatNum !== 'number')
                throw (`暂存房间数据（标识名：${storageName}，房间号：${roomid}，数据：oldUrl_${name}，索引：${i}）缺少必要的键值：${typeof x?.expires !== 'string' ? "expires" : typeof x?.url !== 'string' ? "url" : typeof x?.repeatNum !== 'number' ? "repeatNum" : "未知"}`);
        });
        oldUrl_forEach(storage_obj.data.oldUrl.flv, "flv");
        oldUrl_forEach(storage_obj.data.oldUrl.hls, "hls");

        return true
    }
}

/**
 * @function
 * @description 字符串解析函数
 * @param {string} queryString 字符串标识
 */
const queryStringToObject = (queryString) =>
    queryString.split('&').reduce((result, pair) => {
        let value = decodeURIComponent(pair.split('=')[1] || '');
        result[decodeURIComponent(pair.split('=')[0])] = !isNaN(Number(value)) ? parseFloat(value) : value;
        return result
    }, { "name": null, "roomid": null });


// ------ 录播姬脚本正文末尾




// 模拟录播姬运行脚本的部分操作
recorderEvents.onTest(null);
// sharedStorage.clear();
module.exports.recEvents = recorderEvents;