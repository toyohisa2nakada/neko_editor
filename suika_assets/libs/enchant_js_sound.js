export const sounds = {
    // _sounds_path: "./suika_assets/",
    // _sounds_files: [
    //     "sound_000_koka.mp3",
    //     "sound_001_papa.mp3",
    //     "",
    //     "",
    // ],
    _inited: false,
    _sound_inf: {},
    init: async function (sound_infs, enchantjs_filename) {
        enchantjs_filename ??= "./suika_assets/libs/enchant.js";
        await this.load_script(enchantjs_filename);
        enchant();


        for (const inf of sound_infs) {
            const sounds = [];
            const promises = [];
            for (const _ of [...Array(8).keys()]) {
                promises.push(new Promise((resolve, reject) => {
                    sounds.push(Sound.load(inf.file, "audio/mpeg", () => {
                        resolve();
                    }));
                }))
            }
            await Promise.all(promises);
            this._sound_inf[inf.id] = { sounds, index: 0 };
        };
        // 少し待たないと、enchant.jsの中でnullエラーになる。
        // await (async () => new Promise((r, _) => setTimeout(r, 400)))();
        this._inited = true;
    },
    play: function (idx) {
        if (this._inited === false) {
            return;
        }
        const inf = this._sound_inf[idx];
        if (inf !== undefined) {
            inf.sounds[inf.index % inf.sounds.length].play();
            inf.index += 1;
        }
    },
    load_script: function (fname) {
        return new Promise((resolve, reject) => {
            const sc = document.createElement("script");
            sc.type = "text/javascript";
            sc.src = fname;
            sc.onload = () => resolve();
            sc.onerror = (e) => reject(e);
            const s = document.getElementsByTagName("script")[0];
            s.parentNode.insertBefore(sc, s);
        });
    },
};
