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

function callTTSAPI(text) {
  return new Promise((resolve, reject) => {
    const url = new URL(CONFIG.apiUrl);
    const protocol = url.protocol === 'https:' ? https : http;

    const body = JSON.stringify({
      model: 'mimo-v2.5-tts',
      messages: [
        { role: 'user', content: '用温柔亲切的语气，像妈妈给孩子讲故事，声音温暖有爱' },
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

function getWavDuration(audioBytes) {
  if (audioBytes.length > 44) {
    const sampleRate = audioBytes.readUInt32LE(24);
    const channels = audioBytes.readUInt16LE(22);
    const bitsPerSample = audioBytes.readUInt16LE(34);
    const dataSize = audioBytes.readUInt32LE(40);
    return dataSize / (sampleRate * channels * (bitsPerSample / 8));
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

async function getTTSBytes(text) {
  const result = await callTTSAPI(text);
  if (result.choices && result.choices.length > 0 && result.choices[0].message.audio) {
    return Buffer.from(result.choices[0].message.audio.data, 'base64');
  }
  return null;
}

async function main() {
  console.log('========================================');
  console.log('📚 完整朗读流程模拟测试');
  console.log('========================================\n');

  const files = fs.readdirSync(TEST_DIR)
    .filter(f => /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(f))
    .sort()
    .map(f => path.join(TEST_DIR, f));

  console.log(`📁 测试图片: ${files.length} 张\n`);

  const allPcmBuffers = [];
  let sampleRate = 24000;
  let channels = 1;
  let bitsPerSample = 16;

  // 1. 欢迎语
  console.log('🎬 [步骤1] 生成欢迎语...');
  const welcomeText = '小朋友你好！今天我们来读《测试绘本》。';
  console.log(`   文本: ${welcomeText}`);
  const welcomeBytes = await getTTSBytes(welcomeText);
  if (welcomeBytes) {
    sampleRate = welcomeBytes.readUInt32LE(24);
    channels = welcomeBytes.readUInt16LE(22);
    bitsPerSample = welcomeBytes.readUInt16LE(34);
    allPcmBuffers.push(extractPcmData(welcomeBytes));
    console.log(`   ✅ 完成 | 时长: ${getWavDuration(welcomeBytes).toFixed(1)}秒\n`);
  }

  // 2. 逐页朗读
  for (let i = 0; i < files.length; i++) {
    const pageNum = i + 1;
    const fileName = path.basename(files[i]);

    console.log(`📄 [步骤${i + 2}] 第${pageNum}页: ${fileName}`);

    // OCR识别
    console.log('   🔍 OCR识别...');
    const base64 = blobToBase64(files[i]);
    const ocrResult = await callAPI([
      { role: 'system', content: '你是一个OCR识别引擎。只输出识别到的文字，不输出任何解释。' },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + base64 } },
          { type: 'text', text: '识别图中文字，只输出中文内容，忽略拼音、封面信息和页码。' }
        ]
      }
    ], CONFIG.model);

    let text = '';
    if (ocrResult.choices && ocrResult.choices.length > 0) {
      text = ocrResult.choices[0].message.content;
      console.log(`   ✅ 识别完成 | ${text.length}字符`);
      console.log(`   📝 内容: ${text.substring(0, 50)}...`);
    } else {
      console.log('   ❌ 识别失败，跳过');
      continue;
    }

    // TTS朗读
    console.log('   🔊 TTS朗读...');
    const pageBytes = await getTTSBytes(text);
    if (pageBytes) {
      allPcmBuffers.push(extractPcmData(pageBytes));
      console.log(`   ✅ 完成 | 时长: ${getWavDuration(pageBytes).toFixed(1)}秒`);
    }

    // 翻页提示（最后一页不提示）
    if (i < files.length - 1) {
      console.log('   📢 翻页提示...');
      const turnPageBytes = await getTTSBytes('小朋友，请翻下一页');
      if (turnPageBytes) {
        allPcmBuffers.push(extractPcmData(turnPageBytes));
        console.log(`   ✅ 完成 | 时长: ${getWavDuration(turnPageBytes).toFixed(1)}秒`);
      }
    }

    console.log('');
  }

  // 3. 完成语
  console.log(`🎬 [步骤${files.length + 2}] 生成完成语...`);
  const finishText = '恭喜你，这本书读完啦！真棒！';
  console.log(`   文本: ${finishText}`);
  const finishBytes = await getTTSBytes(finishText);
  if (finishBytes) {
    allPcmBuffers.push(extractPcmData(finishBytes));
    console.log(`   ✅ 完成 | 时长: ${getWavDuration(finishBytes).toFixed(1)}秒\n`);
  }

  // 合并所有音频
  console.log('🔧 合并所有音频片段...');
  const combinedPcm = Buffer.concat(allPcmBuffers);
  const finalWav = createWavFromPcm(combinedPcm, sampleRate, channels, bitsPerSample);

  const outputPath = path.join(TEST_DIR, 'full_reading.wav');
  fs.writeFileSync(outputPath, finalWav);

  const totalDuration = combinedPcm.length / (sampleRate * channels * (bitsPerSample / 8));

  console.log(`\n✅ 已保存: ${outputPath}`);
  console.log(`📦 文件大小: ${(finalWav.length / 1024 / 1024).toFixed(2)} MB`);
  console.log(`⏱️  总时长: ${totalDuration.toFixed(1)}秒 (${(totalDuration / 60).toFixed(1)}分钟)`);

  console.log('\n========================================');
  console.log('✅ 完整朗读流程测试完成！');
  console.log('========================================');
  console.log('\n请播放 test_images/full_reading.wav 听完整效果。');
}

main();
