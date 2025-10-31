
/*
*/
import { CommClient } from "./CommClient.mjs";
export const guest = {
    _inited: false,
    init: function (parent) {
        if (this._inited === true) {
            return;
        }
        parent.created_rigidbodies.forEach(e => {
            parent.Canvas3D.deleteModelWithPhysics(e);
        })
        // parent.created_rigidbodies.splice(0, parent.created_rigidbodies.length);
        parent.created_rigidbodies.length = 0;

        CommClient.init("guest", {
            text: async msg => {
                const jsons = JSON.parse(msg.data);
                parent.created_rigidbodies.forEach(e => e.userData.deleted = true);

                await Promise.all(jsons.map(json => new Promise(async resolve => {
                    let obj = parent.created_rigidbodies.find(e => e.userData.uuid === json.uuid);
                    if (obj === undefined) {
                        obj = await parent.create_obj(json);
                    } else {
                        obj.userData.set_pos(json);
                    }
                    obj.userData.deleted = false;
                    resolve();
                })
                ));
                parent.created_rigidbodies.filter(e => e.userData.deleted).forEach(e => {
                    parent.Canvas3D.deleteModelWithPhysics(e);
                });
                const remained_rididbodies = parent.created_rigidbodies.filter(e => e.userData.deleted === false);
                parent.created_rigidbodies.length = 0;
                parent.created_rigidbodies.push(...remained_rididbodies);
            },
            server_cmd: async (msg) => {
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
        }, true);
        this._inited = true;
    },
    uninit: function(){
        this._inited = false;
    },
};
