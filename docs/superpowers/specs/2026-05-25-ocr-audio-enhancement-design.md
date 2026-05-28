# 读书宝 - OCR识别与有声读物增强设计

## 概述

为读书宝App添加两个核心功能：
1. **免费有声读物资源**：使用Web Speech API进行中文TTS朗读
2. **AI自动读书**：通过摄像头OCR识别书页内容，本地缓存，支持离线使用

## 设计目标

- 零成本：所有功能完全免费，无需API密钥
- 离线优先：识别结果本地存储，再次扫描无需联网
- 存储抽象：当前用IndexedDB，未来可切换到APP原生存储

## 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                      index.html                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  扫描模块    │  │  OCR模块     │  │  TTS模块     │     │
│  │  Camera     │→│  Tesseract  │→│  Speech     │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
│         ↓                ↓                ↓              │
│  ┌─────────────────────────────────────────────────┐   │
│  │              StorageManager (抽象层)              │   │
│  │  ┌───────────────┐  ┌───────────────────────┐  │   │
│  │  │  IndexedDB     │  │  (未来) APP Native    │  │   │
│  │  │  Adapter       │  │  Storage Adapter      │  │   │
│  │  └───────────────┘  └───────────────────────┘  │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 模块职责

| 模块 | 职责 | 依赖 |
|------|------|------|
| `StorageManager` | 统一存储接口，当前用IndexedDB | 无 |
| `OCRManager` | 封装Tesseract.js，识别书页文字 | Tesseract.js CDN |
| `BookCache` | 管理已识别书籍的缓存 | StorageManager |
| `TTSManager` | 增强版TTS，支持语音选择 | Web Speech API |

## 核心模块设计

### 1. StorageManager - 存储抽象层

```javascript
class StorageManager {
  constructor(adapter = 'indexeddb') {
    this.adapter = adapter;
  }
  
  async saveBook(bookData) { ... }
  async getBook(bookId) { ... }
  async getAllBooks() { ... }
  async savePageContent(bookId, pageNum, text, imageBlob) { ... }
  async getPageContent(bookId, pageNum) { ... }
  async deleteBook(bookId) { ... }
}
```

**IndexedDB数据结构：**

- `books` store：存储书籍元信息
  - `id`: 书籍唯一标识（ISBN或hash）
  - `title`: 书名
  - `author`: 作者
  - `cover`: 封面图片（base64）
  - `createdAt`: 创建时间
  - `lastReadAt`: 最后阅读时间
  - `readProgress`: 阅读进度（页码）
  - `totalPages`: 总页数

- `pages` store：存储每页内容
  - `id`: 自增主键
  - `bookId`: 关联书籍ID
  - `pageNum`: 页码
  - `text`: OCR识别的文字内容
  - `imageThumbnail`: 页面缩略图（base64，可选）
  - `confidence`: OCR识别置信度

### 2. OCRManager - OCR识别模块

```javascript
class OCRManager {
  constructor() {
    this.worker = null;
    this.initialized = false;
  }
  
  async init() {
    // 从CDN加载 Tesseract.js
    // 初始化 worker，加载 chi_sim + eng 语言包
  }
  
  async recognizePage(imageBlob) {
    // 识别图片中的文字
    // 返回 { text, confidence }
  }
  
  terminate() {
    // 释放资源
  }
}
```

**CDN资源：**
- Tesseract.js: `https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js`
- 语言包会自动从CDN下载并缓存

**关键点：**
- 首次加载语言包约15MB，之后会缓存到浏览器
- 支持`chi_sim`（简体中文）和`eng`（英文）
- 识别结果包含置信度，可用于判断是否需要手动修正

### 3. 改进的扫描流程

**原流程：**
```
拍照 → 分享到Google Lens → 手动输入书名 → 查询API
```

**新流程：**
```
拍照 → OCR识别文字 → 存储到本地 → TTS朗读
         ↓
    再次扫描同一本书 → 检查本地缓存 → 直接读取已存储内容
```

### 4. 数据流

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ 摄像头    │ →  │ 拍照     │ →  │ OCR识别   │ →  │ 存储缓存  │
│ getUserMedia│  │ capture  │    │ Tesseract │    │ IndexedDB│
└──────────┘    └──────────┘    └──────────┘    └──────────┘
                                                       ↓
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ TTS朗读   │ ←  │ 显示内容  │ ←  │ 读取缓存  │ ←  │ 再次扫描  │
│ Speech   │    │ reading  │    │ getBook  │    │ startScan│
└──────────┘    └──────────┘    └──────────┘    └──────────┘
```

## UI改进

### 扫描页面

- 移除"分享到Google Lens"按钮
- 新增OCR识别进度条（显示识别百分比）
- 识别完成后显示识别结果预览（文字+缩略图）
- 支持"重新识别"和"确认使用"按钮

### 阅读页面

- 显示当前页OCR文字内容（可滚动）
- 支持手动修正文字（点击文字进入编辑模式）
- 语音选择下拉框（如果浏览器支持多个语音）

### 书架页面

- 显示已缓存书籍数量
- 支持删除缓存书籍（长按或滑动删除）
- 显示每本书的识别时间

## 错误处理

| 场景 | 处理方式 |
|------|----------|
| OCR识别失败 | 提示"识别失败，请重新拍照"，允许手动输入 |
| TTS不支持 | 降级为显示文字，提示"当前浏览器不支持语音" |
| 存储空间满 | 提示"存储空间不足，请清理缓存" |
| 网络离线 | 仅使用本地缓存，提示"离线模式" |
| 摄像头权限被拒 | 提示"需要摄像头权限"，提供手动输入选项 |

## 实施顺序

1. **第一步**：添加Tesseract.js依赖，创建OCRManager
2. **第二步**：重构StorageManager，支持pages存储
3. **第三步**：改进扫描流程，集成OCR
4. **第四步**：改进阅读流程，使用本地缓存
5. **第五步**：UI调整和错误处理
6. **第六步**：同步到www目录，测试

## 技术约束

- 纯前端实现，无需后端服务器
- 所有依赖通过CDN加载，无需npm构建
- 保持单文件架构（index.html）
- 兼容移动端浏览器

## 未来扩展

- **APP原生存储**：通过Capacitor插件访问设备文件系统
- **云端同步**：添加可选的云端备份功能
- **多语言OCR**：支持更多语言识别
- **AI增强**：使用本地AI模型提升识别准确率
