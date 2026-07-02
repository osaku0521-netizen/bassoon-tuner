import { getNoteNumber, getStandardFrequency, getCentsDeviation, getNoteDetails } from './notes.js';

function runTests() {
  console.log('=== Tuning Logic Test ===');
  
  // テストケース1: 442Hz基準で442Hzを入力
  const basePitch = 442;
  const f_442 = 442;
  const num_442 = getNoteNumber(f_442, basePitch);
  const std_442 = getStandardFrequency(num_442, basePitch);
  const cents_442 = getCentsDeviation(f_442, std_442);
  const details_de_442 = getNoteDetails(num_442, 'de');
  const details_en_442 = getNoteDetails(num_442, 'en');

  console.log(`442Hz (Base: 442Hz):`);
  console.log(` - MIDI Note: ${num_442} (Expected: 69)`);
  console.log(` - Standard Freq: ${std_442.toFixed(2)}Hz (Expected: 442.00)`);
  console.log(` - Cents Deviation: ${cents_442.toFixed(1)} cents (Expected: 0.0)`);
  console.log(` - German Name: ${details_de_442.name}${details_de_442.octave} (Expected: A4)`);
  console.log(` - English Name: ${details_en_442.name}${details_en_442.octave} (Expected: A4)`);
  
  const p1 = (num_442 === 69 && Math.abs(cents_442) < 0.01 && details_de_442.name === 'A');
  console.log(p1 ? '-> PASS' : '-> FAIL');

  // テストケース2: ファゴット最低音 B♭1 (A#1)
  // 442Hz基準におけるB♭1 (MIDI 34) の周波数は約58.54 Hz
  const f_bb1 = 58.80;
  const num_bb1 = getNoteNumber(f_bb1, basePitch);
  const std_bb1 = getStandardFrequency(num_bb1, basePitch);
  const cents_bb1 = getCentsDeviation(f_bb1, std_bb1);
  const details_de_bb1 = getNoteDetails(num_bb1, 'de');
  const details_en_bb1 = getNoteDetails(num_bb1, 'en');

  console.log(`\n58.80Hz (Base: 442Hz, Bb1):`);
  console.log(` - MIDI Note: ${num_bb1} (Expected: 34)`);
  console.log(` - Standard Freq: ${std_bb1.toFixed(2)}Hz (Expected: ~58.54)`);
  console.log(` - Cents Deviation: ${cents_bb1.toFixed(1)} cents (Expected: ~7.8)`);
  console.log(` - German Name: ${details_de_bb1.name}${details_de_bb1.octave} (Expected: B1)`); // ドイツ語でA#/BbはB
  console.log(` - English Name: ${details_en_bb1.name}${details_en_bb1.octave} (Expected: Bb1)`); // 英語でA#/BbはBb
  
  const p2 = (num_bb1 === 34 && details_de_bb1.name === 'B' && details_en_bb1.name === 'Bb');
  console.log(p2 ? '-> PASS' : '-> FAIL');

  // テストケース3: シ (B1 / H1)
  // 442Hz基準におけるB1 (MIDI 35) の周波数は約62.02 Hz
  const f_b1 = 62.30;
  const num_b1 = getNoteNumber(f_b1, basePitch);
  const details_de_b1 = getNoteDetails(num_b1, 'de');
  const details_en_b1 = getNoteDetails(num_b1, 'en');

  console.log(`\n62.30Hz (Base: 442Hz, B1):`);
  console.log(` - MIDI Note: ${num_b1} (Expected: 35)`);
  console.log(` - German Name: ${details_de_b1.name}${details_de_b1.octave} (Expected: H1)`); // ドイツ語でBはH
  console.log(` - English Name: ${details_en_b1.name}${details_en_b1.octave} (Expected: B1)`); // 英語でBはB
  
  const p3 = (num_b1 === 35 && details_de_b1.name === 'H' && details_en_b1.name === 'B');
  console.log(p3 ? '-> PASS' : '-> FAIL');

  // テストケース4: ミのフラット (Eb5 / Es5) - 一般的な高音域
  // 442Hz基準におけるEb5 (MIDI 75) の周波数は約632.08 Hz
  const f_eb5 = 632.08;
  const num_eb5 = getNoteNumber(f_eb5, basePitch);
  const details_de_eb5 = getNoteDetails(num_eb5, 'de');
  const details_en_eb5 = getNoteDetails(num_eb5, 'en');

  console.log(`\n632.08Hz (Base: 442Hz, Eb5):`);
  console.log(` - MIDI Note: ${num_eb5} (Expected: 75)`);
  console.log(` - German Name: ${details_de_eb5.name}${details_de_eb5.octave} (Expected: Es5)`); // ドイツ語でEbはEs
  console.log(` - English Name: ${details_en_eb5.name}${details_en_eb5.octave} (Expected: Eb5)`); // 英語でEbはEb
  
  const p4 = (num_eb5 === 75 && details_de_eb5.name === 'Es' && details_en_eb5.name === 'Eb');
  console.log(p4 ? '-> PASS' : '-> FAIL');

  // テストケース5: 442Hzでチューニング、ピッチが少しフラットしている場合
  const f_flat = 440.00; // 442Hzに対して約-7.8セント
  const num_flat = getNoteNumber(f_flat, basePitch);
  const std_flat = getStandardFrequency(num_flat, basePitch);
  const cents_flat = getCentsDeviation(f_flat, std_flat);
  
  console.log(`\n440.00Hz (Base: 442Hz, A4 slightly flat):`);
  console.log(` - MIDI Note: ${num_flat} (Expected: 69)`);
  console.log(` - Cents Deviation: ${cents_flat.toFixed(1)} cents (Expected: ~-7.8)`);
  
  const p5 = (Math.abs(cents_flat - (-7.84)) < 0.1);
  console.log(p5 ? '-> PASS' : '-> FAIL');

  if (p1 && p2 && p3 && p4 && p5) {
    console.log('\nALL TESTS PASSED!');
    process.exit(0);
  } else {
    console.error('\nSOME TESTS FAILED.');
    process.exit(1);
  }
}

runTests();
