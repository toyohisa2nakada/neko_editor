const css_strings = `
    .dropdown {
        position: relative;
        display: inline-block;
        width: 80px;
        font-size: x-small;
    }
    .toggle {
        border: 1px solid #aaa;
        padding: 0px;
        cursor: pointer;
        background: #fff;
        line-height: 1.5;
        height: 1.5em;
    }
    .menu {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        width: 160px;
        border: 1px solid #aaa;
        background: #fff;
        display: none;
        margin-top: 2px;
        border-radius: 6px;
        max-height: 200px;
        overflow: visible;
        z-index: 100;
    }
    .menu.show {
        display: block;
    }
    .menu .item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 8px;
        cursor: pointer;
    }
    .menu .item:hover {
        background: #f0f0f0;
    }
    .menu .actions button {
        margin-left: 1px;
        font-size: 12px;
        border: none;
        padding: 0;
        background: #fff;
        position: relative;
    }
    .menu .actions .entrypoint.active {
        background-color: #0078d7;
    }
    .menu .actions button .popup {
        display: none;
        bottom: 100%;
        position: absolute;
        overflow: visible;
        white-space: nowrap;
        z-index: 101;
    }
    .menu .actions button:hover .popup{
        display: block;
    }
`;
const html_strings = `
    <div class="dropdown" id="combo">
        <div class="toggle" id="selected"></div>
        <div class="menu" id="menu">
            <div class="item add">＋ 新規作成</div>
            <hr>
        </div>
    </div>
`;
const item_strings = (id, name, entrypoint) => `
    <div class="item" data-value="${id}">
        <span>${name}</span>
        <span class="actions">
            <button class="rename">✏️<div class="popup">名前の変更</div></button>
            <button class="delete">🗑️<div class="popup">削除</div></button>
            <button class="entrypoint ${entrypoint}">🚩<div class="popup">このファイルを常に実行します</div></button>
        </span>
    </div>
`;


export const combobox = {
    _build_style: () => {
        const style = document.createElement('style');
        style.textContent = css_strings;
        document.head.appendChild(style);
    },
    _build_html: (parent_elem) => {
        const doc = (new DOMParser()).parseFromString(html_strings, 'text/html');
        parent_elem.appendChild(doc.body.firstElementChild);
    },
    _elems: {
        combo: undefined,
        toggle: undefined,
        menu: undefined,
    },
    _items: {
    },
    _selected_item_id: undefined,
    _listeners_array: {
    },

    // アイテムの新規追加、ライブラリ外部からと内部から呼ばれる可能性がある。
    add_item: function ({ id, name, entrypoint }) {
        this._items[id] = { name };
        const doc = (new DOMParser()).parseFromString(item_strings(id, name, entrypoint ? 'active' : ''), 'text/html');
        this._elems.menu.appendChild(doc.body.firstElementChild);
    },
    // 選択アイテムのセット、id===undefinedのとき、無選択
    set_item: function ({ id }) {
        this._selected_item_id = id;
        this._elems.toggle.textContent = this._items[this._selected_item_id]?.name ?? "";
    },
    // 現在選択中のアイテムの取得
    get_item: function () {
        return this._selected_item_id;
    },
    // アイテムの削除
    remove_item: function ({ id, item }) {
        // console.log(`.item[data-value="${id}"`)
        item ??= this._elems.menu.querySelector(`.item[data-value="${id}"]`);
        item.remove();
        delete this._items[id];
    },
    // combobox内の新規作成、名前変更、削除のイベントリスナ
    addEventListener: function (ev_name, cb) {
        const listeners = this._listeners_array[ev_name] ?? [];
        listeners.push(cb);
        this._listeners_array[ev_name] = listeners;
    },
    // entrypointに指定したファイルがあれば、それを返します
    // get_entrypoint: function () {
    //     const item = this._elems.menu.querySelector(".entrypoint.active")?.closet(".item")
    //     console.log(item)
    //     return null;
    // },
    inject: function (parent_elem) {
        this._build_style();
        this._build_html(parent_elem);

        this._elems.combo = document.querySelector("#combo");
        this._elems.toggle = this._elems.combo.querySelector("#selected");
        this._elems.menu = this._elems.combo.querySelector("#menu");

        this._elems.toggle.addEventListener("click", () => {
            this._elems.menu.classList.toggle("show");
        });

        this._elems.menu.addEventListener("click", (e) => {
            const item = e.target.closest(".item");
            if (!item) return;
            e.stopPropagation();

            if (e.target.classList.contains("add")) {
                this._listeners_array.added?.forEach(e => e());
                this._elems.menu.classList.remove("show");
            } else if (e.target.classList.contains("rename")) {
                const span = item.querySelector("span");
                const newName = prompt("新しい名前:", span.textContent);
                if (newName) {
                    this._items[item.dataset.value].name = newName;
                    span.textContent = newName;
                    if (this._selected_item_id === item.dataset.value) {
                        this.set_item({ id: this._selected_item_id })
                    }
                    this._listeners_array.renamed?.forEach(e => e({ id: item.dataset.value, name: newName }));
                }
            } else if (e.target.classList.contains("delete")) {
                const span = item.querySelector("span");
                if (confirm(`${span.textContent} を削除しますか？`)) {
                    this.remove_item({ id: item.dataset.value, item })
                    this._listeners_array.deleted?.forEach(e => e({ id: item.dataset.value }));
                }
            } else if (e.target.classList.contains("entrypoint")) {
                if (e.target.classList.contains("active") === false) {
                    this._elems.menu.querySelectorAll(".entrypoint.active").forEach(e => {
                        e.classList.remove("active");
                        const item = e.closest('.item');
                        this._listeners_array.entrypoint?.forEach(e => e({ id: item.dataset.value, status: false }));
                    })
                }
                const status = e.target.classList.toggle("active");
                this._listeners_array.entrypoint?.forEach(e => e({ id: item.dataset.value, status }));
            } else {
                // 通常選択
                this.set_item({ id: item.dataset.value });
                this._listeners_array.selected?.forEach(e => e({ id: item.dataset.value }));
                this._elems.menu.classList.remove("show");
            }
        });

        // メニュー外クリックで閉じる
        document.addEventListener("click", (e) => {
            if (!this._elems.combo.contains(e.target)) {
                // console.log("メニュー外クリックでメニュー消去", e.target)
                this._elems.menu.classList.remove("show");
            }
        });

    }
}
