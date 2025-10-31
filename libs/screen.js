// 起動時に全画面のスクリーンを表示して、スタートボタンを押すと開始する、というのを実装するもの。
// iphoneだとvideoやaudioの再生にユーザのアクションを必要とするため、このような画面が必要になる。
// 使い方
// <script type="module">
// import { screen } from "./screen.js";
// screen.show(document.getElementById("screen"), ()=>{ ... });
export const screen = {
    _btn: undefined,
    show: function (elem, f) {
        elem.style.position = "fixed";
        elem.style.left = 0;
        elem.style.top = 0;
        // elem.style.width = "100%";
        // elem.style.height = "100%";
        elem.style.width = "100vw";
        elem.style.height = "100vh";
        elem.style.zIndex = 1000;
        elem.style.backgroundColor = "rgba(0,0,0,0.8)";
        elem.style.display = "flex";
        elem.style.justifyContent = "center";
        elem.style.alignItems = "center";
        // elem.style.flexDirection = "column";

        this._btn = document.createElement("button");
        this._btn.innerText = "ボタンを押して開始してください";
        this._btn.style.width = "30vw";
        this._btn.style.height = "30vh";
        elem.appendChild(this._btn);

        const handler = async () => {
            await f();
            elem.style.display = "none";
        };

        this._btn.addEventListener("click", async e => {
            await handler();
        });

        document.body.addEventListener("keyup", (ev) => {
            if (ev.key === " ") {
                handler();
            }
        });
    },
    press_ok: function () {
        this._btn?.click();
    },
    is_screen_visible: function () {
        return this._btn.parentNode.style.display !== "none";
    },
};
