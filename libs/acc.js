//
// 加速度センサーを使用する。
// androidの加速度の軸 (プラス方向が逆になるiPhoneはandroidに合わせて換算して値を返す)
// +------+
// | ↑y   | ↙z (スマホの裏から表方向)
// |   x→ |
// +------+
//
export const acc = {
    _axis_types: [["x", "y", "z"], ["alpha", "beta", "gamma"]],
    init: async function (cb, in_user_action = true) {
        // iphoneの場合には-1をかけて軸方向をandroidに合わせる。
        const factor = this.need_permission() ? -1 : 1;
        await this.request_permission(in_user_action);
        window.addEventListener("devicemotion", motion0 => {
            // e: DeviceMotionEvent (https://developer.mozilla.org/ja/docs/Web/API/DeviceMotionEvent)
            // e.acceleration: x,y,z軸の加速度 (m/s^2)
            // e.accelerationIncludingGravity: 重力込みの加速度 (m/s^2)
            // e.rotationRate: alpha,beta,gammaはそれぞれz,x,y軸周りの角速度
            // ※ alpha, beta, gamma は仕様ではz,x,yだけど実際には x,y,z ?
            //    参考: https://bugs.chromium.org/p/chromium/issues/detail?id=541607
            const motion1 = {};
            [
                ["acceleration", this._axis_types[0]],
                ["accelerationIncludingGravity", this._axis_types[0]],
                ["rotationRate", this._axis_types[1]]].forEach(([name, axes]) => {
                    motion1[name] = axes.reduce((a, e) => ({ ...a, [[e]]: motion0[name][e] * factor }), {});
                })
            cb?.(motion1);
        });
    },
    need_permission: function () {
        return DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function';
    },
    request_permission: async function (in_user_action) {
        const _request = async () => {
            if (DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') {
                //iOS 13+ の Safari許可を取得
                const state = await DeviceMotionEvent.requestPermission();
                if (state === "granted") {
                }
            }
        }
        if (in_user_action !== true) {
            this._modal_dialog(async () => {
                await _request();
            });
        } else {
            await _request();
        }
        return;
    },
    _modal_dialog: async function (cb) {
        const elem = document.createElement("div");
        elem.style.position = "fixed";
        elem.style.left = 0;
        elem.style.top = 0;
        elem.style.width = "100%";
        elem.style.height = "100%";
        elem.style.zIndex = 1000;
        elem.style.backgroundColor = "rgba(0,0,0,0.8)";
        elem.style.display = "flex";
        elem.style.justifyContent = "center";
        elem.style.alignItems = "center";

        const btn = document.createElement("button");
        btn.innerText = "ボタンを押して開始してください";
        btn.style.width = "30%";
        btn.style.height = "30%";
        elem.appendChild(btn);
        document.body.appendChild(elem);
        btn.addEventListener("click", async e => {
            elem.style.display = "none";
            await cb?.();
        });

    },
};

/*
acc.jsを使用するindex.htmlの例
最初に画面を覆うscreen.js、値を平均するvalues.jsを使用している。

<!DOCTYPE html>
<html>

<head>
    <meta charset="utf-8">
    <title></title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
    </style>
</head>

<body>
    <div id="screen"></div>
    <div id="output"></div>
    <div id="console"></div>
</body>
<script type="module">
    const axes = ["x", "y", "z"];
    import { acc } from "./acc.js";

    import { create_values } from "./values.js";
    const values = axes.reduce((a, e) => ({ ...a, [[e]]: create_values(128, e) }), {});

    import { screen } from "./screen.js";

    screen.show(document.getElementById("screen"), () => {
        console.log("start");
        acc.init(motion => {
            console.log(motion);
            document.getElementById("output").innerHTML =
                axes.map(axis => values[axis].add(motion.accelerationIncludingGravity[axis])).reduce((a, e) => a + e.label + ":" + e.ave() + "<br>", "")
        });
    });

</script>

</html>
*/
