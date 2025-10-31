
/*
*/
export const collision_animation = {
    _params: {
        animation_msec: 100,
    },
    _animations: [],
    _ave: function (v0, v1) {
        return v0.map((e, i) => (e + v1[i]) / 2);
    },
    start: function (params) {
        params.elapsed_time = 0;
        params.objThrees = params.objs.map(e => e.userData.objThree);
        params.objThrees.forEach(e => e.userData.p0 = e.position.toArray());
        params.p1 = this._ave(...params.objThrees.map(e => e.userData.p0));
        this._animations.push(params);
        params.objs.forEach(obj => {
            params.Canvas3D._d3.physicsWorld.removeRigidBody(obj);
            params.Canvas3D._d3.rigidBodies = params.Canvas3D._d3.rigidBodies.filter(e => e != obj);
        });
        return undefined;
    },
    update: async function (dt) {
        this._animations = this._animations.filter(e => e._to_delete !== true);
        if (this._animations.length === 0) {
            return [];
        }
        return (await Promise.all(this._animations.map(async ani => {
            ani.elapsed_time += dt;
            if (ani.elapsed_time < this._params.animation_msec) {
                const { objThrees, p1 } = ani;
                const alpha = ani.elapsed_time / this._params.animation_msec;
                objThrees.forEach(objThree => {
                    const pt = objThree.userData.p0.map((p, i) => p + alpha * (p1[i] - p));
                    objThree.position.set(...pt);
                })
                return undefined;
            }
            ani._to_delete = true;
            const { objs, Canvas3D, create_model, sounds, create_uuid, update, objThrees } = ani;

            objThrees.forEach(e => {
                Canvas3D._d3.scene.remove(e);
            });

            const obj = await create_model({
                obj_type_index: objs[0].userData.obj_type_index + 1,
                uuid: create_uuid(),
                p: objs.map(e => e.userData.get_pos().p).reduce((a, e) => this._ave(a, e)),
                v: objs.map(e => e.userData.get_vel().vel).reduce((a, e) => this._ave(a, e)),
                update,
            })
            sounds.play("koka");
            return obj;
        }))).filter(e => e !== undefined);
    },
};
