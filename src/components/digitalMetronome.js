/**
 * Canvas を用いた LED拍インジケーター ＆ 画面フラッシュ型デジタルメトロノーム描画コンポーネント
 * アタック時のフラッシュ発光を時間差から計算して自然にフェードアウトさせます。
 */
export class DigitalMetronome {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    
    this.activeBeat = -1;       // 現在アクティブな拍 (0 〜 beatsPerMeasure-1)
    this.beatsPerMeasure = 4;   // 1小節内の拍数
    this.lastTriggerTime = 0;   // 拍がトリガーされた高精度タイムスタンプ
    
    this.resize();
  }

  /**
   * Canvasのサイズを親要素に合わせてリサイズ
   */
  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.width = rect.width;
    // デジタルインジケーターは比較的省スペースにする
    this.height = Math.min(rect.height, rect.width * 0.65);
    
    this.canvas.width = this.width * window.devicePixelRatio;
    this.canvas.height = this.height * window.devicePixelRatio;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  /**
   * スケジューラー側で拍が登録されたタイミングで同期
   * @param {number} beatNumber 
   * @param {number} time 
   * @param {number} beatsPerMeasure 
   */
  registerBeat(beatNumber, time, beatsPerMeasure) {
    this.activeBeat = beatNumber;
    this.beatsPerMeasure = beatsPerMeasure;
    this.lastTriggerTime = time;
  }

  /**
   * デジタルメトロノームの描画
   * @param {number} currentTime (audioContext.currentTime)
   * @param {boolean} isPlaying 
   */
  draw(currentTime, isPlaying) {
    // 描画サイズが未確定、または0の場合は自己修復リサイズを実行
    if (!this.width || !this.height || this.width === 0 || this.height === 0) {
      this.resize();
      // リサイズ後もサイズが0なら描画をスキップしてレイアウト確定を待つ
      if (this.width === 0 || this.height === 0) return;
    }

    const ctx = this.ctx;
    const width = this.width;
    const height = this.height;
    
    ctx.clearRect(0, 0, width, height);
    
    // 拍のアタックの瞬間から 150ms でフェードアウトするフラッシュのアルファ値を計算
    let flashAlpha = 0.0;
    if (isPlaying && this.lastTriggerTime > 0) {
      const timeDiff = currentTime - this.lastTriggerTime;
      const flashDuration = 0.15; // 150ms
      if (timeDiff >= 0 && timeDiff < flashDuration) {
        // 二乗減衰（イージングアウト）でアタックの鋭さと自然な消え方を表現
        const ratio = timeDiff / flashDuration;
        flashAlpha = (1.0 - ratio) * (1.0 - ratio);
      }
    }
    
    const centerX = width / 2;
    const centerY = height / 2 - 8; // 下部の数値テキストを考慮し、中心をわずかに上へずらす
    
    // 1. 拍の瞬間のフラッシュエフェクト (放射状グラデーションによる淡いゴールドの明滅)
    if (flashAlpha > 0) {
      const isAccent = this.activeBeat === 0;
      const colorPrefix = 'rgba(212, 175, 55, ';
      const maxIntensity = isAccent ? 0.08 : 0.035; // 1拍目（アクセント拍）は光を強めにする
      
      const radialGrad = ctx.createRadialGradient(
        centerX, centerY, 10,
        centerX, centerY, width * 0.45
      );
      radialGrad.addColorStop(0, `${colorPrefix}${maxIntensity * flashAlpha})`);
      radialGrad.addColorStop(1, `${colorPrefix}0)`);
      
      ctx.fillStyle = radialGrad;
      ctx.fillRect(0, 0, width, height);
    }
    
    // 2. LED ドットインジケーターの描画
    const dotSpacing = Math.min(width * 0.18, 55); // 拍数が増えても綺麗に並ぶ配置間隔
    const startX = centerX - ((this.beatsPerMeasure - 1) * dotSpacing) / 2;
    
    for (let i = 0; i < this.beatsPerMeasure; i++) {
      const x = startX + i * dotSpacing;
      const y = centerY;
      
      const isCurrent = isPlaying && this.activeBeat === i;
      const isFirstBeat = i === 0;
      const radius = isFirstBeat ? 12.5 : 10.5; // 1拍目は少し大きく描画して強調
      
      ctx.save();
      
      if (isCurrent) {
        // 点灯状態: ネオン風ゴールドグラデーション
        ctx.shadowColor = '#d4af37';
        ctx.shadowBlur = 16;
        
        const grad = ctx.createRadialGradient(x, y, 1.5, x, y, radius);
        if (isFirstBeat) {
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.35, '#fcf6ba');
          grad.addColorStop(1, '#d4af37');
        } else {
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.4, '#d4af37');
          grad.addColorStop(1, '#b5952b');
        }
        ctx.fillStyle = grad;
      } else {
        // 消灯状態: 暗い半透明グレーに繊細なボーダー
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        continue;
      }
      
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
      
      // ランプの下部に拍のインデックス番号を表示
      ctx.font = 'bold 11px var(--font-mono)';
      ctx.fillStyle = isCurrent ? '#f8fafc' : 'rgba(255, 255, 255, 0.12)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(i + 1, x, y + radius + 18);
    }
  }
}
