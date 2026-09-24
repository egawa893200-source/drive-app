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

  // 時間処理
  MAX_DT: 0.05,
  MAX_DPR: 2,

  // おわり
  END_MINUTES_OPTIONS: [5, 10, 0],  // 0 = なし
  END_SUNSET_SEC: 30,

  // 路面の描画(段階1で追加)
  CENTER_LINE_RATIO: 0.035,    // センターラインの太さ(道幅の半分に対する比)
};
