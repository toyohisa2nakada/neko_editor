export const Canvas3D = {
  // canvasに合わせてphysics worldを作成する。
  // 座標系は、html-canvasが次なので、
  //    y-
  //  x-  x+
  //    y+
  // カメラの位置をcanvasの裏、頭を下にして、
  //    y-
  //  x-  x+  (手前 z+, 奥 z-)
  //    y+
  // とする。ちなみにthree.jsの座標系は右手系(unityは左手系)
  //
  // Canvas3Dを通して3dオブジェクトを生成、操作するときはcanvasの座標をそのまま指定する。

  _d3: {
    THREE: undefined,
    // WebGPURenderer: undefined,

    renderer: undefined,
    scene: undefined,
    camera: undefined,
    frustum: undefined,
    clock: undefined,

    physicsWorld: undefined,
    rigidBodies: [],
    models: {},
    particles: [],
  },
  _params: {
    scale: 0.01, // 1pixel -> three.jsの単位
    fov: 40,    // camera field of view 単位ディグリー
    sec_object_to_remove_after_unseen: 1.0, // カメラの映る範囲から外れたときにオブジェクトが削除される猶予時間

    collider_margin: 0.0,

    // 画面更新の前回更新からの経過時間(デルタタイム)がここで指定された時間を超える場合には、
    // 物理世界の計算をその時は実行しない。なぜなら、デルタタイムが大きなときに物理演算を実行すると
    // 一度に大きな移動になって壁をすり抜けたりしてしまうから。
    // 主に、デルタタイムが大きくなる現象は、画面の非表示から表示に戻るとき。
    min_delta_without_updating: 1.0,
  },
  get_THREE: function () {
    return this._d3.THREE;
  },
  get_scene: function () {
    return this._d3.scene;
  },
  // view {type:model or sphere or box,
  //       sz: boxのサイズ,またはmodelのコリジョンサイズ,
  //       r: sphereのサイズ,またはmodelのコリジョンサイズ,
  //       color: box,sphereの色,
  //       opacity: 不透明度 (1 完全に不透明, 0 完全に透明) 指定しない場合は1
  // p: [x,y,z] 位置 単位ピクセル
  // r: [x,y,z] 向き 単位ピクセル
  // v: [x,y,z] 速度 単位ピクセル
  // angVel: [x,y,z] 各軸周りの回転速度 単位ピクセル
  // ani_no: アニメーションの番号
  // update: 作成されたオブジェクトの状態が更新されたときに呼ばれるコールバック関数
  createModelWithPhysics: async function ({
    view,
    mass,
    p,
    r,
    v,
    angVel,
    restitution,
    ani_no,
    attitude_control_values,
    userData,
    update
  }) {
    if (view?.type === undefined) {
      console.log(
        'WARNING type is undefined when calling createModelWithPhysics'
      )
      return
    }
    const THREE = this._d3.THREE;

    // const view_shape = await ({
    //     "model": async v => await this._load_model(v.url),
    //     "sphere": v => new THREE.Mesh(
    //         new THREE.SphereGeometry(v.r.px2world_r()),
    //         new THREE.MeshStandardMaterial({ color: v.color, transparent: v.opacity !== undefined, opacity: v.opacity ?? 1.0 })
    //     ),
    //     "box": v => new THREE.Mesh(
    //         new THREE.BoxGeometry(...v.sz.px2world_sz()),
    //         new THREE.MeshStandardMaterial({ color: v.color, transparent: v.opacity !== undefined, opacity: v.opacity ?? 1.0 })
    //     ),
    // })[view.type](view);
    const view_shape = await this.createModel({ view, p, r })

    p = new THREE.Vector3(...p.px2world_p())
    r = (r ?? [[1, 0, 0], 0]).reduce((axis, rad) =>
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...axis), rad)
    )
    const collision_shape = {
      sphere: v => {
        v.sz_scale1 = [v.r, v.r, v.r].px2world_sz()
        return new Ammo.btSphereShape(v.r.px2world_r())
      },
      box: v => {
        v.sz_scale1 = v.sz.px2world_sz()
        return new Ammo.btBoxShape(
          new Ammo.btVector3(...v.sz.px2world_sz().map(e => e * 0.5))
        )
      },
      cylinder: v => {
        v.sz_scale1 = v.sz.px2world_sz()
        // btCylinderShapeの引数は、底面、高さ、上辺？？の順かも。第3引数は中田の勘。
        // とりあえずthree.jsのcylinderの引数(底面、上面、高さ)と合わせるために、以下のようにしている。
        // https://simplestar.syuriken.jp/lesson/039_BulletPhysics3.html
        return new Ammo.btCylinderShape(
          new Ammo.btVector3(...[v.sz[0], v.sz[2], v.sz[1]].px2world_sz())
        )
      }
    }[view.type === 'model' ? view.model_collision_shape : view.type](view)
    // console.log(view.type, view);

    // three.jsの設定
    // if (view_shape !== undefined) {
    //     view_shape.position.copy(p);
    //     view_shape.quaternion.copy(r);
    //     this._d3.scene.add(view_shape);

    //     view_shape.ani_ctrl?.play_animation({ ani_no });
    // }

    // ammoの設定
    collision_shape.setMargin(this._params.collider_margin)
    const transform = new Ammo.btTransform()
    transform.setIdentity()
    transform.setOrigin(new Ammo.btVector3(p.x, p.y, p.z))
    transform.setRotation(new Ammo.btQuaternion(r.x, r.y, r.z, r.w))
    const motionState = new Ammo.btDefaultMotionState(transform)

    const localInertia = new Ammo.btVector3(0, 0, 0)
    collision_shape.calculateLocalInertia(mass, localInertia)

    const rbInfo = new Ammo.btRigidBodyConstructionInfo(
      mass,
      motionState,
      collision_shape,
      localInertia
    )
    const obj = new Ammo.btRigidBody(rbInfo)

    if (v) {
      obj.setLinearVelocity(new Ammo.btVector3(...v.px2world_dp()))
    }
    if (angVel) {
      obj.setAngularVelocity(new Ammo.btVector3(...angVel.px2world_dp()))
    }
    if (restitution) {
      obj.setRestitution(restitution)
    }

    if (mass > 0) {
      this._d3.rigidBodies.push(obj)

      //var STATE = {
      // ACTIVE : 1,
      // ISLAND_SLEEPING : 2,
      // WANTS_DEACTIVATION : 3,
      // DISABLE_DEACTIVATION : 4,
      // DISABLE_SIMULATION : 5
      // }
      // Disable deactivation
      obj.setActivationState(4)
    }
    this._d3.physicsWorld.addRigidBody(obj)

    // オブジェクトのcollisionオブジェクトのサイズ変更
    // スイカゲームで落とす前のオブジェクトが多人数プレイで複数個表示されるとき、
    // それらはその時点では衝突を回避したい。衝突を回避するために、
    // obj.getBroadphaseProxy().m_collisionFilterGroup,
    // obj.getBroadphaseProxy().m_collisionFilterMaskによって
    // 衝突を検知しないようにしようとしたが、同じcollisionFilterGroupに所属する
    // オブジェクトはマスクに関係なく衝突してしまう。よってスイカゲームで
    // 落とす前のオブジェクトをすべて異なるグループに属させる必要がある。
    // またsetCollisionFlags(2)というのも試す。
    // コリジョンを検出しないようにできるが、setCollisionFlags(0)で元に戻らない。
    // setActivationStateをしてみたりしたが、物理ワールドの中での動きをしてくれない。
    // そこで、collisionオブジェクトを入れ替える方法をこの関数で実装した。
    // 具体的な使い方は、通用通りrigidbodyを作成したら、
    // すぐにコリジョンオブジェクトを0のサイズに変更する。
    // この時にこの関数は初期時のコリジョンオブジェクトを
    // 保存しておく機能を用意しておく。そしてオブジェクトを落下させたときに、
    // この関数の引数(sz_or_r)を与えずに呼び出して、
    // コリジョンオブジェクトを復活させることにする。
    const set_collision_size = sz_or_r => {
      if (sz_or_r === undefined) {
        if (obj.userData._collisionShape !== undefined) {
          obj.setCollisionShape(obj.userData._collisionShape)
        }
      } else {
        obj.userData._collisionShape = obj.getCollisionShape()
        obj.setCollisionShape(
          Array.isArray(sz_or_r)
            ? new Ammo.btBoxShape(
              new Ammo.btVector3(...sz_or_r.px2world_sz().map(e => e * 0.5))
            )
            : new Ammo.btSphereShape(sz_or_r.px2world_r())
        )
      }
    }

    // オブジェクトの位置取得
    const get_pos = () => {
      obj.userData.temp_tf ??= new Ammo.btTransform()
      obj.getMotionState().getWorldTransform(obj.userData.temp_tf)
      const physical_p = obj.userData.temp_tf.getOrigin().toArray()
      const physical_r = obj.userData.temp_tf.getRotation()
      return {
        physical_p,
        p: physical_p.world2px_p(),
        r: [physical_r.getAxis().toArray(), physical_r.getAngle()]
      }
    }
    // オブジェクトの位置変更 p:canvasの位置, dp:canvasの相対位置, physical_p:3dの位置, d_phydical_p:3dの相対位置
    const set_pos = ({ p, dp, physical_p, d_physical_p, r }) => {
      if ([p, dp, physical_p, d_physical_p, r].every(e => e === undefined)) {
        console.log('WARNING set_pos parameter is not valied ', arguments)
        return
      }
      obj.userData.temp_tf ??= new Ammo.btTransform()
      obj.getMotionState().getWorldTransform(obj.userData.temp_tf)
      const p0 = obj.userData.temp_tf.getOrigin().toArray()
      const p1 =
        p?.px2world_p() ??
        dp?.px2world_dp().map((e, i) => e + p0[i]) ??
        physical_p ??
        d_physical_p?.map((e, i) => e + p0[i])
      obj.userData.temp_tf.setOrigin(new Ammo.btVector3(...p1))
      if (r !== undefined) {
        const quaternion = new Ammo.btQuaternion()
        quaternion.setRotation(new Ammo.btVector3(...r[0]), r[1])
        obj.userData.temp_tf.setRotation(quaternion)
        view_shape.quaternion.set(
          quaternion.x,
          quaternion.y,
          quaternion.z,
          quaternion.w
        )
      }
      obj.setWorldTransform(obj.userData.temp_tf)
      obj.getMotionState().setWorldTransform(obj.userData.temp_tf)
      obj.userData.transform_backup = obj.userData.temp_tf
      // view_shape.position.copy(new THREE.Vector3(...p1));
      view_shape.position.set(...p1)
    }
    const get_sz = () => {
      const s = obj
        .getCollisionShape()
        .getLocalScaling()
        .toArray()
        .map((e, i) => e * view.sz_scale1[i])
        .world2px_sz()
      return { s }
    }
    // オブジェクトのサイズ変更
    const set_sz = ({ s, ds }) => {
      if (s === undefined && ds === undefined) {
        return
      }
      const sz =
        s?.px2world_sz() ??
        [
          obj.getCollisionShape().getLocalScaling().toArray(),
          ds?.px2world_sz()
        ].reduce((a, e) => a.map((ei, i) => ei * view.sz_scale1[i] + e[i]))
      const scale = sz.map((e, i) => e / view.sz_scale1[i])

      obj.getCollisionShape().setLocalScaling(new Ammo.btVector3(...scale))
      view_shape.scale.copy(
        new THREE.Vector3(...scale.map(e => e * this._params.scale))
      )
    }
    // オブジェクトの速度取得
    const get_vel = () => {
      const physical_vel = obj.getLinearVelocity().toArray()
      return { physical_vel, vel: physical_vel.world2px_sz() }
    }
    const set_vel = vel => {
      // 未実装
    }

    // ピッキングの開始/停止
    /* 使っていないコードと思われるので一旦、コメントアウト
           2023.04.11 オブジェクトをつまみ上げる動作に問題が生じないなら、いずれ消す。
           2023.11.29時点でdoubutsu_tower.htmlで使われていることを確認して復活
        */
    const set_picking = enable => {
      if (enable) {
        obj.userData.temp_tf ??= new Ammo.btTransform()
        obj.getMotionState().getWorldTransform(obj.userData.temp_tf)
        obj.userData.transform_backup = obj.userData.temp_tf
        obj.userData.picking = true
      } else {
        obj.userData.transform_backup = undefined
        obj.userData.picking = false
      }
    }
    const attitude_control = (function () {
      let q1 = undefined
      let av1 = undefined
      let persist = undefined
      // {axis:Array(3),rad:float} 目標姿勢を表すクォータニオンのもとになるもの。
      //                           axis: クォータニオンの回転する軸
      //                           rad: 回転角度、単位ラジアン
      // av1:Array(3) 目標の角速度
      const set = ({ axis, rad }, a, p = true) => {
        q1 = new THREE.Quaternion()
        q1.setFromAxisAngle(new THREE.Vector3(...axis), rad)
        av1 = a
        persist = p
        // Object.assign(obj.userData.attitude_values, { q1, av1, persist });
      }
      const get = () => ({ q1, av1, persist })
      return { set, get }
    })()
    if (attitude_control_values) {
      attitude_control.set(
        attitude_control_values.q1,
        attitude_control_values.av1,
        attitude_control_values.persist
      )
    }

    // particles
    let particle_system = undefined
    const add_particles = async params => {
      if (particle_system === undefined) {
        particle_system = await import('./ParticleSystem.js')
        particle_system.ParticleSystem.set_texture_folder(
          'suika_assets/images/'
        )
      }
      this._d3.particles.push(
        particle_system.getParticleSystem({
          camera: this._d3.camera,
          emitter: obj.userData.objThree,
          parent: this._d3.scene,
          ...params
        })
      )
    }

    // Three.jsのMesh, Ammo.jsのbtRigidBodyに付けるユーザデータは、生成はここだけで行う。
    // ここ以外にuserDataに新たな項目を付け加えるところが見つかったら、ここに移動する。
    Object.assign(view_shape.userData, { set_pos, set_sz, rigidBody: obj })
    obj.userData = Object.assign(userData ?? {}, {
      objThree: view_shape,
      update,
      view,
      mass,
      picking: false,
      outof_frustum_sec: 0,
      set_collision_size,
      set_pos,
      set_sz,
      get_pos,
      get_sz,
      get_vel,
      set_vel,
      set_picking,
      set_attitude_control: attitude_control.set,
      get_attitude_control: attitude_control.get,
      add_particles,
      collided_rigidBodies: []
    })
    // console.log("created", obj);
    return obj
  },
  deleteModelWithPhysics: function (obj) {
    this._d3.scene.remove(obj.userData.objThree)
    this._d3.physicsWorld.removeRigidBody(obj)
    this._d3.rigidBodies = this._d3.rigidBodies.filter(e => e != obj)
  },
  _model_clone: function (source) {
    const parallelTraverse = function (a, b, callback) {
      callback(a, b)
      for (let i = 0; i < a.children.length; i++) {
        parallelTraverse(a.children[i], b.children[i], callback)
      }
    }
    const sourceLookup = new Map()
    const cloneLookup = new Map()
    const clone = source.clone()
    parallelTraverse(source, clone, function (sourceNode, clonedNode) {
      sourceLookup.set(clonedNode, sourceNode)
      cloneLookup.set(sourceNode, clonedNode)
    })
    clone.traverse(function (node) {
      if (!node.isSkinnedMesh) return
      const clonedMesh = node
      const sourceMesh = sourceLookup.get(node)
      const sourceBones = sourceMesh.skeleton.bones
      clonedMesh.skeleton = sourceMesh.skeleton.clone()
      clonedMesh.bindMatrix.copy(sourceMesh.bindMatrix)
      clonedMesh.skeleton.bones = sourceBones.map(function (bone) {
        return cloneLookup.get(bone)
      })
      clonedMesh.bind(clonedMesh.skeleton, clonedMesh.bindMatrix)
    })
    if (source.ani_ctrl?.anis !== undefined) {
      this._add_ani_ctrl(clone, source.ani_ctrl.anis)
    }
    return clone
  },
  // Three.jsのモデルだけを作成する。
  createModel: async function ({ view, p, r, ani_no }) {
    const THREE = this._d3.THREE
    const view_shape = await {
      model: async v => await this._load_model(v.url),
      sphere: v =>
        new THREE.Mesh(
          new THREE.SphereGeometry(v.r.px2world_r()),
          new THREE.MeshStandardMaterial({
            color: v.color,
            transparent: v.opacity !== undefined,
            opacity: v.opacity ?? 1.0
          })
        ),
      box: v =>
        new THREE.Mesh(
          new THREE.BoxGeometry(...v.sz.px2world_sz()),
          new THREE.MeshStandardMaterial({
            color: v.color,
            transparent: v.opacity !== undefined,
            opacity: v.opacity ?? 1.0
          })
        ),
      cylinder: v =>
        new THREE.Mesh(
          // new THREE.CylinderGeometry(...v.sz.px2world_sz()),
          new THREE.CylinderGeometry(...v.sz.px2world_sz()),
          // new THREE.MeshBasicMaterial({
          new THREE.MeshStandardMaterial({
            ...{
              color: v.color,
              transparent: true,
              opacity: v.opacity
            },
            ...(v.texture === undefined
              ? {}
              : {
                map: new THREE.TextureLoader().load(v.texture)
              })
          })
        )
    }[view.type](view)

    p = new THREE.Vector3(...p.px2world_p())
    view_shape.position.copy(p)
    r = (r ?? [[1, 0, 0], 0]).reduce((axis, rad) =>
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...axis), rad)
    )
    view_shape.quaternion.copy(r)
    view_shape.ani_ctrol?.play_animation({ ani_no })

    view_shape.userData = {
      set_pos: ({ p, dp, physical_p, d_physical_p, r }) => {
        if (r !== undefined) {
          view_shape.quaternion.copy(
            r.reduce((axis, rad) =>
              new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(...axis),
                rad
              )
            )
          )
        }
        const p0 = view_shape.position.toArray()
        const p1 =
          p?.px2world_p() ??
          dp?.px2world_dp().map((e, i) => e + p0[i]) ??
          physical_p ??
          d_physical_p?.map((e, i) => e + p0[i])
        view_shape.position.set(...p1)
      },
      get_pos: () => {
        const physical_p = view_shape.position.toArray()
        const p = physical_p.world2px_p()

        const axis = new THREE.Vector3()
        const angle = 2 * Math.acos(view_shape.quaternion.w)
        const s = Math.sqrt(
          1 - view_shape.quaternion.w * view_shape.quaternion.w
        )
        if (s < 0.0001) {
          axis.set(1, 0, 0)
        } else {
          axis.set(
            view_shape.quaternion.x / s,
            view_shape.quaternion.y / s,
            view_shape.quaternion.z / s,
          )
        }
        const r = [axis, angle];
        return { physical_p, p, r }

        // obj.userData.temp_tf ??= new Ammo.btTransform();
        // obj.getMotionState().getWorldTransform(obj.userData.temp_tf);
        // const physical_p = obj.userData.temp_tf.getOrigin().toArray();
        // const physical_r = obj.userData.temp_tf.getRotation();
        // return { physical_p, p: physical_p.world2px_p(), r: [physical_r.getAxis().toArray(), physical_r.getAngle()] };
      },
      set_sz: ({ s, ds }) => {
        const sz =
          s?.px2world_sz() ??
          [
            obj.getCollisionShape().getLocalScaling().toArray(),
            ds?.px2world_sz()
          ].reduce((a, e) => a.map((ei, i) => ei * view.sz_scale1[i] + e[i]))
        const scale = sz.map((e, i) => e / view.sz_scale1[i])
        view_shape.scale.copy(
          new THREE.Vector3(...scale.map(e => e * this._params.scale))
        )
      },
      get_sz: () => {
        return view.sz
      }
    }

    this._d3.scene.add(view_shape)
    return view_shape
  },
  deleteModel: function (obj) {
    this._d3.scene.remove(obj)
  },
  _add_ani_ctrl: function (obj, anis) {
    obj.ani_ctrl = {
      anis,
      acts: [], // datum json is {name:string,action:AnimationAction}
      mix: new this._d3.THREE.AnimationMixer(obj),
      current_ani_no: -1,
      play_animation: function ({ name, ani_no }) {
        if (name === undefined && ani_no === undefined) {
          return
        }
        this.current_ani_no =
          ani_no ?? this.acts.findIndex(e => e.name === name)
        this.acts.forEach(
          (e, i) => (e.blending = this.current_ani_no === i ? 0.5 : -0.5)
        )
      },
      get_current_animation: function () {
        return this.current_ani_no
      },
      get_current_animation_name: function () {
        return this.anis[this.get_current_animation()].name
      },
      blend: function (delta_time_s) {
        this.acts
          .filter(e => e.blending !== 0)
          .forEach(e => {
            e.action.weight += e.blending * delta_time_s
            if (e.action.weight > 1.0 || e.action.weight < 0.0) {
              e.action.weight = e.action.weight > 0 ? 1.0 : 0.0
              e.blending = 0.0
            }
          })
      }
    }
    obj.ani_ctrl.anis.forEach(e => {
      obj.ani_ctrl.acts.push({
        name: e.name,
        action: [
          obj.ani_ctrl.mix.clipAction(e),
          e => (e.weight = 0.0),
          e => e.play()
        ].a2e(),
        blending: 0
      })
    })
    return obj
  },
  _load_model: async function (url) {
    const { THREE, GLTFLoader } = this._d3
    const key = url.split('?')[0]
    const ext = /(?:\.([^.]+))?$/.exec(key)?.[1] ?? ''
    this._d3.models[key] ??= await (async () => {
      return new Promise((resolve, _) => {
        ; ({
          json: () => {
            new THREE.ObjectLoader().load(url, obj => {
              obj = this._add_ani_ctrl(
                obj.children[0],
                obj.children[0].animations
              )
              resolve(obj)
            })
          },
          glb: () => {
            const path = /(.*)\/.*$/.exec(key)?.[1] + '/' ?? '/'
            const filename = key.replace(path, '')
            new GLTFLoader().setPath(path).load(filename, obj => {
              resolve(obj.scene)
            })
          }
        }[ext]())
      })
    })()
    return this._model_clone(this._d3.models[key])
  },
  init: async function (threejs_path, options = {}) {
    const { log, params } = options
    Object.assign(this._params, params)
      // 配列の最初でオブジェクトを作成して、そのあとの関数で値をセットする。
      // Array.prototype.a2e = function () { return this.reduce((e, f) => { f(e); return e; }); }
      ;[Array, 'a2e'].reduce((a, e) => {
        a.prototype[e] = function () {
          return this.reduce((e, f) => {
            f(e)
            return e
          })
        }
        Object.defineProperty(a.prototype, e, { enumerable: false })
      })
      // 配列から1つをランダムに選択する。
      // Array.prototype.choice = function () { return this[Math.floor(this.length * Math.random())]; };
      ;[Array, 'choice'].reduce((a, e) => {
        a.prototype[e] = function () {
          return this[Math.floor(this.length * Math.random())]
        }
        Object.defineProperty(a.prototype, e, { enumerable: false })
      })

    // 2度目のinitの抑制と、importmapを使ったときに古いブラウザでimport関数でGLTFLoaderが読めないため予めimport文でthree.js関連を初期化したあとでこのinit関数を呼び出すときのため。
    if (this._d3.THREE !== undefined) {
      return
    }

    threejs_path += threejs_path.endsWith('/') ? '' : '/'
    // ammo.wasm.jsはmoduleではないので、scriptタグを動的にhtmlに埋め込む方法で読み込む。
    await this._load_script(`${threejs_path}examples/jsm/libs/ammo.wasm.js`)

    // three.jsはmodule化しているのでimportで読み込む。上の2文はimportmapを前提としていない。古いiphoneで動作しない。
    // this._d3.THREE = await import(`./${threejs_path}build/three.module.js`);
    // this._d3.GLTFLoader = (await import(`./${threejs_path}examples/jsm/loaders/GLTFLoader.js`)).GLTFLoader;
    this._d3.THREE = await import('three')
    this._d3.GLTFLoader = (
      await import('three/addons/loaders/GLTFLoader.js')
    ).GLTFLoader

    // WebGPURendererのテスト、元はWebGLRenderer
    // this._d3.WebGPURenderer = (await import(`./${threejs_path}examples/jsm/renderers/webgpu/WebGPURenderer.js`)).default;
    // console.log(this._d3.WebGPURenderer)
  },
  init_canvas: async function (ref_rect_elem, options = {}) {
    // console.log(options)
    if (this._d3.renderer !== undefined) {
      return
    }
    const THREE = this._d3.THREE
    let rect = ref_rect_elem.getBoundingClientRect()
    // test WebGPURenderer
    // this._d3.renderer = new this._d3.WebGPURenderer({ alpha: true, preserveDrawingBuffer: true, antialias: true });
    this._d3.renderer = new THREE.WebGLRenderer({
      alpha: true,
      preserveDrawingBuffer: true,
      antialias: true
    })
    this._d3.renderer.setPixelRatio(window.devicePixelRatio)
    this._d3.renderer.domElement.style.position = 'absolute'
    this._d3.renderer.domElement.style.top = rect.top + 'px'
    this._d3.renderer.domElement.style.left = rect.left + 'px'
    this._d3.renderer.domElement.style.zIndex = 10
    this._d3.renderer.domElement.style.pointerEvents = 'none' // マウスイベント等を処理しない
    const set_renderer_canvas_size = () => {
      this._d3.renderer.setSize(rect.width, rect.height)
    }
    set_renderer_canvas_size()
    document.body.appendChild(this._d3.renderer.domElement)

    const scale = this._params.scale;
    [Array, 'px2world_p'].reduce((a, e) => {
      a.prototype[e] = function () { return this.map((e, i) => (i === 1 ? rect.height - e : e) * scale) }
      Object.defineProperty(a.prototype, e, { enumerable: false })
    });
    [Array, 'world2px_p'].reduce((a, e) => {
      a.prototype[e] = function () { return this.map((e, i) => { e /= scale; return i === 1 ? rect.height - e : e }) }
      Object.defineProperty(a.prototype, e, { enumerable: false })
    });
    [Array, 'px2world_dp'].reduce((a, e) => {
      a.prototype[e] = function () { return this.map((e, i) => (i === 1 ? -e : e) * scale) }
      Object.defineProperty(a.prototype, e, { enumerable: false })
    });
    [Array, 'world2px_dp'].reduce((a, e) => {
      a.prototype[e] = function () { return this.map((e, i) => { e /= scale; return i === 1 ? -e : e }) }
      Object.defineProperty(a.prototype, e, { enumerable: false })
    });
    [Array, 'px2world_sz'].reduce((a, e) => {
      a.prototype[e] = function () { return this.map(e => e * scale) }
      Object.defineProperty(a.prototype, e, { enumerable: false })
    });
    [Array, 'world2px_sz'].reduce((a, e) => {
      a.prototype[e] = function () { return this.map(e => e / scale) }
      Object.defineProperty(a.prototype, e, { enumerable: false })
    });
    [Number, 'px2world_r'].reduce((a, e) => {
      a.prototype[e] = function () { return this * scale }
      Object.defineProperty(a.prototype, e, { enumerable: false })
    });
    [Number, 'world2px_r'].reduce((a, e) => {
      a.prototype[e] = function () { return this / scale }
      Object.defineProperty(a.prototype, e, { enumerable: false })
    })

    this._d3.camera = new THREE.PerspectiveCamera(
      this._params.fov,
      1,
      this._params.scale / 10,
      this._params.scale * 10000
    )
    this._d3.camera.up = new THREE.Vector3(0, 1, 0)
    this._d3.frustum = new THREE.Frustum()

    const set_camera_default_position = () => {
      this._d3.camera.aspect = rect.width / rect.height
      const rect2 = ['width', 'height'].reduce((a, e) => ({ ...a, [e]: rect[e] * this._params.scale }), {})
      const ct = [rect2.width / 2, rect2.height / 2]
      this._d3.camera.userData.position = [
        ...ct,
        rect2.height / (2 * Math.tan((this._params.fov * Math.PI) / (2 * 180)))
      ];
      this._d3.camera.position.set(...this._d3.camera.userData.position)
      this._d3.camera.userData.lookAt = [...ct, 0]
      this._d3.camera.userData.angle = 0
      this._d3.camera.lookAt(new THREE.Vector3(...this._d3.camera.userData.lookAt))
      this._d3.camera.updateProjectionMatrix()
      this._d3.frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(
        this._d3.camera.projectionMatrix,
        this._d3.camera.matrixWorldInverse
      ))
    }
    set_camera_default_position();

    // resize: suikaゲームでiphone: safariでアドレスバーが表示/非表示したときに発火して動作が変になるので、いったんコメントアウト
    // 2024.01.07
    // window.onresize = () => {
    //     rect = ref_rect_elem.getBoundingClientRect();
    //     set_renderer_canvas_size();
    //     set_camera_default_position();
    // }
    // monaco editor版にしてとりあえず復活、ただしiphoneでは試していない
    (new ResizeObserver(() => {
      rect = ref_rect_elem.getBoundingClientRect();
      set_renderer_canvas_size();
      set_camera_default_position();
    })).observe(ref_rect_elem);

    this._d3.set_camera_default_position = set_camera_default_position

    this._d3.scene = new THREE.Scene()
    this._d3.clock = new THREE.Clock()

    // debug
    this._d3.scene.add(new THREE.AmbientLight(0xffffff, 2.0));
    // this._d3.scene.add([
    //     new THREE.DirectionalLight(0xffffff, 1.0),
    //     e => e.position.set(1, 0.5, 1),
    // ].a2e());

    // debug
    // console.log(rect)
    // console.log(this.get_ThreeJS_scale())
    // [
    //     [[0, 0, 1], 0xff0000],
    //     [[this.get_ThreeJS_scale() * rect.width / 2, this.get_ThreeJS_scale() * rect.height / 2, 1], 0x00ff00]
    // ].forEach(([pos, color]) => {
    //     this._d3.scene.add([
    //         new THREE.Mesh(
    //             new THREE.BoxGeometry(1, 1, 1),
    //             new THREE.MeshBasicMaterial({ color })
    //         ),
    //         e => e.position.set(...pos),
    //     ].a2e());
    // });
    this._d3.scene.add([
      new THREE.PointLight(0xffffff, 10, 100),
      e => e.position.set(
        (this.get_ThreeJS_scale() * rect.width) / 2,
        (this.get_ThreeJS_scale() * rect.height) / 2,
        0
      )
    ].a2e());


    if (options.background !== undefined) {
      if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(options.background)) {
        this._d3.scene.background = new THREE.Color(options.background)
      } else {
        this._d3.scene.background = new THREE.TextureLoader().load(
          options.background
        )
      }
    }
    // this._d3.scene.background = new THREE.Color(0xf00000);
    // console.log(this._d3.scene.background);

    const init_physicsWorld = () => {
      // btVector3からjavascriptのリストに変換する関数の登録
      Ammo.btVector3.prototype.toArray = function () {
        return [this.x(), this.y(), this.z()]
      }

      const collisionConfiguration = new Ammo.btDefaultCollisionConfiguration()

      // test softbody
      // const collisionConfiguration = new Ammo.btSoftBodyRigidBodyCollisionConfiguration();

      const dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration)
      const broadphase = new Ammo.btDbvtBroadphase()
      const solver = new Ammo.btSequentialImpulseConstraintSolver()

      this._d3.physicsWorld = new Ammo.btDiscreteDynamicsWorld(
        dispatcher,
        broadphase,
        solver,
        collisionConfiguration
      )

      // test softbody
      // const softBodySolver = new Ammo.btDefaultSoftBodySolver();
      // this._d3.physicsWorld = new Ammo.btSoftRigidDynamicsWorld( dispatcher, broadphase, solver, collisionConfiguration, softBodySolver );

      this._d3.physicsWorld.setGravity(
        new Ammo.btVector3(...(options.gravity ?? [0, -9.8, 0]))
      )

      // collision detection 使わない？ 2023.12.9
      // const contact_cb = new Ammo.ConcreteContactResultCallback();
      // contact_cb.addSingleResult = (cp, obj0, obj1, idx0, idx1) => {
      //     console.log("collision");
      //     return 0;
      // };
      // this._d3.physicsWorld.setContactAddedCallback(contact_cb);
      // console.log("collision set")
    }

    // const smokeInstancedSprite = new THREE.Mesh(new THREE.PlaneGeometry(10, 10),
    //     new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide }));
    // this._d3.scene.add(smokeInstancedSprite);

    return new Promise((resolve, _) => {
      Ammo().then(async AmmoLib => {
        Ammo = AmmoLib
        init_physicsWorld()
        if (options.picking === true) {
          this._picking.picking_update = options.picking_update
          await this._set_pointer_event(
            document.body,
            options.picking_hammerjs_filename
          )
        }
        resolve()
      })
    })
  },
  _update_physics: function (delta, elapsed_time, update_physics) {
    if (delta === undefined || this._d3.physicsWorld === undefined) {
      return
    }
    const THREE = this._d3.THREE
    if (update_physics) {
      // delta: 物理世界が進行する時間(秒)、指定しないとデフォルト(fixedTimeStep=1/60)となる。
      // debug - デフォルト
      //   this._d3.physicsWorld.stepSimulation(delta, 10, 1 / 60)
      // debug - 高精度
      // this._d3.physicsWorld.stepSimulation(delta, 120, 1 / 600);
      this._d3.physicsWorld.stepSimulation(delta, 20, 1 / 120);
    }
    this._d3.rigidBodies
      .filter(
        e =>
          e.userData.picking === true &&
          e.userData.transform_backup !== undefined
      )
      .forEach(e => {
        e.setWorldTransform(e.userData.transform_backup)
        e.getMotionState().setWorldTransform(e.userData.transform_backup)
        e.setLinearVelocity(new Ammo.btVector3(0, 0, 0))
        e.setAngularVelocity(new Ammo.btVector3(0, 0, 0))
      })
    this._d3.particles = this._d3.particles.filter(e => !e.is_completed())
    this._d3.particles.forEach(e => e.update(delta))

    const phys2tree_vector3 = vec =>
      new THREE.Vector3(vec.x(), vec.y(), vec.z())
    const phys2tree_quaternion = q =>
      new THREE.Quaternion(q.x(), q.y(), q.z(), q.w())
    const tree2phys_vector3 = vec => new Ammo.btVector3(vec.x, vec.y, vec.z)
    const tree2phys_quaternion = q => new Ammo.btQuaternion(q.x, q.y, q.z, q.w)

    // collision
    this._d3.rigidBodies.forEach(e => (e.userData.collided_rigidBodies = []))
    const dispatcher = this._d3.physicsWorld.getDispatcher()
    const numManifolds = dispatcher.getNumManifolds()
    for (const i of [...Array(numManifolds).keys()]) {
      const contactManifold = dispatcher.getManifoldByIndexInternal(i)
      const rbs = [contactManifold.getBody0(), contactManifold.getBody1()].map(
        e => Ammo.castObject(e, Ammo.btRigidBody)
      )

      // console.log(rbs[0].userData.get_pos())

      rbs.forEach((e, i) =>
        e.userData.collided_rigidBodies.push(rbs[(i + 1) % 2])
      )
    }

    this._d3.rigidBodies.forEach(obj => {
      obj.userData.temp_tf ??= new Ammo.btTransform()
      obj.getMotionState().getWorldTransform(obj.userData.temp_tf)
      const p_phys = phys2tree_vector3(obj.userData.temp_tf.getOrigin())
      obj.userData.outof_frustum_sec = this._d3.frustum.containsPoint(p_phys)
        ? 0
        : obj.userData.outof_frustum_sec + delta
      const p_view = p_phys.clone()

      const q = phys2tree_quaternion(obj.userData.temp_tf.getRotation())

      // 昔のコード、何に使っていたのかよく思い出せないけどたぶん、
      // threeの方のオブジェクトを移動してammoの方をあとから移動する？
      // const p_view_0 = p_view.clone();
      // const q_0 = q.clone();
      // obj.userData.update?.(obj);
      // if (p_view_0.equals(p_view) === false || q_0.equals(q) === false) {
      //     p_phys.copy(p_view.clone());
      //     transformAux1.setOrigin(tree2phys_vector3(p_phys));
      //     transformAux1.setRotation(tree2phys_quaternion(q));
      //     objPhys.setWorldTransform(transformAux1);
      //     ms.setWorldTransform(transformAux1);
      // }

      const objThree = obj.userData.objThree
      objThree?.position.set(p_view.x, p_view.y, p_view.z)
      objThree?.quaternion.set(q.x, q.y, q.z, q.w)

      // 姿勢制御
      if (objThree !== undefined) {
        this._attitude_control.control(obj)
      }

      obj.userData.update?.call(obj, {
        obj,
        delta,
        elapsed_time,
        removed: false
      })
    })

    this._d3.rigidBodies
      .filter(
        obj =>
          obj.userData.outof_frustum_sec >
          this._params.sec_object_to_remove_after_unseen
      )
      .forEach(obj => {
        obj.userData.update?.call(obj, {
          obj,
          delta,
          elapsed_time,
          removed: true
        })
        this.deleteModelWithPhysics(obj)
      })
  },
  get_camera_pos: function () {
    return this._d3.camera.position.toArray().world2px_p()
  },
  set_camera_pos: function ({ p, dp }) {
    if (p === undefined && dp === undefined) {
      return this._d3.set_camera_default_position()
    }
    const pos =
      p ??
      ['x', 'y', 'z']
        .map(e => this._d3.camera.position[e])
        .world2px_p()
        .map((e, i) => e + dp[i])
    this._d3.camera.position.set(...pos.px2world_p())
    this._d3.camera.updateProjectionMatrix()
    this._d3.frustum.setFromProjectionMatrix(
      new this._d3.THREE.Matrix4().multiplyMatrices(
        this._d3.camera.projectionMatrix,
        this._d3.camera.matrixWorldInverse
      )
    )
  },
  get_camera_direction: function () {
    const direction = new this._d3.THREE.Vector3()
    this._d3.camera.getWorldDirection(direction)
    return direction.toArray()
  },
  // 回転行列を指定したカメラの回転
  rotate_camera: function (rmatrix) {
    const THREE = this._d3.THREE
    // 回転の中心はカメラが見ている箇所とする。
    const p0 = this._d3.camera.userData.lookAt
    // 回転の中心(カメラが見ている箇所)を原点に移動する。
    const translationMatrix = new THREE.Matrix4().makeTranslation(
      ...p0.map(e => -e)
    )
    // 移動を戻す行列
    const reverseTranslationMatrix = new THREE.Matrix4().makeTranslation(...p0)

    // 変換行列の結合
    const transformMatrix = reverseTranslationMatrix.multiply(
      rmatrix.multiply(translationMatrix)
    )

    // 変換
    const result = new THREE.Vector3(
      ...this._d3.camera.userData.position
    ).applyMatrix4(transformMatrix)

    // 位置の変更
    this._d3.camera.position.copy(result)
    // 見ている方向は変わらず
    this._d3.camera.lookAt(
      new THREE.Vector3(...this._d3.camera.userData.lookAt)
    )

    this._d3.camera.updateProjectionMatrix()
    this._d3.frustum.setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(
        this._d3.camera.projectionMatrix,
        this._d3.camera.matrixWorldInverse
      )
    )
  },
  // euler [x,y,z]: 各軸の回転角(ラジアン), 回転の順序はxyzでyzは回転後の軸となる。
  rotate_camera_from_euler: function (euler) {
    if (euler === undefined) {
      return this._d3.set_camera_default_position()
    }
    const rotationMatrix = new this._d3.THREE.Matrix4().makeRotationFromEuler(
      new this._d3.THREE.Euler(...euler)
    )
    return this.rotate_camera(rotationMatrix)
  },
  // 指定された軸の周りにangle(ラジアン)だけ回転する。
  rotate_camera_from_axis: function (axis, { a, da }) {
    if (a === undefined && da === undefined) {
      return this._d3.set_camera_default_position()
    }
    const angle = (a ?? this._d3.camera.userData.angle) + (da ?? 0)
    // 現在の角度を保存
    this._d3.camera.userData.angle = angle
    // 回転行列
    const rotationMatrix = new this._d3.THREE.Matrix4().makeRotationAxis(
      new this._d3.THREE.Vector3(...axis).normalize(),
      angle
    )
    return this.rotate_camera(rotationMatrix)
  },
  get_domElement: function () {
    return this._d3.renderer?.domElement
  },
  // 1pixel -> three.jsの単位
  get_ThreeJS_scale: function () {
    return this._params.scale
  },
  render: function (update_physics = true) {
    if (this._d3.renderer === undefined) {
      return
    }
    const delta = this._d3.clock.getDelta()
    if (delta > this._params.min_delta_without_updating) {
      return
    }
    const elapsed_time = this._d3.clock.getElapsedTime()
    this._update_physics(delta, elapsed_time, update_physics)
    this._d3.renderer?.render(this._d3.scene, this._d3.camera)
    this._d3.rigidBodies.forEach(e => {
      e.userData.objThree.ani_ctrl?.blend(delta)
      e.userData.objThree.ani_ctrl?.mix.update(delta)
    })
  },
  _load_script: function (fname) {
    return new Promise((resolve, reject) => {
      const sc = document.createElement('script')
      sc.type = 'text/javascript'
      sc.src = fname
      sc.onload = () => resolve()
      sc.onerror = e => reject(e)
      const s = document.getElementsByTagName('script')[0]
      s.parentNode.insertBefore(sc, s)
    })
  },

  // objectのピッキングを管理する
  // pointerのイベントを受け取ってpickingの開始、終了などを処理する。
  _picking: {
    // picking target object :Ammo.btRigidBody
    target: undefined,
    // tapした位置とtargetの中心位置との差分 :Array[3]
    d_physical_p: undefined,
    // tapした位置 :THREE.Vector2
    pointer_scene: undefined,
    // raycaster object :THREE.Raycaster
    raycaster: undefined,
    // picking状態のコールバック関数
    picking_update: undefined,

    start: function (hm_ev, _d3) {
      // this <- _picking
      this.pointer_scene.x = (hm_ev.center.x * 2) / window.innerWidth - 1
      this.pointer_scene.y = -((hm_ev.center.y * 2) / window.innerHeight) + 1
      this.raycaster.setFromCamera(this.pointer_scene, _d3.camera)

      const intersectObject = this.raycaster.intersectObjects(
        _d3.scene.children
      )[0]
      if (intersectObject === undefined) {
        this.target = undefined
      } else {
        const target = (obj => {
          while (
            obj.userData.rigidBody === undefined &&
            obj.parent !== undefined
          ) {
            obj = obj.parent
          }
          return obj.userData.rigidBody
        })(intersectObject.object)

        target.userData.picking = true
        target.userData.transform_backup = undefined

        this.d_physical_p = target.userData.objThree.position
          .clone()
          .sub(intersectObject.point)
          .toArray()
        this.d_physical_p[2] = 0
        this.target = target
      }
      if (this.target) {
        hm_ev.srcEvent.stopPropagation()
        hm_ev.preventDefault()

        this.picking_update?.({
          obj: this.target,
          type: 'started'
        })
      }
    },
    move: function (hm_ev) {
      this.target?.userData.set_pos({ p: [hm_ev.center.x, hm_ev.center.y, 0] })
      this.target?.userData.set_pos({ d_physical_p: this.d_physical_p })
    },
    end: function () {
      if (this.target) {
        this.picking_update?.({
          obj: this.target,
          type: 'ended'
        })
        this.target.userData.picking = false
        this.target.userData.transform_backup = undefined
        this.target = undefined
      }
    }
  },
  _set_pointer_event: async function (elem, hammerjs_filename) {
    this._picking.pointer_scene = new this._d3.THREE.Vector2()
    this._picking.raycaster = new this._d3.THREE.Raycaster()

    await this._load_script(hammerjs_filename ?? './libs/hammer.min.js')
    const hammer = new Hammer(elem)
    hammer.get('pan').set({ direction: Hammer.DIRECTION_ALL })

    // new Hammerをするとテキスト選択ができなくなる。
    // それを回避するために以下を呼び出す
    // 2025.08.12
    document.body.style.userSelect = 'auto';

    const handlers = {
      tap: ev => {
        this._picking.end(ev)
      },
      'hammer.input': ev => {
        if (ev.srcEvent.type !== 'pointerdown') {
          return;
        }
        this._picking.start(ev, this._d3)
      },
      panmove: ev => {
        this._picking.move(ev)
      },
      panend: ev => {
        this._picking.end(ev)
      }
    }
    Object.keys(handlers).forEach(e => hammer.on(e, handlers[e]))

const iframe = document.querySelector("iframe");
iframe.addEventListener("load",()=>{
  const hammer2 = new Hammer(document.querySelector("iframe").contentDocument);
  hammer2.get("pan").set({ direction: Hammer.DIRECTION_ALL })
  Object.keys(handlers).forEach(e => hammer2.on(e, handlers[e]))
})

  },

  // 姿勢制御
  _attitude_control: {
    params: {
      kp: 0.05, // 係数P
      kd: 0.005, // 係数D
      allowable_error_rad: 0.0873 // 0.0873 (約5度) 未満になると制御終了とする。
    },
    control: function (obj) {
      const attitude_values = obj.userData.get_attitude_control?.()

      if (
        [
          attitude_values?.q1,
          attitude_values?.av1,
          attitude_values?.persist
        ].some(e => e === undefined)
      ) {
        return
      }
      const q1 = new Canvas3D._d3.THREE.Quaternion().copy(attitude_values.q1)
      const av1 = attitude_values.av1
      const persist = attitude_values.persist

      const av0 = obj.getAngularVelocity()
      // const av1 = [0, 0, 0];
      const d_av = ['x', 'y', 'z'].map((e, i) => av1[i] - av0[e]())
      // console.log(`d_av:${d_av}`);

      // 現在の姿勢
      const q0 = new Canvas3D._d3.THREE.Quaternion()
      obj.userData.objThree.getWorldQuaternion(q0)

      // 物理演算の前に見た目(Three.js上)で姿勢が戻せるかを試す。Quaternionバージョン
      // const q1 = new THREE.Quaternion();
      // q1.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)
      const d_q = q1.multiply(q0.invert())

      // 回転させたい軸と角度（ラジアン）を求める。
      // http://gamemakerlearning.blog.fc2.com/blog-entry-205.html
      const rad = Math.acos(d_q.w)
      if (Math.abs(rad) < this.params.allowable_error_rad) {
        if (persist === false) {
          obj.userData.attitude_values.q1 = undefined
          obj.userData.attitude_values.av1 = undefined
          obj.userData.attitude_values.persist = undefined
        }
        return
      }
      // console.log(rad);
      const sn = Math.sin(rad)
      // [x,y,z]で表された回転軸のx,y,zの絶対値の大きな軸から順に回転させるオイラー角を作成する。
      const q_axis = ['x', 'y', 'z']
        .map(e => [d_q[e] / sn, e])
        .sort((e0, e1) => Math.abs(e1[0]) - Math.abs(e0[0]))
        .map(e => e[1])
        .join('')
        .toUpperCase()
      // console.log(q_axis);

      // 現在の姿勢をEulerで表現する。
      const d_eu = new Canvas3D._d3.THREE.Euler().setFromQuaternion(d_q, q_axis)
      const d_e = ['_x', '_y', '_z'].map(e => d_eu[e])
      // console.log(`d_e:${d_e}`);

      // PD制御 d_eがP(位置), d_avがD(速度)に相当する。それぞれに掛ける係数が制御パラメータとなる。
      const torque = [...Array(3).keys()].map(
        i => d_e[i] * this.params.kp + d_av[i] * this.params.kd
      )
      // console.log(torque);
      obj.applyTorqueImpulse(new Ammo.btVector3(...torque))

      // 制御は継続
      return
    }
  }
}
