
/*
*/
import { CommClient } from "./CommClient.mjs";
export const host = {
    _inited: false,
    // 指定時間がたったかどうかを確認する
    _alarm: {
        _time: undefined,
        set: function (msec) {
            this._time = performance.now() + msec;
        },
        done: function () {
            return performance.now() >= this._time;
        },
    },
    init: async function () {
        if (this._inited === true) {
            return;
        }
        await CommClient.init("host", {
            text: async msg => {
                console.log(msg);
            },
            server_cmd: async () => {
                CommClient.send({ cmd: "set_type", type: "camera" });
            },
            set_type: async msg => {
                if (msg.data === "closed") {
                    this._next_objs_inf.filter(e => e.comm_id === msg.from_id)?.forEach(e => e.removed = true);
                    await this._update_next_objs_inf();
                }
            },
        }, () => {
            console.log("websocket closed");
            this._inited = false;
        }, true);
        this._alarm.set(0);
        this._inited = true;
    },
    uninit: function () {
        this._inited = false;
    },
    send: function (created_rigidbodies) {
        if (this._inited == false || this._alarm.done() === false) {
            return;
        }
        this._alarm.set(50);
        const jsons = created_rigidbodies.filter(e => e.userData.picking === false).map(e => {
            const pr = e.userData.get_pos();
            return ({
                uuid: e.userData.uuid,
                obj_type_index: e.userData.obj_type_index,
                p: pr.p,
                r: pr.r,
            })
        });
        CommClient.send({ cmd: "text", data: JSON.stringify(jsons), to_id: "guest" });
    },
};
