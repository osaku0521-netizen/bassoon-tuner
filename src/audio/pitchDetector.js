/**
 * 自己相関法 (Autocorrelation) および YIN アルゴリズムを用いたピッチ検出クラス
 * バスーンの音響特性（低域の基音不足、高次倍音）に特化したフィルターとアルゴリズムを搭載
 */
export class PitchDetector {
  constructor(audioContext) {
    this.audioContext = audioContext;
    this.analyser = audioContext.createAnalyser();
    
    // バスーンの低音域を安定して検知するためにバッファサイズを4096に設定
    this.analyser.fftSize = 4096; 
    this.buffer = new Float32Array(this.analyser.fftSize);
    
    // デフォルトの検出アルゴリズム
    this.algorithm = 'yin'; 

    // 1. ハイパスフィルター (40Hz) - 空調ノイズや超低周波ノイズをカット
    this.hpFilter = audioContext.createBiquadFilter();
    this.hpFilter.type = 'highpass';
    this.hpFilter.frequency.value = 40;

    // 2. ローパスフィルター (1200Hz) - 音質を保ちつつ高次倍音と高音域の無関係なノイズをカット
    this.lpFilter = audioContext.createBiquadFilter();
    this.lpFilter.type = 'lowpass';
    this.lpFilter.frequency.value = 1200;
  }

  /**
   * 検出器に入力を接続する (直列接続: source -> HP -> LP -> Analyser)
   * @param {AudioNode} sourceNode 
   */
  connect(sourceNode) {
    sourceNode.connect(this.hpFilter);
    this.hpFilter.connect(this.lpFilter);
    this.lpFilter.connect(this.analyser);
  }

  /**
   * 接続を解除する
   */
  disconnect() {
    this.hpFilter.disconnect();
    this.lpFilter.disconnect();
    this.analyser.disconnect();
  }

  /**
   * 検出アルゴリズムを設定する
   * @param {'yin' | 'autocorrelation'} type 
   */
  setAlgorithm(type) {
    if (type === 'yin' || type === 'autocorrelation') {
      this.algorithm = type;
      console.log(`Algorithm switched to: ${type}`);
    }
  }

  /**
   * 現在のピッチ（周波数）を検出する
   * @returns {number|null} 検出された周波数 (Hz) または検出できなかった場合は null
   */
  detectPitch() {
    this.analyser.getFloatTimeDomainData(this.buffer);
    
    if (this.algorithm === 'yin') {
      return this.detectPitchYIN(this.buffer, this.audioContext.sampleRate);
    } else {
      return this.autoCorrelate(this.buffer, this.audioContext.sampleRate);
    }
  }

  /**
   * YIN ピッチ検出アルゴリズム (累積平均正規化差分関数を用いた高度な検出)
   * 倍音成分（オクターブエラー）に対して極めて堅牢
   * @param {Float32Array} buffer 音声波形バッファ
   * @param {number} sampleRate サンプリングレート (Hz)
   * @returns {number|null}
   */
  detectPitchYIN(buffer, sampleRate) {
    // 1. RMS計算による無音検知
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i];
    }
    const rms = Math.sqrt(sum / buffer.length);
    if (rms < 0.008) {
      return null;
    }

    const minFreq = 50;
    const maxFreq = 1200;
    
    // YINでは探索用のシグナルサイズ W をバッファの半分とします (ラグを含めてバッファ内に収まるようにするため)
    const W = Math.floor(buffer.length / 2);
    const maxLag = Math.min(Math.floor(sampleRate / minFreq), W);
    const minLag = Math.floor(sampleRate / maxFreq);

    // 2. 差分関数 d(tau) の計算
    const d = new Float32Array(maxLag);
    for (let tau = 0; tau < maxLag; tau++) {
      let sumD = 0;
      for (let t = 0; t < W; t++) {
        const diff = buffer[t] - buffer[t + tau];
        sumD += diff * diff;
      }
      d[tau] = sumD;
    }

    // 3. 累積平均正規化差分 d'(tau) の計算 (YINの中核ロジック)
    const dPrime = new Float32Array(maxLag);
    dPrime[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau < maxLag; tau++) {
      runningSum += d[tau];
      dPrime[tau] = d[tau] / (runningSum / tau);
    }

    // 4. 絶対閾値によるラグ (周期) の決定
    const threshold = 0.15; // YINの標準的な閾値 (0.1 〜 0.15)
    let bestLag = -1;

    // 閾値を下回り、かつ極小値（ローカルミニマム）となる最初のラグを探す
    for (let tau = minLag; tau < maxLag - 1; tau++) {
      if (dPrime[tau] < threshold) {
        if (dPrime[tau] < dPrime[tau - 1] && dPrime[tau] < dPrime[tau + 1]) {
          bestLag = tau;
          break;
        }
      }
    }

    // 閾値を下回る極小値が見つからない場合は、全体の最小値（グローバルミニマム）を選択
    if (bestLag === -1) {
      let minVal = 999;
      for (let tau = minLag; tau < maxLag; tau++) {
        if (dPrime[tau] < minVal) {
          minVal = dPrime[tau];
          bestLag = tau;
        }
      }
    }

    // 範囲外チェック
    if (bestLag <= 0 || bestLag >= maxLag - 1) {
      return null;
    }

    // 5. 放物線補間 (Parabolic Interpolation) による精密な周波数決定
    const alpha = dPrime[bestLag - 1];
    const beta = dPrime[bestLag];
    const gamma = dPrime[bestLag + 1];

    const p = 0.5 * (alpha - gamma) / (alpha - 2 * beta + gamma);
    const preciseLag = bestLag + p;
    const frequency = sampleRate / preciseLag;

    if (frequency >= minFreq && frequency <= maxFreq) {
      return frequency;
    }

    return null;
  }

  /**
   * 自己相関法 (Autocorrelation) によるピッチ検出アルゴリズム
   * @param {Float32Array} buffer 音声波形バッファ
   * @param {number} sampleRate サンプリングレート (Hz)
   * @returns {number|null}
   */
  autoCorrelate(buffer, sampleRate) {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i];
    }
    const rms = Math.sqrt(sum / buffer.length);
    if (rms < 0.008) {
      return null;
    }

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

    const minFreq = 50;
    const maxFreq = 1200;
    const maxLag = Math.min(Math.floor(sampleRate / minFreq), buffer.length);
    const minLag = Math.floor(sampleRate / maxFreq);

    const r = new Float32Array(maxLag);
    let maxR = -999;
    
    for (let lag = minLag; lag < maxLag; lag++) {
      let sumR = 0;
      const limit = buffer.length - lag;
      for (let i = 0; i < limit; i++) {
        sumR += clippedBuffer[i] * clippedBuffer[i + lag];
      }
      r[lag] = sumR;
      if (sumR > maxR) {
        maxR = sumR;
      }
    }

    const peakThreshold = maxR * 0.85;
    let bestLag = -1;

    for (let lag = minLag; lag < maxLag - 1; lag++) {
      if (r[lag] > r[lag - 1] && r[lag] > r[lag + 1]) {
        if (r[lag] > peakThreshold) {
          bestLag = lag;
          break;
        }
      }
    }

    if (bestLag === -1) {
      return null;
    }

    const alpha = r[bestLag - 1];
    const beta = r[bestLag];
    const gamma = r[bestLag + 1];
    
    const p = 0.5 * (alpha - gamma) / (alpha - 2 * beta + gamma);
    const preciseLag = bestLag + p;
    const frequency = sampleRate / preciseLag;

    if (frequency >= minFreq && frequency <= maxFreq) {
      return frequency;
    }

    return null;
  }
}
