/*

const { getParticleSystem } = await import("./getParticleSystem.js");
const fire_effect = getParticleSystem({
        camera,
        emitter,
        parent: scene,
        rate: 50.0,
        duration: 2.0,
        texture: './fire.png',
});
let prev_tm = performance.now();
const render = (tm)=>{
    const dt = tm - prev_tm;
    fire_effect.update(dt/1000)
    ...
    prev_tm = tm;
}
requestAnimationFrame(render);


参考: UnityのParticleSystem
https://docs.unity3d.com/ja/2022.3/Manual/ParticleSystemModules.html


original:
 https://www.youtube.com/watch?app=desktop&v=h1UQdbuF204
 https://github.com/bobbyroe/Simple-Particle-Effects

*/


import * as THREE from 'three';

const _VS = `
uniform float pointMultiplier;

attribute float size;
attribute float angle;
attribute vec4 aColor;

varying vec4 vColor;
varying vec2 vAngle;

// 法線ベクトル
varying vec3 vNormal;
// 位置
varying vec3 vPosition;

void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

    // 法線と3次元の位置
    vNormal = normalize(normalMatrix * normal);
    vPosition = vec3(mvPosition);

    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = size * pointMultiplier / gl_Position.w;

    vAngle = vec2(cos(angle), sin(angle));
    vColor = aColor;
}`;

const _FS = `
uniform sampler2D diffuseTexture;
// camera position
uniform vec3 camera_position;
// 法線の3次元位置
varying vec3 vNormal;
varying vec3 vPosition;

varying vec4 vColor;
varying vec2 vAngle;

void main() {
    // テクスチャからの色
    vec2 coords = (gl_PointCoord - 0.5) * mat2(vAngle.x, vAngle.y, -vAngle.y, vAngle.x) + 0.5;
    vec4 baseColor = texture2D(diffuseTexture, coords) * vColor;
    gl_FragColor = baseColor;

    /*
    // 法線と視点の方向を正規化
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(camera_position - vPosition);

    // 照明の方向
    vec3 lightDirection = normalize(vec3(1.0, 1.0, 1.0));
    // float diff = max(dot(normal, lightDirection), 0.0);
    float diff = 1.0;

    // 反射ベクトル
    vec3 reflectDir = reflect(-lightDirection, normal);
    // ハイライトの強さ
    float spec = pow(max(dot(viewDir, reflectDir), 0.0), 2.0);

    // 金属の色
    vec3 metalColor = vec3(1.0, 1.0, 1.0);
    // vec3 metalColor = vec3(0.2, 0.2, 0.2);
    // 反射と拡散を加算
    vec3 finalColor = (baseColor.rgb * diff * metalColor + spec * vec3(1.0));

    // gl_FragColor = vec4(finalColor, baseColor.a);
    */
}`;


const _VS1 = `
attribute float size;
attribute vec4 aColor;
varying vec4 vColor;
void main() {
        vColor = aColor;
        vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
        gl_PointSize = size * ( 300.0 / -mvPosition.z );
        gl_Position = projectionMatrix * mvPosition;
}`;
const _FS1 = `
uniform sampler2D pointTexture;
varying vec4 vColor;
void main() {
        gl_FragColor = vColor;
        gl_FragColor = gl_FragColor * texture2D( pointTexture, gl_PointCoord );
}`;

[Array, "choice"].reduce((a, e) => {
    a.prototype[e] = function () { return this[Math.floor(this.length * Math.random())]; };
    Object.defineProperty(a.prototype, e, { enumerable: false });
});

function getLinearSpline({ lerp, value }) {
    if (value !== undefined) {
        return { getValueAt: t => value };
    }

    const points = [];
    const _lerp = lerp;

    function addPoint(t, d) {
        points.push([t, d]);
    }

    function getValueAt(t) {
        let p1 = 0;

        for (let i = 0; i < points.length; i++) {
            if (points[i][0] >= t) {
                break;
            }
            p1 = i;
        }

        const p2 = Math.min(points.length - 1, p1 + 1);

        if (p1 == p2) {
            return points[p1][1];
        }

        return _lerp(
            (t - points[p1][0]) / (
                points[p2][0] - points[p1][0]),
            points[p1][1], points[p2][1]);
    }
    return { addPoint, getValueAt };
}

const ParticleSystem = {
    _texture_folder: "/",
    set_texture_folder: function (folder) {
        this._texture_folder = folder + (folder.endsWith("/") ? "" : "/");
    },
    get_texture_folder: function () {
        return this._texture_folder;
    },
    status: {
        WAITING_FIRST_PARTICLE: 0,
        RUNNING: 1,
        EMIT_COMPLETE: 2,
        COMPLETED: 3,
    },
    type: {
        FIRE: {
            rate: 30,
            duration: 0.9,
            texture_file: "fire.png",
            blending: THREE.AdditiveBlending,
            splines: {
                alpha: [[0.0, 0.0], [0.6, 1.0], [1.0, 0.0]],
                color: [[0.0, new THREE.Color(0xFFFFFF)], [1.0, new THREE.Color(0xff8080)]],
                size: [[0.0, 0.0], [1.0, 1.0]],
            },
        },
        SMOKE: {
            rate: 30,
            duration: 0.9,
            texture_file: "smoke.png",
            blending: THREE.AdditiveBlending,
            splines: {
                alpha: [[0.0, 0.0], [0.6, 1.0], [1.0, 0.0]],
                color: [[0.0, new THREE.Color(0xFFFFFF)], [1.0, new THREE.Color(0xff8080)]],
                size: [[0.0, 0.0], [1.0, 1.0]],
            },
        },
        CONFETTI: {
            rate: 10,
            duration: 0.8,
            // duration: 5,
            texture_file: "star.png",
            blending: THREE.NormalBlending,
            splines: {
                alpha: [[0.0, 0.0], [0.6, 1.0], [1.0, 0.0]],
            },
            init: {
                color: [
                    0xFF5733, // 鮮やかな赤
                    0x33FF57, // 明るい緑
                    0x3357FF, // 深い青
                    0xFFFF33, // 明るい黄色
                    0xFF33A1  // パステルピンク
                ],
                size: 0.5,
            },
        },
    },
}

function getParticleSystem(params) {
    const { rate, duration, texture_file, blending, splines, init } = ParticleSystem.type[params.type];
    const { camera, emitter, parent, radius = 0.1, } = params;
    Object.assign(init, params.init);

    const texture = ParticleSystem.get_texture_folder() + texture_file;
    const uniforms = {
        diffuseTexture: { value: new THREE.TextureLoader().load(texture) },
        pointMultiplier: { value: window.innerHeight / (2.0 * Math.tan(30.0 * Math.PI / 180.0)) },
        // camera position
        camera_position: { value: camera.position },
    };
    const _material = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: _VS,
        fragmentShader: _FS,
        blending,
        depthTest: true,
        depthWrite: false,
        transparent: true,
        vertexColors: false,
    });

    let _particles = [];
    let _status = ParticleSystem.status.WAITING_FIRST_PARTICLE;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
    geometry.setAttribute('size', new THREE.Float32BufferAttribute([], 1));
    geometry.setAttribute('aColor', new THREE.Float32BufferAttribute([], 4));
    geometry.setAttribute('angle', new THREE.Float32BufferAttribute([], 1));

    const _points = new THREE.Points(geometry, _material);

    // const alphaSpline = undefined;
    const alphaSpline = splines.alpha === undefined ? getLinearSpline({ value: 1.0 }) :
        [
            getLinearSpline({ lerp: (t, p0, p1) => p0 + t * (p1 - p0) }),
            e => splines.alpha.forEach(ee => e.addPoint(...ee)),
        ].a2e();

    const colorSpline = splines.color === undefined ? undefined :
        [
            getLinearSpline({ lerp: (t, p0, p1) => { const c = p0.clone(); return c.lerp(p1, t); } }),
            e => splines.color.forEach(ee => e.addPoint(...ee)),
        ].a2e();

    const sizeSpline = splines.size === undefined ? getLinearSpline({ value: 1.0 }) :
        [
            getLinearSpline({ lerp: (t, a, b) => a + t * (b - a) }),
            e => splines.size.forEach(ee => e.addPoint(...ee)),
        ].a2e();

    const maxLife = 1.5;
    const maxSize = 3.0;
    let gdfsghk = 0.0;
    let [duration0, duration1] = [duration, 0];
    function _RemoveParticleObject() {
        parent.remove(_points);
        _status = ParticleSystem.status.COMPLETED;
    }
    function _AddParticles(timeElapsed) {
        duration1 += timeElapsed;
        // 指定時間を超える、または、エミッターのオブジェクトが消去されたら、パーティクルの作成は終わる。
        if (duration1 > duration0 || !parent.children.some(e => e === emitter)) {
            _status = ParticleSystem.status.EMIT_COMPLETE;
            return;
        }
        gdfsghk += timeElapsed;
        const n = Math.floor(gdfsghk * rate);
        gdfsghk -= n / rate;
        for (let i = 0; i < n; i += 1) {
            const life = (Math.random() * 0.75 + 0.25) * maxLife;
            _particles.push({
                position: new THREE.Vector3(
                    (Math.random() * 2 - 1) * radius,
                    (Math.random() * 2 - 1) * radius,
                    (Math.random() * 2 - 1) * radius).add(emitter.position),
                size: init?.size ?? (Math.random() * 0.5 + 0.5) * maxSize,
                color: new THREE.Color(init?.color?.choice() ?? 0xffffff),
                alpha: 1.0,
                life: life,
                maxLife: life,
                rotation: Math.random() * 2.0 * Math.PI,
                rotationRate: Math.random() * 0.01 - 0.005,
                // rotation: 0,
                // rotationRate: Math.PI / 2,

                velocity: new THREE.Vector3(0, 1.5, 0),
                // velocity: new THREE.Vector3(2, 0, 0),
            });
        }

        // 最初にパーティクルが0の状態で実行すると、後からパーティクルを追加しても表示されません。この現象は、カメラの角度を変えると起こらなくなりますが、原因は不明です。回避策として、初めてパーティクルを追加する際に、THREE.Pointsオブジェクトをシーンに追加することにします。シーンから削除する際には、追加していなくてもエラーにはならないので、その点は気にしなくて大丈夫です。
        if (_status === ParticleSystem.status.WAITING_FIRST_PARTICLE && _particles.length !== 0) {
            _status = ParticleSystem.status.RUNNING;
            parent.add(_points);
        }
    }
    function _UpdateParticles(timeElapsed) {
        for (let p of _particles) {
            p.life -= timeElapsed;
        }

        _particles = _particles.filter(p => {
            return p.life > 0.0;
        });
        if (_status === ParticleSystem.status.EMIT_COMPLETE && _particles.length === 0) {
            _RemoveParticleObject();
        }

        for (let p of _particles) {
            const t = 1.0 - p.life / p.maxLife;
            p.rotation += p.rotationRate;
            p.alpha = alphaSpline?.getValueAt(t) ?? 1.0;
            p.currentSize = p.size * sizeSpline.getValueAt(t);
            if (colorSpline !== undefined) {
                p.color.copy(colorSpline.getValueAt(t));
            }

            p.position.add(p.velocity.clone().multiplyScalar(timeElapsed));

            const drag = p.velocity.clone();
            drag.multiplyScalar(timeElapsed * 0.1);
            drag.x = Math.sign(p.velocity.x) * Math.min(Math.abs(drag.x), Math.abs(p.velocity.x));
            drag.y = Math.sign(p.velocity.y) * Math.min(Math.abs(drag.y), Math.abs(p.velocity.y));
            drag.z = Math.sign(p.velocity.z) * Math.min(Math.abs(drag.z), Math.abs(p.velocity.z));
            p.velocity.sub(drag);
        }

        _particles.sort((a, b) => {
            const d1 = camera.position.distanceTo(a.position);
            const d2 = camera.position.distanceTo(b.position);

            if (d1 > d2) {
                return -1;
            }
            if (d1 < d2) {
                return 1;
            }
            return 0;
        });
    }

    function _UpdateGeometry() {
        const positions = [];
        const sizes = [];
        const colors = [];
        const angles = [];

        for (let p of _particles) {
            positions.push(p.position.x, p.position.y, p.position.z);
            colors.push(p.color.r, p.color.g, p.color.b, p.alpha);
            // if (Math.random() < 0.9) {
            //     colors.push(1, 1, 1, p.alpha)
            // } else {
            //     colors.push(p.color.r, p.color.g, p.color.b, p.alpha);
            // }
            sizes.push(p.currentSize);
            angles.push(p.rotation);
        }

        geometry.setAttribute(
            'position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute(
            'size', new THREE.Float32BufferAttribute(sizes, 1));
        geometry.setAttribute(
            'aColor', new THREE.Float32BufferAttribute(colors, 4));
        geometry.setAttribute(
            'angle', new THREE.Float32BufferAttribute(angles, 1));

        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.size.needsUpdate = true;
        geometry.attributes.aColor.needsUpdate = true;
        geometry.attributes.angle.needsUpdate = true;
    }
    _UpdateGeometry();


    function update(timeElapsed) {
        _AddParticles(timeElapsed);
        _UpdateParticles(timeElapsed);
        _UpdateGeometry();
    }
    function status() {
        return _status;
    }
    function is_completed() {
        return status() === ParticleSystem.status.COMPLETED;
    }
    return { update, status, is_completed };
}

export { getParticleSystem, ParticleSystem };
