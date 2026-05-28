---
name: "summary"
description: "总结skill，用于生成全书总结。Invoke when user asks about book summary, story conclusion, or generating a recap of the book."
---

# 总结 Skill

## 概述

在全书朗读完成后，生成一个简短的全书总结，帮助孩子回顾故事内容。

## 核心挑战

**如何提高总结速度？**

如果等全书扫描完再一起发送给大模型，会需要很长时间。最佳方案是**提前开始总结**。

## 解决方案：渐进式总结

### 策略1：内容分析预测结尾

在朗读每一页时，让LLM判断是否接近结尾：

```javascript
async function checkIfApproachingEnd(text, pageNum) {
  const result = await callLLM({
    system: '你是内容分析专家。只回答"是"或"否"。',
    user: `以下文字是否像是故事的结尾或接近结尾？
回答"是"或"否"。

页码：第${pageNum}页
文字：${text.substring(0, 150)}`
  });

  return result.includes('是');
}
```

**触发条件**：当检测到接近结尾时，开始后台总结。

### 策略2：渐进式总结

在朗读过程中，逐步更新总结：

```javascript
class ProgressiveSummarizer {
  constructor() {
    this.pages = [];
    this.summary = '';
    this.isSummarizing = false;
  }

  // 添加新页面内容
  addPage(pageNum, text) {
    this.pages.push({ pageNum, text });

    // 每3页更新一次总结
    if (this.pages.length % 3 === 0) {
      this.updateSummary();
    }
  }

  // 更新总结
  async updateSummary() {
    if (this.isSummarizing) return;
    this.isSummarizing = true;

    const allText = this.pages.map(p => p.text).join('\n');

    this.summary = await callLLM({
      system: '你是故事总结专家。用简短的3-5句话总结故事内容，适合儿童理解。',
      user: `请总结以下故事内容：
${allText}`
    });

    this.isSummarizing = false;
  }

  // 获取最终总结
  async getFinalSummary() {
    // 如果还没有总结，生成一个
    if (!this.summary) {
      await this.updateSummary();
    }
    return this.summary;
  }
}
```

### 策略3：最后一页OCR完成后立即并行生成（推荐）

**触发时机**：最后一页OCR识别完成后，立即启动总结生成，与最后一页TTS朗读并行执行。

```javascript
async function onLastPageOCRComplete(allTexts) {
  // OCR完成后立即启动总结，不等待TTS
  const summaryPromise = callAPI([
    { role: 'system', content: '你是一位讲故事的姐姐，擅长用小朋友听得懂的语言总结故事。' },
    { role: 'user', content: `以下是小朋友刚才读的一本书的内容：\n\n${allTexts.join('\n\n')}\n\n请用2-3句话总结这本书，用温暖亲切的语气，适合小朋友听。` }
  ], textModel, 500);

  // 继续执行TTS朗读（不等待总结）
  await speakText(lastPageText);

  // TTS完成后，总结已经生成好了
  const summaryResult = await summaryPromise;
  return summaryResult.choices[0].message.content;
}
```

**并行时间线**：
```
最后一页OCR完成
    ├─→ 启动总结生成（后台，约12秒）
    └─→ TTS朗读最后一页（前台，约80秒）
              │
              └─→ TTS完成时，总结早已就绪（0秒等待）
```

**优势**：总结生成时间完全被TTS朗读时间覆盖，用户无感知等待。

## 完整流程

```
┌─────────────────────────────────────────────────────────────┐
│                    总结流程                                   │
│                                                             │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐                 │
│  │ 朗读    │ →  │ 检测    │ →  │ 开始    │                 │
│  │ 每一页  │    │ 接近结尾│    │ 预生成  │                 │
│  └─────────┘    └─────────┘    └─────────┘                 │
│                       │              │                      │
│                       ▼              ▼                      │
│              ┌─────────────────────────────┐                │
│              │  最后一页朗读时              │                │
│              │  并行生成总结               │                │
│              └─────────────────────────────┘                │
│                            │                                │
│                            ▼                                │
│              ┌─────────────────────────────┐                │
│              │  朗读总结                   │                │
│              └─────────────────────────────┘                │
└─────────────────────────────────────────────────────────────┘
```

## 时间线示例

假设一本书有10页：

```
第1-7页：正常朗读，渐进式更新总结
第8页：检测到接近结尾，开始后台总结
第9页：继续朗读，总结正在生成
第10页：最后一页朗读
         ↓
       总结已生成完成
         ↓
       朗读总结
```

## 总结提示词

### 儿童版总结（默认）

```
你是儿童故事总结专家。请用3-5句简单的话总结这个故事，要求：
1. 语言简单，适合3-8岁儿童
2. 生动有趣，吸引孩子
3. 包含主要角色和结局
4. 不超过100字

故事内容：{全文}
```

### 详细版总结（可选）

```
你是故事分析专家。请总结这个故事，包含：
1. 主要角色
2. 故事背景
3. 主要情节
4. 故事结局
5. 故事寓意

用简洁的语言，适合儿童理解。

故事内容：{全文}
```

## 性能优化

### 并行处理

```javascript
// 在朗读最后一页时，并行生成总结
const [_, summary] = await Promise.all([
  speakText(lastPageText),
  generateSummary(bookId)
]);
```

### 缓存总结

```javascript
// 将总结保存到数据库
await storage.saveSummary(bookId, summary);

// 下次直接使用缓存
const cachedSummary = await storage.getSummary(bookId);
if (cachedSummary) {
  return cachedSummary;
}
```

### 流式生成

如果总结较长，可以流式生成并朗读：

```javascript
async function streamSummary(allText) {
  const stream = await callLLMStream({
    system: '你是儿童故事总结专家。',
    user: `总结故事：${allText}`
  });

  let summary = '';
  for await (const chunk of stream) {
    summary += chunk;
    // 可以在这里实时更新UI
  }

  return summary;
}
```

## 错误处理

| 场景 | 处理方式 |
|------|----------|
| 总结生成失败 | 使用简化版总结 |
| 网络中断 | 使用本地缓存 |
| 内容过长 | 截取关键部分 |

## 开发指南

### 修改总结风格

修改提示词中的风格描述即可。

### 调整总结长度

修改提示词中的字数限制。

### 添加多语言支持

根据用户语言设置选择对应的提示词。
