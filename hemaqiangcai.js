// 常量定义
const APP_NAME = "盒马";
const PACKAGE_NAME = "com.wudaokou.hippo";
const AUTO_JS_PACKAGE_NAME = "org.autojs.autojs";
// 最大尝试轮数
const MAX_ROUND = 10;
// 每轮最长重试次数 (平均单次5秒,300次约25分钟)
const MAX_TIMES_PER_ROUND = 300;
// 点击按钮之后的通用等待时间
const COMMON_SLEEP_TIME_IN_MILLS = 150;
// 是否先强行停止APP
const ACTIVE_STOP_APP = 1;

// 第几轮
var round = 0;
// 本轮执行第几次
var count = 0;
// 确认已失败
var isFailed = false;
// 确实已成功
var isSuccessed = false;

// 正在支付中 (这种情况下, 尽量保持稳定, 避免回退页面的操作)
// 目前是只要是到了[确认订单]页面, 有门牌号输入框, 就认为是到了支付中的场景, 到商品页就不是支付中了
var isPaying = false;

// 遍历所有商品
var hasFindAllItems = false;

// 遍历所有可售卖商品 (仅在需要人工选择商品的情况下打印)
var hasFindAllActiveItems = false;

// 自动选择商品逻辑 查看 config.js
var buyMode;

// 过滤商品的正则表示式 查看 config.js
var itemFilterStr;
// 任务中断次数
var interruptCount = 0;

// 当前正在下单的商品
var currentItemTxt;

// 黑名单列表 (主要是无货)
var blackItemArr = new Array();

// [立即下单] 和 [提交订单] 的 中心坐标都与对方重叠, 填写 门牌号 的时候, 会获取不到 [提交订单] 对象, 使用[立即下单] 替代
var submitOrderX;
var submitOrderY;

var activeItemsSelected = false;

// 调试期间临时使用, 关闭其他脚本
engines.all().map((ScriptEngine) => {
  log("engines.myEngine().toString():" + engines.myEngine().toString());
  if (engines.myEngine().toString() !== ScriptEngine.toString()) {
    ScriptEngine.forceStop();
  }
});

auto.waitFor();
device.wakeUp();
commonWait();
// 在定时任务执行时间的前一分钟先启动闹钟, 给手机亮屏
closeClock();
// 解锁手机
unlock();

// 覆盖配置项内部, 并设置粘贴板
getConfig();

// 开始循环执行
while (round < MAX_ROUND) {
  round++;
  log("开始第" + round + "轮抢菜");
  try {
    start();
  } catch (e) {
    // 在sleep的过程中, 按 [音量+] 停止脚本, 这里也会报错
    console.error(e);
    console.error("ERROR0: 出现中断性问题", e.stack);
    sleep(3000);
    musicNotify("09.error");
  }
  let randomSleep = random(3, 20);
  let secondPerTime = 3;
  for (let i = 0; i < randomSleep; i++) {
    toastLog(
      "第" +
        round +
        "轮抢菜执行结束, 等待" +
        (randomSleep * secondPerTime - i * secondPerTime) +
        "秒后重试"
    );
    sleep(secondPerTime * 1000);
  }
}
toastLog("程序结束");

function start() {
  count = 0;
  isFailed = false;
  isSuccessed = false;
  if (ACTIVE_STOP_APP == 1) {
    kill_app(APP_NAME);
  }
  launchApp(APP_NAME);
  commonWait();
  while (count < MAX_TIMES_PER_ROUND && !isFailed && !isSuccessed) {
    // 220430 盒区团购 会与 商品选择页冲突
    let page = textMatches(
      /(.*请稍后重试.*|.*滑块完成验证.*|确定|搜索|小区提货点|确认订单|确认付款|订单详情|加载失败|我的订单)/
    ).findOne(4000);
    if (page) {
      log("进入条件1:[" + page.text() + "]");
      if (page.text() == "小区提货点") {
        // 购物车
        doInItemSel();
      } else if (page.text() == "搜索") {
        // 首页
        doInHome();
      } else if (page.text() == "确认订单") {
        // 提交订单|选择时间|确认支付
        doInSubmit();
      } else if (page.text() == "确认付款") {
        payConfirm();
      } else if (page.text() == "确定") {
        // 系统提示, 点掉即可
        click_i_know();
        // 提交订单页面的 确定 提示, 点击以后不会自动返回
        back();
        commonWait();
      } else if (page.text().indexOf("TB1FdH") != -1) {
        // [10:1]id:[standby][desc]content:[O1CN011FpVIT1g4oGMqeVw6_!!6000000004089-2-tps-1125-2700]bounds:[0, 67, 1081, 2210]
        console.log("出现[当前购物高峰期人数较多, 请稍后再试]图片, 返回首页");
        back();
        commonWait();
      } else if (page.text().indexOf("完成验证") != -1) {
        // 当前购物高峰期人数较多, 请稍后重试
        musicNotify("05.need_manual");
        sleep(3000);
      } else if (page.text() == "订单详情") {
        log("等待用户进行操作");
        sleep(5000);
      } else if (page.text() == "加载失败") {
        // 网络不好的情况下, 会 [加载失败]
        back();
        commonWait();
      } else if (page.text() == "我的订单") {
        // 其他页面, 都先跳转到首页
        let homeBtn = text("首页").findOne(100);
        if (homeBtn) {
          clickByCoor(homeBtn);
        } else {
          back();
        }
      } else {
        console.error("ERROR1: 当前在其他页面");
        musicNotify("09.error");
        sleep(1000);
      }
    } else {
      let page2 = descMatches(/(支付成功)/).findOne(1000);
      if (page2) {
        log("进入条件5:[" + page2.desc() + "]");
        if (page2.desc() == "支付成功") {
          paySuccess();
        }
        // 220429 无效判断
        // else if (page2.desc().indexOf("请稍后重试") != -1) {
        //   back();
        //   commonWait();
        // }
      } else {
        console.error("ERROR2: 无法判断当前在哪个页面");
        if (!isPaying) {
          // 非支付中, 才会尝试返回
          printPageUIObject();
          musicNotify("09.error");
          let homeBtn = text("首页").findOne(100);
          if (homeBtn) {
            clickByCoor(homeBtn);
          } else {
            back();
          }
          commonWait();
          sleep(500);
        } else {
          log("当前人工支付中");
          // 支付中, 这个时候需要人工接入, 为了提升体验, 就不再反馈异常了
        }
      }
    }

    // 太容易阻碍操作了
    let packageName = currentPackage();
    if (packageName != PACKAGE_NAME && packageName != AUTO_JS_PACKAGE_NAME) {
      interruptCount++;
      toastLog(
        "WANR: 页面已经被切至:" +
          packageName +
          ",当前第" +
          interruptCount +
          "次"
      );
      if (interruptCount % 20 == 0) {
        toastLog("每1分钟重新激活一次[" + APP_NAME + "]");
        home();
        commonWait();
        commonWait();
        launchApp(APP_NAME);
        commonWait();
        commonWait();
      }
    }
  }
  toastLog(
    "第" +
      round +
      "轮执行结束, 总共执行" +
      count +
      "次, isFailed: " +
      isFailed +
      ", isSuccessed:" +
      isSuccessed
  );
}

function printPageUIObject() {
  // TODO, 识别高峰期页面特征, 下面两个txt都是通用的特征, 看看id是否可以首先
  // TB1FdHOtj39YK4jSZPcXXXrUFXa-48-48
  // O1CN01CYtPWu1MUBqQAUK9D_!!6000000001437-2-tps-2-2
  textMatches(".+")
    .find()
    .forEach((child, idx) => {
      log("第" + (idx + 1) + "项text:" + child.text());
    });
  descMatches(".+")
    .find()
    .forEach((child, idx) => {
      log("第" + (idx + 1) + "项desc:" + child.desc());
    });
  idMatches(".+")
    .find()
    .forEach((child, idx) => {
      log("第" + (idx + 1) + "项id:" + child.id());
    });
}

function getConfig() {
  // 获取配置文件的内容进行覆盖
  if (files.exists("./config.js")) {
    log("存在配置文件:./config.js");
    let config = require("./config.js");
    log("配置项为: ", config);
    itemFilterStr = config.itemFilterStr;
    buyMode = config.buyMode;
    if (config.address) {
      setClip(config.address);
    }
  }
  toastLogClip();
}

// 关闭闹钟提醒
function closeClock() {
  // 三星Note9闹钟关闭按钮
  let closeClockBtn = id(
    "com.sec.android.app.clockpackage:id/tabCircle"
  ).findOne(200);
  if (closeClockBtn) {
    console.info("识别到三星闹钟界面, 执行[返回]关闭闹钟");
    back();
    commonWait();
    sleep(500);
  } else {
    log("没有识别出闹钟按钮");
  }
}

// 解锁屏幕
function unlock() {
  try {
    require("./Unlock.js").exec();
  } catch (e) {
    console.error(e);
  }
}

function toastLogClip() {
  var w = floaty.window(
    <frame gravity="center" bg="#ffffff">
      <text id="text">获取剪贴板</text>
    </frame>
  );
  ui.run(function () {
    w.requestFocus();
    setTimeout(() => {
      toastLog("请确认当前剪贴板内容为门牌号:[" + getClip() + "]");
      w.close();
    }, 500);
  });
}

function paySuccess() {
  // 标记为成功
  isSuccessed = true;
  musicNotify("03.pay_success");
  let returnBtn = desc("完成").findOne(1000);
  if (returnBtn) {
    clickByCoor(returnBtn);
  } else {
    console.error("ERROR3 支付成功 页面找不到[完成]按钮");
    musicNotify("09.error");
    commonWait();
  }
}

function musicNotify(name) {
  if (name == null) {
    name = "success";
  }
  let m = "/storage/emulated/0/Download/" + name + ".mp3";
  console.time("music[" + name + "] 耗时");
  try {
    if (!files.exists(m)) {
      // 如果无法访问, 大概耗时2.5s, 将来准备换成公网地址
      var res = http.get(
        "http://192.168.6.16/apk/autojs/tts/Download/" + name + ".mp3"
      );
      if (res.statusCode == 200) {
        files.writeBytes(m, res.body.bytes());
        log("%s下载完成", m);
      }
    }

    media.playMusic(m);
  } catch (e) {
    console.error("播放文件不存在:" + m, e);
  }
  console.timeEnd("music[" + name + "] 耗时");
}

function printAllItems() {
  if (!hasFindAllItems) {
    let totalItemsStr = "";
    let needItemsStr = "";
    let itemIdx = 0;
    let items = className("android.view.View")
      .depth(18)
      .textMatches(/(.+)/)
      .find();
    console.info("INFO allItems.size():" + items.size());
    for (let v of items) {
      itemIdx++;
      if (itemIdx == 1) {
        log("第一个商品标题坐标: " + v.bounds());
        let item1 = className("android.view.View")
          .depth(16)
          .clickable(true)
          .findOne(10000);
        log("第一个商品选项框坐标: " + item1.bounds());
        hasFindAllItems = true;
      }
      let itemInfo = getItemInfo(v);
      totalItemsStr = totalItemsStr + itemIdx + ":" + itemInfo + "; ";
      if (v.text().match(itemFilterStr)) {
        needItemsStr = needItemsStr + itemIdx + ":" + itemInfo + "; ";
      }
    }
    log("全部商品列表: %s", totalItemsStr);
    log("##########################");
    log("需要的商品列表: %s", needItemsStr);
  }
}

function printAllActiveItems() {
  if (!hasFindAllActiveItems) {
    let totalItemsStr = "";
    let needItemsStr = "";
    let itemIdx = 0;
    let items = className("android.view.View")
      .depth(18)
      .textMatches(/(.+)/)
      .find();
    console.info("INFO allItems.size():" + items.size());
    log("####### 可购买商品如下: #######")
    for (let v of items) {
      if (filterActiveItem(v)) {
        itemIdx++;
        hasFindAllActiveItems = true;
        let itemInfo = getItemInfo(v);
        console.info(itemIdx + ":" + itemInfo);
        totalItemsStr = totalItemsStr + itemIdx + ":" + itemInfo + "; ";
      }
    }
    log("##########################")
    // log("全部可购买商品列表: %s", totalItemsStr);
  }
}

function listAllFilterItems() {
  let items = className("android.view.View")
    .depth(18)
    .textMatches(itemFilterStr)
    .find();
  log("符合条件[" + itemFilterStr + "]的商品数:" + items.size());
  return items;
}

function filterActiveItem(item) {
  let isActive = true;
  let itemDiv = item.parent().parent().parent().parent();
  // idx 1: 图片 className: android.widget.Image;
  let imageDivs = itemDiv.find(className("android.widget.Image"));
  // 22/05/01 正常的商品会包含两个图片, 1:选项框, 2:商品图片
  // 不能购买的商品, 会有3个图片, 3:今日售完/配送已约满
  if (imageDivs.size() == 2) {
    isActive = true;
  } else if (imageDivs.size() == 3) {
    isActive = false;
  } else if (imageDivs.size() == 4) {
    // 认为已经有商品选中了
    activeItemsSelected = true;
    // 有货, 并且被选中, 所以不需要再选择了, 设置为不可选中, 避免再次点击
    isActive = false;
  } else if (imageDivs.size() == 5) {
    // 无货, 并且被选中
    isActive = false;
  } else {
    console.error("商品[%s]包含%s张图片", item.text(), imageDivs.size());
    imageDivs.forEach(function (temp, idx) {
      log("子信息项" + idx + ":" + temp);
    });
    isActive = false;
  }
  return isActive;
}

// function filterActiveItemByRadio(itemRadio) {
//   let isActive = true;
//   let itemDiv = itemRadio.parent().parent().parent().parent();
//   // idx 1: 配送已约满 className: android.widget.Image; text: O1CN01q5RH5b1uzVvCCkGFZ_!!6000000006108-2-tps-192-53.png_220x10000.jpg_
//   // 今日售完 text: O1CN01PVZbL01mz2Vt2gPtR_!!6000000005024-2-tps-192-53.png_220x10000.jpg_
//   itemDiv.find(className("android.widget.Image")).each(function (temp, idx) {
//     // log("子信息项"+idx+":" + temp);
//     if (
//       temp.text() ==
//         "O1CN01q5RH5b1uzVvCCkGFZ_!!6000000006108-2-tps-192-53.png_220x10000.jpg_" ||
//       temp.text() ==
//         "O1CN01PVZbL01mz2Vt2gPtR_!!6000000005024-2-tps-192-53.png_220x10000.jpg_"
//     ) {
//       isActive = false;
//       // log("确认商品[" + item.text() + "]无运力或今日售完");
//     }
//   });

//   // if (isActive) {
//   //   console.info("INFO 确认商品[" + item.text() + "]可购买");
//   // }
//   return isActive;
// }

function clickRadioByItem(item) {
  let itemDiv = item.parent().parent().parent().parent();
  let checkBtns = itemDiv.find(
    className("android.view.View").depth(16).clickable()
  );
  // 220424 测试, 会返回3-4个对象,
  // 其中0,1点了是可以选中的, 根据坐标来看, 可能
  // 0是选项框, (69, 990 - 123, 1044)
  // 1是图片, (153, 903 - 369, 1131)
  checkBtns.forEach(function (temp, idx) {
    // log(item.text() + ",可能的选项框" + idx + ":" + temp);
    // 下面的代码用来验证哪个对象是能点击的 (这些对象因为是不可见的, 所以不能通过坐标点击)
    // log("点击第" + idx + "个选项");
    // temp.click();
    // sleep(10000);
    // log("再次点击第" + idx + "个选项");
    // temp.click();
    // sleep(10000);
  });
  let checkBtn = checkBtns[0];
  log("点击[" + item.text() + "]的选项框");
  checkBtn.click();
  // 因为商品选中这个操作并不会与后台接口交互数据, 所以特别的, 这里并不设置等待
}

/**
 * 拼接返回商品描述
 * @param {商品标题UIObject} v
 * @returns
 */
function getItemInfo(v) {
  let infoDiv = v.parent().parent().parent();
  // className("android.view.View")
  let infoList = infoDiv.find(textMatches(".+")).each(function (temp) {
    // log("子信息项:" + temp);
  });
  // idx 0: 标题
  // idx 1: 描述 (可能没有)
  // idx 2: 货币(￥)
  // idx 3: 整数金额
  // idx 4: 小数金额 (可能没有)
  // idx 5: 单位
  if (infoList.size() == 6) {
    // 价格有小数的情况
    return (
      infoList.get(0).text() +
      "-" +
      infoList.get(3).text() +
      infoList.get(4).text() +
      infoList.get(infoList.size() - 1).text()
    );
  } else if (infoList.size() == 5) {
    // 价格是整数, 有描述的情况
    // 价格是整数+小数, 没有描述的情况
    if (infoList.get(1).text().length > 1) {
      // 有描述, 没有小数
      return (
        infoList.get(0).text() +
        "-" +
        infoList.get(3).text() +
        ".0" +
        infoList.get(infoList.size() - 1).text()
      );
    } else {
      // 没有描述, 有小数
      return (
        infoList.get(0).text() +
        "-" +
        infoList.get(1).text() +
        infoList.get(2).text() +
        infoList.get(infoList.size() - 1).text() +
        "(" +
        infoList.size() +
        ")"
      );
    }
  } else if (infoList.size() == 4) {
    // 价格有小数的情况
    return (
      infoList.get(0).text() +
      "-" +
      infoList.get(2).text() +
      infoList.get(infoList.size() - 1).text()
    );
  } else {
    return infoList.get(0).text() + "(" + infoList.size() + ")";
  }
}

/**
 * 根据商品选项框返回商品信息
 * @param {商品选项框UIObject} v
 * @returns
 */
function getItemInfoByRadio(v) {
  let infoDiv = v.parent().parent();
  let infoList = infoDiv
    .find(textMatches(".+"))
    .find(className("android.view.View"))
    .each(function (temp) {
      //log("子信息项:" + temp);
    });
  // idx 0: 图片
  // idx 1: 图片 className: android.widget.Image;
  // idx 2: 图片
  // idx 3: 标题
  // idx 4: 描述
  // idx 5: 货币(￥)
  // idx 6: 整数金额
  // idx 7: 小数金额 (可能没有)
  // idx 8: 单位 (可能是4)
  return infoList.get(0).text();
}

/**
 * 获取第一个商品的选项框
 * @returns
 */
// function findFirstItemRadio() {
//   let item1 = className("android.view.View")
//     .depth(16)
//     .clickable(true)
//     .findOne(10000);
//   return item1;
// }

/**
 * 获得第一个商品的标题位置UIObject
 */
function findFirstItem() {
  let item1 = className("android.view.View")
    .depth(18)
    .textMatches(/(.+)/)
    .findOne(10000);
  return item1;
}

function clickByCoor(obj) {
  let loc = obj.bounds();
  log(
    "通过坐标点击(" +
      obj.text() +
      "):[" +
      loc.centerX() +
      "," +
      loc.centerY() +
      "]"
  );
  click(loc.centerX(), loc.centerY());
  commonWait();
}

/** 确认订单页面处理逻辑 */
function doInSubmit() {
  log("已进入[确认订单]页面");
  // musicNotify("01.submit");
  // let addressIsError = inputAddress();
  // 注意 [金额]前面的 [合计:] 跟[￥0.00]并不是一个控件
  // 220430 已经不需要选择时间, 所以可以直接下一步
  let selectTimeBtn = textMatches(
    "(￥0.00|￥d+.d{1,2}|.*前送达|.*自动选择可用时间|选择时间|确认付款|.*滑块完成验证.*)"
  ).findOne(2000);
  // 通过选择时间按钮, 判断是否还有货
  if (selectTimeBtn) {
    log("进入条件4: [%s]", selectTimeBtn.text());
    if (selectTimeBtn.text() == "选择时间") {
      // 220430 更新, 已经不需要这一步操作, 替换为[系统已为您自动选择可用时间], 暂时保留
      log("点击->[" + selectTimeBtn.text() + "]");
      clickByCoor(selectTimeBtn);
      // textStartsWith("18:00").findOne(5000);
      let timeCheckBtn = id("com.wudaokou.hippo:id/period_title").findOne(1000);
      // log(timeCheckBtn);
      if (timeCheckBtn) {
        log("点击->[" + timeCheckBtn.text() + "]");
        clickByCoor(timeCheckBtn);
        let confirmTimeBtn = text("确认").findOne(300);
        if (confirmTimeBtn) {
          confirmTimeBtn.click();
          console.time("等待输入框出现耗时");
          className("android.widget.EditText").findOne(1000);
          console.timeEnd("等待输入框出现耗时");
        }
      }
      orderConfirm();
    } else if (selectTimeBtn.text() == "确认付款") {
      payConfirm();
    } else if (selectTimeBtn.text() == "￥0.00") {
      orderConfirm();
    } else if (selectTimeBtn.text().indexOf("完成验证") != -1) {
      // 当前购物高峰期人数较多, 请稍后重试
      log("通过text查找到[%s]", page.text());
      musicNotify("05.need_manual");
      sleep(3000);
    } else {
      // 系统已为您自动选择可用时间
      // ￥
      log("符合点击[提交订单]的条件,往下流转");
      orderConfirm();
    }
  } else {
    console.error("ERROR4 在[确认订单]找不到任何内容, 继续");
    // musicNotify("09.error");
    // 有时候在点了[确定]按钮之后, 在[确认订单]页面会卡住, 白屏
    // 返回购物车处理
    back();
    commonWait();
  }
}

/**
 * 自动输入地址
 * 返回是否有错误
 * 1. 没有地址输入框 return false -> 往下走, 判断金额
 * 2. 有地址输入框, 但是设置成功了 return false; -> 往下走, 提交订单
 * 3. 有地址输入框, 但是设置失败了 return true; -> 不往下走, 需要等待人工输入地址
 * @returns
 */
function inputAddress() {
  // 有地址输入框, 但是为空, 或者默认值 true
  //
  let addressIsError = true;
  let isSetVal = false;
  // 220427 [门牌号] 会为空, 前面两项会自动根据淘宝账号带出
  className("android.widget.EditText")
    .find()
    .forEach((child, idx) => {
      log("第" + (idx + 1) + "项当前值:" + child.text());
      if (idx == 2) {
        isPaying = true;
        if (
          child.text() == null ||
          child.text() == "" ||
          child.text() == "例：8号楼808室"
        ) {
          //toastLog("请手工输入第" + (idx + 1) + "项内容");
          //sleep(3000);
          log("选中地址输入框");
          clickByCoor(child);
          log("粘贴剪贴板内容");
          child.paste();
          sleep(50);
          log("触发[返回], 关闭输入框");
          back();
          commonWait();
          // 220428, 测试粘贴剪贴板可以成功
          isSetVal = true;
        } else {
          log("当前地址为:[%s]", child.text());
          addressIsError = false;
        }
      }
    });

  if (isSetVal) {
    let inputs = className("android.widget.EditText").find();
    if (inputs) {
      let child = inputs.get(2);
      if (
        child.text() == null ||
        child.text() == "" ||
        child.text() == "例：8号楼808室"
      ) {
        console.error(
          "地址设置失败, 当前值为:[%s], 重新设置剪贴板",
          child.text()
        );
        getConfig();
        musicNotify("05.need_manual");
        sleep(1000);
      } else {
        console.info("确认当前地址为:[%s]", child.text());
        addressIsError = false;
      }
    } else {
      console.error("ERROR 没有找到输入框");
    }
  } else {
    // 没有地址输入框的情况下, 设置为无错误
    addressIsError = false;
  }

  return addressIsError;
}

function orderConfirm() {
  log("进入[确认订单]第二部分");
  let addressIsError = inputAddress();
  if (!addressIsError) {
    let totalAmount = textMatches(/(￥\d+\.\d{1,2})/).findOne(1000);
    if (totalAmount) {
      log("金额:" + totalAmount.text());
      if (totalAmount.text() == "￥0.00") {
        // 这种情况一般就是有缓存了, 光退回团购页面还不行, 需要返回首页
        log("当前订单总金额:" + totalAmount.text());
        // 库存不足 -> [失效原因:] 抱歉, 您选的商品太火爆了, 一会儿功夫库存不足了(008)
        // 运力不足 -> [失效原因:] 非常抱歉, 当前商品运力不足(063)
        let failReason =
          textMatches(/(.*运力不足.*|.*库存不足.*)/).findOne(200);
        if (failReason) {
          if (failReason.text().indexOf("运力不足") != -1) {
            for (let i = 0; i < 20; i++) {
              if (i % 20 == 1) {
                musicNotify("04.no_express");
              }
              toastLog("运力不足,等待" + (20 * 3 - i * 3) + "秒后重试");
              sleep(3 * 1000);
            }
          } else {
            console.log("商品[%s]因为库存不足失败, 加入黑名单", currentItemTxt);
            if (blackItemArr.indexOf(currentItemTxt) == -1) {
              blackItemArr.push(currentItemTxt);
            }
          }
        }
        back();
        commonWait();
        commonWait();
        back();
        commonWait();
      } else {
        // 有金额了就认为是支付中, 如果失败返回了首页, 再重置为false
        let confirmBtn = text("提交订单|确认付款").findOne(1000);
        if (confirmBtn) {
          musicNotify("02.pay");
          if (confirmBtn.text() == "提交订单") {
            console.info("INFO: 点击[" + confirmBtn.text() + "]");
            confirmBtn.click();
            commonWait();
            click_i_know();
            // 提交订单页面的 确定 提示, 点击以后不会自动返回
            back();
            commonWait();
          } else {
            // 确认付款
            payConfirm();
          }
        } else {
          printPageUIObject();
          musicNotify("02.pay");
          // 在输入信息的时候会挡住按钮
          if (submitOrderX && submitOrderY) {
            log(
              "直接点击[提交订单]对应的坐标[%s,%s]",
              submitOrderX,
              submitOrderY
            );
            click(submitOrderX, submitOrderY);
          } else {
            console.error("没有缓存到[提交订单]的坐标");
            console.error("ERROR5 未知情况");
            musicNotify("09.error");
          }
          commonWait();
        }
      }
    } else {
      console.error("ERROR6 没有找到金额");
      musicNotify("09.error");
    }
  } else {
    log("收货地址未输入, 稍后重试");
  }
}

/**
 * 确认付款这个页面因为还需要输入密码/指纹, 所以只能人工操作
 */
function payConfirm() {
  let payBtn = textMatches(".*确认付款.*").findOne(1000);
  if (payBtn) {
    log("已弹出确认付款页面, 按钮[" + payBtn.text() + "]");
    // 等待用户付款
    toastLog("等待用户[确认付款]中");
    musicNotify("06.need_pay");
    sleep(5000);
  }
  blackItemArr;
}

function findActiveFilterItems() {
  var activeItems = new Array();
  // 打印所有可买商品
  let allItems = listAllFilterItems();

  for (var i = 0; i < allItems.length; i++) {
    var tempItem = allItems[i];
    if (filterActiveItem(tempItem)) {
      // 过滤黑名单里面的商品
      if (blackItemArr.indexOf(tempItem.text()) == -1) {
        activeItems.push(tempItem);
        try {
          console.info("INFO: 可购买商品信息: " + tempItem.text());
        } catch (e) {
          console.error(e.stack);
        }
      } else {
        log("商品[%s]存在黑名单中, 跳过加入可购买名单", tempItem.text());
      }
    }
  }
  return activeItems;
}

function itemSel() {
  // 商品已选中
  let isItemSelectd = false;
  let first = findFirstItem();
  // log("first: ", first);
  let canBuy = false;
  // 如果有运力的情况下, 第一个商品肯定可购买的, 今日售完的商品会排在后面
  if (filterActiveItem(first)) {
    canBuy = true;
    toastLog("[商品已上架]");
    console.info("黑名单商品名单: ", blackItemArr);
    // 1, 首先获取所有符合条件的商品
    let activeItems = findActiveFilterItems();
    if (activeItems.length == 0) {
      try {
        console.info("INFO: 没有可购买的符合条件的商品");
        // 0 自动选择第一件
        if (buyMode == 0) {
          toastLog("INFO 没有符合条件的可选商品, 下单第一件" + first.text());
          clickRadioByItem(first);
          currentItemTxt = first.text();
          isItemSelectd = true;
          // } else if (buyMode == 1) {
          //   toastLog("INFO 没有符合条件的可选商品, 下单第一件");
          //   clickRadioByItem(first);
          //   isItemSelectd = true;
        } else {
          printAllActiveItems();
          // 0 等待人工选择
          // let checkedTxt = textStartsWith("已选").findOne(100);
          // if (checkedTxt) {
          //   if (checkedTxt.text() == "已选0件") {
          //     musicNotify("05.need_manual");
          //     toastLog("请手工选择商品");
          //     sleep(2000);
          //   } else {
          //     console.info("[%s], 尝试提交", checkedTxt.text());
          //   }
          // }
        }
        // } else {
        //   // 不可购买的话, 返回首页, 重试
        //   console.warn("WARN: 商品[" + first.text() + "]当前不可购买");
        //   back();
        //   commonWait();
        // }
      } catch (e) {
        console.error(e.stack);
      }
    } else {
      // 220428 随机选中某件可选商品
      let randomIdx = random(0, activeItems.length - 1);
      for (let i = 0; i < activeItems.length; i++) {
        // 0, 全选所有商品
        // 1, 仅选择第一件商品
        // 其他 不选择
        item = activeItems[i];
        if (buyMode != 0 && buyMode != 1) {
          // 播放需要手工操作的提示
          musicNotify("05.need_manual");
          toastLog("请选择商品1");
          sleep(2000);
        } else if (buyMode == 0 || (buyMode == 1 && i == randomIdx)) {
          toastLog("INFO 选中第[" + (i + 1) + "]件商品: [" + item.text() + "]");
          clickRadioByItem(item);
          currentItemTxt = item.text();
          activeItemsSelected = true;
          isItemSelectd = true;
        } else {
          console.info(
            "INFO 跳过第[" + (i + 1) + "]件商品: [" + item.text() + "]"
          );
        }
      }
      commonWait();
    }
  } else {
    log("[商品未上架]");
  }
  return canBuy;
}

/** 商品选择页处理逻辑 */
function doInItemSel() {
  // text("小区提货点").exists()
  log("当前在商品选择页面");
  isPaying = false;
  activeItemsSelected = false;
  // let notServicePage = id("hema-floor-title-4732230300").findOne(1000).parent();
  //console.time('商品列表页,确认状态耗时')
  let specialPackageTxt = textMatches(
    /立即下单|配送已约满|抢购结束|即将开售|已选.*/
  ).findOne(4000);
  //console.timeEnd('商品列表页,确认状态耗时')
  if (specialPackageTxt) {
    log("进入条件2:" + specialPackageTxt.text());
    // 遍历所有的商品

    printAllItems();
    //log("当前在营业时间");
    // 220428 因为其实 [商品列表] 比 [立即下单] 按钮加载的更快, 考虑用第一个商品是否可购买来判断能否下单
    console.time("判断是否可买并选中耗时");
    let canBuy = true;
    // if (
    //   !specialPackageTxt.text().match("已选.*") ||
    //   specialPackageTxt.text() == "已选0件"
    // ) {
    canBuy = itemSel(); // 由于已售完的物品也会在购物车里面, 但是又不可购买, 所以不能再通过这个条件进行判断
    // }

    console.timeEnd("判断是否可买并选中耗时");
    if (canBuy && activeItemsSelected) {
      console.time("确认是否可下单 耗时");
      let btn = textMatches(/(立即下单|配送已约满|抢购结束|即将开售)/).findOne(
        4000
      ); // S8大概 3500ms
      console.timeEnd("确认是否可下单 耗时");
      // musicNotify
      if (btn != null && btn.text() == "立即下单") {
        // 记录 [立即下单]的坐标
        submitOrderX = btn.bounds().centerX();
        submitOrderY = btn.bounds().centerY();
        // 默认是 [已选0件]
        let checkedTxt = textStartsWith("已选").findOne(1000);
        // log(checkedTxt);
        if (checkedTxt) {
          if (checkedTxt.text() != "已选0件" && activeItemsSelected) {
            log("当前商品情况:" + checkedTxt.text());
            let submitBtn = textMatches(
              "立即下单|即将开售|配送已约满|抢购结束"
            ).findOne(1000);
            if (submitBtn && submitBtn.text() == "立即下单") {
              // 这里是高峰期的核心操作
              // 点击  [立即下单] 之后, 高峰期会出现 [当前购物高峰期人数较多, 请您稍后再试] 的toast,
              // 运气好的话, 进入过渡页面, [确认订单] 的 [载入中], 所以通过确认订单判断也应该可以
              try {
                while (submitBtn) {
                  submitBtn.click();
                  console.time("into_confirm_order 耗时");
                  // 高峰期会出现 [确定] 按钮
                  let confirmTxt = textMatches(
                    /(当前购物高峰期.*|.*滑块完成验证.*|确认订单|确定)/
                  ).findOne(5000);
                  console.timeEnd("into_confirm_order 耗时");
                  if (confirmTxt) {
                    console.log(
                      "点击[立即下单]后,进入条件3:" + confirmTxt.text()
                    );
                    if (confirmTxt.text() == "确定") {
                      // [确认订单] - 温馨提示 - 前方拥挤, 亲稍等再试试 - [确定]
                      console.log("发现[确定]按钮, 立即点击");
                      clickByCoor(confirmTxt);
                      back();
                      commonWait();
                    } else if (confirmTxt.text().indexOf("完成验证") != -1) {
                      // 当前购物高峰期人数较多, 请稍后重试
                      log("通过text查找到[%s]", page.text());
                      musicNotify("05.need_manual");
                      sleep(3000);
                    } else {
                      // 当前购物高峰期 , 确认订单 这两个页面,都无需处理, 也无需等待
                    }
                  } else {
                    console.error("ERROR7: 既没有[确认订单], 也没有[确定]按钮");
                    musicNotify("09.error");
                    back();
                    commonWait();
                  }
                  submitBtn = text("立即下单").findOne(100);
                }
                log("[立即下单]已经往下流转");
              } catch (e) {
                console.error(e.stack);
              }
            } else {
              // 可能是 即将开售|配送已约满|抢购结束
              console.error("ERROR8: 没有找到[立即下单]按钮");
              musicNotify("09.error");
            }
          } else {
            console.log("没有符合要求的商品, 即将返回首页");
            back();
            commonWait();
          }
        } else {
          console.error("异常情况6, 没有找到[已选*件]文本");
          musicNotify("09.error");
        }
      } else {
        log("没有找到[立即下单], 即将返回首页");
        back();
        commonWait();
      }
    } else {
      log("无商品可购买, 即将返回首页");
      back();
      commonWait();
    }
  } else {
    // 08:00 - 18:00
    log("WARN: 当前无商品可购买");
    isFailed = true;
    back();
    commonWait();
  }
}

/** 首页处理逻辑 */
function doInHome() {
  count++;
  hasFindAllActiveItems = false;
  log("抢菜第" + round + "-" + count + "次");
  if (count == 1 || count % 5 == 0) {
    toast("抢菜第" + round + "轮第" + count + "次");
  }
  // log("当前在首页");
  // 在首页
  let toListBtn = id("home_page_other_layout").findOne(1000); // 20ms
  if (toListBtn) {
    let loc = toListBtn.bounds();
    // log(
    //   "通过坐标点击进入团购的按钮:[" +
    //     loc.centerX() +
    //     ", " +
    //     loc.centerY() +
    //     "]"
    // );
    // 必须要等待超过300ms, 否则点击会无效, 无法进入[商品选择]页面
    commonWait();
    sleep(200);
    click(loc.centerX(), loc.centerY()); // 执行一次点击大约耗时160ms
    console.time("into_mall 耗时");
    let mall = textMatches(
      /(抢购结束|小区提货点|立即下单|配送已约满|O1CN011FpVIT1g4oGMqe.*)/
    ).findOne(4000); // S8 加载耗时3.3s, 高峰期也不会超过4秒
    console.timeEnd("into_mall 耗时");
    log("成功进入[商品列表]页面:" + (mall != null));
  } else {
    log("没有找到进入团购的按钮");
    back();
    commonWait();
  }
}

// ###############################################################

function commonWait() {
  sleep(COMMON_SLEEP_TIME_IN_MILLS + random(0, 50));
}

function click_i_know() {
  // 只要页面有 我知道了等按钮, 都盲点
  let retry_button = textMatches(/(我知道了|返回购物车|确定)/).findOne(100);
  if (retry_button) {
    log("通用方法:找到[" + retry_button.text() + "]按钮,直接点击");
    clickByCoor(retry_button);
  }
}

function kill_app(packageName) {
  var name = getPackageName(packageName);
  if (!name) {
    if (getAppName(packageName)) {
      name = packageName;
    } else {
      return false;
    }
  }
  app.openAppSetting(name);
  text(app.getAppName(name)).waitFor();
  let is_sure = textMatches(/(.*强.*|.*停.*|.*结.*|.*行.*|.*FORCE.*)/).findOne(
    3000
  );
  // log(is_sure);
  if (is_sure.enabled()) {
    is_sure.click();
    commonWait();
    buttons = textMatches(
      /(.*强.*|.*停.*|.*结.*|.*行.*|确定|是|.*FORCE.*)/
    ).find();
    if (buttons.length > 0) {
      buttons[buttons.length - 1].click();
      commonWait();
    } else {
      // 异常情况
      toast(app.getAppName(name) + "应用没有找到确认按钮");
      sleep(50000);
    }

    log(app.getAppName(name) + "应用已被关闭");
    sleep(1000);
    back();
  } else {
    log(app.getAppName(name) + "应用不能被正常关闭或不在后台运行");
    sleep(3000);
    // back();
  }
}
