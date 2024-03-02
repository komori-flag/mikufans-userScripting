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
    const getOldUrl = new OldUrl(3, 10000, {
        "flv": 'https://cn-gddg-cu-01-04.bilivideo.com/live-bvc/481448/live_11153765_9369560.flv',
        "hls": 'https://cn-gddg-cu-01-04.bilivideo.com/live-bvc/481448/live_11153765_9369560/index.m3u8'
    });

    console.log(getOldUrl);
}


// debug 信息显示开关
const switch_DEBUG = false; // true：开启，false：关闭
// 旧直播流地址复用开关（默认值：false）。关闭则获取到的直播流地址将直接输出而不做暂存
// 开启此项功能，需要您安装的录播姬版本位于 2.6.0 及以上
const switch_oldUrl = true; // true：开启，false：关闭
const storageName = "FF0";

// const current_qn = v1_data?.data?.current_qn;
// const playurl = v1_data?.data?.durl.map(x => x?.url);
// playurl.forEach(x => {
//     if (/_(\d+)(?=\.flv)/.exec(x) && (Number(/_(\d+)(?=\.flv)/.exec(x)[1]) / 10) < current_qn) {
//         new Log("warn",`[画质选择]返回直播流地址的画质是 ${Number(/_(\d+)(?=\.flv)/.exec(x)[1]) / 10} 而不是请求的 ${current_qn}`)
//     }
// });


/**
 * @description 旧直播流地址获取
 * @param {number} roomid 房间 ID 值
 * @param {number} qn 画质 qn 值
 * @param {object} streamUrl 请求的直播流地址
 * @param {string} streamUrl.flv FLV 流地址
 * @param {string} streamUrl.hls HLS_FMP4 流地址
 * @returns {object} ok, message, oldStream
 */
const OldUrl = class {

    /**
     * @param {boolean} 状态
     */
    ok = true

    /**
     * @param {string} 消息
     */
    message = "0"

    /**
     * @param {object} 房间相对应的旧直播流地址
     * @param {string} oldStream.flv 旧的 FLV 流地址
     * @param {string} oldStream.hls 旧的 HLS_FMP4 流地址
     */
    oldStream = {
        "flv": "",
        "hls": ""
    }

    /**
     * @enum {boolean} 获取到的直播流地址状态
     */
    #streamStatus = {
        /**
         * 是否为二压原画[地址带有“_bluray”字样]
         */
        "blurayUrl": false,
        /**
         * 是否为未登录“原画”画质[qn为10000但获取的是150等]
         */
        "not_10000": false
    }

    /**
     * @description 旧直播流复用-对暂存房间数据的集成方法
     * @param {string} storage_name 暂存数据标识名
     * @example storage = this.#storage(storage_name)
    */
    #storage = (storage_name) =>
        new class extends Storage {

            /**
             * @param {string} storage_name 暂存数据标识名
             */
            constructor(storage_name) {
                super(storage_name);
                if (!this.ok) return;

                this.read = this.#read;
                this.write = this.#write;
            }

            /**
             * @description 写入暂存房间数据
             * @param {number} roomid 房间 ID 值
             * @param {object} roomData 需要保存的房间数据
             * @returns {object} 写入后相对应的暂存房间数据
             */
            #write(roomid, roomData) {
                return this.set_roomData(storageName, roomid, JSON.stringify(roomData));
            }

            /**
             * @description 读取暂存房间数据
             * @param {number} roomid 房间 ID 值
             * @returns {object} 相对应的暂存房间数据
             */
            #read(roomid) {
                const roomData_sign = this.storage?.roomData?.filter(x => x?.roomid === roomid)[0]?.sign;
                if (!roomData_sign) return { "ok": false, "message": `没有暂存此房间（${roomid}）的标识符` }
                return this.get_roomData(roomData_sign);
            }
        }(storage_name)

    /**
     * @description 旧直播流地址复用
     * @param {number} roomid 房间 ID 值
     * @param {number} qn 画质 qn 值
     * @param {object} streamUrl 请求的直播流地址
     * @param {string} streamUrl.flv FLV 流地址
     * @param {string} streamUrl.hls HLS_FMP4 流地址
     * @param {string} storage_name 暂存数据标识名[可选，但必须在全局下设置`storageName`变量]
     */
    constructor(roomid, qn, streamUrl, storage_name = storageName) {
        // 对是否开启“旧直播流地址复用”功能进行检测
        if (!switch_oldUrl) {
            [this.ok, this.message] = [false, "[旧直播流地址复用]您并未开启“旧直播流地址复用”功能"];
            return;
        }

        // 对获取到的直播流地址进行状态检查
        this.#getStreamStatus(streamUrl, qn);

        // 对检查后出现的状态异常直接输出而不做接下来的操作
        if (!this.ok) return;

        // 地址过期时间筛除
        try {
            let temp = this.#expires(roomid, storage_name);

            if (!temp?.ok) {
                [this.ok, this.message] = [false, temp?.message];
                return;
            }

        } catch (error) {
            [this.ok, this.message] = [false, `[旧直播流地址复用]在执行地址过期时间筛除时出现了错误：${error.toString()}`];
            return;
        }

        // 筛选出需要输出到外部的旧直播流地址
        try {
            let temp = this.#select(roomid, storage_name, streamUrl);

            if (!temp?.ok) {
                [this.ok, this.message] = [false, temp?.message];
                return;
            }
        } catch (error) {
            [this.ok, this.message] = [false, `[旧直播流地址复用]在执行筛选地址时出现了错误：${error.toString()}`];
            return;
        }

        // 发现有获取到真原画直播流地址，执行写入
        if ((!this.#streamStatus.blurayUrl) && (!this.#streamStatus.not_10000)) {
            try {
                let temp = this.#set(roomid, storage_name, streamUrl);

                if (!temp?.ok) {
                    [this.ok, this.message] = [false, temp?.message];
                    return;
                }
            } catch (error) {
                [this.ok, this.message] = [false, `[旧直播流地址复用]在执行地址写入时出现了错误：${error.toString()}`];
                return;
            }
        }
    }

    /**
     * @description 集成方法 - 获取暂存的房间数据
     * @param {number} roomid 房间 ID 值
     * @param {string} storage_name 暂存数据标识符
     * @returns {object}
     */
    #getRoomData(roomid, storage_name) {
        let storage = null;
        try {
            storage = this.#storage(storage_name)

            if (!storage?.ok) {
                return {
                    "ok": storage.ok,
                    "message": storage.message
                }
            }
        } catch (error) {
            return {
                "ok": false,
                "message": `[旧直播流地址复用]调用自身获取房间数据方法时出现了错误：${error.toString()}`
            }
        }

        let temp = storage.read(roomid);

        if (!temp?.ok) {
            return storage.write(roomid, {
                storageName,
                roomid,
                "data": {
                    "waitTime_HLS": 0,
                    "oldUrl": {
                        "flv": [],
                        "hls": []
                    }
                }
            });
        } else {
            return temp;
        }
    }

    /**
     * @description 获取直播流地址的状态
     * @param {object} streamUrl 获取的直播流地址
     * @param {string} streamUrl.flv FLV 流地址
     * @param {string} streamUrl.hls HLS_FMP4 流地址
     * @param {number} qn 画质 qn 值
     * @returns {object} 输出处理后的对象 
     */
    #getStreamStatus(streamUrl, qn) {
        // 用户 qn 值为非原画（10000）
        if (qn !== 10000) {
            new Log("warn", "[旧直播流地址复用]当前房间请求的画质为非原画（qn 不等于 10000），故不对此次请求的直播流地址进行复用操作和保存");
            [this.ok, this.message] = [false, "[旧直播流地址复用]当前房间请求的画质为非原画（qn 不等于 10000），故不对此次请求的直播流地址进行复用操作和保存"];
            return;
        }

        // 直播流地址为 hevc 地址
        if (/_minihevc/.test(streamUrl?.flv) || /_minihevc/.test(streamUrl?.hls)) {
            new Log("warn", "[旧直播流地址复用]当前获取到的为 HEVC 地址，故不对此次请求的直播流地址进行复用操作和保存");
            [this.ok, this.message] = [false, "[旧直播流地址复用]当前获取到的为 HEVC 地址，故不对此次请求的直播流地址进行复用操作和保存"];
            return;
        }

        // 直播流地址为二压原画地址
        if (/_bluray/.test(streamUrl?.flv) || /_bluray/.test(streamUrl?.hls)) {
            this.#streamStatus.blurayUrl = true;
            new Log("warn", "[旧直播流地址复用]当前获取到的直播流地址为二压原画[地址带有“_bluray”字样]");
        }

        // 对未登录“原画”画质
        if (/_(800|1500|2500|4000)/.test(streamUrl?.flv) || /_(800|1500|2500|4000)/.test(streamUrl.hls)) {
            this.#streamStatus.not_10000 = true;
            new Log("warn", `[旧直播流地址复用]当前获取到的直播流地址画质不是请求中的 ${qn.toString()}（${qnConvert(qn)}）`);
        }
    }

    /**
     * @description 过期检测
     * @param {number} roomid 房间 ID 值
     * @param {string} storage_name 暂存变量标识名
     * @returns {object} ok:状态, message:信息, roomData:暂存的房间数据
     */
    #expires(roomid, storage_name) {
        let temp = this.#getRoomData(roomid, storage_name);

        if (!temp?.ok) {
            return {
                "ok": temp?.ok,
                "message": temp?.message
            }
        } else {
            temp = temp?.data;
        }


        // const funpack = (oldUrl, ...urlSignArr) =>
        //     urlSignArr.map(urlSign => oldUrl[urlSign] = oldUrl[urlSign].filter(x => Number(x.expires) < (Date.now() / 1000) + 10));

        temp.data.oldUrl.flv = temp?.data?.oldUrl?.flv.filter(x => Number(x.expires) < (Date.now() / 1000) + 10);
        temp.data.oldUrl.hls = temp?.data?.oldUrl?.hls.filter(x => Number(x.expires) < (Date.now() / 1000) + 10);

        try {
            temp = this.#storage(storage_name).write(roomid, temp);
        } catch (error) {
            return {
                "ok": false,
                "message": `[旧直播流地址复用]在写入暂存的房间数据时出现了错误：${error.toString()}`,
                "roomData": null
            }
        }

        return {
            "ok": true,
            "message": "0",
            "roomData": temp
        }
    }

    /**
     * @description 写入直播流地址
     * @param {number} roomid 房间 ID 值
     * @param {string} storage_name 暂存数据标识名
     * @param {object} streamUrl 获取的直播流地址 
     * @returns {object} ok:状态, message:信息, roomData:暂存的房间数据
     */
    #set(roomid, storage_name, streamUrl) {
        let temp = this.#getRoomData(roomid, storage_name);

        if (!temp?.ok) {
            return {
                "ok": temp?.ok,
                "message": temp?.message
            }
        } else {
            temp = temp?.data;
        }

        new Log("info", `[旧直播流地址复用]写入直播流地址，获取到的地址为：[flv: ${streamUrl.flv}, hls_fmp4: ${streamUrl.hls}]/r/n获取到的房间数据为：[${JSON.stringify(temp)}]`)

        const valueRepeatCheck = (oldUrl, url, ...urlSignArr) =>
            urlSignArr.filter(urlSign =>
                oldUrl[urlSign].filter(x => x.url === url[urlSign])[0]
            )

        // 检查是否有重复的直播流地址传入
        if (valueRepeatCheck(temp?.data?.oldUrl, streamUrl, "flv", "hls").length) {
            new Log("warn", `[旧直播流地址复用]当前获取到的地址与已保存的地址重复，不予保存`)
            return {
                "ok": true,
                "message": `[旧直播流地址复用]当前获取到的地址与已保存的地址重复，不予保存`,
                "roomData": null
            }
        }

        // flv
        temp?.data?.oldUrl?.flv.push({
            "expires": Number(new URL(streamUrl?.flv).searchParams.get('expires')),
            "url": streamUrl?.flv,
            "repeatNum": 0
        });

        // hls
        temp?.data?.oldUrl?.hls.push({
            "expires": Number(new URL(streamUrl?.hls).searchParams.get('expires')),
            "url": streamUrl?.hls,
            "repeatNum": 0
        });

        try {
            let storage = this.#storage(storage_name);

            if (!storage?.ok) {
                return {
                    "ok": storage.ok,
                    "message": storage.message
                }
            }

            temp = this.#storage(storage_name).write(roomid, temp);
        } catch (error) {
            return {
                "ok": false,
                "message": `[旧直播流地址复用]在写入暂存的房间数据时出现了错误：${error.toString()}`,
                "roomData": null
            }
        }

        return {
            "ok": true,
            "message": "0",
            "roomData": temp
        }
    }

    /**
     * @description 旧直播流地址选择
     * @param {number} roomid 房间 ID 值
     * @param {string} storage_name 暂存数据标识名
     * @returns {object} 
     */
    #select(roomid, storage_name, streamUrl) {
        let temp = this.#getRoomData(roomid, storage_name);

        if (!temp?.ok) {
            return {
                "ok": temp?.ok,
                "message": temp?.message
            }
        } else {
            temp = temp?.data;
        }

        const maxNum = 5; // test
        const funPack = (oldUrl, url, ...urlSignArr) =>
            urlSignArr.map(urlSign =>
                oldUrl[urlSign].filter(x => url[urlSign] !== x.url && x.repeatNum < maxNum)
                    .sort((a, b) => a?.repeatNum - b?.repeatNum)
                    .map((x, i, arr) => arr[Math.floor(Math.random() * arr.length)])
                    .filter((x, i, arr) => i === 0 ? ++x.repeatNum : false)[0]?.url ?? '');

        const [flv, hls] = funPack({
            "flv": temp?.data?.oldUrl?.flv,
            "hls": temp?.data?.oldUrl?.hls
        }, streamUrl, "flv", "hls");

        try {
            temp = this.#storage(storage_name).write(roomid, temp);
        } catch (error) {
            return {
                "ok": false,
                "message": `[旧直播流地址复用]在写入暂存的房间数据时出现了错误：${error.toString()}`,
            }
        }

        this.oldStream = { flv, hls }

        return {
            "ok": true,
            "message": "0",
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
     * 4. 两流选择的关键在于 HLS 流等待时间，通过
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

    /**
     * @param {boolean} 状态
     */
    ok = true;

    /**
     * @param {object|null} 暂存数据
     */
    storage = null;

    /**
     * @param {string} 信息
     */
    message = "0";

    /**
     * @description 暂存数据 - 默认执行方法
     * @param {string} storageName 暂存数据标识名
     */
    constructor(storageName) {
        if (typeof sharedStorage === "undefined") {
            new Log("err", "[暂存数据]执行脚本内部不存在 sharedStorage 接口，请升级录播姬核心版本到 2.6.0 及以上");
            [this.ok, this.message] = [false, "[暂存数据]执行脚本内部不存在 sharedStorage 接口，请升级录播姬核心版本到 2.6.0 及以上"];
            return;
        }

        // 通过用户设定的标识名读取“sharedStorage”接口中的内容
        try {
            this.storage = JSON.parse(sharedStorage.getItem(`name=${storageName}`));

            if (!this.storage) throw (`没有此标识符（${storageName}）的暂存数据`);

            // 检查所存的暂存数据格式是否合法
            this.#check_storage(storageName, this.storage);

            // 返回内置的对象及执行方法
            this.get_roomData = this.#get_roomData;
            this.set_roomData = this.#set_roomData;
            this.remove_roomData = this.#remove_roomData;
            return;
        } catch (error) { new Log("err", `[暂存数据]读取暂存数据时出现了错误：${error.toString()}`) }

        // 未存储、存储的数据格式不合法或修改了暂存数据的标识名
        try {
            // 先清空暂存在录播姬内部的暂存数据
            sharedStorage.clear();
            new Log("info", "[暂存数据]已执行暂存数据清空操作");

            // 再注入新数据
            const storage_json = JSON.stringify({ storageName, "roomData": [] });
            this.storage = JSON.parse(storage_json);
            sharedStorage.setItem(`name=${storageName}`, storage_json);
            new Log("info", "[暂存数据]注入新数据成功");

            // 返回内置的对象及执行方法
            this.get_roomData = this.#get_roomData;
            this.set_roomData = this.#set_roomData;
            this.remove_roomData = this.#remove_roomData;
        } catch (error) {
            new Log("info", `[暂存数据]操作暂存数据时出现了错误：${error.toString()}`);
            [this.ok, this.message] = [false, `[暂存数据]操作暂存数据时出现了错误：${error.toString()}`];
        }
    }

    /**
     * @description 暂存数据 - 获取房间数据
     * @param {string} sign 房间数据标识符
     * @returns {object} 暂存的房间数据
     */
    #get_roomData(sign) {
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
     * @returns {object} 暂存的房间数据
     */
    #set_roomData(storageName, roomid, setData, callback = null) {
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
     * @returns {object} 暂存的房间数据
     */
    #remove_roomData(sign) {
        if (!sharedStorage.getItem(sign))
            return { "ok": false, "message": `[暂存数据-删除房间数据]没有此标识符（${sign.toString()}）下的房间数据` };
        sharedStorage.removeItem(sign);
        return { "ok": true, "message": "0" }
    }

    /**
     * @description 暂存数据格式检测 - 默认方法
     * @param {string} storageName 暂存数据标识名
     * @param {object} storage_obj 暂存的对象数据
     * @returns {boolean|TypeError} 检测状态
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
     * @returns {boolean|TypeError} 检测状态
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
 * @description 字符串解析(name=name&name=name)
 * @param {string} queryString 字符串标识
 * @returns {object} signData 解析对象
 */
const queryStringToObject = (queryString) => {
    const signData = queryString.split('&').reduce((result, pair) => {
        let value = decodeURIComponent(pair.split('=')[1] || '');
        result[decodeURIComponent(pair.split('=')[0])] = !isNaN(Number(value)) ? parseFloat(value) : value;
        return result
    }, { "name": null, "roomid": null });
    new Log("info", `[字符串解析]queryString:${queryString.toString()},signData:${JSON.stringify(signData)}`);
    return signData
}

/**
 * @description 日志输出
 * @param {string} type 类型(info、warn、err、debug)
 * @param {string} value 需要输出的内容
 * @returns {object} ok:状态, message:信息
 */
const Log = class {

    /**
     * @param {boolean} 执行状态
     */
    ok = true;

    /**
     * @param {string} 执行信息
     */
    message = "0";

    /**
     * @description 日志输出
     * @param {string} type 类型(info、warn、err、debug)
     * @param {string} value 需要输出的内容
     */
    constructor(type, value) {
        // 检测类型是否合法
        if (!/^(info|warn|err|debug)$/.test(type)) {
            [this.ok, this.message] = [false, "[日志]调用方法名不存在，请检查需要调用的方法名是否为“info、warn、err、debug”中的其中之一"];
            this.err("[error][日志]调用方法名不存在，请检查需要调用的方法名是否为“info、warn、err、debug”中的其中之一");
            return;
        }

        // 是否开启了日志输出到录播姬前端日志上
        if (!switch_DEBUG) {
            this.debug(`[${type}]${value}`);
            return;
        }

        this[type](value);
    }

    /**
     * @description 信息
     * @param {string} value 需要输出的内容
     * @returns {void}
     */
    info(value) {
        console.log(value);
    }

    /**
     * @description 警告
     * @param {string} value 需要输出的内容
     * @returns {void}
     */
    warn(value) {
        console.warn(value);
    }

    /**
     * @description 错误
     * @param {string} value 需要输出的内容
     * @returns {void}
     */
    err(value) {
        console.error(value);
    }

    /**
     * @description 调试
     * @param {string} value 需要输出的内容
     * @returns {void}
     */
    debug(value) {
        console.debug(value);
    }
}
// ------ 录播姬脚本正文末尾




// 模拟录播姬运行脚本的部分操作
recorderEvents.onTest(null);
// sharedStorage.clear();
module.exports.recEvents = recorderEvents;
module.exports.Storage = Storage;