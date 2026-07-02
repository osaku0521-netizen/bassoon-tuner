/**
 * 音名マッピングと周波数計算ユーティリティ
 */

// 英語表記 (管楽器で一般的なフラット優先表記を一部採用)
const NOTE_NAMES_EN = [
  'C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'
];

// ドイツ語表記 (ファゴット奏者に最も馴染みのある表記)
// A#/Bb は B (ベー)、B は H (ハー)、D#/Eb は Es (エス)、G#/Ab は As (アス) を採用
const NOTE_NAMES_DE = [
  'C', 'Cis', 'D', 'Es', 'E', 'F', 'Fis', 'G', 'As', 'A', 'B', 'H'
];

/**
 * 周波数から最も近いMIDIノート番号を計算する
 * @param {number} frequency 周波数 (Hz)
 * @param {number} basePitch 基準ピッチ (440-444Hz)
 * @returns {number} MIDIノート番号
 */
export function getNoteNumber(frequency, basePitch = 442) {
  const noteNum = 12 * (Math.log(frequency / basePitch) / Math.log(2)) + 69;
  return Math.round(noteNum);
}

/**
 * MIDIノート番号の基準周波数を取得する
 * @param {number} noteNumber MIDIノート番号
 * @param {number} basePitch 基準ピッチ (440-444Hz)
 * @returns {number} 周波数 (Hz)
 */
export function getStandardFrequency(noteNumber, basePitch = 442) {
  return basePitch * Math.pow(2, (noteNumber - 69) / 12);
}

/**
 * 入力周波数と基準周波数のズレ（セント値）を計算する
 * @param {number} frequency 実際の周波数
 * @param {number} standardFrequency 基準周波数
 * @returns {number} セント値 (-50 〜 +50)
 */
export function getCentsDeviation(frequency, standardFrequency) {
  return 1200 * (Math.log(frequency / standardFrequency) / Math.log(2));
}

/**
 * MIDIノート番号から音名とオクターブを取得する
 * @param {number} noteNumber MIDIノート番号
 * @param {string} notation 'en' (英語) または 'de' (ドイツ語)
 * @returns {{name: string, octave: number}} 音名とオクターブ
 */
export function getNoteDetails(noteNumber, notation = 'en') {
  const octave = Math.floor(noteNumber / 12) - 1;
  const index = ((noteNumber % 12) + 12) % 12;
  
  const names = notation === 'de' ? NOTE_NAMES_DE : NOTE_NAMES_EN;
  return {
    name: names[index],
    octave: octave
  };
}
