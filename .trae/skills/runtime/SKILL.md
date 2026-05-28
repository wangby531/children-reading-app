---
name: "runtime"
description: "运行skill，串起整个阅读流程：拍照→识别→保存→朗读→翻页检测→循环。Invoke when user asks about the main reading flow, auto-detection, page turning, or the complete reading process."
---

# 运行 Skill

## 概述

串起整个阅读流程的核心skill。摄像头常开，架在书前，自动完成：拍照→识别→保存→朗读→翻页检测→循环。

## 完整运行流程

```
┌─────────────────────────────────────────────────────────────┐
│                      运行流程                                │
│                                                             │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐ │
│  │ 摄像头  │ →  │ 拍照    │ →  │ 识别    │ →  │ 保存    │ │
│  │ 常开    │    │ 封面    │    │ 书名    │    │ 书架    │ │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘ │
│                                                     │       │
│                                                     ▼       │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐ │
│  │ 翻页    │ ←  │ 提示    │ ←  │ 朗读    │ ←  │ 拍照    │ │
│  │ 检测    │    │ 翻页    │    │ 内容    │    │ 页面    │ │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘ │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────┐    ┌─────────┐                                │
│  │ 全书    │ →  │ 生成    │                                │
│  │ 完成    │    │ 总结    │                                │
│  └─────────┘    └─────────┘                                │
└─────────────────────────────────────────────────────────────┘
```

## 步骤详解

### 步骤1：启动摄像头

```javascript
async function startReading() {
  // 启动摄像头
  await startCamera();

  // 步骤1：拍摄封面
  const coverBlob = await captureFrame();
  const bookInfo = await recognizeBookCover(coverBlob);

  // 检查是否已存在
  const existingBook = await findBookByCover(coverBlob);
  if (existingBook) {
    // 已存在，直接播放缓存音频
    await playContinuous(existingBook.id);
    return;
  }

  // 新书，保存封面和书名
  const bookId = generateBookId();
  await saveBook(bookId, bookInfo.title, coverBlob);

  // 进入逐页阅读循环
  await readPagesLoop(bookId);
}
```

### 步骤2：逐页阅读循环

```javascript
async function readPagesLoop(bookId) {
  let pageNum = 1;

  while (true) {
    // 1. 拍照当前页
    const pageImage = await captureFrame();

    // 2. 识别文字（同时进行）
    const text = await recognizePage(pageImage);

    // 3. 保存页面（识别和保存同时进行）
    await savePage(bookId, pageNum, pageImage, text);

    // 4. 生成并保存音频（同时进行）
    const audioBlob = await synthesizeSpeech(text);
    await saveAudio(bookId, pageNum, audioBlob);

    // 5. 朗读
    await playAudio(audioBlob);

    // 6. 检测是否是最后一页
    const isLastPage = await checkIfLastPage(text);
    if (isLastPage) {
      break;
    }

    // 7. 提示翻页
    await speakText('小朋友，请翻下一页');

    // 8. 等待翻页检测
    await waitForPageTurn();

    pageNum++;
  }

  // 全书完成
  await finishBook(bookId);
}
```

### 步骤3：翻页检测

**核心问题**：如何检测小孩已经翻页？

**解决方案**：图像差异检测

```javascript
async function waitForPageTurn() {
  const referenceFrame = await captureFrame();
  const referenceData = getImageData(referenceFrame);

  let pageTurnDetected = false;
  let stableCount = 0;
  const STABLE_THRESHOLD = 3;  // 连续3帧稳定才算翻页完成
  const DIFF_THRESHOLD = 0.15; // 15%差异认为是翻页

  while (!pageTurnDetected) {
    await sleep(500); // 每500ms检测一次

    const currentFrame = await captureFrame();
    const currentData = getImageData(currentFrame);

    const diff = calculateImageDifference(referenceData, currentData);

    if (diff > DIFF_THRESHOLD) {
      // 检测到变化，可能是翻页中
      stableCount = 0;
    } else {
      // 画面稳定
      stableCount++;

      if (stableCount >= STABLE_THRESHOLD) {
        // 连续稳定，确认翻页完成
        pageTurnDetected = true;
      }
    }
  }
}

function calculateImageDifference(data1, data2) {
  let diffPixels = 0;
  const totalPixels = data1.length / 4;

  for (let i = 0; i < data1.length; i += 4) {
    const rDiff = Math.abs(data1[i] - data2[i]);
    const gDiff = Math.abs(data1[i+1] - data2[i+1]);
    const bDiff = Math.abs(data1[i+2] - data2[i+2]);

    if (rDiff + gDiff + bDiff > 50) {
      diffPixels++;
    }
  }

  return diffPixels / totalPixels;
}
```

### 步骤4：最后一页检测

**问题**：如何知道当前是最后一页？

**解决方案**：多重检测机制

```javascript
async function checkIfLastPage(text) {
  // 方法1：内容分析 - 让LLM判断是否是结尾
  const isEnding = await analyzeIfEnding(text);
  if (isEnding) return true;

  // 方法2：空白检测 - 如果下一页是空白，说明翻完了
  const nextPageBlank = await detectBlankPage();
  if (nextPageBlank) return true;

  // 方法3：超时检测 - 如果翻页提示后长时间没有翻页
  // （在waitForPageTurn中实现超时机制）

  return false;
}

async function analyzeIfEnding(text) {
  const result = await callLLM({
    system: '你是内容分析专家。只回答"是"或"否"。',
    user: `以下文字是否像是一个故事或文章的结尾部分？
回答"是"或"否"。

文字：${text.substring(0, 200)}`
  });

  return result.includes('是');
}

async function detectBlankPage() {
  const frame = await captureFrame();
  const text = await recognizePage(frame);

  // 如果识别出的文字非常少，认为是空白页
  return text.length < 10;
}
```

### 步骤5：全书完成

```javascript
async function finishBook(bookId) {
  // 朗读完成语
  await speakText('恭喜你，这本书读完啦！真棒！', {
    style: '用开心表扬的语气，充满鼓励和赞许'
  });

  // 触发总结流程（另一个skill）
  generateBookSummary(bookId);
}
```

## 状态管理

```javascript
const runtimeState = {
  isRunning: false,
  currentBookId: null,
  currentPage: 0,
  phase: 'idle',  // idle, cover, reading, waiting_turn, finished
  cameraStream: null
};
```

## 错误处理

| 场景 | 处理方式 |
|------|----------|
| 摄像头被遮挡 | 提示用户调整 |
| 识别失败 | 重试一次，仍失败跳过 |
| 翻页检测超时 | 提示"请翻页"或"合上书本结束" |
| 网络中断 | 使用本地缓存或Web Speech |

## 性能优化

### 并行处理

识别、保存、TTS可以并行执行：

```javascript
// 并行执行识别和保存
const [text, _] = await Promise.all([
  recognizePage(pageImage),
  savePageImage(bookId, pageNum, pageImage)
]);

// TTS异步生成，不阻塞朗读
const audioPromise = synthesizeSpeech(text);
```

### 预加载

在朗读当前页时，可以预加载下一页的TTS：

```javascript
// 朗读当前页时，预生成下一页的音频
const [currentAudio, nextAudio] = await Promise.all([
  synthesizeSpeech(currentText),
  preGenerateNextAudio()
]);
```
