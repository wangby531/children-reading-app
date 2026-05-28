const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

process.stdout.setEncoding('utf8');

const configPath = path.join(__dirname, 'config.local.js');
eval(fs.readFileSync(configPath, 'utf-8'));

const TEST_DIR = path.join(__dirname, 'test_images');

const VOICE = '冰糖';
const VOICE_DESC = '温柔女声，适合讲故事';

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

async function recognizePage(imagePath) {
  const base64 = blobToBase64(imagePath);
  const messages = [
    { role: 'system', content: '你是一个OCR识别引擎。只输出识别到的文字，不输出任何解释、前缀或格式。' },
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + base64 } },
        { type: 'text', text: '识别图中文字，只输出中文内容，忽略拼音和封面信息。' }
      ]
    }
  ];
  return callAPI(messages, CONFIG.model);
}

async function analyzeEmotion(text) {
  const messages = [
    { role: 'system', content: '你是情感分析专家。只返回一个JSON对象，不要任何解释、前缀或markdown格式。' },
    {
      role: 'user',
      content: `分析文本情感，直接返回JSON：
{"emotion":"平静/开心/悲伤/激动/紧张","tone":"温柔/活泼/严肃/俏皮/低沉","speed":"慢/正常/快"}

文本：${text.substring(0, 150)}`
    }
  ];
  return callAPI(messages, CONFIG.models.text, 200);
}

async function synthesizeSpeech(text, style) {
  return callTTSAPI(text, style);
}

async function processPage(imagePath, pageNum, totalPages) {
  const fileName = path.basename(imagePath);
  const stat = fs.statSync(imagePath);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📄 第 ${pageNum} 页 / 共 ${totalPages} 页: ${fileName}`);
  console.log(`📦 图片大小: ${(stat.size / 1024).toFixed(1)} KB`);
  console.log(`${'='.repeat(60)}`);

  const result = {
    page: pageNum,
    file: fileName,
    recognition: null,
    emotion: null,
    tts: null,
    times: {}
  };

  // Step 1: OCR识别
  console.log('\n🔍 [步骤1] OCR识别文字...');
  const startTime1 = Date.now();
  try {
    const ocrResult = await recognizePage(imagePath);
    const time1 = ((Date.now() - startTime1) / 1000).toFixed(2);
    result.times.recognition = time1;

    if (ocrResult.choices && ocrResult.choices.length > 0) {
      result.recognition = {
        text: ocrResult.choices[0].message.content,
        tokens: ocrResult.usage
      };
      console.log(`✅ 识别完成 | 耗时: ${time1}秒`);
      console.log(`📝 文本长度: ${result.recognition.text.length} 字符`);
      console.log(`📄 内容预览: ${result.recognition.text.substring(0, 80)}...`);
    } else {
      console.log(`❌ 识别失败`);
      result.recognition = { text: '', error: '识别失败' };
    }
  } catch (error) {
    const time1 = ((Date.now() - startTime1) / 1000).toFixed(2);
    result.times.recognition = time1;
    result.recognition = { text: '', error: error.message };
    console.log(`❌ 识别错误: ${error.message}`);
  }

  if (!result.recognition || !result.recognition.text) {
    return result;
  }

  // Step 2: 情感分析
  console.log('\n🎭 [步骤2] 分析情感语气...');
  const startTime2 = Date.now();
  try {
    const emotionResult = await analyzeEmotion(result.recognition.text);
    const time2 = ((Date.now() - startTime2) / 1000).toFixed(2);
    result.times.emotion = time2;

    if (emotionResult.choices && emotionResult.choices.length > 0) {
      try {
        let emotionText = emotionResult.choices[0].message.content;
        emotionText = emotionText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
        result.emotion = JSON.parse(emotionText);
        result.emotion.tokens = emotionResult.usage;
        console.log(`✅ 情感分析完成 | 耗时: ${time2}秒`);
        console.log(`🎭 情感: ${result.emotion.emotion}`);
        console.log(`🗣️  语气: ${result.emotion.tone}`);
        console.log(`⚡ 语速: ${result.emotion.speed}`);
      } catch (e) {
        result.emotion = { emotion: '平静', tone: '自然', speed: '正常', raw: emotionResult.choices[0].message.content };
        console.log(`⚠️  JSON解析失败，使用默认情感 | 耗时: ${time2}秒`);
      }
    }
  } catch (error) {
    const time2 = ((Date.now() - startTime2) / 1000).toFixed(2);
    result.times.emotion = time2;
    result.emotion = { emotion: '平静', tone: '自然', speed: '正常', error: error.message };
    console.log(`❌ 情感分析错误: ${error.message}`);
  }

  // Step 3: TTS语音合成
  console.log('\n🔊 [步骤3] TTS语音合成...');
  if (!result.emotion) {
    result.emotion = { emotion: '平静', tone: '自然', speed: '正常' };
  }
  const style = `用${result.emotion.tone || '自然'}的语气朗读，语速${result.emotion.speed || '正常'}`;
  console.log(`📋 风格指令: ${style}`);
  console.log(`🎤 音色: ${VOICE}（${VOICE_DESC}）`);

  const startTime3 = Date.now();
  try {
    const ttsResult = await synthesizeSpeech(result.recognition.text, style);
    const time3 = ((Date.now() - startTime3) / 1000).toFixed(2);
    result.times.tts = time3;

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

      const audioFileName = `page${pageNum}.wav`;
      const audioPath = path.join(TEST_DIR, audioFileName);
      fs.writeFileSync(audioPath, audioBytes);

      result.tts = {
        format: audioData.format || 'wav',
        dataSize: audioData.data ? audioData.data.length : 0,
        duration: duration.toFixed(1),
        audioFile: audioPath,
        tokens: ttsResult.usage
      };
      console.log(`✅ TTS完成 | 耗时: ${time3}秒`);
      console.log(`🎵 音频格式: ${result.tts.format}`);
      console.log(`📦 音频数据大小: ${(result.tts.dataSize * 0.75 / 1024).toFixed(1)} KB (base64)`);
      console.log(`⏱️  音频时长: ${result.tts.duration}秒 (阅读时间)`);
      console.log(`💾 已保存: ${audioPath}`);
    } else {
      result.tts = { error: '未获取到音频', raw: JSON.stringify(ttsResult).substring(0, 200) };
      console.log(`❌ TTS失败: 未获取到音频`);
    }
  } catch (error) {
    const time3 = ((Date.now() - startTime3) / 1000).toFixed(2);
    result.times.tts = time3;
    result.tts = { error: error.message };
    console.log(`❌ TTS错误: ${error.message}`);
  }

  // 计算总时间
  const totalTime = (parseFloat(result.times.recognition || 0) +
                     parseFloat(result.times.emotion || 0) +
                     parseFloat(result.times.tts || 0)).toFixed(2);
  result.times.total = totalTime;

  console.log(`\n📊 本页总耗时: ${totalTime}秒`);
  console.log(`   - 识别: ${result.times.recognition}秒`);
  console.log(`   - 情感分析: ${result.times.emotion}秒`);
  console.log(`   - TTS合成: ${result.times.tts}秒`);

  return result;
}

async function main() {
  console.log('========================================');
  console.log('📚 读书宝完整朗读流程测试');
  console.log('========================================');
  console.log('');
  console.log('📋 配置信息:');
  console.log('  OCR模型: ' + CONFIG.model);
  console.log('  TTS模型: mimo-v2.5-tts');
  console.log('  音色: ' + VOICE + '（' + VOICE_DESC + '）');
  console.log('  API: ' + CONFIG.apiUrl);
  console.log('');

  const files = fs.readdirSync(TEST_DIR)
    .filter(f => /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(f))
    .sort()
    .map(f => path.join(TEST_DIR, f));

  console.log(`📁 测试图片: ${files.length} 张（模拟一本书的${files.length}页）`);
  files.forEach(f => console.log('  -', path.basename(f)));

  const results = [];
  const bookStartTime = Date.now();

  // 模拟整本书的朗读流程
  console.log('\n');
  console.log('🎬 开始朗读《测试绘本》');
  console.log('   "小朋友你好！今天我们来读《测试绘本》。"');

  for (let i = 0; i < files.length; i++) {
    const result = await processPage(files[i], i + 1, files.length);
    results.push(result);

    if (i < files.length - 1) {
      console.log('\n');
      console.log('📢 "小朋友翻页啦~"');
    }
  }

  const bookEndTime = Date.now();
  const bookTotalTime = ((bookEndTime - bookStartTime) / 1000).toFixed(2);

  // 汇总报告
  console.log('\n\n');
  console.log('='.repeat(70));
  console.log('📊 完整朗读流程测试报告');
  console.log('='.repeat(70));
  console.log('');

  // 每页详情
  console.log('┌──────┬────────────┬────────┬────────┬────────┬────────┬────────┐');
  console.log('│ 页码 │ 音色       │ 识别   │ 情感   │ TTS    │ 总计   │ 阅读   │');
  console.log('├──────┼────────────┼────────┼────────┼────────┼────────┼────────┤');

  results.forEach(r => {
    const page = String(r.page).padStart(2);
    const voice = VOICE.padEnd(8);
    const rec = (r.times.recognition || '-').padStart(4) + 's';
    const emo = (r.times.emotion || '-').padStart(4) + 's';
    const tts = (r.times.tts || '-').padStart(4) + 's';
    const total = (r.times.total || '-').padStart(4) + 's';
    const read = (r.tts?.duration || '-').padStart(4) + 's';
    console.log(`│  ${page}  │ ${voice} │ ${rec} │ ${emo} │ ${tts} │ ${total} │ ${read} │`);
  });

  console.log('└──────┴────────────┴────────┴────────┴────────┴────────┴────────┘');

  // 情感详情
  console.log('\n🎭 情感语气详情:');
  console.log('┌──────┬──────────┬──────────────────┬──────┐');
  console.log('│ 页码 │ 情感     │ 语气             │ 语速 │');
  console.log('├──────┼──────────┼──────────────────┼──────┤');

  results.forEach(r => {
    const page = String(r.page).padStart(2);
    const emotion = (r.emotion?.emotion || '-').padEnd(6);
    const tone = (r.emotion?.tone || '-').substring(0, 14).padEnd(14);
    const speed = (r.emotion?.speed || '-').padEnd(2);
    console.log(`│  ${page}  │ ${emotion} │ ${tone} │ ${speed} │`);
  });

  console.log('└──────┴──────────┴──────────────────┴──────┘');

  // 汇总统计
  console.log('\n📈 汇总统计:');

  const totalRecTime = results.reduce((sum, r) => sum + parseFloat(r.times.recognition || 0), 0);
  const totalEmoTime = results.reduce((sum, r) => sum + parseFloat(r.times.emotion || 0), 0);
  const totalTtsTime = results.reduce((sum, r) => sum + parseFloat(r.times.tts || 0), 0);
  const totalReadTime = results.reduce((sum, r) => sum + parseFloat(r.tts?.duration || 0), 0);

  console.log(`  - 总页数: ${results.length}`);
  console.log(`  - 音色: ${VOICE}（${VOICE_DESC}）`);
  console.log(`  - 总识别耗时: ${totalRecTime.toFixed(2)}秒 (平均 ${(totalRecTime / results.length).toFixed(2)}秒/页)`);
  console.log(`  - 总情感分析耗时: ${totalEmoTime.toFixed(2)}秒 (平均 ${(totalEmoTime / results.length).toFixed(2)}秒/页)`);
  console.log(`  - 总TTS耗时: ${totalTtsTime.toFixed(2)}秒 (平均 ${(totalTtsTime / results.length).toFixed(2)}秒/页)`);
  console.log(`  - 总阅读时间: ${totalReadTime.toFixed(1)}秒 (平均 ${(totalReadTime / results.length).toFixed(1)}秒/页)`);
  console.log(`  - 整本书处理耗时: ${bookTotalTime}秒`);

  // Token统计
  console.log('\n🔢 Token用量统计:');
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  results.forEach(r => {
    if (r.recognition?.tokens) {
      totalInputTokens += r.recognition.tokens.prompt_tokens || 0;
      totalOutputTokens += r.recognition.tokens.completion_tokens || 0;
    }
    if (r.emotion?.tokens) {
      totalInputTokens += r.emotion.tokens.prompt_tokens || 0;
      totalOutputTokens += r.emotion.tokens.completion_tokens || 0;
    }
    if (r.tts?.tokens) {
      totalInputTokens += r.tts.tokens.prompt_tokens || 0;
      totalOutputTokens += r.tts.tokens.completion_tokens || 0;
    }
  });

  console.log(`  - 总输入Token: ${totalInputTokens}`);
  console.log(`  - 总输出Token: ${totalOutputTokens}`);
  console.log(`  - 总Token: ${totalInputTokens + totalOutputTokens}`);

  // API返回结果
  console.log('\n📦 API返回结果详情:');
  results.forEach(r => {
    console.log(`\n--- 第${r.page}页 ---`);
    console.log('识别结果:', r.recognition?.text?.substring(0, 100) + '...');
    console.log('情感分析:', JSON.stringify(r.emotion, null, 2));
    console.log('TTS状态:', r.tts?.error ? '失败 - ' + r.tts.error : '成功');
  });
}

main();
