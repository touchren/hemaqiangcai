// 输入密码
function password_input() {
  var password = "1234";
  for (var i = 0; i < password.length; i++) {
    var p = text(password[i].toString()).findOne().bounds();
    click(p.centerX(), p.centerY());
    sleep(100);
  }
}

// 解锁屏幕
function unlock() {
  if (!device.isScreenOn()) {
    device.wakeUp();
    sleep(500);
    swipe(500, 2000, 500, 1000, 210);
    // 有些手机(比如MIUI13)防误触, 需要不规则滑动
    //     swipe(random(device.width / 3, device.width / 2), random(device.height * 8 / 10, device.height * 7 / 10), random(device.width / 3, device.width / 2), random(device.height * 2 / 10, device.height / 10), random(500, 1000));
    sleep(500);
    password_input();
  }
}

toastLog("5秒后测试解锁");
sleep(5000);
// 解锁方式1, 使用上面的简单代码, 仅支持数字解锁
//unlock();

// 解锁方式2, 使用 Unlock.js , 还支持滑动解锁
let unlocker = require('./Unlock.js')
unlocker.exec();