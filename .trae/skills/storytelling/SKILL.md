---
name: "storytelling"
description: "看图说话skill，用于无文字或少文字绘本的故事生成。Invoke when user asks about picture books, image storytelling, or when OCR detects no text or very little text."
---

# 看图说话 Skill

## 概述

当绘本没有文字或文字非常少时，让LLM看图自己编故事，且保证每一页的故事在逻辑上连贯。

## 触发条件

```
拍照 → OCR识别 → 文字很少(< 20字) → 进入看图说话模式
```

## 核心挑战

1. **如何检测是无文字绘本？** → OCR识别结果少于20个字符
2. **如何保证故事连贯？** → 每页生成时传入前几页的故事梗概
3. **如何生成适合儿童的故事？** → 使用专门的儿童故事提示词

## 流程设计

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ 拍照    │ →  │ OCR识别 │ →  │ 判断    │ →  │ 看图    │
│ 页面    │    │ 文字    │    │ 是否有字│    │ 说话    │
└─────────┘    └─────────┘    └─────────┘    └─────────┘
                                     │              │
                                     ▼              ▼
                              ┌──────────┐   ┌──────────┐
                              │ 有文字   │   │ 无文字   │
                              │ 正常朗读 │   │ LLM编故事│
                              └──────────┘   └──────────┘
```

## 步骤详解

### 步骤1：检测是否有文字

```javascript
async function hasEnoughText(imageBlob) {
  const text = await recognizePage(imageBlob);

  // 如果文字少于20个字符，认为是无文字绘本
  if (text.length < 20) {
    return false;
  }

  // 如果文字主要是数字或标点，也认为是无文字
  const cleanText = text.replace(/[\d\s\p{P}]/gu, '');
  if (cleanText.length < 10) {
    return false;
  }

  return true;
}
```

### 步骤2：看图说话

```javascript
async function generateStoryFromImage(imageBlob, previousStory = '') {
  const base64 = await blobToBase64(imageBlob);

  const prompt = previousStory
    ? `这是一个绘本故事的后续页面。之前的故事是：
"${previousStory}"

请根据这张新图片，继续编故事的下一部分。要求：
1. 保持与之前故事的连贯性
2. 延续相同的角色和情节
3. 用简单的语言，适合3-8岁儿童
4. 约50-80字
5. 生动有趣，有想象力`
    : `请根据这张图片编一个简短的儿童故事。要求：
1. 观察图片中的角色、场景、动作
2. 编一个简单有趣的故事
3. 语言简单，适合3-8岁儿童
4. 约50-80字
5. 生动有趣，有想象力
6. 这是故事的开头`;

  const result = await callVisionAPI({
    system: '你是一位优秀的儿童故事作家。你能根据图片创作生动有趣、适合儿童的故事。只输出故事内容，不要解释。',
    user: [
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + base64 } },
      { type: 'text', text: prompt }
    ]
  });

  return result;
}
```

### 步骤3：保持故事连贯

```javascript
class StoryContext {
  constructor() {
    this.pages = [];
    this.storySummary = '';
  }

  // 添加新页面
  addPage(pageNum, story) {
    this.pages.push({ pageNum, story });

    // 更新故事梗概（取最近3页）
    this.updateSummary();
  }

  // 更新故事梗概
  updateSummary() {
    const recentPages = this.pages.slice(-3);
    this.storySummary = recentPages.map(p => p.story).join(' ');
  }

  // 获取上下文
  getContext() {
    return this.storySummary;
  }

  // 获取完整故事
  getFullStory() {
    return this.pages.map(p => p.story).join('\n\n');
  }
}
```

## 提示词设计

### 第一页（故事开头）

```
请根据这张图片编一个简短的儿童故事开头。要求：
1. 观察图片中的主要角色和场景
2. 介绍故事的开始
3. 语言简单，适合3-8岁儿童
4. 约50-80字
5. 生动有趣，吸引孩子
```

### 后续页面（故事延续）

```
这是绘本故事的第{N}页。之前的故事是：
"{之前的故事梗概}"

请根据这张新图片，继续编故事。要求：
1. 保持与之前故事的连贯性
2. 延续相同的角色
3. 推进情节发展
4. 约50-80字
5. 语言简单，适合3-8岁儿童
```

### 最后一页（故事结尾）

```
这是绘本故事的最后一页。之前的故事是：
"{之前的故事梗概}"

请根据这张图片，给故事一个完整的结尾。要求：
1. 解决故事中的问题或冲突
2. 给出一个温馨或有趣的结局
3. 可以有一点小道理或寓意
4. 约50-80字
5. 语言简单，适合3-8岁儿童
```

## 完整流程

```javascript
async function readPictureBook(bookId) {
  const storyContext = new StoryContext();
  let pageNum = 1;

  while (true) {
    // 1. 拍照
    const image = await captureFrame();

    // 2. 检测是否有文字
    const hasText = await hasEnoughText(image);

    let story;
    if (hasText) {
      // 有文字，正常OCR识别
      story = await recognizePage(image);
    } else {
      // 无文字，看图说话
      story = await generateStoryFromImage(image, storyContext.getContext());
    }

    // 3. 保存
    await savePage(bookId, pageNum, image, story);

    // 4. 朗读
    await speakText(story);

    // 5. 更新故事上下文
    storyContext.addPage(pageNum, story);

    // 6. 检测是否最后一页
    const isLast = await checkIfLastPage(image);
    if (isLast) break;

    // 7. 提示翻页
    await speakText('小朋友，请翻下一页');
    await waitForPageTurn();

    pageNum++;
  }

  // 生成完整故事文本
  const fullStory = storyContext.getFullStory();
  await saveFullStory(bookId, fullStory);
}
```

## 混合模式

有些绘本可能前几页有文字，后几页没有。需要支持混合模式：

```javascript
async function readBook(bookId) {
  const storyContext = new StoryContext();
  let pageNum = 1;
  let isPictureBook = false;

  while (true) {
    const image = await captureFrame();
    const hasText = await hasEnoughText(image);

    let content;

    if (hasText) {
      // 有文字，OCR识别
      content = await recognizePage(image);

      // 如果前几页有文字，后面突然没文字，可能是绘本
      if (pageNum > 2 && !hasText) {
        isPictureBook = true;
      }
    } else {
      // 无文字
      if (pageNum === 1) {
        // 第一页就没文字，确认是绘本
        isPictureBook = true;
      }

      // 看图说话
      content = await generateStoryFromImage(image, storyContext.getContext());
    }

    storyContext.addPage(pageNum, content);
    await savePage(bookId, pageNum, image, content);
    await speakText(content);

    // ... 翻页逻辑
  }
}
```

## 错误处理

| 场景 | 处理方式 |
|------|----------|
| 图片识别失败 | 重试一次 |
| 故事生成失败 | 使用简单描述 |
| 故事不连贯 | 重新生成 |

## 开发指南

### 调整故事风格

修改提示词中的风格描述：
- 可以指定"幽默风格"
- 可以指定"温馨风格"
- 可以指定"冒险风格"

### 调整故事长度

修改提示词中的字数限制：
- 50-80字：简短版
- 100-150字：标准版
- 200字以上：详细版

### 添加故事角色

可以在第一页生成后，提取主要角色名称，在后续页面中保持一致：

```javascript
// 第一页生成后
const characters = await extractCharacters(story);
storyContext.setCharacters(characters);

// 后续页面生成时
const prompt = `故事角色有：${storyContext.getCharacters()}...`;
```
