/**
 * 自己相関法 (Autocorrelation) を用いたピッチ検出クラス
 * ファゴットの低音域 (B♭1: 58Hz) から高音域 (C6: 1000Hz) に特化した設計
 */
export class PitchDetector {
  constructor(audioContext) {
    this.audioContext = audioContext;
    this.analyser = audioContext.createAnalyser();
    
    // ファゴットの低音域を安定して検知するためにバッファサイズを4096に設定
    this.analyser.fftSize = 4096; 
    this.buffer = new Float32Array(this.analyser.fftSize);
    
    // バンドパス/ローパスフィルターの適用 (ファゴットの音域外ノイズのカット用)
    // 50Hz〜1200Hzを通過させるバンドパスフィルターを設定
    this.filter = audioContext.createBiquadFilter();
    this.filter.type = 'bandpass';
    this.filter.frequency.value = 350; // 中心周波数 (ファゴットの中音域付近)
    this.filter.Q.value = 0.5; // なだらかなQでノイズを抑える
  }

  /**
   * 検出器に入力を接続する
   * @param {AudioNode} sourceNode 
   */
  connect(sourceNode) {
    sourceNode.connect(this.filter);
    this.filter.connect(this.analyser);
  }

  /**
   * 接続を解除する
   */
  disconnect() {
    this.filter.disconnect();
    this.analyser.disconnect();
  }

  /**
   * 現在のピッチ（周波数）を検出する
   * @returns {number|null} 検出された周波数 (Hz) または検出できなかった場合は null
   */
  detectPitch() {
    this.analyser.getFloatTimeDomainData(this.buffer);
    return this.autoCorrelate(this.buffer, this.audioContext.sampleRate);
  }

  /**
   * 自己相関法によるピッチ検出アルゴリズム
   * @param {Float32Array} buffer 音声波形バッファ
   * @param {number} sampleRate サンプリングレート (Hz)
   * @returns {number|null}
   */
  autoCorrelate(buffer, sampleRate) {
    // 1. 信号の音量（RMS: 二乗平均平方根）を計算し、無音時は処理をスキップ
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i];
    }
    const rms = Math.sqrt(sum / buffer.length);
    
    // 閾値以下の極めて小さい音は検知しない (マイクの無音時ノイズ防止)
    if (rms < 0.008) {
      return null;
    }

    // 2. 信号全体の最大振幅を求め、中心クリッピングの閾値を設定
    // これにより倍音成分による影響（オクターブエラー）を軽減します
    let maxVal = -1;
    let minVal = 1;
    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i] > maxVal) maxVal = buffer[i];
      if (buffer[i] < minVal) minVal = buffer[i];
    }
    const maxAmplitude = Math.max(Math.abs(maxVal), Math.abs(minVal));
    const clippingThreshold = maxAmplitude * 0.35; // 35%の中心クリッピング
    
    const clippedBuffer = new Float32Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      if (Math.abs(buffer[i]) > clippingThreshold) {
        clippedBuffer[i] = buffer[i] > 0 ? buffer[i] - clippingThreshold : buffer[i] + clippingThreshold;
      } else {
        clippedBuffer[i] = 0;
      }
    }

    // 3. ファゴットの音域に合わせた探索ラグの範囲を計算
    // 50Hz (最低) から 1200Hz (最高) の範囲を探索
    const minFreq = 50;
    const maxFreq = 1200;
    const maxLag = Math.min(Math.floor(sampleRate / minFreq), buffer.length);
    const minLag = Math.floor(sampleRate / maxFreq);

    // 自己相関値を計算
    const r = new Float32Array(maxLag);
    let maxR = -999;
    
    for (let lag = minLag; lag < maxLag; lag++) {
      let sumR = 0;
      // バッファオーバーフローを防ぎつつ相関をとる
      const limit = buffer.length - lag;
      for (let i = 0; i < limit; i++) {
        sumR += clippedBuffer[i] * clippedBuffer[i + lag];
      }
      r[lag] = sumR;
      if (sumR > maxR) {
        maxR = sumR;
      }
    }

    // 相関ピークの探索
    // 単に「最大値」を選ぶとオクターブエラーが生じやすいため、
    // 最大ピークの90%以上の強さを持つ最初のローカルピーク（一番長い周期＝最も低い基音）を見つけます。
    const peakThreshold = maxR * 0.85;
    let bestLag = -1;

    for (let lag = minLag; lag < maxLag - 1; lag++) {
      // ローカルピーク（極大値）の判定
      if (r[lag] > r[lag - 1] && r[lag] > r[lag + 1]) {
        if (r[lag] > peakThreshold) {
          bestLag = lag;
          break; // 最も長い周期（低音）を優先するため、最初に見つかった適合ラグで確定
        }
      }
    }

    if (bestLag === -1) {
      return null;
    }

    // 放物線補間 (Parabolic Interpolation) による精度の向上
    // ラグのインデックスは整数だが、その前後の値からより正確な小数のラグ位置を推定する
    const alpha = r[bestLag - 1];
    const beta = r[bestLag];
    const gamma = r[bestLag + 1];
    
    const p = 0.5 * (alpha - gamma) / (alpha - 2 * beta + gamma);
    const preciseLag = bestLag + p;

    // 周波数を算出
    const frequency = sampleRate / preciseLag;

    // 最終防衛ライン: ファゴットの現実的な周波数範囲内かチェック
    if (frequency >= minFreq && frequency <= maxFreq) {
      return frequency;
    }

    return null;
  }
}
