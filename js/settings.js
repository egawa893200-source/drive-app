// 大人向け設定(DESIGN.md 14章)。値の保存と、オーバーレイの開閉。
// 保存は localStorage。読めなければ初期値で動く(iOSのPWAは7日使わないと消える)。

const KEY = 'driveapp.settings.v1';

// 初期値は DESIGN.md 14章の表の太字
const SCHEMA = {
  sound: { values: ['on', 'off'], def: 'on' },
  speed: { values: ['slow', 'normal'], def: 'normal' },
  obstacles: { values: ['on', 'off'], def: 'on' },
  sensitivity: { values: ['low', 'mid', 'high'], def: 'mid' },
  carColor: { values: ['red', 'blue', 'yellow', 'white'], def: 'red' },
  endMinutes: { values: ['5', '10', '0'], def: '5' },
  debug: { values: ['off', 'on'], def: 'off' },
};

function defaults() {
  const v = {};
  for (const [key, spec] of Object.entries(SCHEMA)) v[key] = spec.def;
  return v;
}

function load() {
  const v = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return v;
    const saved = JSON.parse(raw);
    for (const [key, spec] of Object.entries(SCHEMA)) {
      if (spec.values.includes(saved[key])) v[key] = saved[key];
    }
  } catch (e) {
    // 読めないときは初期値のまま
  }
  return v;
}

function save(v) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch (e) {
    // 保存できなくても遊べる
  }
}

// onChange(key, value) は値が変わるたびに呼ばれる。
// onCalibrate は「傾きをリセット」。設定以外のデータは保存しない(DESIGN.md 18章)
export function createSettings(root, { onChange, onCalibrate }) {
  const values = load();
  const rows = root.querySelectorAll('.row[data-key]');

  function paint() {
    for (const row of rows) {
      const key = row.dataset.key;
      for (const button of row.querySelectorAll('button[data-value]')) {
        button.classList.toggle('on', button.dataset.value === values[key]);
      }
    }
  }

  function set(key, value) {
    if (!SCHEMA[key] || !SCHEMA[key].values.includes(value)) return;
    if (values[key] === value) return;
    values[key] = value;
    save(values);
    paint();
    onChange(key, value);
  }

  for (const row of rows) {
    const key = row.dataset.key;
    for (const button of row.querySelectorAll('button[data-value]')) {
      button.addEventListener('click', () => set(key, button.dataset.value));
    }
  }

  root.querySelector('#calibrateButton').addEventListener('click', () => onCalibrate());
  root.querySelector('#closeSettings').addEventListener('click', () => close());

  function open() {
    paint();
    root.hidden = false;
  }

  function close() {
    root.hidden = true;
  }

  // 起動時に、保存されている値をすべて反映させる
  function applyAll() {
    for (const key of Object.keys(SCHEMA)) onChange(key, values[key]);
  }

  paint();

  return {
    open,
    close,
    applyAll,
    get isOpen() { return !root.hidden; },
    get values() { return values; },
  };
}
