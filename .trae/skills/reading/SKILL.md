---
name: "reading"
description: "语音朗读skill，用于TTS语音合成、阅读模式、翻页提示等功能开发。Invoke when user asks about TTS, voice synthesis, reading mode, page turning, or audio playback."
---

# 语音朗读 Skill

## 概述

负责读书宝App中的语音朗读功能。使用小米mimo TTS模型进行高质量语音合成，支持音色选择、朗读控制等。

## 朗读流程

```
┌─────────┐    ┌─────────┐    ┌─────────┐
│ 获取文字 │ →  │ 选择音色 │ →  │ 开始朗读 │
└─────────┘    └─────────┘    └─────────┘
                                    │
                                    ▼
                           ┌─────────────┐
                           │ 朗读完成    │
                           │ "请翻下一页" │
                           └─────────────┘
                                    │
                                    ▼
                           ┌─────────────┐
                           │ 识别下一页  │ → 继续朗读...
                           └─────────────┘
```

## TTS 模型配置

### 可用模型

| 模型 | Model ID | 功能 |
|------|----------|------|
| MiMo-V2.5-TTS | `mimo-v2.5-tts` | 预置精品音色 |
| MiMo-V2.5-TTS-VoiceDesign | `mimo-v2.5-tts-voicedesign` | 文本描述定制音色 |
| MiMo-V2.5-TTS-VoiceClone | `mimo-v2.5-tts-voiceclone` | 音频样本复刻音色（待实现） |

### API调用格式

```javascript
const response = await fetch(apiUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + apiKey,
    'api-key': apiKey
  },
  body: JSON.stringify({
    model: 'mimo-v2.5-tts',
    messages: [
      { role: 'user', content: '用自然的语气朗读' },
      { role: 'assistant', content: '要朗读的文字内容' }
    ],
    audio: { format: 'wav', voice: '冰糖' }
  })
});
```

## 预置音色列表

| 音色 | 性别 | 推荐场景 |
|------|------|----------|
| 冰糖 | 女性 | ✅ 温柔讲故事（默认） |
| 茉莉 | 女性 | 活泼朗读 |
| 苏打 | 男性 | 沉稳叙述 |
| 白桦 | 男性 | 磁性朗读 |

## 风格控制

通过自然语言描述控制朗读风格，放在 `role: user` 的消息中：

```
用温柔的语气，像妈妈给孩子讲故事一样，语速稍慢，声音温暖亲切。
```

## 朗读流程详解

### 步骤1：获取文字

从IndexedDB或OCR识别获取当前页文字内容。

### 步骤2：选择音色

```javascript
const voice = getUserSelectedVoice() || '冰糖';
```

### 步骤3：调用TTS朗读

```javascript
async function speakText(text, voice) {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { /* ... */ },
    body: JSON.stringify({
      model: 'mimo-v2.5-tts',
      messages: [
        { role: 'user', content: '用自然的语气朗读' },
        { role: 'assistant', content: text }
      ],
      audio: { format: 'wav', voice: voice }
    })
  });

  const audioData = await response.json();
  const audioBytes = base64.decode(audioData.choices[0].message.audio.data);
  return playAudio(audioBytes);
}
```

### 步骤4：翻页提示

```javascript
async function promptTurnPage() {
  await speakText('小朋友，请翻下一页', getUserSelectedVoice());
  showTurnPageAnimation();
}
```

### 步骤4.5：左右页引导

当摄像头同时拍到左右两页时（如摊开的书本），需要引导小朋友看向正确的一侧。

**触发条件**：仅当识别结果检测到双页时才触发引导，单页内容不提示左右页。

```javascript
async function guidePageSide(side) {
  const prompts = {
    left: [
      '小朋友，请先看左边这一页',
      '我们先来看看左边的故事吧',
      '小朋友，眼睛看左边哦'
    ],
    right: [
      '小朋友，该看右边了',
      '现在我们来看右边这一页',
      '小朋友，右边还有呢'
    ]
  };
  const text = prompts[side][Math.floor(Math.random() * prompts[side].length)];
  await speakText(text, getUserSelectedVoice(), '用亲切的语气引导小朋友');
}

async function handlePageContent(text, isDualPage) {
  if (isDualPage) {
    const { left, right } = splitDualPage(text);
    await speakText(left);
    await sleep(2000);  // 朗读间歇
    await guidePageSide('right');
    await sleep(1000);  // 引导后停顿1秒，让小朋友看过去
    await speakText(right);
  } else {
    await speakText(text);
  }
}
```

**引导规则**：
- 检测到双页时，先朗读左边，再引导看右边
- 单页内容不触发左右页引导
- 语气要温柔自然，不要用"左页""右页"等生硬词汇
- 引导语放在朗读间歇之后、正式朗读之前
- 引导后停顿1秒，让小朋友视线转移，再继续朗读右边内容

### 步骤5：继续下一页

```javascript
async function nextPage() {
  const nextPageNum = currentPage + 1;
  if (nextPageNum <= totalPages) {
    const text = await getPageContent(bookId, nextPageNum);
    await speakText(text, getUserSelectedVoice());
    await promptTurnPage();
    await nextPage();
  } else {
    await finishBook();
  }
}
```

### 步骤6：整本书完成

```javascript
async function finishBook() {
  generateBookSummary(bookId);
  await speakText('恭喜你，这本书读完啦！', getUserSelectedVoice());
}
```

## 音色设置功能

### 功能需求

1. **预置音色选择**：让用户选择冰糖、茉莉、苏打、白桦
2. **自定义音色录制**：录制爸爸妈妈的声音，生成自定义音色（待实现）
3. **音色预览**：选择后可以预览效果

## 音频缓存

### 缓存策略

- 每页音频单独缓存到IndexedDB
- 缓存键：`[bookId, pageNum, voiceId]`
- 再次阅读时直接播放缓存

## 错误处理

| 场景 | 处理方式 |
|------|----------|
| TTS API失败 | 重试一次，仍失败则使用Web Speech API |
| 音频播放被阻止 | 解锁音频上下文 |
| 网络不可用 | 使用缓存音频或Web Speech |

## 开发指南

### 修改朗读风格

修改 `role: user` 中的风格描述即可。

### 添加新的音色

在预置音色列表中添加，或使用VoiceDesign模型生成新音色。
