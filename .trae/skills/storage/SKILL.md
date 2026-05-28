---
name: "storage"
description: "数据存储skill，用于IndexedDB存储、书籍管理、页面缓存、音频缓存、封面检测等功能开发。Invoke when user asks about data storage, IndexedDB, book management, caching, offline support, or book recognition."
---

# 数据存储 Skill

## 概述

负责读书宝App中的数据存储功能，包括书籍管理、页面内容缓存、音频缓存、封面相似度检测等。

## 存储流程

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ 拍摄封面 │ →  │ 保存封面 │ →  │ 识别书名 │ →  │ 保存书名 │ →  │ 逐页识别 │
└─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘
                                                                  │
                                                                  ▼
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ 连续播放 │ ←  │ 保存音频 │ ←  │ TTS合成 │ ←  │ 保存文字 │ ←  │ 拍摄页面 │
└─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘
```

## 数据库配置

- 数据库名：`DushubaoDB`
- 版本：`4`
- 存储空间：
  - `books` - 书籍元数据
  - `pages` - 页面内容
  - `audios` - 音频缓存
  - `covers` - 封面特征（新增）

## 数据结构

### books 存储空间

```javascript
{
  id: string,           // 书籍唯一标识
  title: string,        // 书名（从封面识别）
  cover: Blob,          // 封面图片数据
  coverHash: string,    // 封面特征哈希（用于相似度检测）
  totalPages: number,   // 总页数
  readProgress: number, // 阅读进度（页码）
  createdAt: number,    // 创建时间戳
  lastReadAt: number    // 最后阅读时间戳
}
```

### pages 存储空间

```javascript
{
  bookId: string,       // 关联书籍ID
  pageNum: number,      // 页码
  image: Blob,          // 页面照片
  text: string,         // OCR识别的文字内容
  savedAt: number       // 保存时间戳
}
```

**复合主键：** `[bookId, pageNum]`

### audios 存储空间

```javascript
{
  bookId: string,       // 关联书籍ID
  pageNum: number|string, // 页码（或'intro'/'finish'）
  audio: Blob,          // 音频数据
  savedAt: number       // 保存时间戳
}
```

**复合主键：** `[bookId, pageNum]`

### covers 存储空间（新增）

```javascript
{
  bookId: string,       // 关联书籍ID
  features: Array,      // 封面特征向量
  hash: string,         // 感知哈希
  savedAt: number       // 保存时间戳
}
```

## 主要功能

### 1. 封面保存

```javascript
async function saveCover(bookId, coverBlob) {
  // 保存封面图片
  await db.put('books', { id: bookId, cover: coverBlob });

  // 提取封面特征
  const features = await extractFeatures(coverBlob);
  const hash = await computeHash(coverBlob);

  // 保存特征用于后续检测
  await db.put('covers', { bookId, features, hash });
}
```

### 2. 书名保存

从OCR识别结果中提取书名，保存到书籍记录：

```javascript
async function saveBookTitle(bookId, title) {
  const book = await db.get('books', bookId);
  book.title = title;
  await db.put('books', book);
}
```

### 3. 页面保存

每一页保存照片和识别文字：

```javascript
async function savePage(bookId, pageNum, imageBlob, text) {
  await db.put('pages', {
    bookId,
    pageNum,
    image: imageBlob,
    text,
    savedAt: Date.now()
  });
}
```

### 4. 音频保存

每页音频单独保存，支持连续播放：

```javascript
async function saveAudio(bookId, pageNum, audioBlob) {
  await db.put('audios', {
    bookId,
    pageNum,
    audio: audioBlob,
    savedAt: Date.now()
  });
}
```

### 5. 连续播放（熏听模式）

不穿插翻页提示，自动连续播放所有页面音频：

```javascript
async function playContinuous(bookId) {
  const pages = await db.getAllByIndex('audios', 'bookId', bookId);

  // 排除intro和finish，只播放页面音频
  const pageAudios = pages
    .filter(p => typeof p.pageNum === 'number')
    .sort((a, b) => a.pageNum - b.pageNum);

  for (const page of pageAudios) {
    await playAudioBlob(page.audio);
  }
}
```

## 封面相似度检测

### 问题

每次拍摄的封面可能因角度、光线、清晰度等因素导致图片不完全相同，需要建立容错机制。

### 解决方案：多特征融合检测

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ 感知哈希    │ +  │ 颜色直方图  │ +  │ 文字匹配    │ → 综合相似度
│ (pHash)     │    │ (Histogram) │    │ (OCR)       │
└─────────────┘    └─────────────┘    └─────────────┘
```

### 检测流程

```javascript
async function findBookByCover(newCoverBlob) {
  // 1. 计算新封面的特征
  const newHash = await computeHash(newCoverBlob);
  const newColor = await computeColorHistogram(newCoverBlob);
  const newText = await recognizeText(newCoverBlob);

  // 2. 获取所有已保存的书籍
  const allBooks = await db.getAll('books');

  // 3. 计算相似度
  let bestMatch = null;
  let bestScore = 0;

  for (const book of allBooks) {
    const coverData = await db.get('covers', book.id);
    if (!coverData) continue;

    // 感知哈希相似度（汉明距离）
    const hashScore = 1 - hammingDistance(newHash, coverData.hash) / 64;

    // 颜色直方图相似度
    const colorScore = compareHistograms(newColor, coverData.colorHistogram);

    // 文字相似度（书名匹配）
    const textScore = compareText(newText, book.title);

    // 综合评分（加权平均）
    const totalScore = hashScore * 0.4 + colorScore * 0.3 + textScore * 0.3;

    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestMatch = book;
    }
  }

  // 4. 阈值判断（相似度 > 0.7 认为是同一本书）
  if (bestScore > 0.7) {
    return { book: bestMatch, score: bestScore };
  }

  return null;
}
```

### 感知哈希算法 (pHash)

对图片进行缩放、灰度化、DCT变换，提取低频分量生成64位哈希：

```javascript
async function computeHash(imageBlob) {
  // 1. 缩放到32x32
  const resized = await resizeImage(imageBlob, 32, 32);

  // 2. 转灰度
  const grayscale = await toGrayscale(resized);

  // 3. DCT变换
  const dct = await applyDCT(grayscale);

  // 4. 取左上角8x8
  const lowFreq = dct.slice(0, 8).map(row => row.slice(0, 8));

  // 5. 计算均值
  const mean = lowFreq.flat().reduce((a, b) => a + b) / 64;

  // 6. 生成哈希
  return lowFreq.flat().map(v => v > mean ? 1 : 0).join('');
}
```

### 汉明距离

计算两个哈希之间的不同位数：

```javascript
function hammingDistance(hash1, hash2) {
  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) distance++;
  }
  return distance;
}
```

### 颜色直方图

提取RGB各通道的颜色分布：

```javascript
async function computeColorHistogram(imageBlob) {
  const canvas = await imageToCanvas(imageBlob, 64, 64);
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, 64, 64);

  const histogram = { r: new Array(256).fill(0), g: new Array(256).fill(0), b: new Array(256).fill(0) };

  for (let i = 0; i < imageData.data.length; i += 4) {
    histogram.r[imageData.data[i]]++;
    histogram.g[imageData.data[i + 1]]++;
    histogram.b[imageData.data[i + 2]]++;
  }

  return histogram;
}
```

### 文字相似度

比较识别出的文字与已保存书名的匹配度：

```javascript
function compareText(text1, text2) {
  if (!text1 || !text2) return 0;

  // 提取书名（取前20个字符）
  const name1 = text1.substring(0, 20);
  const name2 = text2.substring(0, 20);

  // 计算最长公共子序列
  const lcs = longestCommonSubsequence(name1, name2);
  return lcs / Math.max(name1.length, name2.length);
}
```

## 主要方法

| 方法 | 功能 | 参数 | 返回值 |
|------|------|------|--------|
| `saveBook(bookData)` | 保存书籍 | bookData: object | Promise |
| `getBook(bookId)` | 获取书籍 | bookId: string | Promise |
| `getAllBooks()` | 获取所有书籍 | 无 | Promise<Array> |
| `deleteBook(bookId)` | 删除书籍 | bookId: string | Promise |
| `savePage(bookId, pageNum, image, text)` | 保存页面 | bookId, pageNum, image, text | Promise |
| `saveAudio(bookId, pageNum, audioBlob)` | 保存音频 | bookId, pageNum, audioBlob | Promise |
| `findBookByCover(coverBlob)` | 通过封面查找书籍 | coverBlob: Blob | Promise |
| `playContinuous(bookId)` | 连续播放（熏听） | bookId: string | Promise |

## 错误处理

| 场景 | 处理方式 |
|------|----------|
| 存储空间满 | 提示用户清理缓存 |
| 封面检测失败 | 作为新书处理 |
| 音频播放失败 | 跳过该页，继续播放 |

## 开发指南

### 添加新的检测特征

1. 在 `findBookByCover` 中添加新的特征计算
2. 调整权重分配
3. 测试准确率

### 优化存储性能

1. 使用索引加速查询
2. 批量操作使用事务
3. 定期清理过期数据
