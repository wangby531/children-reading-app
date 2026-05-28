const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const configPath = path.join(__dirname, 'config.local.js');
eval(fs.readFileSync(configPath, 'utf-8'));

const TEST_DIR = path.join(__dirname, 'test_images');

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

async function testImage(imagePath, index) {
  const fileName = path.basename(imagePath);
  const stat = fs.statSync(imagePath);

  console.log(`\n${'='.repeat(50)}`);
  console.log(`📄 测试 ${index}: ${fileName}`);
  console.log(`📦 大小: ${(stat.size / 1024).toFixed(1)} KB`);
  console.log(`${'='.repeat(50)}`);

  const base64 = blobToBase64(imagePath);

  console.log('\n⏳ 正在识别...');
  const startTime = Date.now();

  try {
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

    const result = await callAPI(messages);
    const time = ((Date.now() - startTime) / 1000).toFixed(2);

    if (result.choices && result.choices.length > 0) {
      const text = result.choices[0].message.content;
      console.log(`✅ 识别完成 | 耗时: ${time}秒 | 字符数: ${text.length}`);
      console.log(`📝 内容: ${text}`);

      return {
        file: fileName,
        text: text,
        time: time,
        success: true
      };
    } else {
      console.log(`❌ 识别失败 | 耗时: ${time}秒`);
      return { file: fileName, time: time, success: false };
    }
  } catch (error) {
    const time = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`❌ 识别错误 | 耗时: ${time}秒 | ${error.message}`);
    return { file: fileName, time: time, success: false };
  }
}

async function main() {
  console.log('========================================');
  console.log('📚 识别Skill 测试');
  console.log('========================================');
  console.log('');
  console.log('📋 配置:');
  console.log('  模型:', CONFIG.model);
  console.log('  API:', CONFIG.apiUrl);
  console.log('');

  const files = fs.readdirSync(TEST_DIR)
    .filter(f => /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(f))
    .map(f => path.join(TEST_DIR, f));

  console.log(`📁 测试图片: ${files.length} 张`);
  files.forEach(f => console.log('  -', path.basename(f)));

  const results = [];

  for (let i = 0; i < files.length; i++) {
    const result = await testImage(files[i], i + 1);
    results.push(result);
  }

  // 汇总
  console.log('\n\n');
  console.log('='.repeat(60));
  console.log('📊 汇总报告');
  console.log('='.repeat(60));
  console.log('');

  const successResults = results.filter(r => r.success);
  const totalTime = successResults.reduce((sum, r) => sum + parseFloat(r.time), 0);

  console.log(`| ${'文件'.padEnd(20)} | ${'耗时'.padEnd(8)} | ${'字符数'.padEnd(8)} | ${'状态'.padEnd(6)} |`);
  console.log(`|${'-'.repeat(22)}|${'-'.repeat(10)}|${'-'.repeat(10)}|${'-'.repeat(8)}|`);

  results.forEach(r => {
    const status = r.success ? '✅' : '❌';
    const chars = r.success ? r.text.length.toString() : '-';
    console.log(`| ${r.file.padEnd(18)} | ${(r.time + 's').padEnd(8)} | ${chars.padEnd(8)} | ${status.padEnd(6)} |`);
  });

  console.log('');
  console.log(`📌 结论:`);
  console.log(`   - 测试总数: ${results.length}`);
  console.log(`   - 成功识别: ${successResults.length}/${results.length}`);
  if (successResults.length > 0) {
    console.log(`   - 平均耗时: ${(totalTime / successResults.length).toFixed(2)}秒`);
  }
}

main();
