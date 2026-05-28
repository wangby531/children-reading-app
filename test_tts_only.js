const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

process.stdout.setEncoding('utf8');

const configPath = path.join(__dirname, 'config.local.js');
eval(fs.readFileSync(configPath, 'utf-8'));

const TEST_DIR = path.join(__dirname, 'test_images');
const VOICE = '冰糖';

function blobToBase64(filePath) {
  const buffer = fs.readFileSync(filePath);
  return buffer.toString('base64');
}

function callAPI(messages, model, maxTokens = 1000) {
  return new Promise((resolve, reject) => {
    const url = new URL(CONFIG.apiUrl);
    const protocol = url.protocol === 'https:' ? https : http;

    const body = JSON.stringify({
      model: model,
      messages: messages,
      max_tokens: maxTokens,
      temperature: 0,
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
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('JSON解析失败: ' + data));
        }
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
      model: 'mimo-v2.5-tts',
      messages: [
        { role: 'user', content: style },
        { role: 'assistant', content: text }
      ],
      audio: {
        format: 'wav',
        voice: VOICE
      }
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
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('JSON解析失败: ' + data));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('========================================');
  console.log('🔊 TTS纯朗读测试（无情感分析）');
  console.log('========================================\n');

  const files = fs.readdirSync(TEST_DIR)
    .filter(f => /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(f))
    .sort()
    .map(f => path.join(TEST_DIR, f));

  console.log(`📁 测试图片: ${files.length} 张\n`);

  for (let i = 0; i < files.length; i++) {
    const pageNum = i + 1;
    const fileName = path.basename(files[i]);
    console.log(`\n${'='.repeat(50)}`);
    console.log(`📄 第 ${pageNum} 页: ${fileName}`);
    console.log(`${'='.repeat(50)}`);

    // OCR识别
    console.log('\n🔍 OCR识别...');
    const startTime1 = Date.now();
    const base64 = blobToBase64(files[i]);
    const ocrResult = await callAPI([
      { role: 'system', content: '你是一个OCR识别引擎。只输出识别到的文字，不输出任何解释。' },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + base64 } },
          { type: 'text', text: '识别图中文字，只输出中文内容。' }
        ]
      }
    ], CONFIG.model);
    const time1 = ((Date.now() - startTime1) / 1000).toFixed(2);

    let text = '';
    if (ocrResult.choices && ocrResult.choices.length > 0) {
      text = ocrResult.choices[0].message.content;
      console.log(`✅ 识别完成 | 耗时: ${time1}秒 | ${text.length}字符`);
    } else {
      console.log(`❌ 识别失败`);
      continue;
    }

    // TTS朗读（无情感分析，直接用默认风格）
    console.log('\n🔊 TTS朗读（默认风格）...');
    const startTime2 = Date.now();
    const ttsResult = await callTTSAPI(text, '用自然的语气朗读');
    const time2 = ((Date.now() - startTime2) / 1000).toFixed(2);

    if (ttsResult.choices && ttsResult.choices.length > 0 && ttsResult.choices[0].message.audio) {
      const audioData = ttsResult.choices[0].message.audio;
      const audioBytes = Buffer.from(audioData.data, 'base64');

      let duration = 0;
      if (audioBytes.length > 44) {
        const sampleRate = audioBytes.readUInt32LE(24);
        const channels = audioBytes.readUInt16LE(22);
        const bitsPerSample = audioBytes.readUInt16LE(34);
        const dataSize = audioBytes.readUInt32LE(40);
        duration = dataSize / (sampleRate * channels * (bitsPerSample / 8));
      }

      const audioFileName = `page${pageNum}_no_emotion.wav`;
      const audioPath = path.join(TEST_DIR, audioFileName);
      fs.writeFileSync(audioPath, audioBytes);

      console.log(`✅ TTS完成 | 耗时: ${time2}秒`);
      console.log(`⏱️  阅读时间: ${duration.toFixed(1)}秒`);
      console.log(`💾 已保存: ${audioPath}`);
    } else {
      console.log(`❌ TTS失败`);
    }
  }

  console.log('\n\n========================================');
  console.log('✅ 测试完成！');
  console.log('========================================');
  console.log('\n新生成的音频文件（无情感分析）:');
  console.log('  - page1_no_emotion.wav');
  console.log('  - page2_no_emotion.wav');
  console.log('  - page3_no_emotion.wav');
  console.log('  - page4_no_emotion.wav');
  console.log('\n请对比播放这两组音频，看看是否有区别。');
}

main();
