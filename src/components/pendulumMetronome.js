/**
 * Canvas を用いた振り子型（ペンデュラム）アナログメトロノーム描画コンポーネント
 * スケジュールされた拍のタイムスタンプと同期し、コサイン波で滑らかな物理挙動をシミュレートします。
 */
export class PendulumMetronome {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    
    // 拍のスケジュールタイミング同期用の状態
    this.lastBeatTime = 0;
    this.nextBeatTime = 0;
    this.beatDuration = 0.5; // BPM 120の時の1拍の時間 (秒)
    this.direction = 1;      // 1: 右方向へスイング, -1: 左方向へスイング
    
    this.maxAngle = 0.42;    // 最大振れ幅 (ラジアン, 約24度)
    this.currentAngle = 0;   // 現在の振り子の角度
    
    this.resize();
  }

  /**
   * Canvasのサイズを親要素に合わせてリサイズ
   */
  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.width = rect.width;
    // 縦横比を保ちつつ、無駄な余白が出ないように設定
    this.height = Math.min(rect.height, rect.width * 1.05);
    
    this.canvas.width = this.width * window.devicePixelRatio;
    this.canvas.height = this.height * window.devicePixelRatio;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  /**
   * スケジューラー側で拍が登録されたタイミングで呼び出し、同期点を登録
   * @param {number} beatNumber 
   * @param {number} time 
   * @param {number} bpm 
   */
  registerBeat(beatNumber, time, bpm) {
    this.beatDuration = 60.0 / bpm;
    // 直前の拍の時間と、次の拍の予定時間を登録
    this.lastBeatTime = time - this.beatDuration;
    this.nextBeatTime = time;
    // 拍ごとに方向を反転させる (偶数拍は右、奇数拍は左へ端に到達)
    this.direction = beatNumber % 2 === 0 ? 1 : -1;
  }

  /**
   * メトロノーム全体の描画処理
   * @param {number} currentTime (audioContext.currentTime)
   * @param {number} bpm 
   * @param {boolean} isPlaying 
   */
  draw(currentTime, bpm, isPlaying) {
    const ctx = this.ctx;
    const width = this.width;
    const height = this.height;
    
    ctx.clearRect(0, 0, width, height);
    
    // 1. 振り子バーの角度を計算
    if (isPlaying && this.nextBeatTime > 0) {
      const duration = this.nextBeatTime - this.lastBeatTime;
      let progress = (currentTime - this.lastBeatTime) / duration;
      
      // 描画タイミングの微細なはみ出しをクランプ
      if (progress < 0) progress = 0;
      if (progress > 1) progress = 1;
      
      // コサイン波を用いて物理的な振り子の加減速運動をシミュレート
      // (中央を通過するときに最速になり、両端で一瞬静止して音がトリガーされる)
      const angleMultiplier = -Math.cos(progress * Math.PI); // -1 (左端) 〜 1 (右端)
      this.currentAngle = this.direction * this.maxAngle * angleMultiplier;
    } else {
      // 停止時はバーがスムーズに中央（直立）へ戻るようにイージングをかける
      this.currentAngle = this.currentAngle * 0.85;
      if (Math.abs(this.currentAngle) < 0.001) this.currentAngle = 0;
    }
    
    const centerX = width / 2;
    const centerY = height * 0.84;        // 支点のY位置
    const bodyTopY = height * 0.16;       // メトロノーム頭頂部のY位置
    const bodyBottomY = height * 0.88;    // 底辺のY位置
    const bodyWidthTop = width * 0.14;    // 頭頂部の幅
    const bodyWidthBottom = width * 0.54; // 底面の幅
    
    // 2. 木製クラシック台形ボディの描画
    ctx.beginPath();
    ctx.moveTo(centerX - bodyWidthTop / 2, bodyTopY);
    ctx.lineTo(centerX + bodyWidthTop / 2, bodyTopY);
    ctx.lineTo(centerX + bodyWidthBottom / 2, bodyBottomY);
    ctx.lineTo(centerX - bodyWidthBottom / 2, bodyBottomY);
    ctx.closePath();
    
    // ディープネイビーとウッドの深みをブレンドした3次元グラデーション
    const bodyGrad = ctx.createLinearGradient(centerX - bodyWidthBottom/2, 0, centerX + bodyWidthBottom/2, 0);
    bodyGrad.addColorStop(0, '#070b13');
    bodyGrad.addColorStop(0.25, '#101929');
    bodyGrad.addColorStop(0.5, '#19273f');
    bodyGrad.addColorStop(0.75, '#101929');
    bodyGrad.addColorStop(1, '#070b13');
    ctx.fillStyle = bodyGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.35)'; // ゴールドの枠線でプレミアム感を演出
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // 3. 中央の金属製目盛り板の描画
    const plateWidthTop = width * 0.08;
    const plateWidthBottom = width * 0.26;
    const plateTopY = height * 0.24;
    const plateBottomY = height * 0.78;
    
    ctx.beginPath();
    ctx.moveTo(centerX - plateWidthTop / 2, plateTopY);
    ctx.lineTo(centerX + plateWidthTop / 2, plateTopY);
    ctx.lineTo(centerX + plateWidthBottom / 2, plateBottomY);
    ctx.lineTo(centerX - plateWidthBottom / 2, plateBottomY);
    ctx.closePath();
    ctx.fillStyle = '#080d17';
    ctx.fill();
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // テンポ目盛り線の描画
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let y = plateTopY + 12; y < plateBottomY - 8; y += 12) {
      const w = ((y - plateTopY) / (plateBottomY - plateTopY)) * (plateWidthBottom - plateWidthTop) + plateWidthTop;
      ctx.beginPath();
      ctx.moveTo(centerX - w / 2 + 4, y);
      ctx.lineTo(centerX + w / 2 - 4, y);
      ctx.stroke();
    }
    
    // 4. 振り子の金属バーの描画
    const rodLength = height * 0.62; // バーの全長
    const rodEndX = centerX + rodLength * Math.sin(this.currentAngle);
    const rodEndY = centerY - rodLength * Math.cos(this.currentAngle);
    
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(rodEndX, rodEndY);
    ctx.strokeStyle = 'var(--color-theme)'; // ゴールド
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.stroke();
    
    // 5. 遊錘 (スライディングウェイト) の描画
    // 遊錘の支点からの距離は、テンポ (BPM) が遅いほど上部へ、速いほど下部へ移動します (物理再現)
    // 40 BPM (上部) 〜 250 BPM (下部)
    const bpmRatio = (bpm - 40) / (250 - 40);
    const weightDistance = height * 0.18 + (1 - bpmRatio) * (height * 0.38);
    
    const weightX = centerX + weightDistance * Math.sin(this.currentAngle);
    const weightY = centerY - weightDistance * Math.cos(this.currentAngle);
    
    ctx.save();
    ctx.translate(weightX, weightY);
    ctx.rotate(this.currentAngle);
    
    // 台形の金属製ウェイトを描画
    ctx.beginPath();
    ctx.moveTo(-9, 10);
    ctx.lineTo(9, 10);
    ctx.lineTo(6.5, -8);
    ctx.lineTo(-6.5, -8);
    ctx.closePath();
    ctx.fillStyle = '#f1f5f9'; // シャープなシルバーの遊錘
    ctx.fill();
    ctx.strokeStyle = 'var(--color-theme)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    
    // 遊錘中央のシャフト通し溝
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(0, 10);
    ctx.strokeStyle = '#080d17';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    
    ctx.restore();
    
    // 6. 支点の金属カバーの描画
    ctx.beginPath();
    ctx.arc(centerX, centerY, 7.5, 0, 2 * Math.PI);
    ctx.fillStyle = '#b5952b';
    ctx.fill();
    ctx.strokeStyle = 'var(--color-theme)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
