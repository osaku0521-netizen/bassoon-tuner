/**
 * HTML5 Canvas を使用したモダンなデジタル（LEDバー）メーター
 */
export class DigitalMeter {
  /**
   * @param {HTMLCanvasElement} canvas 
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    
    this.targetCents = 0;
    this.currentCents = 0;
    this.isTuning = false;

    // LEDセグメントの設定
    this.segmentsCount = 15; // 片側のLED個数 (合計 15 * 2 + 1 = 31個)
    
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /**
   * キャンバスサイズ調整
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
   * 値の更新
   * @param {number} cents 
   * @param {boolean} isTuning 
   */
  update(cents, isTuning) {
    this.isTuning = isTuning;
    if (isTuning) {
      this.targetCents = cents;
    } else {
      // チューニングしていない時は中央(0)へフェード
      this.targetCents = 0;
    }
  }

  /**
   * 角丸長方形の描画ユーティリティ
   */
  roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  /**
   * 描画処理
   */
  draw() {
    // デジタルメーターも滑らかなイージングで追従
    const easing = this.isTuning ? 0.2 : 0.1;
    this.currentCents += (this.targetCents - this.currentCents) * easing;

    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.clearRect(0, 0, w, h);

    // テキスト用の領域を確保し、LEDバーは下部に配置
    const barY = h * 0.65;
    const barHeight = h * 0.25;
    const textY = h * 0.38;

    // 1. デジタル数値テキストの描画
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    if (this.isTuning) {
      const centsInt = Math.round(this.currentCents);
      const sign = centsInt > 0 ? '+' : '';
      
      // セント値
      ctx.font = '700 36px "JetBrains Mono", monospace';
      const absCents = Math.abs(centsInt);
      
      // 合っている時はエメラルド、少しズレたら黄色、大きくズレたら赤
      if (absCents <= 3) {
        ctx.fillStyle = '#10b981'; // ネオンエメラルド
      } else if (absCents <= 15) {
        ctx.fillStyle = '#f59e0b'; // アンバー
      } else {
        ctx.fillStyle = '#ef4444'; // レッド
      }
      
      ctx.fillText(`${sign}${centsInt} cents`, w / 2, textY);
    } else {
      ctx.font = '600 22px "Outfit", sans-serif';
      ctx.fillStyle = '#475569';
      ctx.fillText('NO SIGNAL', w / 2, textY);
    }

    // 2. LEDバーの描画設計
    // セグメント数: 片側15個、中央1個、計31個
    const totalSegments = this.segmentsCount * 2 + 1;
    const padding = 3; // セグメント間の隙間
    const segmentWidth = (w - (padding * (totalSegments - 1))) / totalSegments;

    // 点灯するべきセグメント数を計算 (-50〜+50 セントを -15〜+15 にマップ)
    const activeSegmentIndex = this.isTuning 
      ? Math.round((this.currentCents / 50) * this.segmentsCount) 
      : 0;

    for (let i = 0; i < totalSegments; i++) {
      // 左端を0としたインデックスから、中心(0)に対する相対インデックス（-15 〜 +15）を計算
      const relIndex = i - this.segmentsCount;
      const x = i * (segmentWidth + padding);
      
      // LEDスロットの描画
      this.roundRect(ctx, x, barY, segmentWidth, barHeight, 2);

      // チューニング中かつ、このLEDが「点灯対象」である場合
      const isLit = this.isTuning && (
        (relIndex === 0 && Math.abs(activeSegmentIndex) === 0) || // 中央
        (relIndex > 0 && relIndex <= activeSegmentIndex) ||       // プラス方向
        (relIndex < 0 && relIndex >= activeSegmentIndex)          // マイナス方向
      );

      if (isLit) {
        // 点灯色を設定
        const absRel = Math.abs(relIndex);
        let color = '#10b981'; // 0〜4セグメント(約13セント以下)はエメラルド
        let glowColor = 'rgba(16, 185, 129, 0.4)';
        
        if (absRel > 4 && absRel <= 10) {
          color = '#f59e0b'; // 5〜10セグメント(約33セント以下)はアンバー
          glowColor = 'rgba(245, 158, 11, 0.4)';
        } else if (absRel > 10) {
          color = '#ef4444'; // それより外側はレッド
          glowColor = 'rgba(239, 68, 68, 0.4)';
        }

        ctx.fillStyle = color;
        
        // 中心に近い（ピッタリに近い）LEDや現在値のピーク部分にはグロー効果をのせる
        if (relIndex === activeSegmentIndex) {
          ctx.shadowBlur = 8;
          ctx.shadowColor = color;
        }

        ctx.fill();
        ctx.shadowBlur = 0; // リセット
      } else {
        // 消灯状態のLED
        ctx.fillStyle = '#1e293b';
        ctx.fill();
      }
    }
  }
}
