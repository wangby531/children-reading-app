const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

process.stdout.setEncoding('utf8');

const configPath = path.join(__dirname, 'config.local.js');
eval(fs.readFileSync(configPath, 'utf8'));

const TEST_DIR = path.join(__dirname, 'test_images');
const VOICE = '冰糖';
const PAGE_DELAY = 3000;
const AUDIO_TIMELINE = [];
const PROCESS_TIMELINE = [];

const IMAGES = [
  { name: '识别测试.jpg', page: 1, side: 'single' },
  { name: '识别测试2.jpg', page: 2, side: 'single' },
  { name: '识别测试3.jpeg', page: 3, side: 'single' },
  { name: '识别测试4.jpeg', page: 4, side: 'dual' }
];

function msToTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function callAPI(messages, model, maxTokens) {
  return new Promise((resolve, reject) => {
    const url = new URL(CONFIG.apiUrl);
    const protocol = url.protocol === 'https:' ? https : http;
    const body = JSON.stringify({
      model: model,
      messages: messages,
      max_tokens: maxTokens || 2000,
      temperature: 0.3,
      stream: false
    });
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + CONFIG.apiKey,
        'api-key': CONFIG.apiKey,
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse error: ' + data.substring(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function callTTSAPI(text, style) {
  return new Promise((resolve, reject) => {
    const url = new URL(CONFIG.apiUrl);
    const protocol = url.protocol === 'https:' ? https : http;
    const body = JSON.stringify({
      model: CONFIG.models.tts,
      messages: [
        { role: 'user', content: style || '用温柔亲切的语气朗读' },
        { role: 'assistant', content: text }
      ],
      audio: { format: 'wav', voice: VOICE }
    });
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + CONFIG.apiKey,
        'api-key': CONFIG.apiKey,
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('TTS JSON parse error: ' + data.substring(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function getWavDuration(wavBytes) {
  if (wavBytes.length > 44) {
    const sampleRate = wavBytes.readUInt32LE(24);
    const channels = wavBytes.readUInt16LE(22);
    const bitsPerSample = wavBytes.readUInt16LE(34);
    const dataSize = wavBytes.readUInt32LE(40);
    return dataSize / (sampleRate * channels * (bitsPerSample / 8)) * 1000;
  }
  return 0;
}

function extractPcmData(wavBytes) {
  if (wavBytes.length <= 44) return Buffer.alloc(0);
  return wavBytes.slice(44);
}

function createWavFromPcm(pcmData, sampleRate, channels, bitsPerSample) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
  header.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmData.length, 40);
  return Buffer.concat([header, pcmData]);
}

function createSilencePcm(durationMs, sampleRate, channels, bitsPerSample) {
  const numSamples = Math.floor(sampleRate * durationMs / 1000);
  return Buffer.alloc(numSamples * channels * (bitsPerSample / 8));
}

async function getTTSBytes(text, style) {
  const result = await callTTSAPI(text, style);
  if (result.choices && result.choices.length > 0 && result.choices[0].message.audio) {
    return Buffer.from(result.choices[0].message.audio.data, 'base64');
  }
  console.log('   TTS response:', JSON.stringify(result).substring(0, 200));
  return null;
}

async function simulateSave(type, content, audioTime) {
  const saveStart = Date.now();
  const sizes = { text: 2, image: 8, audio: 5, cover: 10, bookInfo: 1 };
  await new Promise(r => setTimeout(r, sizes[type] || 3));
  const saveTime = Date.now() - saveStart;
  PROCESS_TIMELINE.push({ audioTime, op: `保存${content}`, duration: saveTime });
  return saveTime;
}

function splitDualPage(text) {
  const leftMatch = text.match(/(?:左页|###\s*左页)[\s\S]*?(?=右页|###\s*右页|$)/i);
  const rightMatch = text.match(/(?:右页|###\s*右页)[\s\S]*/i);
  if (leftMatch && rightMatch) {
    return {
      left: leftMatch[0].replace(/(?:左页|###\s*左页)\s*/i, '').trim(),
      right: rightMatch[0].replace(/(?:右页|###\s*右页)\s*/i, '').trim()
    };
  }
  const lines = text.split('\n').filter(l => l.trim());
  const mid = Math.ceil(lines.length / 2);
  return { left: lines.slice(0, mid).join('\n'), right: lines.slice(mid).join('\n') };
}

async function main() {
  const globalStart = Date.now();
  const allPcmBuffers = [];
  const allTexts = [];
  let sampleRate = 24000, channels = 1, bitsPerSample = 16;
  let audioCursor = 0;
  let summaryPromise = null;
  let summaryStartTime = 0;

  console.log('============================================================');
  console.log('读书宝 - 完整流程验证测试（双时间线）');
  console.log('============================================================\n');

  const welcomeText = '欢迎使用读书宝！请把书放在镜头前，我要开始讲啦！';
  const ws1 = Date.now();
  const welcomeBytes = await getTTSBytes(welcomeText, '用开心的语气对小朋友说');
  const welcomeTime = Date.now() - ws1;
  if (welcomeBytes) {
    sampleRate = welcomeBytes.readUInt32LE(24);
    channels = welcomeBytes.readUInt16LE(22);
    bitsPerSample = welcomeBytes.readUInt16LE(34);
    allPcmBuffers.push(extractPcmData(welcomeBytes));
    const wDur = getWavDuration(welcomeBytes);
    console.log(`[${msToTime(audioCursor)}] 欢迎语`);
    console.log(`  文字: "${welcomeText}"`);
    console.log(`  TTS耗时: ${welcomeTime}ms | 音频时长: ${(wDur / 1000).toFixed(1)}秒`);
    AUDIO_TIMELINE.push({ start: audioCursor, event: '欢迎语', apiTime: welcomeTime, audioDur: wDur });
    audioCursor += wDur;
  }

  for (let i = 0; i < IMAGES.length; i++) {
    const img = IMAGES[i];
    const imgPath = path.join(TEST_DIR, img.name);
    const isLastPage = (i === IMAGES.length - 1);
    const isCover = (i === 0);

    console.log(`\n[${msToTime(audioCursor)}] ========== 第${img.page}页: ${img.name} ==========`);

    const base64 = fs.readFileSync(imgPath).toString('base64');
    const ext = path.extname(img.name).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
    const ocrStart = Date.now();
    const ocrResult = await callAPI([
      { role: 'system', content: '你是一个OCR识别引擎。只输出识别到的文字，不输出任何解释。' },
      { role: 'user', content: [
        { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
        { type: 'text', text: '识别图中文字，只输出中文内容，忽略拼音、封面信息和页码。如果是双页，请标注左页和右页。' }
      ]}
    ], CONFIG.models.ocr);
    const ocrTime = Date.now() - ocrStart;

    let text = '';
    if (ocrResult.choices && ocrResult.choices.length > 0) {
      text = ocrResult.choices[0].message.content;
      allTexts.push(text);
      console.log(`  OCR识别耗时: ${ocrTime}ms`);
      console.log(`  文字(${text.length}字): ${text.substring(0, 60)}...`);

      const ocrSilencePcm = createSilencePcm(ocrTime, sampleRate, channels, bitsPerSample);
      allPcmBuffers.push(ocrSilencePcm);
      AUDIO_TIMELINE.push({ start: audioCursor, event: `第${img.page}页OCR识别（等待）`, apiTime: ocrTime, audioDur: ocrTime });
      audioCursor += ocrTime;

      await simulateSave('text', `第${img.page}页文字`, audioCursor);
      await simulateSave('image', `第${img.page}页图片`, audioCursor);

      if (isLastPage && allTexts.length > 0) {
        summaryStartTime = Date.now();
        const allTextForSummary = allTexts.join('\n\n');
        console.log(`  [并行] 启动总结生成（与最后一页TTS同时进行）`);
        summaryPromise = callAPI([
          { role: 'system', content: '你是一位讲故事的姐姐，擅长用小朋友听得懂的语言总结故事。' },
          { role: 'user', content: `以下是小朋友刚才读的一本书的内容：\n\n${allTextForSummary}\n\n请用2-3句话总结这本书，用温暖亲切的语气，适合小朋友听。` }
        ], CONFIG.models.text, 500);
      }
    } else {
      console.log('  OCR识别失败:', JSON.stringify(ocrResult).substring(0, 200));
      continue;
    }

    const hasLeftRight = (img.side === 'dual') && (text.includes('左页') || text.includes('右页') || text.includes('左') && text.includes('右'));

    if (hasLeftRight) {
      const { left, right } = splitDualPage(text);
      console.log(`  检测到双页，左页${left.length}字，右页${right.length}字`);

      const leftStyle = '用温柔亲切的语气朗读';
      const leftStart = Date.now();
      const leftBytes = await getTTSBytes(left, leftStyle);
      const leftTtsTime = Date.now() - leftStart;
      if (leftBytes) {
        allPcmBuffers.push(extractPcmData(leftBytes));
        const lDur = getWavDuration(leftBytes);
        console.log(`  左页TTS耗时: ${leftTtsTime}ms | 音频时长: ${(lDur / 1000).toFixed(1)}秒`);
        AUDIO_TIMELINE.push({ start: audioCursor, event: `第${img.page}页左页TTS朗读`, apiTime: leftTtsTime, audioDur: lDur });
        audioCursor += lDur;
        await simulateSave('audio', `第${img.page}页左页音频`, audioCursor);
      }

      const pausePcm = createSilencePcm(2000, sampleRate, channels, bitsPerSample);
      allPcmBuffers.push(pausePcm);
      AUDIO_TIMELINE.push({ start: audioCursor, event: '朗读间歇', apiTime: 0, audioDur: 2000 });
      audioCursor += 2000;

      const guideText = '小朋友，该看右边了';
      console.log(`\n  [${msToTime(audioCursor)}] 左右页引导`);
      const guideStart = Date.now();
      const guideBytes = await getTTSBytes(guideText, '用亲切的语气引导小朋友');
      const guideTime = Date.now() - guideStart;
      if (guideBytes) {
        allPcmBuffers.push(extractPcmData(guideBytes));
        const gDur = getWavDuration(guideBytes);
        console.log(`  引导语: "${guideText}" | TTS耗时: ${guideTime}ms | 音频时长: ${(gDur / 1000).toFixed(1)}秒`);
        AUDIO_TIMELINE.push({ start: audioCursor, event: '左右页引导', apiTime: guideTime, audioDur: gDur });
        audioCursor += gDur;
      }

      const guidePausePcm = createSilencePcm(1000, sampleRate, channels, bitsPerSample);
      allPcmBuffers.push(guidePausePcm);
      AUDIO_TIMELINE.push({ start: audioCursor, event: '引导后停顿', apiTime: 0, audioDur: 1000 });
      audioCursor += 1000;

      const rightStyle = '用温柔亲切的语气朗读';
      const rightStart = Date.now();
      const rightBytes = await getTTSBytes(right, rightStyle);
      const rightTtsTime = Date.now() - rightStart;
      if (rightBytes) {
        allPcmBuffers.push(extractPcmData(rightBytes));
        const rDur = getWavDuration(rightBytes);
        console.log(`  右页TTS耗时: ${rightTtsTime}ms | 音频时长: ${(rDur / 1000).toFixed(1)}秒`);
        AUDIO_TIMELINE.push({ start: audioCursor, event: `第${img.page}页右页TTS朗读`, apiTime: rightTtsTime, audioDur: rDur });
        audioCursor += rDur;
        await simulateSave('audio', `第${img.page}页右页音频`, audioCursor);
      }
    } else {
      const styleDesc = isCover ? '用开心的语气朗读' : '用温柔亲切的语气朗读';
      const ttsStart = Date.now();
      const pageBytes = await getTTSBytes(text, styleDesc);
      const ttsTime = Date.now() - ttsStart;
      if (pageBytes) {
        allPcmBuffers.push(extractPcmData(pageBytes));
        const pDur = getWavDuration(pageBytes);
        console.log(`  TTS耗时: ${ttsTime}ms | 音频时长: ${(pDur / 1000).toFixed(1)}秒`);
        AUDIO_TIMELINE.push({ start: audioCursor, event: `第${img.page}页TTS朗读`, apiTime: ttsTime, audioDur: pDur });
        audioCursor += pDur;
        await simulateSave('audio', `第${img.page}页音频`, audioCursor);
      }
    }

    if (!isLastPage) {
      const PAGE_PAUSE = 2000;
      const pausePcm = createSilencePcm(PAGE_PAUSE, sampleRate, channels, bitsPerSample);
      allPcmBuffers.push(pausePcm);
      console.log(`  朗读间歇: ${PAGE_PAUSE / 1000}秒`);
      AUDIO_TIMELINE.push({ start: audioCursor, event: '朗读间歇', apiTime: 0, audioDur: PAGE_PAUSE });
      audioCursor += PAGE_PAUSE;

      const turnText = '小朋友，请翻到下一页吧！';
      console.log(`\n  [${msToTime(audioCursor)}] 翻页提示`);
      const turnStart = Date.now();
      const turnBytes = await getTTSBytes(turnText, '用亲切的语气提示小朋友');
      const turnTime = Date.now() - turnStart;
      if (turnBytes) {
        allPcmBuffers.push(extractPcmData(turnBytes));
        const tDur = getWavDuration(turnBytes);
        console.log(`  TTS耗时: ${turnTime}ms | 音频时长: ${(tDur / 1000).toFixed(1)}秒`);
        AUDIO_TIMELINE.push({ start: audioCursor, event: '翻页提示', apiTime: turnTime, audioDur: tDur });
        audioCursor += tDur;
      }

      const silencePcm = createSilencePcm(PAGE_DELAY, sampleRate, channels, bitsPerSample);
      allPcmBuffers.push(silencePcm);
      console.log(`  等待翻页: ${PAGE_DELAY / 1000}秒`);
      AUDIO_TIMELINE.push({ start: audioCursor, event: '等待翻页（静默）', apiTime: 0, audioDur: PAGE_DELAY });
      audioCursor += PAGE_DELAY;
    }
  }

  console.log(`\n[${msToTime(audioCursor)}] ========== 获取总结结果 ==========`);
  const allText = allTexts.join('\n\n');
  console.log(`  全文长度: ${allText.length}字符`);

  let summaryText = '';
  if (summaryPromise) {
    const summaryResult = await summaryPromise;
    const sumTime = Date.now() - summaryStartTime;
    if (summaryResult.choices && summaryResult.choices.length > 0) {
      summaryText = summaryResult.choices[0].message.content;
      console.log(`  总结已在并行生成完成 | 实际耗时: ${sumTime}ms`);
      console.log(`  总结内容: ${summaryText}`);
      PROCESS_TIMELINE.push({ audioTime: audioCursor, op: '总结生成（并行完成）', duration: sumTime });
    }
  }

  const introText = '这本书讲完啦！我来帮你总结一下：';
  const introBytes = await getTTSBytes(introText, '用开心的语气对小朋友说');
  if (introBytes) {
    allPcmBuffers.push(extractPcmData(introBytes));
    const iDur = getWavDuration(introBytes);
    console.log(`\n  [${msToTime(audioCursor)}] 总结引导语 | 音频时长: ${(iDur / 1000).toFixed(1)}秒`);
    AUDIO_TIMELINE.push({ start: audioCursor, event: '总结引导语', apiTime: 0, audioDur: iDur });
    audioCursor += iDur;
  }

  if (summaryText) {
    const sumBytes = await getTTSBytes(summaryText, '用温暖的语气总结故事');
    if (sumBytes) {
      allPcmBuffers.push(extractPcmData(sumBytes));
      const sDur = getWavDuration(sumBytes);
      console.log(`  [${msToTime(audioCursor)}] 总结正文朗读 | 音频时长: ${(sDur / 1000).toFixed(1)}秒`);
      AUDIO_TIMELINE.push({ start: audioCursor, event: '总结正文朗读', apiTime: 0, audioDur: sDur });
      PROCESS_TIMELINE.push({ audioTime: audioCursor, op: '保存总结到IndexedDB', duration: 3 });
      audioCursor += sDur;
    }
  }

  const endText = '今天的读书时间结束啦，小朋友真棒！';
  const endBytes = await getTTSBytes(endText, '用开心夸奖的语气');
  if (endBytes) {
    allPcmBuffers.push(extractPcmData(endBytes));
    const eDur = getWavDuration(endBytes);
    console.log(`  [${msToTime(audioCursor)}] 结束语 | 音频时长: ${(eDur / 1000).toFixed(1)}秒`);
    AUDIO_TIMELINE.push({ start: audioCursor, event: '结束语', apiTime: 0, audioDur: eDur });
    audioCursor += eDur;
  }

  console.log('\n合并所有音频...');
  const combinedPcm = Buffer.concat(allPcmBuffers);
  const finalWav = createWavFromPcm(combinedPcm, sampleRate, channels, bitsPerSample);
  const outputPath = path.join(TEST_DIR, 'full_verification.wav');
  fs.writeFileSync(outputPath, finalWav);
  const totalAudioDur = combinedPcm.length / (sampleRate * channels * (bitsPerSample / 8)) * 1000;
  const totalTime = Date.now() - globalStart;

  console.log('\n============================================================');
  console.log('时间线A：音频时间线（孩子听到的内容）');
  console.log('============================================================');
  console.log('序号  时间点    事件                          API耗时     音频时长');
  console.log('-'.repeat(75));
  AUDIO_TIMELINE.forEach((e, i) => {
    const idx = String(i + 1).padEnd(5);
    const ts = msToTime(e.start).padEnd(10);
    const evt = e.event.padEnd(30);
    const api = (e.apiTime > 0 ? `${e.apiTime}ms` : '-').padEnd(12);
    const dur = (e.audioDur > 0 ? `${(e.audioDur / 1000).toFixed(1)}s` : '-');
    console.log(`${idx}${ts}${evt}${api}${dur}`);
  });
  console.log('-'.repeat(75));
  console.log(`总音频时长: ${(totalAudioDur / 1000).toFixed(1)}秒 (${msToTime(totalAudioDur)})`);

  console.log('\n============================================================');
  console.log('时间线B：后台进程时间线（并行操作）');
  console.log('============================================================');
  console.log('音频时间点  并行操作                      操作耗时');
  console.log('-'.repeat(60));
  PROCESS_TIMELINE.forEach((e) => {
    const ts = msToTime(e.audioTime).padEnd(12);
    const op = e.op.padEnd(30);
    console.log(`${ts}${op}${e.duration}ms`);
  });
  console.log('-'.repeat(60));

  console.log('\n============================================================');
  console.log('汇总');
  console.log('============================================================');
  console.log(`总流程耗时（含API等待）: ${(totalTime / 1000).toFixed(1)}秒`);
  console.log(`总音频时长: ${(totalAudioDur / 1000).toFixed(1)}秒 (${msToTime(totalAudioDur)})`);
  console.log(`音频文件: ${outputPath}`);
  console.log(`文件大小: ${(finalWav.length / 1024).toFixed(1)}KB`);

  let md = '# 读书宝 - 完整流程验证时间线\n\n';
  md += `- **日期**: ${new Date().toLocaleString('zh-CN')}\n`;
  md += `- **总音频时长**: ${(totalAudioDur / 1000).toFixed(1)}秒\n`;
  md += `- **总流程耗时**: ${(totalTime / 1000).toFixed(1)}秒\n`;
  md += `- **音色**: ${VOICE}\n\n`;

  md += '## 时间线A：音频时间线（孩子听到的内容）\n\n';
  md += '| 序号 | 时间点 | 事件 | API耗时 | 音频时长 |\n';
  md += '|------|--------|------|---------|----------|\n';
  AUDIO_TIMELINE.forEach((e, i) => {
    const api = e.apiTime > 0 ? `${e.apiTime}ms` : '-';
    const dur = e.audioDur > 0 ? `${(e.audioDur / 1000).toFixed(1)}秒` : '-';
    md += `| ${i + 1} | ${msToTime(e.start)} | ${e.event} | ${api} | ${dur} |\n`;
  });

  md += '\n## 时间线B：后台进程时间线（并行操作）\n\n';
  md += '| 音频时间点 | 并行操作 | 操作耗时 |\n';
  md += '|------------|----------|----------|\n';
  PROCESS_TIMELINE.forEach((e) => {
    md += `| ${msToTime(e.audioTime)} | ${e.op} | ${e.duration}ms |\n`;
  });

  md += '\n## 各页识别内容\n\n';
  allTexts.forEach((t, i) => {
    md += `### 第${i + 1}页\n\n${t}\n\n`;
  });
  if (summaryText) {
    md += `## 总结内容\n\n${summaryText}\n`;
  }
  const timelinePath = path.join(TEST_DIR, 'verification_timeline.md');
  fs.writeFileSync(timelinePath, md, 'utf8');
  console.log(`\n时间线已保存: ${timelinePath}`);
  console.log('\n验证完成！');
}

main().catch(console.error);
