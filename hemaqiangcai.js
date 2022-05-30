// 05/27 Note20u Android 12, 界面布局层次, id,depth等都不一样, 已经额外进行适配
// 三星 S8(1080, 2220) Android 9, Note9(1080, 2220) Android 10, Note20u(1080,2316) Android 12
// 盒马的放货时间并不固定为08:00整, 会提前个1-2分钟
// 常量定义
const APP_NAME = "盒马";
const PACKAGE_NAME = "com.wudaokou.hippo";
const AUTO_JS_PACKAGE_NAMES = [
  "com.taobao.idlefish.x", // 困鱼
  "org.autojs.autoxjs", // Autoxjs
];
const OTHER_ALLOW_PACKAGE_NAMES = [
  "com.samsung.android.app.smartcapture", //录屏程序(Note9)
  "com.samsung.android.app.cocktailbarservice", // 新消息顶部浮框
  "com.sec.android.app.launcher", //可能是桌面
  "com.android.systemui", // 通知栏
];

const VERSION = "v220530";

// 配置文件的相对路径
const CONFIG_PATH = "./config.js";
// 最大尝试轮数
const MAX_ROUND = 6;
// 每轮最长重试次数 (300次约8分钟)
const MAX_TIMES_PER_ROUND = 500;
// 点击按钮之后的通用等待时间
const COMMON_SLEEP_TIME_IN_MILLS = 150;
// 是否先强行停止APP
const ACTIVE_STOP_APP = 1;
// 几秒提醒一次
const SECOND_PER_TIME = 5;
// 开卖时间
const SALE_BEGIN_TIME_ARR = ["08:00", "12:00"];
// 对于部分只能通过坐标点击的对象, 按照(1080, 2220)进行适配
const DEFAULT_DEVICE_WIDTH = 1080;
const DEFAULT_DEVICE_HEIGHT = 2220;

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

// 过滤商品的正则表示式 查看 config.js
var itemFilterStr = ".*(测试商品1|测试商品2).*";

// 主程序切换到别的APP的次数
var interruptCount = 0;

// 是否启动录屏
var activeRecord = 0;

// 是否启动高峰期录屏(准点开售)
var activePeakRecord = 1;

// 是否在录屏中
var isRecording = false;

// 购物车内商品列表
var cartItems;

// 配置对象, json格式
var config;

// 连续刷新次数
var continueRefreshCount = 0;

// 是否需要刷新购物车 (推荐列表内的商品添加后, 需要手工刷新购物车)
let needReloadCart = true;

// 购物车商品数量
let itemIdx = 0;

// 调试期间临时使用, 关闭其他脚本
engines.all().map((ScriptEngine) => {
  log("engines.myEngine().toString():" + engines.myEngine().toString());
  if (engines.myEngine().toString() !== ScriptEngine.toString()) {
    ScriptEngine.forceStop();
  }
});

log("version:", VERSION);
auto.waitFor();
sleep(1000);
// setScreenMetrics(1080, 2220);
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
  if (round < MAX_ROUND) {
    let randomSleep = random(2, 8);
    for (let i = 0; i < randomSleep; i++) {
      toastLog(
        "第" +
          round +
          "轮抢菜执行结束, 等待" +
          (randomSleep * SECOND_PER_TIME - i * SECOND_PER_TIME) +
          "秒后继续"
      );
      sleep(SECOND_PER_TIME * 1000);
    }
  }
}
home();
toastLog("程序已结束");

function start() {
  startRecord();
  count = 0;
  isFailed = false;
  isSuccessed = false;
  if (ACTIVE_STOP_APP == 1) {
    kill_app(APP_NAME);
  }
  launchApp(APP_NAME);
  commonWait();
  if (ACTIVE_STOP_APP == 1) {
    // 220526 这里等待较长时间, 否则可能会未定位成功
    sleep(5000);
  }

  while (count < MAX_TIMES_PER_ROUND && !isFailed && !isSuccessed) {
    if (activePeakRecord == 1) {
      checkSaleTime();
    }
    click_i_know();
    // 返回按钮图标 TB1FdHOtj39YK4jSZPcXXXrUFXa-48-48
    // 第2项(10)text:O1CN011FpVIT1g4oGMqeVw6_!!6000000004089-2-tps-1125-2700
    let page = textMatches(
      /(.*请稍后重试.*|验证码拦截|立即下载|确定|搜索|我常买|加入购物车|到货提醒|粽香飘飘|确认订单|确认付款|继续付款|支付宝支付|确认交易|正在付款.*|使用密码|订单详情|加载失败|我的订单|困鱼|日志|O1CN011FpVIT1g4o.*)/
    ).findOne(4000);
    if (page) {
      if (page.text() != "日志" && page.text() != "困鱼") {
        // 不能打印, 否则日志会刷屏
        log("进入条件1:[" + page.text() + "]");
      }
      if (page.text() == "粽香飘飘") {
        // 商品选择页
        doInItemSel2();
      } else if (page.text() == "我常买") {
        // 购物车
        doInCart();
      } else if (page.text() == "搜索") {
        // 首页
        doInHome();
      } else if (page.text() == "确认订单") {
        // 提交订单|选择时间|确认支付
        doInSubmit();
      } else if (page.text() == "确认付款") {
        payConfirm();
      } else if (
        page.text().indexOf("正在付款") != -1 ||
        page.text().indexOf("使用密码") != -1
      ) {
        toastLog("付款的中间状态, 等待5000ms");
        sleep(5000);
      } else if (
        page.text().indexOf("确认交易") != -1 ||
        page.text().indexOf("继续付款") != -1 ||
        page.text().indexOf("支付宝支付") != -1
      ) {
        musicNotify("05.need_manual");
        sleep(5000);
      } else if (page.text() == "确定") {
        // 系统提示, 点掉即可
        while (page) {
          click_i_know(page);
          page = text("确定").findOnce();
        }
      } else if (
        page.text() == "立即下载" ||
        page.text() == "加入购物车" ||
        page.text() == "到货提醒"
      ) {
        // 程序升级提醒
        log("执行返回19");
        back();
        commonWait();
      } else if (page.text() == "困鱼" || page.text() == "日志") {
        waitCheckLog();
      } else if (page.text().indexOf("O1CN011FpVIT1g") != -1) {
        // 05/03 识别高峰期页面特征, 下面两个txt都是通用的特征
        // depth == 14 都是
        // TB1FdHOtj39YK4jSZPcXXXrUFXa-48-48 (05/03 确认是返回按钮, depth 14, 除了大小略有差异外, 与商品页面的[<]完全一致)
        //log("[返回]图标depth:%s", page.depth());
        if (page.depth() == 10) {
          console.log("出现[当前购物高峰期人数较多, 请稍后再试]图片, 返回首页");
          log("执行返回10");
          back();
          //commonWait();
        } else {
          console.error("ERROR-04: 无法判断在哪个页面");
          printPageUIObject();
          sleep(2000);
          log("执行返回11");
          back();
          commonWait();
        }
      } else if (page.text().indexOf("验证码拦截") != -1) {
        musicNotify("05.need_manual");
        sleep(3000);
      } else if (page.text() == "订单详情") {
        log("等待用户进行操作");
        sleep(5000);
      } else if (page.text() == "加载失败") {
        // 网络不好的情况下, 会 [加载失败]
        log("执行返回12");
        back();
        commonWait();
      } else if (page.text() == "我的订单") {
        // 其他页面, 都先跳转到首页
        let homeBtn = text("首页").findOne(100);
        if (homeBtn) {
          clickByCoor(homeBtn);
        } else {
          log("执行返回13");
          back();
        }
      } else {
        console.error("ERROR-02: 当前在其他页面");
        musicNotify("09.error");
        sleep(1000);
      }
    } else {
      let page2 = descMatches(/(支付成功)/).findOne(500);
      if (page2) {
        log("进入条件5:[" + page2.desc() + "]");
        if (page2.desc() == "支付成功") {
          paySuccess();
        }
      } else {
        let checkDepth = depth(12).findOnce();
        if (checkDepth) {
          console.error("ERROR03: 无法判断当前在哪个页面");
          if (!isPaying) {
            // 非支付中, 才会尝试返回
            printPageUIObject();
            musicNotify("09.error");
            let homeBtn = text("首页").findOne(100);
            if (homeBtn) {
              clickByCoor(homeBtn);
            } else {
              log("执行返回14");
              back();
            }
            commonWait();
            sleep(500);
          } else {
            log("当前人工支付中");
            // 支付中, 这个时候需要人工接入, 为了提升体验, 就不再反馈异常了
            sleep(2000);
          }
        } else {
          log("可能页面加载失败");
          log("执行返回20");
          back();
          commonWait();
        }
      }
    }

    // 太容易阻碍操作了
    let packageName = currentPackage();
    if (
      packageName != PACKAGE_NAME &&
      AUTO_JS_PACKAGE_NAMES.indexOf(packageName) == -1 &&
      OTHER_ALLOW_PACKAGE_NAMES.indexOf(packageName) == -1
    ) {
      interruptCount++;
      log(
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
    } else {
      interruptCount = 0;
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
  if (isSuccessed && isPeakTime()) {
    // 22/05/28 高峰期抢到商品以后, 购物车一直不会移除, 所以就不执行下一轮了
    round = 999;
  }
  stopRecord();
}

function isPeakTime() {
  let result = false;
  SALE_BEGIN_TIME_ARR.forEach((o, i) => {
    if (isPeakTimeStr(o, 1 * 60 * 1000, 5 * 60 * 1000)) {
      result = true;
      return;
    }
  });
  // if (result) {
  //   log("当前时间为高峰期, 跳过部分操作");
  // }
  return result;
}

function checkSaleTime() {
  let nextTime = new Date(new Date().getTime() + 60 * 1000);
  let hour = nextTime.getHours();
  if (hour < 10) {
    hour = "0" + hour;
  }
  let minute = nextTime.getMinutes();
  if (minute < 10) {
    minute = "0" + minute;
  }
  var second = nextTime.getSeconds();
  let nextTimeStr = hour + ":" + minute;
  if (SALE_BEGIN_TIME_ARR.indexOf(nextTimeStr) != -1) {
    // 1分钟 之后开始销售
    if ((60 - second) % SECOND_PER_TIME == 0) {
      toastLog("还有[" + (60 - second) + "]秒开放下单");
    }
    if (second < 20) {
      // 避免不适配的手机一直重试
      activeRecord = 1;
      startRecord();
      activeRecord = 0;
    }
  }
}

function getConfig() {
  // 获取配置文件的内容进行覆盖
  if (files.exists(CONFIG_PATH)) {
    log("存在配置文件: ", CONFIG_PATH);
    config = require(CONFIG_PATH);
    log("配置项为: ", config);
    itemFilterStr = config.itemFilterStr;
    sleep(2000);
  } else {
    log("没有找到配置文件: ", CONFIG_PATH);
  }
  // toastLogClip();
}

// function toastLogClip() {
//   var w = floaty.window(
//     <frame gravity="center" bg="#ffffff">
//       <text id="text">获取剪贴板</text>
//     </frame>
//   );
//   ui.run(function () {
//     w.requestFocus();
//     setTimeout(() => {
//       toastLog("请确认当前门牌号为:[" + getClip() + "]");
//       w.close();
//     }, 500);
//   });
// }

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

// 打印所有的商品列表
function printAllItems() {
  console.time("打印活动页商品耗时");
  if (!hasFindAllItems && cartItems != null) {
    // 全部商品列表
    let totalItemsStr = "";
    // [需要]列表
    let needItemsStr = "";
    // [可买]商品列表
    let activeItemsStr = "";
    // [需要]且[可买]商品列表
    let activeNeedItemsStr = "";
    let allItemIdx = 0;
    // 精选好货, 格式与下面的不太一样, 而且肯定是有货的
    let items1 = className("android.view.View")
      .depth(19)
      .textMatches(/(.+)/)
      .indexInParent(0)
      .drawingOrder(0)
      .find();
    console.info("INFO allItems1.size():" + items1.size());
    for (let v of items1) {
      allItemIdx++;
      let itemInfo = v.text();
      let isNeed = v.text().match(itemFilterStr);
      // console.info(itemIdx + ":" + itemInfo+",isActive:");
      totalItemsStr = totalItemsStr + allItemIdx + ":" + itemInfo + "; ";
      if (isNeed) {
        needItemsStr = needItemsStr + allItemIdx + ":" + itemInfo + "; ";
      }

      // 默认认为是有效的
      activeItemsStr = activeItemsStr + allItemIdx + ":" + itemInfo + "; ";
      if (isNeed) {
        activeNeedItemsStr =
          activeNeedItemsStr + allItemIdx + ":" + itemInfo + "; ";
      }
    }
    let items2 = className("android.view.View")
      .depth(18)
      .textMatches(/(.+)/)
      .find();
    console.info("INFO allItems2.size():" + items2.size());
    let items3 = className("android.view.View")
      .depth(21)
      .textMatches(/(.+)/)
      .find();
    console.info("INFO allItems3.size():" + items3.size());
    let items4 = className("android.view.View")
      .depth(19)
      .textMatches(/(.+)/)
      .find();
    console.info("INFO allItems4.size():" + items4.size());

    let items = new Array();
    // items.push.apply(items, items1);
    items.push.apply(items, items2);
    items.push.apply(items, items4);
    items.push.apply(items, items3);
    for (let v of items) {
      allItemIdx++;
      if (allItemIdx < 1200 && allItemIdx > 0) {
        hasFindAllItems = true;
        let itemInfo = getItemInfo(v);
        let isActive = filterActiveItem(v);
        let isNeed = v.text().match(itemFilterStr);
        // console.info(itemIdx + ":" + itemInfo+",isActive:");

        totalItemsStr = totalItemsStr + allItemIdx + ":" + itemInfo + "; ";
        if (isNeed) {
          needItemsStr = needItemsStr + allItemIdx + ":" + itemInfo + "; ";
        }

        if (isActive) {
          activeItemsStr = activeItemsStr + allItemIdx + ":" + itemInfo + "; ";
        }

        if (isNeed && isActive) {
          if (cartItems != null && cartItems.indexOf(v.text()) == -1) {
            clickRadioByItem(v);
            sleep(1000);
          }
          activeNeedItemsStr =
            activeNeedItemsStr + allItemIdx + ":" + itemInfo + "; ";
        }
      }
    }
    log("##########################");
    log("[全部]商品列表: %s", totalItemsStr);
    log("##########################");
    log("[需要]商品列表: %s", needItemsStr);
    log("##########################");
    log("[可买]商品列表: %s", activeItemsStr);
    log("##########################");
    log("[需要]且[可买]商品列表: %s", activeNeedItemsStr);
    log("##########################");
  }
  console.timeEnd("打印活动页商品耗时");
}

function printCartItems() {
  // desc("展开, 按钮") desc("收起, 按钮")
  if (cartItems == null) {
    console.time("获取购物车商品列表耗时");
    let tempJ = 0;
    while (!text("盒马鲜生").findOnce() && tempJ < 20) {
      log("[盒马鲜生]不存在, 往上翻页第%s次", tempJ);
      scrollUpInCart();
      tempJ++;
    }

    cartItems = new Array();

    let tempI = 0;
    log("####### 购物车内商品如下: #######");
    // 22/05/25 高峰期内 RECOMMEND 大概率会不存在, 所以不能使用 [RECOMMEND] 进行判断
    // 商品数较少的情况下, 也不会出现 [收起] 按钮
    do {
      tempI++;
      let openBtn = desc("展开, 按钮").findOnce();
      if (openBtn) {
        // console.time("展开购物车耗时");
        openBtn.click();
        // console.timeEnd("展开购物车耗时");
        commonWait();
      }
      printCurrentCartItems();
      if (tempI > 1) scrollDownInCart();
    } while (
      !text("收起").exists() &&
      !text("RECOMMEND").exists() &&
      tempI < 10
    );
    printCurrentCartItems();
    let closeBtn = text("收起").findOnce();
    if (closeBtn) {
      sleep(1000);
      closeBtn.click();
      commonWait();
      sleep(1000);
    } else {
      log("找不到[收起]按钮");
    }
    scrollUpInCart();
    console.timeEnd("获取购物车商品列表耗时");
  }
}

function closeSimilarRecom() {
  // 关闭相似推荐
  desc("相似推荐")
    .find()
    .forEach((o, i) => {
      o.parent().child(1).click();
      commonWait();
    });
}

function printCurrentCartItems() {
  closeSimilarRecom();
  let items = className("android.widget.TextView")
    .depth(20)
    .textMatches(/(.{8,})/)
    .find();
  //console.info("INFO cartItems.size():" + items.size());

  for (let v of items) {
    hasFindAllActiveItems = true;
    let itemInfo = v.getText() + "";
    if (
      cartItems.indexOf(itemInfo) == -1 &&
      itemInfo != "商品库存不足" &&
      itemInfo != "商品已不可售" &&
      itemInfo != "商品购买数量不对" &&
      itemInfo != "宝贝已不能购买，请联系卖家" &&
      itemInfo.search("¥") == -1
    ) {
      itemIdx++;
      cartItems.push(itemInfo);
      console.info(itemIdx + ":" + itemInfo);
    }
  }
}

// 查询符合条件的商品列表
// 购物车 页面
function listAllFilterItems() {
  //itemFilterStr
  // android.support.v7.widget.RecyclerView
  let container = className("androidx.recyclerview.widget.RecyclerView")
    .scrollable()
    .depth(14)
    .findOnce();

  if (container) {
    let items = container.find(
      className("android.widget.TextView")
        .depth(16)
        .indexInParent(1)
        .textMatches(itemFilterStr)
    );
    // log("符合条件[" + itemFilterStr + "]的商品数:" + items.size());
    return items;
  } else {
    return new Array();
  }
}

// 判断指定的商品是否可购买, 如果已加入购物车的则跳过
// 22/05/20 仅支持标准购物车页面下面的推荐商品判断
function filterActiveItem(item) {
  let isActive = true;
  if (item) {
    let itemDiv = item.parent();
    let cartBtns = itemDiv.find(idMatches(".*(cart_icon|cart_buy)"));
    if (cartBtns.size() > 0) {
      let cartBtn = cartBtns[0];
      if (cartBtn.parent().childCount() == 2) {
        // 已加入购物车
        log("商品[%s]已加入购物车", item.text());
        isActive = false;
      } else {
        isActive = true;
      }
    } else {
      console.error("商品[%s]无法找到添加购物车按钮", item.text());
    }
  } else {
    isActive = false;
  }
  return isActive;
}

function clickRadioByItem(item) {
  let itemDiv = item.parent();
  let cartBtn = itemDiv.find(idMatches(".*(cart_icon|cart_buy)"))[0];
  log("点击[" + item.text() + "]的添加购物车按钮");
  cartBtn.parent().click();
  needReloadCart = true;
  commonWait();
  sleep(1000);
}

/**
 * 拼接返回商品描述
 * @param {商品标题UIObject} v
 * @returns
 */
function getItemInfo(v) {
  let infoDiv = v.parent().parent();
  let infoList = infoDiv.find(className("android.view.View").textMatches(".+"));
  // idx 0: 标题
  // idx 1: 描述 (可能没有)
  // idx 2: 货币(￥)
  // idx 3: 整数金额
  // idx 4: 小数金额 (可能没有)
  // idx 5: 单位
  // idx 6: android.widget.Image; text: O1CN01CYtPWu1MUBqQAUK9D_!!6000000001437-2-tps-2-2
  // idx 7: X会员价 ￥34.9 (可以通过正则来判断);
  if (infoList.size() == 6 || infoList.size() == 7) {
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
    // infoList.forEach(function (temp, idx) {
    //   log("子信息项%s:%s", idx, temp);
    // });
    return infoList.get(0).text() + "(" + infoList.size() + ")";
  }
}

/** 确认订单页面处理逻辑 */
function doInSubmit() {
  log("已进入[确认订单]页面");
  // 会出现[载入中]过渡动画
  // 注意 [金额]前面的 [合计:] 跟[￥0.00]并不是一个控件
  // 支付宝|确认付款| 说明已经成功
  let selectTimeBtn = textMatches(
    "(￥0.00|￥d+.d{1,2}|.*送达|选择时间|系统已为您自动选择可用时间|支付宝.+|确认付款|.*滑块完成验证.*)"
  ).findOne(2000);
  // 通过选择时间按钮, 判断是否还有货
  if (selectTimeBtn) {
    log("进入条件4: [%s]", selectTimeBtn.text());
    if (selectTimeBtn.text() == "选择时间") {
      // 220430 更新, 已经不需要这一步操作, 替换为[系统已为您自动选择可用时间], 暂时保留
      //log("点击->[" + selectTimeBtn.text() + "]");
      //clickByCoor(selectTimeBtn);
      // textStartsWith("18:00").findOne(5000);
      // let timeCheckBtn = id("com.wudaokou.hippo:id/period_title").findOne(1000);
      // // log(timeCheckBtn);
      // if (timeCheckBtn) {
      //   log("点击->[" + timeCheckBtn.text() + "]");
      //   clickByCoor(timeCheckBtn);
      let confirmTimeBtn = text("确认").findOne(300);
      if (confirmTimeBtn) {
        confirmTimeBtn.click();
        //commonWait();
      }
      // }
      orderConfirm();
    } else if (
      selectTimeBtn.text() == "确认付款" ||
      selectTimeBtn.text().indexOf("支付宝") != -1
    ) {
      // 说明已经下单成功
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
      log("符合点击[提交订单]的条件,往下流转");
      orderConfirm();
    }
  } else {
    console.error("ERROR4 在[确认订单]找不到任何内容, 继续");
    // musicNotify("09.error");
    // 有时候在点了[确定]按钮之后, 在[确认订单]页面会卡住, 白屏, 返回购物车处理
    log("执行返回16");
    back();
    commonWait();
  }
}

function orderConfirm() {
  log("进入[确认订单]第二部分");
  let totalAmount = textMatches(/(￥\d+\.\d{1,2})/).findOne(1000);
  if (totalAmount) {
    log("金额:" + totalAmount.text());
    if (totalAmount.text() == "￥0.00") {
      // 这种情况一般就是有缓存了, 光退回团购页面还不行, 需要返回首页
      log("当前订单总金额:" + totalAmount.text());
      // 库存不足 -> [失效原因:] 抱歉, 您选的商品太火爆了, 一会儿功夫库存不足了(008)
      // 运力不足 -> [失效原因:] 非常抱歉, 当前商品运力不足(063)
      let failReason = textMatches(
        /(.*运力不足.*|.*库存不足.*|.*当前不在.+可售时段)/
      ).findOne(200);
      if (failReason) {
        if (failReason.text().indexOf("运力不足") != -1) {
          toastLog("运力不足, 等待5000ms");
          sleep(5000);
        } else if (failReason.text().indexOf("可售时段") != -1) {
          let sleepTime = 10 * 1000;
          if (isPeakTime()) {
            sleep(1000);
          }
          log("不在可售时段, 等待[%s]ms", sleepTime);
          sleep(sleepTime);
        } else {
          log("商品库存不足失败, 等待1000ms");
          sleep(1000);
        }
      }

      if (!text("确认订单").findOnce().parent().child(0).click()) {
        log("执行返回18");
        back();
      }
      commonWait();
    } else {
      // 有金额了就认为是支付中, 如果失败返回了首页, 再重置为false
      let confirmBtn = textMatches(/(提交订单|确认付款)/).findOne(500);
      musicNotify("02.pay");
      if (confirmBtn) {
        if (confirmBtn.text() == "提交订单") {
          console.info("INFO: 点击[" + confirmBtn.text() + "]");
          confirmBtn.click();
          // 点击之后, 进入 [载入中] 过渡动画, [支付宝] 过渡动画, 最终出现 [确认付款] 按钮
          // [支付宝] 之后, 设置过的手机会自动 [免密支付中] , [免密支付成功] ,
          // 最终 [支付成功] , 有 [完成] (Note9上面与录音的停止键位置重叠), [返回首页]
          commonWait();
          // [确认提货点为] [XX小区] [更改] [确定]
          // 05/07 有时候会需要确认 小区 , 操作一次以后, 短期内不再需要确认, 后面还需不需要确认还不确定
          click_i_know();
          console.time("跳转到支付页面耗时");
          // 载入中 比较短, 使用[支付宝]判断就够了
          let checkTxt = textMatches(
            "(支付宝|免密支付中|免密支付成功|确定)"
          ).findOne(3000);
          console.timeEnd("跳转到支付页面耗时");
          if (checkTxt) {
            log("进入条件6:", checkTxt.text());
            if (checkTxt.text() != "确定") {
              console.info("订单正在自动支付中, 等待一定时间");
              sleep(5000);
            }
          }
        } else {
          // 确认付款
          payConfirm();
        }
      } else {
        printPageUIObject();
        //musicNotify("09.error");
        commonWait();
      }
    }
  } else {
    console.error("ERROR6 没有找到金额");
    musicNotify("09.error");
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
}

function findActiveFilterItems() {
  var activeItems = new Array();
  // 打印所有可买商品
  let allItems = listAllFilterItems();

  for (var i = 0; i < allItems.length; i++) {
    var tempItem = allItems[i];
    if (filterActiveItem(tempItem)) {
      // 过滤黑名单里面的商品
      activeItems.push(tempItem);
      try {
        console.info("INFO: 可购买商品信息: " + tempItem.text());
      } catch (e) {
        console.error(e.stack);
      }
    }
  }
  return activeItems;
}

// 推荐商品选购
function itemRecomSel() {
  if (text("RECOMMEND").exists()) {
    console.time("自动加购耗时");
    let tempI = 0;
    while (tempI < 45) {
      tempI++;
      // log(tempI);
      scrollDownInCart();
      while (textMatches(".*正在加载.*").findOne(200)) {
        sleep(300);
        log("第%s页加载中", tempI);
      }
      addFilterItemsToCart();
    }
    log("往下翻页总共滑屏%s次", tempI);
    console.timeEnd("自动加购耗时");
    toHome();
  } else {
    log("找不到推荐商品(可能是高峰期)");
  }
}

function addFilterItemsToCart() {
  let activeItemsSelected = false;
  let activeItems = findActiveFilterItems();
  if (activeItems.length != 0) {
    for (let i = 0; i < activeItems.length; i++) {
      item = activeItems[i];
      if (cartItems.indexOf(item.text()) != -1) {
        log("购物车内已经包含[%s]", item.text());
      } else {
        toastLog("INFO 选中第[" + (i + 1) + "]件商品: [" + item.text() + "]");
        clickRadioByItem(item);
        commonWait();
        activeItemsSelected = true;
        sleep(500);
      }
    }
    if (activeItemsSelected) {
      // 重新获取购物车信息
      cartItems = null;
      itemIdx = 0;
      commonWait();
    }
  }
}

/** 商品选择页处理逻辑 */
function doInItemSel2() {
  isPaying = false;
  console.time("查找购物车按钮 耗时");
  let btn = idContains("cartEl").findOne(5000);
  //let btn = idContains("nav_icon_wrap").findOne(5000);
  //let btn = text("").findOne(1000);
  console.timeEnd("查找购物车按钮 耗时");
  printAllItems();
  if (btn) {
    btn.click();
    commonWait();
    let checkTxt = textMatches("我常买").findOne(2000);
  }
}

function doInCart() {
  if (text("盒马鲜生").findOne(2000)) {
    // log("已进入购物车");
    hasFindAllItems = false;
    countP = 0;
    countT = 0;
    // 获取购物车内当前商品
    printCartItems();

    if (count >= MAX_TIMES_PER_ROUND) {
      // 大约每半小时休息几分钟
      toastLog("本轮捡漏没有成功, 稍后重新开始");
      return;
    }
    count++;
    log("抢菜第" + round + "-" + count + "次-" + continueRefreshCount);
    if (count == 1 || count % 5 == 0) {
      toast("抢菜第" + round + "轮第" + count + "次");
    }
    if (needReloadCart) {
      log("重新加载购物车:", needReloadCart);
      reload_mall_cart();
    }

    // 定期把推荐商品里面符合条件的商品自动加入购物车
    if (!isPeakTime()) {
      if (count % 300 == 10) {
        // 自动选择不在购物车中的商品
        return itemRecomSel();
      } else {
        addFilterItemsToCart();
      }
    }

    // 22/05/24 因为共用X会员账号, 暂时关闭全选
    if (ACTIVE_STOP_APP == 1) {
      check_all();
    }
    // 22/05/24 出现[确定]弹框的情况下, 下面的元素是无法获取的
    let submit_btn = textMatches("结算.*|重新加载|刷新|确定").findOne(1000);
    if (submit_btn) {
      // log("进入条件9: ", submit_btn.text());
      if (submit_btn.text().indexOf("结算") != -1) {
        // 极端情况下, 商品秒无, 这个时候会没有结算按钮, 需要再次判断
        // 只是 "结算" 按钮的话, 并未选择商品, 只有出现 "结算(*)" 才是选中了 , 这种情况会出现在早上6点左右, 服务器繁忙的情况下
        let noExpressTxt = text("商品运力不足").findOne(100);
        if (
          submit_btn.text() != "结算(0)" &&
          (noExpressTxt == null || count % 10 == 0)
        ) {
          continueRefreshCount = 0;
          //log("点击->[" + submit_btn.text() + "]");
          let tempI = 0;
          console.time("连续点击[结算]耗时");
          while (submit_btn && !text("确定").exists() && tempI < 50) {
            tempI++;
            //if (tempI % 2 != 2) {
            clickByCoorNoWait(submit_btn);
            // } else {
            //   submit_btn.click(); //结算按钮点击
            // }
            if (
              textMatches(/(确定|确认订单)/).findOne(
                (tempI > 3 ? 3 : tempI) * 50
              )
            ) {
              break;
            } else {
              submit_btn = textStartsWith("结算(").findOnce();
            }
          }
          console.timeEnd("连续点击[结算]耗时");
          log("[结算]总共点击%s次", tempI);
          // 这里只有两种场景, 1: 确定, 2已经到 下个页面 [确认订单]
          //
          // 22/05/25 更新5.41.2版本之后, // 高峰期 [温馨提示] [当前购物高峰期人数较多, 请您稍后再试] [确定] 跳转为 toast

          let nextBtn = textMatches(
            /(前方拥挤.*|确定|确认订单|.*请您稍后再试)/
          ).findOne(2000);
          // 会出现 [载入中] 过渡界面
          if (nextBtn) {
            log("进入条件6: ", nextBtn.text());
            if (nextBtn.text() == "确定") {
              console.time("点击->01[" + nextBtn.text() + "]耗时");
              // 22/05/28的版本, 确定 的弹框, 请您稍后再试。 (结尾有句号)
              if (!textMatches("当前购物高峰期人数较多.*").exists()) {
                printReason(nextBtn);
              }
              // 22/05/22 有的时候判断时候在购物车页面, 但是点击的时候已经到了订单确认页面, 所有不能使用 .parent().click()
              clickByCoor(nextBtn);
              console.timeEnd("点击->01[" + nextBtn.text() + "]耗时");
            } else if (
              nextBtn.text().indexOf("前方拥挤") != -1 ||
              nextBtn.text().indexOf("请您稍后再试") != -1
            ) {
              log("可能没有[结算]成功, 继续");
            } else {
              log("没有出现[我知道了|确定]等失败信息");
            }
          } else {
            if (text("我常买").exists()) {
              console.error("ERROR7: 结算按钮点击未生效");
            } else {
              console.error("ERROR7: 未知情况");
              printPageUIObject();
              musicNotify("09.error");
            }
          }
        } else {
          continueRefreshCount++;
          if (continueRefreshCount % 50 == 0) {
            log(
              "没有可买商品或[商品运力不足]连续%s次，继续刷新页面",
              continueRefreshCount
            );
          }
          reload_mall_cart();
        }
      } else {
        // 重新加载|刷新
        clickByCoor(submit_btn);
        //submit_btn.parent().click();
        commonWait();
      }
    } else {
      musicNotify("09.error");
      console.error("ERROR05: 购物车加载失败");
      printPageUIObject();
    }
  } else {
    log("购物车内没有找到[盒马鲜生]按钮, 返回首页");
    toHome();
  }
  // log("DEBUG: [结算]执行结束");
}

/** 首页处理逻辑 */
function doInHome() {
  // log("当前在首页");
  count++;
  hasFindAllActiveItems = false;
  log("抢菜第" + round + "-" + count + "次");
  if (count % 5 == 0) {
    toast("抢菜第" + round + "轮第" + count + "次");
  }
  // 22/05/25 因为帮别人抢货的时候, 经常会跳回定位所在地, 所以每次都进行确认[家]对应的地址
  let locCheckBtn = id(
    PACKAGE_NAME + ":id/home_page_titlebar_location_icon"
  ).findOne(500);
  if (locCheckBtn) {
    clickByCoor(locCheckBtn);
    if (text("选择地址").findOne(2000)) {
      let addBtn = textStartsWith("家").findOne(2000);
      if (addBtn) {
        toastLog("确认地址:" + addBtn.text());
        let currAddTxt = textMatches("当前地址.*").findOne(3000);
        if (currAddTxt) {
          // 220526 前面是 家后面带两个空格
          let add = addBtn.text().substring(3).trim();
          if (currAddTxt.text().indexOf(add) != -1) {
            log("当前地址已经是:", add);
            id("select_address_back").findOnce().click();
          } else {
            log("原地址:[%s], 切换为:[%s]", currAddTxt.text(), add);
            sleep(2000);
            clickByCoor(addBtn);
          }
          sleep(2000);
          if (!toCart()) {
            log("没有找到进入购物车的按钮");
            log("执行返回7");
            back();
            commonWait();
          }
        } else {
          console.error("没有找到[当前地址]");
          back();
          commonWait();
        }
      } else {
        isFailed = true;
        toastLog("请在收货地址内添加一条标签为[家]的地址");
      }
    } else {
      log("[选择地址]页面没有正常加载, 返回首页");
      back();
      commonWait();
    }
  } else {
    console.warn("找不到进入确认地址的按钮");
  }
}

function toCart() {
  // log("当前在首页");
  // 在首页
  let toListBtn = text("购物车").findOne(1000); // 20ms
  if (toListBtn) {
    let loc = toListBtn.bounds();
    // 必须要等待超过300ms, 否则点击会无效, 无法进入[商品选择]页面
    commonWait();
    // 05/04 高峰期可能加载更慢, 增加延时100ms至300ms
    sleep(300);
    click(loc.centerX(), loc.centerY()); // 执行一次点击大约耗时160ms
    console.time("into_mall 耗时");
    let mall = textMatches(
      /(盒区团购|爱一起 尽享当夏|海鲜水产|我常买|O1CN011FpVIT1g4o.*)/
    ).findOne(4000); // S8 加载耗时3.3s, 高峰期也不会超过4秒
    console.timeEnd("into_mall 耗时");
    log("成功进入[购物车]页面:" + (mall != null));
  }
  return toListBtn;
}

function toHome() {
  let btn = text("首页").findOne(1000); // 20ms
  if (btn) {
    clickByCoor(btn);
    console.time("into_home 耗时");
    let homeTxt = textMatches(/(搜索)/).findOne(1000);
    console.timeEnd("into_home 耗时");
    log("成功进入[首页]:" + (homeTxt != null));
  } else {
    log("没有找到进入[首页]的按钮");
    back();
    commonWait();
  }
  return btn;
}

// ###############################################################
function commonWait() {
  sleep(COMMON_SLEEP_TIME_IN_MILLS + random(0, 50));
}

function click_i_know(iKnow) {
  // [温馨提示] - [当前购物高峰期人数较多, 请您稍后再试] - [确定] - 需要[返回]
  // [温馨提示] - [抱歉, 您选的商品太火爆了, 一会儿功夫库存不足了(008)] - [确定] - 不确定是否要返回
  // [温馨提示] - [前方拥挤, 亲稍等再试试] - [确定] - 应该不需要[返回]
  let retry_button = iKnow;
  if (retry_button == null) {
    retry_button == textMatches(/(我知道了|返回购物车|确定)/).findOnce();
  }
  if (retry_button) {
    let reason = printReason(retry_button);
    if (!reason) {
      printPageUIObject();
    }
    log(
      "通用方法:找到[" + retry_button.text() + "]按钮,原因[%s],直接点击",
      reason
    );
    clickByCoor(retry_button);
    //if (reason.indexOf("请您稍后再试") != -1) {
    // 05/08 新版本这个框是出现在购物车页面, 不需要返回
    // log("执行[返回8]操作");
    // back();
    // commonWait();
    //} else {
    // 05/05 [前方拥挤, 亲稍等再试试], 这种情况下, 会自动返回[盒区团购]页面
    //  log("不执行[返回]操作");
    //}
  }
}

function printReason(iKnow) {
  try {
    let needPrint = true;
    let reason = "";
    iKnow
      .parent()
      .parent()
      .parent()
      .find(textMatches(".+"))
      .forEach((child, idx) => {
        if (needPrint) {
          if (child.text() != "订单已约满" && child.text() != "温馨提示") {
            log(
              "第" + (idx + 1) + "项(" + child.depth() + ")text:" + child.text()
            );
          } else {
            needPrint = false;
          }
        }
        if (idx == 1) {
          reason = child.text();
        }
      });
    return reason;
  } catch (e) {
    console.error(e);
    console.error(e.stack);
  }
}

function check_all() {
  // log("判断购物车是否已经选中商品");
  //console.time("全选商品耗时"); // 大约15ms
  let headTxt = text("盒马鲜生").findOne(100); // 20ms
  if (headTxt) {
    let checkAllbtn = headTxt
      .parent()
      .find(className("android.widget.CheckBox"))
      .get(0);
    if (checkAllbtn) {
      let is_checked = checkAllbtn.checked();
      // log("购物车当前已全选商品:" + is_checked);
      if (checkAllbtn.enabled()) {
        if (!is_checked) {
          log("全选所有商品");
          checkAllbtn.click();
          commonWait();
          sleep(1000);
        } else {
          log("购物车已经全选商品");
        }
      }
    }
  }
  //console.timeEnd("全选商品耗时");
}

function reload_mall_cart() {
  // 切换标签页面
  // log("重新加载购物车");
  let reloadSuccess = false;
  let tempI = 0;
  do {
    scrollUpInCart();
    tempI++;
    // 22/05/25 貌似这个页面的 [加载中] text 一直都在,只是不能查出来而已; 反倒是[盒马鲜生], 如果滚到下面是查不到的
    reloadSuccess = text("盒马鲜生").findOne(100);
  } while (!reloadSuccess && tempI < 50);
  sleep(random(500, 1000));
  if (ACTIVE_STOP_APP == 1 && !text("盒马鲜生").findOne(5000)) {
    printPageUIObject();
    console.warn("[盒马鲜生]不存在, 跳过本轮");
    isFailed = true;
  }
  needReloadCart = false;
  closeSimilarRecom();
}

// ################# 以下为通用方法 ################################################################################################
// 通用方法1: 结束程序
function kill_app(packageName) {
  var name = getPackageName(packageName);
  if (!name) {
    if (getAppName(packageName)) {
      name = packageName;
    } else {
      return false;
    }
  }
  log("即将停止的APP: ", name);
  app.openAppSetting(name);
  commonWait();
  text(app.getAppName(name)).findOne(2000);
  sleep(300);
  let is_sure = textMatches(/(.*强.*|.*停.*|.*结.*|.*行.*|.*FORCE.*)/).findOne(
    3000
  );
  // log(is_sure);
  if (is_sure.enabled()) {
    log("找到停止按钮: ", is_sure.text());
    commonWait();
    is_sure.click();
    commonWait();

    buttons = textMatches(
      /(.*强.*|.*停.*|.*结.*|.*行.*|确定|是|.*FORCE.*)/
    ).find();
    if (buttons.length > 0) {
      log("找到确认停止按钮: ", buttons[buttons.length - 1].text());
      commonWait();
      buttons[buttons.length - 1].click();
      commonWait();
    } else {
      // 异常情况
      toast(app.getAppName(name) + "应用没有找到确认按钮");
      sleep(30 * 1000);
    }

    log(app.getAppName(name) + "应用已被关闭");
    sleep(2000);
    log("执行返回9");
    back();
    commonWait();
  } else {
    log(app.getAppName(name) + "应用不能被正常关闭或不在后台运行");
    sleep(3000);
    // back();
  }
}

/**
 * 真人模拟滑动函数 （滑块滑动）
 * @param {起点x} sx
 * @param {起点y} sy
 * @param {终点x} ex
 * @param {终点y} ey
 */
function randomSwipe(sx, sy, ex, ey) {
  // 22/05/27 解决问题: [JavaException: java.lang.IllegalArgumentException: Path bounds must not be negative]
  if (sx == 0 || ex == 0) {
    console.warn("[device.width]返回结果为0,使用默认值540");
    sx = 540;
    ex = 540;
  }
  //log(sx, sy, ex, ey);
  //设置随机滑动时长范围
  var timeMin = 250;
  var timeMax = 300;
  //设置控制点极限距离
  var leaveHeightLength = 300;

  //根据偏差距离，应用不同的随机方式
  if (Math.abs(ex - sx) > Math.abs(ey - sy)) {
    var my = (sy + ey) / 2;
    var y2 = my + random(0, leaveHeightLength);
    var y3 = my - random(0, leaveHeightLength);

    var lx = (sx - ex) / 3;
    if (lx < 0) {
      lx = -lx;
    }
    var x2 = sx + lx / 2 + random(0, lx);
    var x3 = sx + lx + lx / 2 + random(0, lx);
  } else {
    var mx = (sx + ex) / 2;
    var x2 = mx + random(0, leaveHeightLength);
    var x3 = mx - random(0, leaveHeightLength);

    var ly = (sy - ey) / 3;
    if (ly < 0) {
      ly = -ly;
    }
    var y2 = sy + ly / 2 + random(0, ly);
    var y3 = sy + ly + ly / 2 + random(0, ly);
  }

  //获取运行轨迹，及参数
  var time = [0, random(timeMin, timeMax)];
  var track = bezierCreate(sx, sy, x2, y2, x3, y3, ex, ey);

  //滑动
  //log(time.concat(track));
  gestures(time.concat(track));
}
/**
 * 计算滑动轨迹
 */
function bezierCreate(x1, y1, x2, y2, x3, y3, x4, y4) {
  //构建参数
  var h = 100;
  var cp = [
    { x: x1, y: y1 + h },
    { x: x2, y: y2 + h },
    { x: x3, y: y3 + h },
    { x: x4, y: y4 + h },
  ];
  var numberOfPoints = 100;
  var curve = [];
  var dt = 1.0 / (numberOfPoints - 1);

  //计算轨迹
  for (var i = 0; i < numberOfPoints; i++) {
    var ax, bx, cx;
    var ay, by, cy;
    var tSquared, tCubed;
    var result_x, result_y;

    cx = 3.0 * (cp[1].x - cp[0].x);
    bx = 3.0 * (cp[2].x - cp[1].x) - cx;
    ax = cp[3].x - cp[0].x - cx - bx;
    cy = 3.0 * (cp[1].y - cp[0].y);
    by = 3.0 * (cp[2].y - cp[1].y) - cy;
    ay = cp[3].y - cp[0].y - cy - by;

    var t = dt * i;
    tSquared = t * t;
    tCubed = tSquared * t;
    result_x = ax * tCubed + bx * tSquared + cx * t + cp[0].x;
    result_y = ay * tCubed + by * tSquared + cy * t + cp[0].y;
    curve[i] = {
      x: result_x,
      y: result_y,
    };
  }

  //轨迹转路数组
  var array = [];
  for (var i = 0; i < curve.length; i++) {
    try {
      var j = i < 100 ? i : 199 - i;
      xx = parseInt(curve[j].x);
      yy = parseInt(Math.abs(100 - curve[j].y));
    } catch (e) {
      break;
    }
    array.push([xx, yy]);
  }

  return array;
}

// 判断当前是否高峰期
// 开售前1分钟 - 开售后5分钟
// checkTime 判断时间, 08:00
// beforeOffset 往前判断阈值, 单位: 毫秒, 比如: 1 * 60 *1000
// afterOffset 往后判断阈值, 单位: 分钟, 比如: 5 * 60 *1000
// 最终判断 >= 07:59 && <= 08:05:00
function isPeakTimeStr(checkTime, beforeOffset, afterOffset) {
  // log(
  //   "判断时间: %s, 往前%s分钟, 往后%s分钟",
  //   checkTime,
  //   beforeOffset,
  //   afterOffset
  // );
  let now = new Date();
  let checkDate = new Date(now);
  var beginIndex = checkTime.lastIndexOf(":");
  var beginHour = checkTime.substring(0, beginIndex);
  var beginMinue = checkTime.substring(beginIndex + 1, checkTime.length);
  checkDate.setHours(beginHour, beginMinue, 0, 0);
  return (
    now.getTime() >= checkDate.getTime() - beforeOffset &&
    now.getTime() <= checkDate.getTime() + afterOffset
  );
}

// 开始录屏
function startRecord() {
  if (!isRecording && activeRecord == 1) {
    swipe(700, 0, 750, 1300, 200);
    commonWait();

    // 录屏工具,关闭。,按钮
    // 每个手机不一样, 需要进行适配
    // Note20U [898, 269, 221, 121] [录屏工具,已关闭。,按钮]
    let startRecBtn = descMatches("录.*关闭.*").findOne(2000);
    if (startRecBtn) {
      log("找到[开启录屏]按钮: ", startRecBtn.desc());
      startRecBtn.click();
      commonWait();
      isRecording = true;
      sleep(3000);
    } else {
      log("没有找到[开启录屏]按钮");
      printPageUIObject();
      back();
      commonWait();
    }

    let confirmRecord = text("开始录制").findOne(500);
    if (confirmRecord) {
      confirmRecord.click();
      commonWait();
      sleep(5000);
    }
  } else {
    // log("已经在录屏中或者不需要录屏");
  }
}

// 开始录屏
function stopRecord() {
  if (isRecording) {
    swipe(700, 0, 750, 1300, 200);
    commonWait();
    // Note920U 录屏工具,已开启。,按钮
    // Note9 录屏工具,关闭。,按钮
    // S8 录制屏幕,开启。,按钮
    let startRecBtn = descMatches("(录屏工具|录制屏幕).*开启.*").findOne(3000);
    if (startRecBtn) {
      log("找到[关闭录屏]按钮: ", startRecBtn.desc());
      if (startRecBtn.desc().indexOf("录屏工具") != -1) {
        // Note9
        startRecBtn.click();
        back();
        commonWait();
      } else {
        // S8 录屏过程通知栏会有一条[录制屏幕]常驻通知
        click("点击此处停止录屏");
        sleep(5000);
        back();
        commonWait();
      }
      isRecording = false;
      //printPageUIObject();
    } else {
      log("没有找到[关闭录屏]按钮, 非Note9,S8,Note20u需要自己适配");
      back();
      commonWait();
      // printPageUIObject();
    }
    sleep(1000);
  } else {
    log("不在录屏中");
  }
}

function printPageUIObject() {
  textMatches(".+")
    .find()
    .forEach((child, idx) => {
      if (idx < 50)
        log("第" + (idx + 1) + "项(" + child.depth() + ")text:" + child.text());
    });
  descMatches(".+")
    .find()
    .forEach((child, idx) => {
      if (idx < 50)
        log("第" + (idx + 1) + "项(" + child.depth() + ")desc:" + child.desc());
    });
  idMatches(".+")
    .find()
    .forEach((child, idx) => {
      if (idx < 50)
        log("第" + (idx + 1) + "项(" + child.depth() + ")id:" + child.id());
    });
}

// 针对Android 12 偶尔会返回0的情况
function getWidth() {
  return device.width == 0 ? 1080 : device.width;
}

// 针对Android 12 偶尔会返回0的情况
function getHeight() {
  return device.height == 0 ? 2316 : device.height;
}

// 点击指定对象的坐标
function clickByCoor(obj) {
  clickByCoorNoWait(obj);
  commonWait();
}

function clickByCoorNoWait(obj) {
  let loc = obj.bounds();
  log(
    "通过坐标点击[%s]:(" + loc.centerX() + "," + loc.centerY() + ")",
    obj.text() != "" ? obj.text() : obj.className() + "(" + obj.depth() + ")"
  );
  press(loc.centerX(), loc.centerY(), 10);
}

function musicNotify(name) {
  if (name == null) {
    name = "success";
  }
  let m = "/storage/emulated/0/Download/" + name + ".mp3";
  if (name == "05.need_manual") {
    device.vibrate(500);
  }
  console.time("music[" + name + "] 耗时");
  try {
    if (!files.exists(m)) {
      // 如果无法访问, 大概耗时2.5s, 将来准备换成公网地址
      // http://192.168.6.16/apk/autojs/tts/Download/
      var res = http.get(
        "https://raw.fastgit.org/touchren/meituanmaicai/main/tts/Download/" +
          name +
          ".mp3"
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

function waitCheckLog() {
  sleep(3000);
}

// 关闭闹钟提醒
function closeClock() {
  // 三星Note9闹钟关闭按钮
  let closeClockBtn = id(
    "com.sec.android.app.clockpackage:id/tabCircle"
  ).findOne(200);
  if (closeClockBtn) {
    console.info("识别到三星闹钟界面, 执行[返回]关闭闹钟");
    log("执行返回15");
    back();
    commonWait();
    sleep(500);
  } else {
    // 可能是弹窗状态, 5分钟后会自动消失
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

function scrollUpInCart() {
  randomSwipe(
    getWidth() / 2,
    random(300, 400),
    getWidth() / 2,
    random(1500, 1600)
  );
}

function scrollDownInCart() {
  randomSwipe(
    getWidth() / 2,
    random(1500, 1600),
    getWidth() / 2,
    random(300, 400)
  );
}

// 针对人工抓取的坐标, 不同分辨率需要进行坐标等比例缩放
// 根据横坐标计算缩放比例
function clickScale(x, y, btnTxt) {
  let ratio = getWidth() / DEFAULT_DEVICE_WIDTH;
  let realX = x * ratio;
  let realY = y * ratio;
  log("点击[固定]坐标[%s]:(" + realX + "," + realY + ")", btnTxt);
  click(realX, realY);
}

// 部分元素是靠底部排版的, 所以对于x是1080,但是y有细微差异的屏幕, 需要计算偏移量
function clickBottomScale(x, y, btnTxt) {
  let ratio = getWidth() / DEFAULT_DEVICE_WIDTH;
  let realX = x * ratio;
  let realY = y * ratio + getHeight() - DEFAULT_DEVICE_HEIGHT * ratio;
  log("点击[固定]坐标[%s]:(" + realX + "," + realY + ")", btnTxt);
  click(realX, realY);
}
