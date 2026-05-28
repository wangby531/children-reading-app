---
name: "recognition"
description: "图书识别skill，用于拍照识别书本文字。Invoke when user asks about OCR, book recognition, text extraction, or image-to-text conversion."
---

# 图书识别 Skill

## 概述

负责读书宝App的图书识别功能。核心流程：**手机拍照 → 大模型识别文字 → 输出文本**

## 识别流程

```
┌─────────┐    ┌─────────┐    ┌─────────┐
│ 手机拍照 │ →  │ 图片转  │ →  │ 大模型  │ → 输出文本
│         │    │ Base64  │    │ 识别    │
└─────────┘    └─────────┘    └─────────┘
```

## 核心限制

### 1. 不识别拼音
- 识别结果中应过滤掉纯拼音内容
- 只保留中文和英文文字

### 2. 只识别正文内容
- **不识别**：出版社、作者、ISBN、定价等封面信息
- **只识别**：书本正文内容（翻开后的文字）

### 3. 不识别页码
- 忽略页面上的数字页码（如"13"、"第25页"等）
- 忽略章节编号（如"1."、"2."等，但保留正文中的序号）
- 只保留正文故事内容

## 大模型调用方式

### 调用机制

通过 **HTTP API + 提示词** 方式调用小米mimo大模型：

```javascript
const config = {
  apiUrl: 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',
  apiKey: '你的API密钥',
  model: 'mimo-v2.5'
};

const response = await fetch(config.apiUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + config.apiKey,
    'api-key': config.apiKey
  },
  body: JSON.stringify({
    model: config.model,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: {
            url: 'data:image/jpeg;base64,' + imageBase64
          }
        },
        {
          type: 'text',
          text: '你的提示词'
        }
      ]
    }]
  })
});
```

### 关键点说明

| 要素 | 说明 |
|------|------|
| **图片传递** | 图片转成Base64字符串，作为`image_url`传入 |
| **提示词** | 作为`text`类型传入，告诉大模型要做什么 |
| **返回结果** | `response.choices[0].message.content` |

## 提示词设计（效率优先）

### 重要原则

- **直接输出**：不要添加解释、前缀、后缀
- **禁止思考**：不要进行发散性思考，直接返回结果
- **限制token**：使用 `max_tokens` 参数控制输出长度
- **低温度**：设置 `temperature: 0` 保证稳定性

### API参数配置

```javascript
body: JSON.stringify({
  model: 'mimo-v2.5',
  messages: [...],
  max_tokens: 1000,
  temperature: 0,
  stream: false
})
```

### 识别提示词

**System Message：**
```
你是一个OCR识别引擎。只输出识别到的文字，不输出任何解释、前缀或格式。
```

**User Message：**
```
识别图中文字，只输出中文内容，忽略拼音、封面信息和页码。
```

### 提示词对比

| 版本 | 提示词 | 效果 |
|------|--------|------|
| ❌ 低效 | "请识别这张图片中的所有中文文字内容。要求：1. 只识别正文内容..." | 大模型可能发散思考 |
| ✅ 高效 | "识别图中文字，只输出中文内容，忽略拼音和封面信息。" | 直接执行，快速返回 |

## 代码实现

### 主要函数

| 函数 | 功能 |
|------|------|
| `captureCover()` | 拍照并触发识别 |
| `recognizeWithCloud(imageBlob)` | 调用大模型识别 |
| `filterPinyin(text)` | 过滤拼音内容 |

### 完整识别流程

```javascript
async function recognizeBook(imageBlob) {
  const base64 = await blobToBase64(imageBlob);
  const rawText = await recognizeWithCloud(base64, PROMPT_RECOGNIZE);
  const filteredText = filterPinyin(rawText);
  return filteredText;
}
```

## 错误处理

| 场景 | 处理方式 |
|------|----------|
| API调用失败 | 重试一次，仍失败则提示用户 |
| 识别结果为空 | 提示用户重新拍照 |
| 网络不可用 | 提示用户检查网络 |

## 开发指南

### 修改识别行为

修改提示词内容即可改变大模型的识别行为。

### 优化识别准确率

调整识别提示词，让大模型更专注于正文内容。

## 测试结果参考

经测试，mimo-v2.5 模型识别准确率较高：
- 平均识别耗时：7.19 秒
- 识别准确率：约 95%+
- 校对环节已移除（测试表明识别已足够准确）
