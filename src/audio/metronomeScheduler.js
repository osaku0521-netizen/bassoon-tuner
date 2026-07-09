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
    const osc = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    // サイン波よりも倍音が豊かで管楽器の演奏中でも耳通りが良い「三角波（triangle）」を採用
    osc.type = 'triangle';
    
    // 周波数を少し高めに設定して耳への通りをさらに改善
    if (beatNumber === 0) {
      osc.frequency.value = 1200; // 1拍目 (高音の鋭いクリック)
    } else {
      osc.frequency.value = 900;  // 2拍目以降 (少し低めのクリック)
    }
    
    // アタックとリリースの精密スケジュール (最大ゲインを 1.0 に設定)
    const duration = 0.07; // 70ms にわずかに伸ばして音圧（エネルギー）を確保
    gainNode.gain.setValueAtTime(0, time);
    gainNode.gain.linearRampToValueAtTime(1.0, time + 0.001); // 1ms の超鋭いアタックで「カチッ」というアタック感を極限まで高める
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration); // リリース
    
    osc.start(time);
    osc.stop(time + duration);
    
    // 描画同期のために拍が決定されたことを main 側に知らせる
    if (this.onBeat) {
      this.onBeat(beatNumber, time);
    }
  }
}
