const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const TEST_DIR = path.join(__dirname, 'test_images');

if (!fs.existsSync(TEST_DIR)) {
  fs.mkdirSync(TEST_DIR);
}

const images = [
  {
    name: 'test1_小学语文.jpg',
    url: 'https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/doc/imgs/11.jpg',
    desc: '中文文档 - 复杂排版'
  },
  {
    name: 'test2_混合文字.jpg',
    url: 'https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/doc/imgs/12.jpg',
    desc: '中英文混合'
  },
  {
    name: 'test3_表格文档.jpg',
    url: 'https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/doc/imgs/table.jpg',
    desc: '表格文档'
  },
  {
    name: 'test4_手写文字.jpg',
    url: 'https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/doc/imgs/handwrite.jpg',
    desc: '手写文字'
  },
  {
    name: 'test5_密集文字.jpg',
    url: 'https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/doc/imgs/22.jpg',
    desc: '密集文字排版'
  }
];

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);

    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadFile(response.headers.location, destPath)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`下载失败: ${response.statusCode}`));
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

async function main() {
  console.log('========================================');
  console.log('📥 下载测试图片');
  console.log('========================================');
  console.log('');
  console.log('下载目录:', TEST_DIR);
  console.log('');

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const destPath = path.join(TEST_DIR, img.name);

    console.log(`[${i + 1}/${images.length}] ${img.desc}`);
    console.log(`    文件: ${img.name}`);
    console.log(`    来源: ${img.url}`);

    try {
      await downloadFile(img.url, destPath);
      const stat = fs.statSync(destPath);
      console.log(`    ✅ 下载成功 (${(stat.size / 1024).toFixed(1)} KB)`);
    } catch (error) {
      console.log(`    ❌ 下载失败: ${error.message}`);
    }
    console.log('');
  }

  console.log('========================================');
  console.log('📥 下载完成');
  console.log('========================================');

  const files = fs.readdirSync(TEST_DIR).filter(f => f.endsWith('.jpg') || f.endsWith('.png'));
  console.log(`共 ${files.length} 张测试图片`);
}

main();
