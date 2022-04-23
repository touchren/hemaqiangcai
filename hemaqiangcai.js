// 常量定义
const APP_NAME = "盒马";
// 最大尝试轮数
const MAX_ROUND = 10;
// 每轮最长重试次数 (平均单次1.2秒)
const MAX_TIMES_PER_ROUND = 50000;
// 点击按钮之后的通用等待时间
const COMMON_SLEEP_TIME_IN_MILLS = 500;
// 是否先强行停止APP
const ACTIVE_STOP_APP = 0;

// 第几轮
var round = 0;
// 本轮执行第几次
var count = 0;
// 确认已失败
var isFailed = false;
// 确实已成功
var isSuccessed = false;

// 遍历所有商品
var hasFindAllItems = false;

// 商品选项框跟标题的偏移量
var offsetX = 0;
var offsexY = 0;

var itemFilterStr = ".*(蛋糕|吐司|餐包|麻薯|菠萝包).*";

// 调试期间临时使用, 关闭其他脚本
engines.all().map((ScriptEngine) => {
  log("engines.myEngine().toString():" + engines.myEngine().toString());
  if (engines.myEngine().toString() !== ScriptEngine.toString()) {
    ScriptEngine.forceStop();
  }
});

device.wakeUp();
commonWait();
auto.waitFor();
// 开始循环执行
while (round < MAX_ROUND) {
  round++;
  log("开始第" + round + "轮抢菜");
  try {
    start();
  } catch (e) {
    log("异常: 出现中断性问题");
    log(e);
  }
  let randomSleep = random(30 * 1000, 90 * 1000);
  log("第" + round + "轮抢菜执行结束, 休息[" + randomSleep + "]ms");
  // 随机休息30-90秒
  sleep(randomSleep);
}
log("程序正常结束");

function start() {
  count = 0;
  isFailed = false;
  isSuccess = false;
  if (ACTIVE_STOP_APP == 1) {
    kill_app(APP_NAME);
  }
  launchApp(APP_NAME);
  commonWait();
  sleep(2600);
  click_i_know();
  while (count < MAX_TIMES_PER_ROUND && !isFailed && !isSuccess) {
    if (text("小区提货点").exists()) {
      doInItemSel();
    } else if (text("搜索").exists()) {
      doInHome();
    } else if (text("确认订单").exists()) {
      doInSubmit();
    } else {
      log("ERROR: 当前在其他页面");
      back();
      commonWait();
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

function musicNotify() {
  // 心如止水
  const m = "/storage/emulated/0/Download/success.mp3";
  media.playMusic(m);
  // sleep(media.getMusicDuration());
}

function findAllItems() {
  // (/(.+g|.+盒|.+枚|.+袋|.+\)|.+装|.+只|.+L)/)
  if (!hasFindAllItems) {
    let totalItemsStr = "";
    let itemIdx = 0;
    let items = listAllItems();
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
        offsetX = v.bounds().centerX() - item1.bounds().centerX();
        offsetY = v.bounds().centerY() - item1.bounds().centerY();
        log("offsetX=" + offsetX + ",offsetY=" + offsetY);
      }
      totalItemsStr = totalItemsStr + itemIdx + ":" + getItemInfo(v) + "; ";
    }
    log(totalItemsStr);
  }
}

function listAllItems() {
  let items;
  if (itemFilterStr) {    
    items = className("android.view.View").depth(18).textMatches(itemFilterStr).find();
  } else {
    items = className("android.view.View").depth(18).textMatches(/(.+)/).find();
  }
  log("itemName.size():" + items.size());
  return items;
}

function filterActiveItem(item) {
  let isActive = true;
  let itemDiv = item.parent().parent().parent().parent();
  // idx 1: 运力已约满 className: android.widget.Image; text: O1CN01q5RH5b1uzVvCCkGFZ_!!6000000006108-2-tps-192-53.png_220x10000.jpg_
  itemDiv.find(className("android.widget.Image")).each(function (temp) {
    log("子信息项:" + temp);
    if (
      temp.text() ==
      "O1CN01q5RH5b1uzVvCCkGFZ_!!6000000006108-2-tps-192-53.png_220x10000.jpg_"
    ) {
      isActive = false;
    }
  });
  return isActive;
}

function getItemInfo(v) {
  let infoDiv = v.parent().parent().parent();
  // log("第一个商品信息坐标: " + infoDiv.bounds());
  // log(infoDiv);
  // className("android.view.View")
  let infoList = infoDiv.find(textMatches(".+")).each(function (temp) {
    // log("子信息项:" + temp);
  });
  // idx 0: 标题
  // idx 1: 描述
  // idx 2: 货币(￥)
  // idx 3: 整数金额
  // idx 4: 小数金额 (可能没有)
  // idx 5: 单位 (可能是4)
  return (
    infoList.get(0).text() +
    "-" +
    infoList.get(3).text() +
    infoList.get(infoList.size() - 1).text()
  );
}

function getItemInfoByRadio(v) {
  let infoDiv = v.parent().parent();
  // log("第一个商品信息坐标: " + infoDiv.bounds());
  //log(infoDiv);
  // className("android.view.View")
  let infoList = infoDiv
    .find(textMatches(".+"))
    .find(className("android.view.View"))
    .each(function (temp) {
      //log("子信息项:" + temp);
    });
  // idx 0: 图片
  // idx 1: 运力已约满 className: android.widget.Image; text: O1CN01q5RH5b1uzVvCCkGFZ_!!6000000006108-2-tps-192-53.png_220x10000.jpg_
  // idx 2: 图片
  // idx 3: 标题
  // idx 4: 描述
  // idx 5: 货币(￥)
  // idx 6: 整数金额
  // idx 7: 小数金额 (可能没有)
  // idx 8: 单位 (可能是4)
  return (
    infoList.get(0).text() +
    "-" +
    infoList.get(3).text() +
    infoList.get(infoList.size() - 1).text()
  );
}

function findFirstItem() {
  let item1 = className("android.view.View")
    .depth(16)
    .clickable(true)
    .findOne(10000);

  // textMatches()
  // 商品标题 depth==18
  // let testItem = textMatches(/(叶菜组合.*)/)
  //   .depth(18)
  //   .findOne(1000);
  // log(testItem);
  // log(testItem.depth());

  // 商品描述 depth==19
  // let testItem2 = textMatches(/(红米.*)/).findOne(1000);
  // log(testItem2);
  // log(testItem2.depth());

  // log("itemName1:" + itemName1.get(1));
  // log(item1);
  //log(item1.parent());
  //log(item1.parent().parent());
  return item1;
}

function clickByCoor(obj) {
  let loc = obj.bounds(); //1.匹配id寻找位置。
  log("通过坐标点击:[" + loc.centerX() + "," + loc.centerY() + "]");
  click(loc.centerX(), loc.centerY());
  commonWait();
}

/** 确认订单页面处理逻辑 */
function doInSubmit() {
  log("已进入[确认订单]页面");
  let confirmBtn = text("提交订单").findOne(5000);
  // log(confirmBtn)
  // 合计: , 跟金额并不是一个控件
  // let sumTxt = textStartsWith("合计").findOne(1000);
  // log(sumTxt);
  let selectTimeBtn = textStartsWith("选择时间").findOne(1000);
  // 通过选择时间按钮, 判断是否还有货
  if (selectTimeBtn) {
    // log(selectTimeBtn);
    log("点击->[" + selectTimeBtn.text() + "]");
    clickByCoor(selectTimeBtn);
    commonWait();
    // textStartsWith("18:00").findOne(5000);
    let timeCheckBtn = id("com.wudaokou.hippo:id/period_title").findOne(1000);
    log(timeCheckBtn);
    if (timeCheckBtn) {
      log("点击->[" + timeCheckBtn.text() + "]");
      clickByCoor(timeCheckBtn);
      let confirmTimeBtn = text("确认").findOne(500);
      if (confirmTimeBtn) {
        confirmTimeBtn.click();
        commonWait();
      }
    } else {
      log("ERROR: 没有找到类似于[18:00]的选择项");
    }

    if (confirmBtn) {
      confirmBtn.click();
      commonWait();
      let payBtn = textMatches(".*支付.*").findOne(1000);
      if (payBtn) {
        log("已经进入支付页面");
        // 标记为成功
        isSuccessed = true;
        musicNotify();
      }
    }
  } else {
    log("没有找到[选择时间]按钮");
    let totalAmount = text("￥0.00").findOne(1000);
    if (totalAmount) {
      log("当前订单总金额:" + totalAmount.text());
    }
    // 这种情况一般就是有缓存了, 光退回团购页面还不行, 需要返回首页
    back();
    commonWait();
    back();
    commonWait();
  }
}

/** 商品选择页处理逻辑 */
function doInItemSel() {
  // text("小区提货点").exists()
  log("当前在商品选择页面");
  // let notServicePage = id("hema-floor-title-4732230300").findOne(1000).parent();
  let specialPackageTxt = text("特供套餐").findOne(1000);
  if (specialPackageTxt) {
    // 遍历所有的商品及计算偏移量
    findAllItems();
    //log("当前在营业时间");
    // 判断是否 运力已满
    let noExpressExt = text("运力已约满").findOne(1000);
    if (noExpressExt) {
      log("已提示运力已约满, 即将返回首页");
      back();
      commonWait();
    } else {
      log("INFO: 开始选择商品");
      let first = findFirstItem();
      // 默认是 [已选0件]
      let checkedTxt = textStartsWith("已选").findOne(1000);
      // 打印所有可买商品
      listAllItems.filter(filterActiveItem).each(function (activeItem) {
        try {
          log("INFO: 可购买商品信息: " + getItemInfoByRadio(activeItem));
        } catch (e) {
          log(e);
        }
      });
      // log(checkedTxt);
      if (checkedTxt && checkedTxt.text() == "已选0件") {
        try {
          log("INFO: 通过选项框查找商品信息: " + getItemInfoByRadio(first));
        } catch (e) {
          log(e);
        }
        first.click();
        commonWait();
      } else {
        log("当前商品情况:" + checkedTxt.text());
      }

      let submitBtn = text("立即下单").findOne(1000);
      if (submitBtn) {
        submitBtn.click();
        commonWait();
        text("确认订单").findOne(5000);
      }
    }
  } else {
    // 08:00 - 18:00
    log("WARN: 当前不在服务时间提示存在");
    isFailed = true;
    back();
    commonWait();
  }
}

/** 首页处理逻辑 */
function doInHome() {
  count++;
  log("抢菜第" + round + "-" + count + "次");
  if (count == 1 || count % 5 == 0) {
    toast("抢菜第" + round + "轮第" + count + "次");
  }
  log("当前在首页");
  // 在首页
  let toListBtn = id("home_page_other_layout");

  if (toListBtn.exists()) {
    let loc = toListBtn.findOne(1000).bounds();
    log("通过坐标点击进入团购的按钮");
    click(loc.centerX(), loc.centerY());
    commonWait();
    text("小区提货点").findOne(5000);
  } else {
    log("没有找到进入团购的按钮");
  }
}

function commonWait() {
  sleep(COMMON_SLEEP_TIME_IN_MILLS + random(0, 50));
}

function click_i_know() {
  // 只要页面有 我知道了等按钮, 都盲点
  let retry_button = textMatches(/(我知道了|返回购物车)/);
  if (retry_button.exists()) {
    let temp = retry_button.findOne(100);
    log("通用方法:找到[" + temp.text() + "]按钮,直接点击");
    // 1. 配送运力已约满
    // 2. 门店已打烊
    // 3. 订单已约满
    if (temp != null) {
      temp.parent().click();
      commonWait();
      let temp2 = retry_button.findOne(100);
      if (temp2) {
        log("异常: 点击[我知道了]无效");
        let loc = temp2.bounds(); //1.匹配id寻找位置。
        log("通过坐标点击");
        click(loc.centerX(), loc.centerY());
      }
    }
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
