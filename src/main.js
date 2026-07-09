import './style.css';
import { PitchDetector } from './audio/pitchDetector.js';
import { getNoteNumber, getStandardFrequency, getCentsDeviation, getNoteDetails } from './audio/notes.js';
import { AnalogMeter } from './components/analogMeter.js';
import { DigitalMeter } from './components/digitalMeter.js';
import { MetronomeScheduler } from './audio/metronomeScheduler.js';
import { PendulumMetronome } from './components/pendulumMetronome.js';
import { DigitalMetronome } from './components/digitalMetronome.js';

// グローバル状態管理
let audioContext = null;
let mediaStream = null;
let pitchDetector = null;
let analogMeter = null;
let digitalMeter = null;

// メトロノーム関連のグローバル状態
let activeView = 'tuner'; // 現在アクティブなビュー ('tuner' | 'metronome')
let metronomeScheduler = null;
let pendulumMetronome = null;
let digitalMetronome = null;
let metroViewMode = 'analog'; // メトロノーム表示モード ('analog' | 'digital')
let metroBpm = 120;
let metroBeats = 4;
let isMetroPlaying = false;
let tapTimes = []; // タップテンポの時刻履歴

let isRunning = false;
let basePitch = 442;     // ファゴットの合奏で一般的な442Hzをデフォルトに設定
let notation = 'en';     // 英語音名 (Bb, B) に統一
let viewMode = 'analog'; // 初期表示はアナログメーター
let wakeLock = null;     // 画面スリープ防止用ロック
let smoothedFreq = null; // 表示用平滑化周波数 (マイルドなEMA)
let smoothedCents = null; // 平滑化されたセント値 (EMA用)
let consecutiveFrames = 0; // アタック時のノイズ除去用カウンター
let currentResponseSpeed = 'stable'; // 反応速度 ('fast' | 'normal' | 'stable')

const ALPHA_MAP = {
  fast: 0.35,
  normal: 0.18,
  stable: 0.08
};

// 信頼度ゲート制御用の閾値定数
const CONFIDENCE_THRESHOLD = 0.72; // 安定して追従する基準閾値 (ファゴットの低音特性に配慮して引き下げ)
const CONFIDENCE_MIN = 0.55;       // メーター更新を完全に切り捨てる最低信頼度

/**
 * 画面のスリープ（消灯）を防止する Wake Lock を要求する
 */
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('Screen Wake Lock is active');
    }
  } catch (err) {
    console.warn(`Wake Lock request failed: ${err.name}, ${err.message}`);
  }
}

// DOM要素のキャッシュ
const welcomeScreen = document.getElementById('welcome-screen');
const btnStart = document.getElementById('btn-start');
const displayNote = document.getElementById('display-note');
const displayOctave = document.getElementById('display-octave');
const displayFreq = document.getElementById('display-freq');

// 特徴モーダル要素
const btnShowFeatures = document.getElementById('btn-show-features');
const btnCloseModal = document.getElementById('btn-close-modal');
const featuresModal = document.getElementById('features-modal');

// アルゴリズム切り替えボタン
const btnAlgYin = document.getElementById('btn-alg-yin');
const btnAlgAutocorr = document.getElementById('btn-alg-autocorr');

// 反応速度切り替えボタン
const btnSpeedFast = document.getElementById('btn-speed-fast');
const btnSpeedNormal = document.getElementById('btn-speed-normal');
const btnSpeedStable = document.getElementById('btn-speed-stable');

// 表示モードボタン
const btnModeAnalog = document.getElementById('btn-mode-analog');
const btnModeDigital = document.getElementById('btn-mode-digital');
const canvasAnalog = document.getElementById('canvas-analog');
const canvasDigital = document.getElementById('canvas-digital');

// 基準ピッチボタン
const pitchButtons = document.querySelectorAll('.btn-pitch');

/**
 * オーディオシステムの初期化とマイクの取得
 */
async function initAudio() {
  try {
    // 1. AudioContext の初期化 (iOS/Safari対策のためユーザーインタラクション内で実行)
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass();

    // 2. マイクの使用許可取得
    // 音質補正機能（エコーキャンセラー、ノイズサプレッサー、自動ゲイン調整）は
    // ピッチ検出の波形を歪ませるため、すべて false に設定します
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      },
      video: false
    });

    const source = audioContext.createMediaStreamSource(mediaStream);
    
    // 3. ピッチ検出器の初期化と接続
    pitchDetector = new PitchDetector(audioContext);
    pitchDetector.connect(source);

    // 4. メーターコンポーネントの初期化
    analogMeter = new AnalogMeter(canvasAnalog);
    digitalMeter = new DigitalMeter(canvasDigital);

    // メトロノーム関連コンポーネントの初期化
    const canvasMetroAnalog = document.getElementById('canvas-metronome-analog');
    const canvasMetroDigital = document.getElementById('canvas-metronome-digital');
    metronomeScheduler = new MetronomeScheduler(audioContext);
    pendulumMetronome = new PendulumMetronome(canvasMetroAnalog);
    digitalMetronome = new DigitalMetronome(canvasMetroDigital);

    isRunning = true;
    
    // 5. 画面スリープ防止ロックを取得
    await requestWakeLock();
    
    // ウェルカム画面を非表示にする
    welcomeScreen.classList.add('hidden');
    
    // アニメーションループ開始
    tick();
  } catch (error) {
    console.error('マイクの取得に失敗しました:', error);
    alert('マイクのアクセス許可が必要です。設定を確認してリトライしてください。');
  }
}

/**
 * アニメーション＆ピッチ検出ループ
 */
function tick() {
  if (!isRunning) return;

  if (activeView === 'tuner') {
    // ------------------------------------------
    // チューナー表示時の音声解析 ＆ メーター描画
    // ------------------------------------------
    const result = pitchDetector ? pitchDetector.detectPitch() : null;
    
    if (result !== null) {
      const { frequency: rawFreq, confidence } = result;

      // 信頼度が最低基準値（0.65）を満たしているかチェック
      if (confidence >= CONFIDENCE_MIN) {
        consecutiveFrames++;
        
        // 3フレーム連続（約40ms以上）で安定して検知された場合のみ、画面に反映（アタックノイズを無視）
        if (consecutiveFrames >= 3) {
          // 1. セント計算用の基準周波数を生の周波数から一時計算
          const rawNoteNum = getNoteNumber(rawFreq, basePitch);
          const rawStandardFreq = getStandardFrequency(rawNoteNum, basePitch);
          const rawCents = getCentsDeviation(rawFreq, rawStandardFreq);

          // 2. セント値をEMAで平滑化 (UX改善: 音域に依存しない均一な平滑化)
          let alpha = ALPHA_MAP[currentResponseSpeed];
          
          // アタック直後（フレーム数が少ない状態）は、さらに平滑化を強めてアタックノイズを吸い込む
          if (consecutiveFrames < 10) {
            alpha = alpha * 0.6; // 二重減衰による極端なフリーズを防ぐため、0.4から0.6へ緩和
          }
          
          // 信頼度を平滑化係数（alpha）へ動的に反映
          // 信頼度が低いグレーゾーン（0.65〜0.80）のフレームは、完全に捨てる代わりに
          // 平滑化強度を強めて、ゆっくりとメーターを追従させます。
          if (confidence < CONFIDENCE_THRESHOLD) {
            const ratio = (confidence - CONFIDENCE_MIN) / (CONFIDENCE_THRESHOLD - CONFIDENCE_MIN); // 0.0 〜 1.0
            const confidenceScale = 0.5 + ratio * 0.5; // 減衰の下限を10%から50%へ引き上げて応答性を改善
            alpha = alpha * confidenceScale;
          }
          
          if (smoothedCents === null) {
            smoothedCents = rawCents;
          } else {
            // オクターブエラーや急激な音程変化（ジャンプ）があった場合は、平滑化をリセットして即座に追従
            if (Math.abs(rawCents - smoothedCents) > 40) {
              smoothedCents = rawCents;
            } else {
              smoothedCents = smoothedCents * (1 - alpha) + rawCents * alpha;
            }
          }

          // 3. 表示周波数自体も激しいブレを防ぐためマイルドに平滑化
          if (smoothedFreq === null) {
            smoothedFreq = rawFreq;
          } else {
            smoothedFreq = smoothedFreq * 0.8 + rawFreq * 0.2;
          }

          // 4. 平滑化された周波数から音名表示を決定 (音名チラつき/チャタリング防止)
          const displayNoteNum = getNoteNumber(smoothedFreq, basePitch);
          const noteDetails = getNoteDetails(displayNoteNum, notation);

          // UIの更新
          displayNote.textContent = noteDetails.name;
          displayOctave.textContent = noteDetails.octave;
          displayFreq.textContent = smoothedFreq.toFixed(1);

          // ズレの量に応じた文字色クラスのトグル
          const absCents = Math.abs(smoothedCents);
          if (absCents <= 3) {
            displayNote.className = 'note-name in-tune';
          } else if (absCents <= 15) {
            displayNote.className = 'note-name slightly-off';
          } else {
            displayNote.className = 'note-name off-tune';
          }

          // メーターの更新 (平滑化されたセント値を渡す)
          analogMeter.update(smoothedCents, true);
          digitalMeter.update(smoothedCents, true);
        } else {
          // 連続検出回数が足りない間は、無音の表示を維持して暴れを完全に遮断
          displayNote.textContent = '--';
          displayNote.className = 'note-name';
          displayOctave.textContent = '-';
          displayFreq.textContent = '--.-';
          analogMeter.update(0, false);
          digitalMeter.update(0, false);
        }
      } else {
        // 信頼度が極端に低い（0.65未満）完全なノイズは「無視」する
      }
    } else {
      // 音が検知されなかった場合 (無音状態)
      consecutiveFrames = 0; // カウントリセット
      smoothedCents = null; // セント平滑化リセット
      smoothedFreq = null; // 周波数平滑化リセット
      
      displayNote.textContent = '--';
      displayNote.className = 'note-name';
      displayOctave.textContent = '-';
      displayFreq.textContent = '--.-';

      // メーターに「無信号」状態を伝える
      analogMeter.update(0, false);
      digitalMeter.update(0, false);
    }

    // メーターの描画更新
    if (viewMode === 'analog') {
      analogMeter.draw();
    } else {
      digitalMeter.draw();
    }
  } else if (activeView === 'metronome') {
    // ------------------------------------------
    // メトロノーム表示時のアニメーション描画
    // ------------------------------------------
    const currentTime = audioContext.currentTime;
    if (metroViewMode === 'analog') {
      if (pendulumMetronome) pendulumMetronome.draw(currentTime, metroBpm, isMetroPlaying);
    } else {
      if (digitalMetronome) digitalMetronome.draw(currentTime, isMetroPlaying);
    }
  }

  requestAnimationFrame(tick);
}

// ==========================================
// イベントリスナーの登録
// ==========================================

// チューナー開始
btnStart.addEventListener('click', () => {
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }
  initAudio();
});

// 表示モード切り替え (アナログ / デジタル)
btnModeAnalog.addEventListener('click', () => {
  viewMode = 'analog';
  btnModeAnalog.classList.add('active');
  btnModeDigital.classList.remove('active');
  
  canvasAnalog.classList.add('active');
  canvasDigital.classList.remove('active');
  
  // サイズ変更に対応させる
  if (analogMeter) analogMeter.resize();
});

btnModeDigital.addEventListener('click', () => {
  viewMode = 'digital';
  btnModeDigital.classList.add('active');
  btnModeAnalog.classList.remove('active');
  
  canvasDigital.classList.add('active');
  canvasAnalog.classList.remove('active');
  
  // サイズ変更に対応させる
  if (digitalMeter) digitalMeter.resize();
});

// 基準ピッチ切り替え
pitchButtons.forEach(button => {
  button.addEventListener('click', (e) => {
    // すべてのボタンのアクティブクラスを解除
    pitchButtons.forEach(btn => btn.classList.remove('active'));
    
    // クリックされたボタンをアクティブにする
    button.classList.add('active');
    
    // 基準ピッチの更新
    basePitch = parseInt(button.dataset.pitch, 10);
  });
});

// こだわりモーダルの開閉
if (btnShowFeatures && btnCloseModal && featuresModal) {
  btnShowFeatures.addEventListener('click', () => {
    featuresModal.classList.remove('hidden');
  });
  
  btnCloseModal.addEventListener('click', () => {
    featuresModal.classList.add('hidden');
  });

  // モーダルの外側タップでも閉じるようにする
  featuresModal.addEventListener('click', (e) => {
    if (e.target === featuresModal) {
      featuresModal.classList.add('hidden');
    }
  });
}

// タブが切り替わって戻ってきたときにWake Lockを再取得する
document.addEventListener('visibilitychange', async () => {
  if (wakeLock !== null && document.visibilityState === 'visible' && isRunning) {
    await requestWakeLock();
  }
});

// アルゴリズム切り替えイベント
if (btnAlgYin && btnAlgAutocorr) {
  btnAlgYin.addEventListener('click', () => {
    if (pitchDetector) pitchDetector.setAlgorithm('yin');
    btnAlgYin.classList.add('active');
    btnAlgAutocorr.classList.remove('active');
  });

  btnAlgAutocorr.addEventListener('click', () => {
    if (pitchDetector) pitchDetector.setAlgorithm('autocorrelation');
    btnAlgAutocorr.classList.add('active');
    btnAlgYin.classList.remove('active');
  });
}

// 反応速度切り替えイベント
if (btnSpeedFast && btnSpeedNormal && btnSpeedStable) {
  btnSpeedFast.addEventListener('click', () => {
    currentResponseSpeed = 'fast';
    btnSpeedFast.classList.add('active');
    btnSpeedNormal.classList.remove('active');
    btnSpeedStable.classList.remove('active');
  });

  btnSpeedNormal.addEventListener('click', () => {
    currentResponseSpeed = 'normal';
    btnSpeedNormal.classList.add('active');
    btnSpeedFast.classList.remove('active');
    btnSpeedStable.classList.remove('active');
  });

  btnSpeedStable.addEventListener('click', () => {
    currentResponseSpeed = 'stable';
    btnSpeedStable.classList.add('active');
    btnSpeedFast.classList.remove('active');
    btnSpeedNormal.classList.remove('active');
  });
}

// ==========================================
// ビュー切り替えタブイベント
// ==========================================
const tabTuner = document.getElementById('tab-tuner');
const tabMetronome = document.getElementById('tab-metronome');
const tunerView = document.getElementById('tuner-view');
const metronomeView = document.getElementById('metronome-view');

tabTuner.addEventListener('click', () => {
  if (activeView === 'tuner') return;
  activeView = 'tuner';
  tabTuner.classList.add('active');
  tabMetronome.classList.remove('active');
  tunerView.classList.add('active');
  metronomeView.classList.remove('active');
  
  // メトロノームを安全に停止
  stopMetronome();
  
  // チューナー（マイク入力）の再接続
  if (pitchDetector && mediaStream) {
    const source = audioContext.createMediaStreamSource(mediaStream);
    pitchDetector.connect(source);
  }
  
  // メーターのサイズを更新
  if (viewMode === 'analog' && analogMeter) analogMeter.resize();
  if (viewMode === 'digital' && digitalMeter) digitalMeter.resize();
});

tabMetronome.addEventListener('click', () => {
  if (activeView === 'metronome') return;
  activeView = 'metronome';
  tabMetronome.classList.add('active');
  tabTuner.classList.remove('active');
  metronomeView.classList.add('active');
  tunerView.classList.remove('active');
  
  // チューナーのマイク解析スレッドを切断してCPU負荷を削減
  if (pitchDetector) {
    pitchDetector.disconnect();
  }
  
  // Canvasサイズのリサイズ (DOMが可視状態になった直後に実行)
  setTimeout(() => {
    if (pendulumMetronome) pendulumMetronome.resize();
    if (digitalMetronome) digitalMetronome.resize();
  }, 50);
});

// ==========================================
// メトロノームUIコントロールイベント
// ==========================================
const btnMetronomeToggle = document.getElementById('btn-metronome-toggle');
const displayBpm = document.getElementById('display-bpm');
const sliderBpm = document.getElementById('slider-bpm');
const btnBpmMinus = document.getElementById('btn-bpm-minus');
const btnBpmPlus = document.getElementById('btn-bpm-plus');
const btnTempoTap = document.getElementById('btn-tempo-tap');
const btnMetroModeAnalog = document.getElementById('btn-metro-mode-analog');
const btnMetroModeDigital = document.getElementById('btn-metro-mode-digital');
const canvasMetroAnalog = document.getElementById('canvas-metronome-analog');
const canvasMetroDigital = document.getElementById('canvas-metronome-digital');
const beatButtons = document.querySelectorAll('.btn-beat');

/**
 * メトロノームを再生
 */
function startMetronome() {
  if (!metronomeScheduler) return;
  isMetroPlaying = true;
  btnMetronomeToggle.textContent = 'STOP';
  btnMetronomeToggle.classList.remove('btn-primary');
  btnMetronomeToggle.classList.add('btn-secondary');
  
  metronomeScheduler.setBpm(metroBpm);
  metronomeScheduler.setBeatsPerMeasure(metroBeats);
  
  // スケジュール完了コールバックを同期
  metronomeScheduler.start((beatNumber, time) => {
    if (pendulumMetronome) pendulumMetronome.registerBeat(beatNumber, time, metroBpm);
    if (digitalMetronome) digitalMetronome.registerBeat(beatNumber, time, metroBeats);
  });
}

/**
 * メトロノームを停止
 */
function stopMetronome() {
  if (!metronomeScheduler) return;
  isMetroPlaying = false;
  btnMetronomeToggle.textContent = 'START';
  btnMetronomeToggle.classList.remove('btn-secondary');
  btnMetronomeToggle.classList.add('btn-primary');
  metronomeScheduler.stop();
}

// 再生ボタン
btnMetronomeToggle.addEventListener('click', () => {
  if (isMetroPlaying) {
    stopMetronome();
  } else {
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume();
    }
    startMetronome();
  }
});

/**
 * BPM設定を更新
 */
function updateBpm(bpm) {
  metroBpm = Math.max(40, Math.min(250, bpm));
  sliderBpm.value = metroBpm;
  displayBpm.textContent = metroBpm;
  
  if (metronomeScheduler) {
    metronomeScheduler.setBpm(metroBpm);
  }
}

// BPMスライダー
sliderBpm.addEventListener('input', (e) => {
  updateBpm(parseInt(e.target.value, 10));
});

// 微調節ボタン (-)
btnBpmMinus.addEventListener('click', () => {
  updateBpm(metroBpm - 1);
});

// 微調節ボタン (+)
btnBpmPlus.addEventListener('click', () => {
  updateBpm(metroBpm + 1);
});

// タップテンポ (Tap Tempo)
btnTempoTap.addEventListener('click', () => {
  const now = performance.now();
  
  // 前回タップから2秒以上空いたらリセット
  if (tapTimes.length > 0 && now - tapTimes[tapTimes.length - 1] > 2000) {
    tapTimes = [];
  }
  
  tapTimes.push(now);
  
  if (tapTimes.length > 1) {
    let sumIntervals = 0;
    for (let i = 1; i < tapTimes.length; i++) {
      sumIntervals += tapTimes[i] - tapTimes[i - 1];
    }
    const avgInterval = sumIntervals / (tapTimes.length - 1);
    const calculatedBpm = Math.round(60000 / avgInterval);
    updateBpm(calculatedBpm);
  }
  
  if (tapTimes.length > 5) {
    tapTimes.shift(); // 直近5タップ分に制限
  }
  
  // タップ感向上のためスケールエフェクトを適用
  btnTempoTap.style.transform = 'scale(0.95)';
  setTimeout(() => {
    btnTempoTap.style.transform = '';
  }, 80);
});

// 拍子変更ボタン
beatButtons.forEach(button => {
  button.addEventListener('click', () => {
    beatButtons.forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');
    
    metroBeats = parseInt(button.dataset.beat, 10);
    if (metronomeScheduler) {
      metronomeScheduler.setBeatsPerMeasure(metroBeats);
    }
    
    // 再生中の場合は即座に同期し直す
    if (isMetroPlaying) {
      stopMetronome();
      startMetronome();
    }
  });
});

// 表示モード切り替え (アナログ / デジタル)
btnMetroModeAnalog.addEventListener('click', () => {
  metroViewMode = 'analog';
  btnMetroModeAnalog.classList.add('active');
  btnMetroModeDigital.classList.remove('active');
  canvasMetroAnalog.classList.add('active');
  canvasMetroDigital.classList.remove('active');
  if (pendulumMetronome) pendulumMetronome.resize();
});

btnMetroModeDigital.addEventListener('click', () => {
  metroViewMode = 'digital';
  btnMetroModeDigital.classList.add('active');
  btnMetroModeAnalog.classList.remove('active');
  canvasMetroDigital.classList.add('active');
  canvasMetroAnalog.classList.remove('active');
  if (digitalMetronome) digitalMetronome.resize();
});

// リサイズイベントへのハンドラ統合
window.addEventListener('resize', () => {
  if (activeView === 'tuner') {
    if (analogMeter) analogMeter.resize();
    if (digitalMeter) digitalMeter.resize();
  } else {
    if (pendulumMetronome) pendulumMetronome.resize();
    if (digitalMetronome) digitalMetronome.resize();
  }
});
