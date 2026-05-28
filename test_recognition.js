const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const configPath = path.join(__dirname, 'config.local.js');
if (!fs.existsSync(configPath)) {
  console.error('❌ 未找到 config.local.js，请先创建配置文件');
  process.exit(1);
}
eval(fs.readFileSync(configPath, 'utf-8'));

const IMAGE_PATH = path.join(__dirname, '识别测试.jpg');

function blobToBase64(filePath) {
  const buffer = fs.readFileSync(filePath);
  return buffer.toString('base64');
}

function callAPI(messages) {
  return new Promise((resolve, reject) => {
    const url = new URL(CONFIG.apiUrl);
    const protocol = url.protocol === 'https:' ? https : http;

    const body = JSON.stringify({
      model: CONFIG.model,
      messages: messages,
      max_tokens: 1000,
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

async function main() {
  console.log('========================================');
  console.log('📚 识别Skill 两阶段测试');
  console.log('========================================');
  console.log('');
  console.log('📋 配置信息:');
  console.log('  API地址:', CONFIG.apiUrl);
  console.log('  模型:', CONFIG.model);
  console.log('');

  if (!fs.existsSync(IMAGE_PATH)) {
    console.error('❌ 未找到测试图片: 识别测试.jpg');
    process.exit(1);
  }

  const stat = fs.statSync(IMAGE_PATH);
  console.log('🖼️  图片:', IMAGE_PATH);
  console.log('📦 图片大小:', (stat.size / 1024).toFixed(1), 'KB');
  console.log('');

  const base64 = blobToBase64(IMAGE_PATH);

  // ========== 第一部分：直接识别 ==========
  console.log('========================================');
  console.log('📖 第一部分：图片文字识别');
  console.log('========================================');
  console.log('');
  console.log('⏳ 正在识别...');
  console.log('');

  const startTime1 = Date.now();
  let recognizedText = '';

  try {
    const messages1 = [
      { role: 'system', content: '你是一个OCR识别引擎。只输出识别到的文字，不输出任何解释、前缀或格式。' },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + base64 } },
          { type: 'text', text: '识别图中文字，只输出中文内容，忽略拼音和封面信息。' }
        ]
      }
    ];

    const result1 = await callAPI(messages1);
    const endTime1 = Date.now();
    const timeTaken1 = ((endTime1 - startTime1) / 1000).toFixed(2);

    if (result1.choices && result1.choices.length > 0) {
      recognizedText = result1.choices[0].message.content;
      console.log('✅ 识别成功');
      console.log('');
      console.log('⏱️  耗时:', timeTaken1, '秒');
      console.log('');
      console.log('📝 识别内容:');
      console.log('----------------------------------------');
      console.log(recognizedText);
      console.log('----------------------------------------');
      console.log('');
      console.log('📏 文本长度:', recognizedText.length, '字符');

      if (result1.usage) {
        console.log('');
        console.log('🔢 Token用量:');
        console.log('  输入:', result1.usage.prompt_tokens);
        console.log('  输出:', result1.usage.completion_tokens);
        console.log('  总计:', result1.usage.total_tokens);
      }
    } else {
      console.log('❌ 识别失败');
      console.log('错误信息:', JSON.stringify(result1, null, 2));
      process.exit(1);
    }
  } catch (error) {
    const endTime1 = Date.now();
    const timeTaken1 = ((endTime1 - startTime1) / 1000).toFixed(2);
    console.log('❌ 识别请求失败');
    console.log('⏱️  耗时:', timeTaken1, '秒');
    console.log('错误:', error.message);
    process.exit(1);
  }

  console.log('');
  console.log('');

  // ========== 第二部分：LLM校对 ==========
  console.log('========================================');
  console.log('� 第二部分：LLM校对准确性');
  console.log('========================================');
  console.log('');
  console.log('⏳ 正在校对...');
  console.log('');

  const startTime2 = Date.now();

  try {
    const messages2 = [
      { role: 'system', content: '你是文字校对员。只输出修正后的文本，不输出解释。如无错误，原样返回。' },
      {
        role: 'user',
        content: '校对以下文本，修正错别字和不通顺处，直接返回修正结果：\n' + recognizedText
      }
    ];

    const result2 = await callAPI(messages2);
    const endTime2 = Date.now();
    const timeTaken2 = ((endTime2 - startTime2) / 1000).toFixed(2);

    if (result2.choices && result2.choices.length > 0) {
      const verifiedText = result2.choices[0].message.content;
      console.log('✅ 校对完成');
      console.log('');
      console.log('⏱️  耗时:', timeTaken2, '秒');
      console.log('');
      console.log('📝 校对后内容:');
      console.log('----------------------------------------');
      console.log(verifiedText);
      console.log('----------------------------------------');
      console.log('');
      console.log('📏 文本长度:', verifiedText.length, '字符');

      if (result2.usage) {
        console.log('');
        console.log('🔢 Token用量:');
        console.log('  输入:', result2.usage.prompt_tokens);
        console.log('  输出:', result2.usage.completion_tokens);
        console.log('  总计:', result2.usage.total_tokens);
      }

      // 对比
      console.log('');
      console.log('');
      console.log('========================================');
      console.log('📊 总结对比');
      console.log('========================================');
      console.log('');
      console.log('⏱️  第一部分（识别）耗时:', ((startTime2 - startTime1) / 1000).toFixed(2), '秒');
      console.log('⏱️  第二部分（校对）耗时:', timeTaken2, '秒');
      console.log('⏱️  总耗时:', ((endTime2 - startTime1) / 1000).toFixed(2), '秒');
      console.log('');

      if (recognizedText === verifiedText) {
        console.log('📌 结论：识别结果与校对结果一致，无需修正');
      } else {
        console.log('📌 结论：校对后有修正，请对比上方两部分内容');
      }
    } else {
      console.log('❌ 校对失败');
      console.log('错误信息:', JSON.stringify(result2, null, 2));
    }
  } catch (error) {
    const endTime2 = Date.now();
    const timeTaken2 = ((endTime2 - startTime2) / 1000).toFixed(2);
    console.log('❌ 校对请求失败');
    console.log('⏱️  耗时:', timeTaken2, '秒');
    console.log('错误:', error.message);
  }
}

main();
