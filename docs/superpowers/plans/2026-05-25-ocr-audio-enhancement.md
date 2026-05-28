# 读书宝 OCR识别与有声读物增强 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为读书宝App添加OCR书页识别、本地缓存和TTS朗读功能，实现离线阅读体验

**Architecture:** 在现有单文件index.html中添加StorageManager、OCRManager、BookCache三个核心模块，使用Tesseract.js进行中文OCR识别，IndexedDB存储识别结果，Web Speech API进行TTS朗读

**Tech Stack:** Tesseract.js (CDN), IndexedDB, Web Speech API, HTML5 Canvas

---

## 文件结构

本次修改主要集中在 `index.html` 单文件中，新增以下模块：

| 文件 | 操作 | 职责 |
|------|------|------|
| `index.html` | 修改 | 主应用文件，添加所有新模块和UI |
| `www/index.html` | 同步 | Capacitor web目录，同步主文件 |

## 实施任务

### Task 1: 添加Tesseract.js依赖和OCRManager模块

**Files:**
- Modify: `index.html` (head部分添加CDN引用)
- Modify: `index.html` (script部分添加OCRManager类)

- [ ] **Step 1: 在index.html的head中添加Tesseract.js CDN引用**

```html
<script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"></script>
```

- [ ] **Step 2: 在script标签中添加OCRManager类**

```javascript
class OCRManager {
  constructor() {
    this.worker = null;
    this.initialized = false;
    this.initPromise = null;
  }

  async init() {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        this.worker = await Tesseract.createWorker('chi_sim+eng', 1, {
          logger: m => {
            if (m.status === 'recognizing text') {
              const progress = Math.round(m.progress * 100);
              document.dispatchEvent(new CustomEvent('ocr-progress', { detail: { progress } }));
            }
          }
        });
        this.initialized = true;
      } catch (err) {
        console.error('OCR初始化失败:', err);
        throw err;
      }
    })();

    return this.initPromise;
  }

  async recognizePage(imageBlob) {
    if (!this.initialized) {
      await this.init();
    }

    try {
      const result = await this.worker.recognize(imageBlob);
      return {
        text: result.data.text.trim(),
        confidence: result.data.confidence
      };
    } catch (err) {
      console.error('OCR识别失败:', err);
      throw err;
    }
  }

  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.initialized = false;
    }
  }
}
```

- [ ] **Step 3: 验证Tesseract.js加载**

在浏览器中打开index.html，检查控制台是否有Tesseract对象可用。

---

### Task 2: 重构StorageManager，支持pages存储

**Files:**
- Modify: `index.html` (替换现有IndexedDB代码为StorageManager类)

- [ ] **Step 1: 添加StorageManager类**

```javascript
class StorageManager {
  constructor() {
    this.dbName = 'DushubaoDB';
    this.dbVersion = 2;
    this.db = null;
  }

  async open() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains('books')) {
          const bookStore = db.createObjectStore('books', { keyPath: 'id' });
          bookStore.createIndex('title', 'title', { unique: false });
          bookStore.createIndex('lastReadAt', 'lastReadAt', { unique: false });
        }

        if (!db.objectStoreNames.contains('pages')) {
          const pageStore = db.createObjectStore('pages', { keyPath: ['bookId', 'pageNum'] });
          pageStore.createIndex('bookId', 'bookId', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  async saveBook(bookData) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['books'], 'readwrite');
      const store = transaction.objectStore('books');
      const request = store.put({
        ...bookData,
        lastReadAt: Date.now()
      });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getBook(bookId) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['books'], 'readonly');
      const store = transaction.objectStore('books');
      const request = store.get(bookId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllBooks() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['books'], 'readonly');
      const store = transaction.objectStore('books');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteBook(bookId) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['books', 'pages'], 'readwrite');
      const bookStore = transaction.objectStore('books');
      const pageStore = transaction.objectStore('pages');

      bookStore.delete(bookId);

      const index = pageStore.index('bookId');
      const request = index.openCursor(IDBKeyRange.only(bookId));

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async savePageContent(bookId, pageNum, text, confidence) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['pages'], 'readwrite');
      const store = transaction.objectStore('pages');
      const request = store.put({
        bookId,
        pageNum,
        text,
        confidence,
        savedAt: Date.now()
      });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getPageContent(bookId, pageNum) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['pages'], 'readonly');
      const store = transaction.objectStore('pages');
      const request = store.get([bookId, pageNum]);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getBookPages(bookId) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['pages'], 'readonly');
      const store = transaction.objectStore('pages');
      const index = store.index('bookId');
      const request = index.getAll(IDBKeyRange.only(bookId));
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }
}
```

- [ ] **Step 2: 替换现有IndexedDB代码**

删除现有的 `openDB`, `cacheBook`, `getCachedBook` 函数，替换为 `const storage = new StorageManager();`

- [ ] **Step 3: 更新 `searchBookByTitle` 函数中的缓存调用**

将 `await cacheBook(book.isbn, book)` 替换为 `await storage.saveBook(book)`

---

### Task 3: 改进扫描流程，集成OCR

**Files:**
- Modify: `index.html` (修改扫描页面HTML和JavaScript)

- [ ] **Step 1: 修改扫描页面HTML**

在 `#screen-scan` 中添加OCR进度显示区域：

```html
<div class="ocr-progress" id="ocrProgress" style="display:none;">
  <div class="ocr-progress-text">正在识别文字...</div>
  <div class="progress-track">
    <div class="progress-fill" id="ocrProgressFill" style="width:0%"></div>
  </div>
  <div class="ocr-status" id="ocrStatus">准备中...</div>
</div>
```

- [ ] **Step 2: 添加OCR进度样式**

```css
.ocr-progress {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0,0,0,0.8);
  padding: 30px;
  border-radius: 20px;
  text-align: center;
  z-index: 10;
  width: 80%;
}

.ocr-progress-text {
  color: white;
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 16px;
}

.ocr-status {
  color: rgba(255,255,255,0.8);
  font-size: 14px;
  margin-top: 12px;
}
```

- [ ] **Step 3: 修改captureCover函数，添加OCR识别逻辑**

```javascript
const ocrManager = new OCRManager();

async function captureCover() {
  const video = document.getElementById('cameraVideo');
  if (!video || video.readyState < 2) {
    showToast('摄像头未就绪，请稍候');
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);

  canvas.toBlob(async (blob) => {
    capturedBlob = blob;

    document.getElementById('scanOverlay').style.display = 'none';
    document.getElementById('ocrProgress').style.display = 'block';
    document.getElementById('ocrStatus').textContent = '正在初始化OCR引擎...';

    try {
      await ocrManager.init();
      document.getElementById('ocrStatus').textContent = '正在识别文字...';

      const result = await ocrManager.recognizePage(blob);

      if (result.text && result.text.length > 10) {
        const bookId = 'ocr_' + Date.now();
        const book = {
          id: bookId,
          title: result.text.substring(0, 20) + '...',
          author: 'OCR识别',
          cover: '',
          pages: [{ pageNum: 1, text: result.text }],
          totalPages: 1,
          createdAt: Date.now(),
          readProgress: 0
        };

        await storage.saveBook(book);
        await storage.savePageContent(bookId, 1, result.text, result.confidence);

        state.currentBook = book;
        showBookResult(book);
      } else {
        showToast('识别内容过少，请重新拍照或手动输入');
        document.getElementById('ocrProgress').style.display = 'none';
        document.getElementById('scanOverlay').style.display = '';
      }
    } catch (err) {
      showToast('识别失败: ' + err.message);
      document.getElementById('ocrProgress').style.display = 'none';
      document.getElementById('scanOverlay').style.display = '';
    }
  }, 'image/jpeg', 0.9);
}
```

- [ ] **Step 4: 添加OCR进度事件监听**

```javascript
document.addEventListener('ocr-progress', (e) => {
  const { progress } = e.detail;
  document.getElementById('ocrProgressFill').style.width = progress + '%';
  document.getElementById('ocrStatus').textContent = `识别中 ${progress}%`;
});
```

---

### Task 4: 改进阅读流程，使用本地缓存

**Files:**
- Modify: `index.html` (修改阅读相关函数)

- [ ] **Step 1: 修改startReading函数，支持从缓存读取**

```javascript
async function startReading() {
  const book = state.currentBook;
  if (!book) return;

  state.currentPage = book.readProgress || 1;
  state.totalPages = book.totalPages || 1;
  state.isPlaying = false;
  state.progress = 0;
  state.isPageComplete = false;

  document.getElementById('readBookTitle').textContent = book.title;
  showScreen('reading');
  document.getElementById('tabBarWrap').style.display = 'none';

  await loadPageContent(state.currentPage);

  state.isPlaying = true;
  updatePlayIcon();
  await speak('小朋友你好！今天我们来读《' + book.title + '》。', { rate: 0.8, pitch: 1.3 });
  
  if (state.isPlaying) {
    const text = document.getElementById('readingBody').innerText;
    await speak(text, { rate: 0.85, pitch: 1.1 });
  }
  
  if (state.isPlaying) {
    showTurnPagePrompt();
  }
}
```

- [ ] **Step 2: 添加loadPageContent函数**

```javascript
async function loadPageContent(pageNum) {
  const book = state.currentBook;
  if (!book) return;

  let pageContent = null;
  
  if (book.id.startsWith('ocr_')) {
    pageContent = await storage.getPageContent(book.id, pageNum);
  }

  const body = document.getElementById('readingBody');
  
  if (pageContent && pageContent.text) {
    const lines = pageContent.text.split(/[,，。！？\n]+/).filter(l => l.trim());
    body.innerHTML = lines.map(l => `<div class="line">${l.trim()}</div>`).join('');
  } else if (book.pages && book.pages[pageNum - 1]) {
    const page = book.pages[pageNum - 1];
    const lines = page.text.split(/[,，。！？\n]+/).filter(l => l.trim());
    body.innerHTML = lines.map(l => `<div class="line">${l.trim()}</div>`).join('');
  } else {
    body.innerHTML = '<div class="line">暂无内容</div>';
  }

  document.getElementById('pageInfo').textContent = `第 ${pageNum} 页 / 共 ${state.totalPages} 页`;
}
```

- [ ] **Step 3: 修改turnPage函数，使用loadPageContent**

```javascript
function turnPage(dir) {
  state.currentPage += dir;
  state.isPageComplete = false;
  state.progress = 0;
  document.getElementById('turnPagePrompt').style.display = 'none';
  document.getElementById('playerProgress').style.width = '0%';
  document.getElementById('currentTime').textContent = '0:00';

  const body = document.getElementById('readingBody');
  body.style.opacity = '0';
  body.style.transform = dir > 0 ? 'translateX(20px)' : 'translateX(-20px)';

  setTimeout(async () => {
    await loadPageContent(state.currentPage);

    body.style.transition = 'opacity 0.3s, transform 0.3s';
    body.style.opacity = '1';
    body.style.transform = 'translateX(0)';

    if (state.isPlaying) {
      const text = body.innerText;
      await speak(text, { rate: 0.8, pitch: 1.2 });
    }

    if (state.currentPage >= state.totalPages) {
      await speak('恭喜你读完啦！真棒！', { pitch: 1.4 });
      showToast('恭喜读完《' + state.currentBook.title + '》!');
      state.booksRead++;
    }

    simulatePlay();
  }, 300);
}
```

---

### Task 5: 添加书架页面缓存书籍显示

**Files:**
- Modify: `index.html` (修改书架页面HTML和JavaScript)

- [ ] **Step 1: 添加loadBookshelf函数**

```javascript
async function loadBookshelf() {
  const books = await storage.getAllBooks();
  const container = document.getElementById('bookshelfContent');
  
  if (!container) return;

  if (books.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--text-muted);">
        <p>还没有缓存的书籍</p>
        <p style="font-size:14px;margin-top:8px;">扫描图书开始阅读吧！</p>
      </div>
    `;
    return;
  }

  const booksHtml = books.map(book => `
    <div class="grid-card" data-book-id="${book.id}" onclick="openCachedBook('${book.id}')">
      <div class="cover" style="background:var(--mint-light)">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="var(--mint)" stroke-width="2">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
        </svg>
      </div>
      <span class="title">${book.title.substring(0, 15)}</span>
      <span class="meta" style="font-size:11px;color:var(--text-muted)">${new Date(book.lastReadAt).toLocaleDateString()}</span>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="book-grid">${booksHtml}</div>
  `;
}
```

- [ ] **Step 2: 添加openCachedBook函数**

```javascript
async function openCachedBook(bookId) {
  const book = await storage.getBook(bookId);
  if (book) {
    state.currentBook = book;
    showBookResult(book);
  } else {
    showToast('书籍未找到');
  }
}
```

- [ ] **Step 3: 修改书架页面HTML，添加动态内容区域**

```html
<div id="screen-bookshelf" class="screen">
  <div class="content">
    <div class="shelf-header">
      <h1>我的书架</h1>
      <div class="shelf-count" id="bookCount">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
        </svg>
        <span>0 本</span>
      </div>
    </div>
    <div id="bookshelfContent"></div>
    <div style="height:100px"></div>
  </div>
</div>
```

- [ ] **Step 4: 在switchTab函数中添加书架加载**

```javascript
function switchTab(name) {
  if (state.screen === 'reading' || state.screen === 'scan') {
    stopReading();
  }
  if (state.screen === 'scan') {
    stopCamera();
    state.isDetecting = false;
  }
  showScreen(name);
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.tab[data-screen="' + name + '"]').classList.add('active');
  document.getElementById('tabBarWrap').style.display = '';

  if (name === 'bookshelf') {
    loadBookshelf();
  }
}
```

---

### Task 6: 同步到www目录并测试

**Files:**
- Modify: `www/index.html` (同步主文件的所有更改)

- [ ] **Step 1: 复制index.html到www目录**

```bash
cp index.html www/index.html
```

- [ ] **Step 2: 启动本地服务器测试**

```bash
python -m http.server 8080
```

- [ ] **Step 3: 测试OCR识别流程**

1. 打开 http://localhost:8080
2. 点击"开始读书"
3. 对准一本书拍照
4. 等待OCR识别完成
5. 查看识别结果

- [ ] **Step 4: 测试本地缓存功能**

1. 识别一本书后关闭
2. 再次打开App
3. 进入书架页面
4. 点击已缓存的书籍
5. 验证内容是否正确加载

---

## 验证清单

- [ ] Tesseract.js正确加载，OCR识别功能正常
- [ ] StorageManager正确初始化，IndexedDB存储正常
- [ ] 拍照后OCR识别流程完整，进度显示正确
- [ ] 识别结果正确存储到IndexedDB
- [ ] 书架页面正确显示已缓存书籍
- [ ] 点击缓存书籍可正确加载内容
- [ ] TTS朗读功能正常工作
- [ ] 错误处理正确（OCR失败、存储失败等）
