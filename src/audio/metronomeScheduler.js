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
    // 開始直後は現在より少し先の時刻をセットして、確実に最初の音が遅れずに出るようにします
    this.nextNoteTime = this.audioContext.currentTime + 0.05;
    
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
    
    // 1拍目（アクセント拍）は高音、それ以外は低音にする
    if (beatNumber === 0) {
      osc.frequency.value = 1000; // チッ
    } else {
      osc.frequency.value = 800;  // ポッ
    }
    
    // アタックとリリース (エンベロープ) の精密スケジュール
    const duration = 0.05; // 50ms の短い音
    gainNode.gain.setValueAtTime(0, time);
    gainNode.gain.linearRampToValueAtTime(0.6, time + 0.003); // アタック
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration); // リリース (自然な減衰)
    
    osc.start(time);
    osc.stop(time + duration);
    
    // 描画同期のために拍が決定されたことを main 側に知らせる
    if (this.onBeat) {
      this.onBeat(beatNumber, time);
    }
  }
}
