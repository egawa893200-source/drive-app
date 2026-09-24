// 調整値はすべてここに集める(DESIGN.md 4章)。コード中に数値を直書きしない。
export const CFG = {
  // 道路
  ROAD_HALF_WIDTH: 2000,
  SEGMENT_LENGTH: 200,
  DRAW_DISTANCE: 200,          // 描く区間数
  CAMERA_HEIGHT: 1000,
  FOV_DEG: 100,
  HORIZON_RATIO: 0.45,         // 地平線の画面上の位置(上からの比率)
  RUMBLE_SEGMENTS: 3,          // 路面の縞1本あたりの区間数
  SPEED: { slow: 2400, normal: 3600 },   // ワールド単位/秒

  // 自車
  CAR_SCREEN_Y_RATIO: 0.80,    // 自車の下端の画面上の位置
  CAR_WIDTH_RATIO: 0.18,       // 自車の幅(画面の短辺比)
  CAR_HITBOX_HALF: 0.18,       // 道路座標での当たり判定の半幅
  CAR_X_LIMIT: 0.8,            // 自車が動ける範囲
  ROLL_MAX_DEG: 8,

  // 操作
  // 段階4: 25 -> 40 -> 60 でもまだ敏感だったので 80 まで広げた。
  // 端まで行くのに必要な傾きは 29度(25+4) から 84度(80+4) になる
  STEER_RANGE_DEG: 80,
  STEER_DEADZONE_DEG: 4,
  STEER_SIGN: 1,               // 実機で逆に動いたら -1
  STEER_SENSITIVITY: { low: 0.7, mid: 1.0, high: 1.4 },
  // 段階4: 1.2 では傾けたときに横へ流れるのが速く、敏感に感じたので 0.8 にした
  LATERAL_SPEED: 0.8,          // 道路座標/秒
  // 段階4: 0.2 -> 0.35。目標へゆっくり寄せて、動きを落ち着かせる
  FOLLOW_TAU: 0.35,            // 追従の時定数(秒)
  // 段階4: 0.08 -> 0.25。子どもが持つと手が細かく動き、それがそのまま
  // 操作に出て「敏感すぎる」感じになるため、平滑化を強めた
  GRAVITY_LPF_TAU: 0.25,       // 加速度センサーの平滑化(秒)
  TOUCH_RAMP_TAU: 0.15,

  // 障害物
  OBSTACLE_INTERVAL: [8, 12],  // 秒
  OBSTACLE_LEAD_TIME: 4,       // 出現してから自車に届くまで(秒)
  OBSTACLE_X: 0.28,            // 置く位置(±)。中央の車と少しだけ重なる
  OBSTACLE_HITBOX_HALF: 0.15,  // 見た目の70%
  OBSTACLE_FADE_IN: 0.5,

  // 場面
  SCENE_DURATION: 60,
  SCENE_BLEND: 30,

  // 画面の向き(段階8)。iOS Safari は向きを固定できないので、縦持ちのときは
  // 描画そのものを回して横画面にする(DESIGN.md 6章)。
  // 実機で上下が逆に見えたら -90 にする
  CANVAS_ROTATION: 90,

  // クラクションへの反応(段階9、DESIGN.md 20章)
  REACT_SEGMENTS: 60,          // 前方で反応する区間数。60区間 = 12000(約3秒先まで)
  REACT_FLY_SEC: 1.6,          // 鳥が飛び去るまで
  REACT_LOOK_SEC: 1.8,         // 動物がこちらを向いている時間
  REACT_SWAY_SEC: 1.2,         // 木や草がゆれて止まるまで
  REACT_SWAY_DEG: 10,          // ゆれの大きさ(度)。7度だと遠くの木で数pxしか動かず気づけない
  REACT_CHIRP_GAP_SEC: 1.2,    // 鳴き声を続けて鳴らさない間隔

  // 踏切(段階10、DESIGN.md 21章)。時間はどれも「踏切に着く何秒前か」
  CROSSING_FIRST_SEC: 20,      // 走りはじめてから最初の踏切を探しはじめるまで
  CROSSING_INTERVAL: 45,       // 踏切を通り過ぎてから、次を探しはじめるまで
  // 電車は目の前を通す。遠くから走ってきて、着く直前に道を横切る。
  // 動いている時間を長くとるほど、横切る速さがゆっくりになる。
  // TRAIN_AT は描画距離(200区間)の内側に収まる値にすること(ふつうの速さで 10.8秒まで)
  CROSSING_BELL_AT: 9.0,       // カンカンが鳴りはじめる
  CROSSING_TRAIN_AT: 8.5,      // 電車が画面の外で動きだす
  CROSSING_CLEAR_AT: 0.7,      // 電車の最後尾が道から出る。カンカンもここで止む
  CROSSING_BELL_INTERVAL: 0.45, // カンカンの間隔

  // 時間処理
  MAX_DT: 0.05,
  MAX_DPR: 2,

  // おわり
  END_MINUTES_OPTIONS: [5, 10, 0],  // 0 = なし
  END_SUNSET_SEC: 30,
  // 段階8: 車庫が見えてから入るまでの秒数。描画距離(DRAW_DISTANCE区間 = 40000)の
  // 内側に収まる値にすること。速いほうの速度でも 3600*8 = 28800 で収まる
  END_GARAGE_LEAD_SEC: 8,
  END_FADE_SEC: 3,                  // 車庫に入ってから暗くなりきるまでの秒数

  // 路面の描画(段階1で追加)
  CENTER_LINE_RATIO: 0.035,    // センターラインの太さ(道幅の半分に対する比)
};
