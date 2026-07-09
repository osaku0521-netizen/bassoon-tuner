/**
 * HTML5 Canvas を使用した高精度で美しいアナログ風メーター
 */
export class AnalogMeter {
  /**
   * @param {HTMLCanvasElement} canvas 
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    
    // アニメーション用の状態管理
    this.targetCents = -50;
    this.currentCents = -50;
    this.isTuning = false;
    
    // スタイリングカラー (HSLによるモダンなネオンパレット)
    this.colors = {
      bg: '#121824',          // ディープダーク背景
      tickNormal: '#334155',  // 通常の目盛り
      tickAccent: '#64748b',  // 5セントごとの目盛り
      tickCenter: '#10b981',  // ジャスト(0セント)のネオンエメラルド
      needle: '#ef4444',      // 針のネオンレッド
      needleHub: '#f8fafc',   // 針の中心軸
      text: '#94a3b8',        // テキスト
      glowOk: 'rgba(16, 185, 129, 0.4)', // ピッチが合っている時のグロー
      glowNg: 'rgba(239, 68, 68, 0.2)'    // ズレが大きい時のグロー
    };

    // デバイスピクセル比に対応するためのスケーリング
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /**
   * キャンバスのサイズをデバイス解像度に合わせて最適化
   */
  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    this.width = rect.width;
    this.height = rect.height;
    
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    
    this.ctx.scale(dpr, dpr);
  }

  /**
   * メーターの値を更新
   * @param {number} cents ズレ (セント値: -50 〜 +50)
   * @param {boolean} isTuning 音が検知されているかどうか
   */
  update(cents, isTuning) {
    this.isTuning = isTuning;
    if (isTuning) {
      this.targetCents = cents;
    } else {
      // 音が途切れたら左端（-50セント）にゆっくり戻す
      this.targetCents = -50;
    }
  }

  /**
   * メーターの描画ループ（外部の requestAnimationFrame から呼び出される）
   */
  draw() {
    // 針の動きをイージングで滑らかにする
    // 反応速度と滑らかさのバランスをとるため、イージング係数を調整
    const easing = this.isTuning ? 0.12 : 0.08;
    this.currentCents += (this.targetCents - this.currentCents) * easing;

    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // キャンバスのクリア
    ctx.clearRect(0, 0, w, h);

    // 中心座標とメーター半径の決定
    const centerX = w / 2;
    const centerY = h * 0.94; // 針の支点をさらに下寄りに配置してスペースを極限まで稼ぐ
    const radius = Math.min(w * 0.58, h * 0.82); // 左右の余白を極限まで削りメーターを最大化

    // メーターの角度設定 (円の真上を -Math.PI / 2 とする)
    // 左端 -50セント: -Math.PI * 0.8  (約 -144度)
    // 右端 +50セント: -Math.PI * 0.2  (約 -36度)
    // 中央  0セント: -Math.PI * 0.5  (約 -90度)
    const startAngle = -Math.PI * 0.8;
    const endAngle = -Math.PI * 0.2;
    const angleRange = endAngle - startAngle;

    // 1. バックグラウンドアーク（メーターの土台）の描画
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.stroke();

    // 2. ピッチ許容範囲 (±3セント) のエメラルドゾーンを描画
    const greenStart = startAngle + (angleRange * 0.47); // -3セント相当
    const greenEnd = startAngle + (angleRange * 0.53);   // +3セント相当
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, greenStart, greenEnd);
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.3)';
    ctx.lineWidth = 12;
    ctx.stroke();

    // 3. 目盛り (Ticks) の描画
    const totalTicks = 50; // -50から50まで2セント刻み
    for (let i = 0; i <= totalTicks; i++) {
      const centValue = -50 + (i * 2);
      const ratio = i / totalTicks;
      const angle = startAngle + ratio * angleRange;
      
      let tickLength = 6;
      let tickWidth = 1.5;
      let tickColor = this.colors.tickNormal;

      if (centValue === 0) {
        tickLength = 16;
        tickWidth = 3;
        tickColor = this.colors.tickCenter;
      } else if (centValue % 10 === 0) {
        tickLength = 12;
        tickWidth = 2;
        tickColor = this.colors.tickAccent;
      }

      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      const x1 = centerX + (radius - 2) * cos;
      const y1 = centerY + (radius - 2) * sin;
      const x2 = centerX + (radius - tickLength) * cos;
      const y2 = centerY + (radius - tickLength) * sin;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = tickColor;
      ctx.lineWidth = tickWidth;
      ctx.stroke();

      // 主要な数字 (-50, -30, 0, 30, 50 など) の描画
      if (centValue === -50 || centValue === -30 || centValue === 0 || centValue === 30 || centValue === 50) {
        const textX = centerX + (radius - tickLength - 16) * cos;
        const textY = centerY + (radius - tickLength - 16) * sin;
        
        ctx.font = '600 10px "JetBrains Mono", monospace';
        ctx.fillStyle = centValue === 0 ? this.colors.tickCenter : this.colors.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((centValue > 0 ? '+' : '') + centValue, textX, textY);
      }
    }

    // 4. ジャストインジケーター（中央上部の光るランプ）
    const isJust = this.isTuning && Math.abs(this.currentCents) <= 3;
    ctx.beginPath();
    ctx.arc(centerX, centerY - radius - 12, 5, 0, Math.PI * 2);
    ctx.fillStyle = isJust ? '#10b981' : '#334155';
    
    // 光彩（シャドウ）効果
    if (isJust) {
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#10b981';
    } else {
      ctx.shadowBlur = 0;
    }
    ctx.fill();
    ctx.shadowBlur = 0; // シャドウ効果をリセット

    // 5. 針 (Needle) の描画
    // 現在のセント値に対応する角度を計算
    const needleRatio = (this.currentCents + 50) / 100;
    const needleAngle = startAngle + needleRatio * angleRange;
    
    const needleCos = Math.cos(needleAngle);
    const needleSin = Math.sin(needleAngle);

    // 針の長さ（目盛りより少し手前）
    const needleLength = radius - 8;

    ctx.beginPath();
    ctx.moveTo(centerX - needleSin * 2, centerY + needleCos * 2); // 根元を少し太く
    ctx.lineTo(centerX + needleCos * needleLength, centerY + needleSin * needleLength);
    ctx.lineTo(centerX + needleSin * 2, centerY - needleCos * 2);
    
    // 針の色をチューニング状態に合わせて変化させる（合っている時はエメラルド、ズレている時は赤）
    const dev = Math.abs(this.currentCents);
    if (!this.isTuning) {
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)'; // オフ時は半透明レッド
    } else {
      ctx.strokeStyle = dev <= 3 ? '#10b981' : (dev <= 15 ? '#f59e0b' : '#ef4444');
    }
    
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();

    // 6. 針のハブ (中心円) の描画
    ctx.beginPath();
    ctx.arc(centerX, centerY, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#f8fafc';
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
  }
}
