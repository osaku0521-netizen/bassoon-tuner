/**
 * Web Audio API を用いた高精度メトロノーム・スケジューラー
 * ブラウザのタイマーのヨレ（ジッター）を防ぐため、Look-ahead 方式で先読みスケジュールを施します。
 */
export class MetronomeScheduler {
  constructor(audioContext) {
    this.audioContext = audioContext;
    this.bpm = 120;
    this.beatsPerMeasure = 4;
    this.isPlaying = false;
    
    this.timerId = null;
    this.nextNoteTime = 0.0;     // 次の拍の再生予定時刻 (AudioContext.currentTime スケール)
    this.currentBeat = 0;        // 現在の拍数 (0 〜 beatsPerMeasure-1)
    
    this.lookahead = 25.0;       // スケジューリング関数を呼び出す頻度 (ms)
    this.scheduleAheadTime = 0.1; // 未来の音をどれだけ先読みしてスケジュールするか (秒)
    this.onBeat = null;           // 拍がスケジュールされた際のコールバック (beatNumber, time)
  }

  /**
   * テンポ (BPM) を設定
   * @param {number} bpm 
   */
  setBpm(bpm) {
    this.bpm = Math.max(40, Math.min(250, bpm));
  }

  /**
   * 1小節内の拍数を設定
   * @param {number} beats 
   */
  setBeatsPerMeasure(beats) {
    this.beatsPerMeasure = beats;
  }

  /**
   * メトロノームの再生を開始
   * @param {Function} onBeatCallback (beatNumber, time) 
   */
  start(onBeatCallback) {
    if (this.isPlaying) return;
    
    this.isPlaying = true;
    this.onBeat = onBeatCallback;
    this.currentBeat = 0;
    // 最初の拍の音が鳴るまでに丸々1拍分の予備スイング時間を設け、テンポの予測を容易にします
    const secondsPerBeat = 60.0 / this.bpm;
    this.nextNoteTime = this.audioContext.currentTime + secondsPerBeat;
    

    const runScheduler = () => {
      this.scheduler();
      if (this.isPlaying) {
        this.timerId = setTimeout(runScheduler, this.lookahead);
      }
    };
    runScheduler();
  }

  /**
   * メトロノームの再生を停止
   */
  stop() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  /**
   * Look-ahead スケジューリングループ
   */
  scheduler() {
    // 次の拍の予定時刻が、先読み限界時間内に達している限り、先の予定をWeb Audioのキューに積む
    while (this.nextNoteTime < this.audioContext.currentTime + this.scheduleAheadTime) {
      this.scheduleNote(this.currentBeat, this.nextNoteTime);
      this.nextNote();
    }
  }

  /**
   * 次の拍のカウンタと時刻を更新
   */
  nextNote() {
    const secondsPerBeat = 60.0 / this.bpm;
    this.nextNoteTime += secondsPerBeat;
    
    this.currentBeat++;
    if (this.currentBeat >= this.beatsPerMeasure) {
      this.currentBeat = 0;
    }
  }

  /**
   * Web Audio API のオシレータを使って拍の電子音をスケジュール
   * @param {number} beatNumber 
   * @param {number} time 
   */
  scheduleNote(beatNumber, time) {
    const duration = 0.07; // 70ms の長さで音響エネルギーを稼ぐ
    
    // 1. メインオシレーター (三角波)
    const osc1 = this.audioContext.createOscillator();
    osc1.type = 'triangle';
    
    // 2. 最もエネルギー密度の高い「矩形波」を1オクターブ上の倍音としてブレンドし、音圧とアタックの抜けを極限まで強化
    const osc2 = this.audioContext.createOscillator();
    osc2.type = 'square';
    
    let baseFreq = 900;
    if (beatNumber === 0) {
      baseFreq = 1200; // 1拍目 (高周波の鋭いアクセントクリック)
    } else {
      baseFreq = 900;  // 2拍目以降
    }
    
    osc1.frequency.value = baseFreq;
    osc2.frequency.value = baseFreq * 2; // 1オクターブ上 (倍音)
    
    // 個別のゲインコントロールノード
    const gain1 = this.audioContext.createGain();
    const gain2 = this.audioContext.createGain();
    
    osc1.connect(gain1);
    osc2.connect(gain2);
    
    // 3. 全体をまとめるマスタリング Gain
    const masterGain = this.audioContext.createGain();
    gain1.connect(masterGain);
    gain2.connect(masterGain);
    
    // 4. 音割れを防ぎつつ、スマホスピーカーの限界まで音のエネルギー密度を圧縮するマスタリングコンプレッサー
    const compressor = this.audioContext.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-12, time); // 閾値を下げて全体の音エネルギーを均一化
    compressor.knee.setValueAtTime(8, time);
    compressor.ratio.setValueAtTime(12, time);      // 強力に圧縮して平均音圧を稼ぐ
    compressor.attack.setValueAtTime(0.001, time);  // 1msで即圧縮作動してアタック感を維持
    compressor.release.setValueAtTime(0.03, time);  // 30msで素早くリリースして音圧キープ
    
    masterGain.connect(compressor);
    compressor.connect(this.audioContext.destination);
    
    // アタック 1ms の超鋭角ゲインエンベロープ
    gain1.gain.setValueAtTime(0, time);
    gain1.gain.linearRampToValueAtTime(0.9, time + 0.001);
    gain1.gain.exponentialRampToValueAtTime(0.001, time + duration);
    
    gain2.gain.setValueAtTime(0, time);
    gain2.gain.linearRampToValueAtTime(0.3, time + 0.001); // 矩形波を30%ブレンドして物理音圧を激増させる
    gain2.gain.exponentialRampToValueAtTime(0.001, time + duration);
    
    masterGain.gain.setValueAtTime(1.0, time);
    
    osc1.start(time);
    osc1.stop(time + duration);
    osc2.start(time);
    osc2.stop(time + duration);
    
    // 描画同期のために拍が決定されたことを main 側に知らせる
    if (this.onBeat) {
      this.onBeat(beatNumber, time);
    }
  }
}
