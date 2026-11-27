(() => {
  'use strict';

  const DB_NAME = 'kho-cua-tui';
  const DB_VERSION = 1;
  const STORE = 'vaults';
  const PALETTE = [
    ['#a88af8','rgba(168,138,248,.12)'],
    ['#70a9ed','rgba(112,169,237,.12)'],
    ['#d29b68','rgba(210,155,104,.12)'],
    ['#78bba5','rgba(120,187,165,.12)']
  ];

  const els = {
    main: document.getElementById('mainContent'),
    library: document.getElementById('libraryContent'),
    settings: document.getElementById('settingsContent'),
    grid: document.getElementById('vaultGrid'),
    empty: document.getElementById('emptyState'),
    dialog: document.getElementById('vaultDialog'),
    form: document.getElementById('vaultForm'),
    name: document.getElementById('vaultName'),
    notice: document.getElementById('noticeDialog'),
    noticeTitle: document.getElementById('noticeTitle'),
    noticeText: document.getElementById('noticeText')
  };

  let dbPromise;
  let vaults = [];
  let selectedEmoji = '✦';
  let activeVault = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('Trình duyệt không hỗ trợ lưu trữ cục bộ cần thiết.'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Không thể mở kho dữ liệu.'));
    });
    return dbPromise;
  }

  async function readAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async function saveVault(vault) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(vault);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Không thể lưu dữ liệu.'));
      tx.onabort = () => reject(tx.error || new Error('Lưu dữ liệu bị gián đoạn.'));
    });
  }

  function createElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderVaults() {
    const hasVaults = vaults.length > 0;
    els.empty.hidden = hasVaults;
    els.grid.hidden = !hasVaults;
    els.grid.replaceChildren();

    vaults.sort((a, b) => b.updatedAt - a.updatedAt);
    const fragment = document.createDocumentFragment();

    vaults.forEach((vault, index) => {
      const [accent, glow] = PALETTE[index % PALETTE.length];
      const card = createElement('button', 'vault-card');
      card.type = 'button';
      card.style.setProperty('--glow', glow);
      card.style.setProperty('--symbol-bg', glow);
      const symbol = createElement('span', 'vault-symbol', vault.emoji || '✦');
      symbol.style.color = accent;
      const name = createElement('span', 'vault-name', vault.name);
      const meta = createElement('span', 'vault-meta', 'Chưa có mục lưu trữ');
      const arrow = createElement('span', 'vault-arrow', '↗');
      card.append(symbol, name, meta, arrow);
      card.addEventListener('click', () => openVault(vault.id));
      fragment.append(card);
    });
    els.grid.append(fragment);
  }

  function updateStats() {
    document.getElementById('photoCount').textContent = '0';
    document.getElementById('videoCount').textContent = '0';
    document.getElementById('fileCount').textContent = '0';
  }

  function showNotice(title, message) {
    els.noticeTitle.textContent = title;
    els.noticeText.textContent = message;
    els.notice.showModal();
  }

  function showHome() {
    activeVault = null;
    els.main.hidden = false;
    els.library.hidden = true;
    els.settings.hidden = true;
    document.querySelectorAll('.nav-item').forEach(button => {
      button.classList.toggle('active', button.dataset.tab === 'home');
    });
    window.scrollTo(0, 0);
  }

  function openVault(id) {
    activeVault = vaults.find(vault => vault.id === id);
    if (!activeVault) return;
    els.main.hidden = true;
    els.settings.hidden = true;
    els.library.hidden = false;
    els.library.replaceChildren();

    const back = createElement('button', 'page-back', '←  Trang chủ');
    back.addEventListener('click', showHome);
    const kicker = createElement('div', 'section-kicker', 'KHÔNG GIAN CỦA BẠN');
    const title = createElement('h1', '', activeVault.name);
    const description = createElement('p', 'page-description', 'Đây là nơi sắp xếp nội dung trong không gian này.');
    const empty = createElement('div', 'category-empty', 'Không gian này chưa có nhóm nào.\nPhần tạo nhóm và nhập nội dung sẽ được bổ sung ở bước tiếp theo.');
    els.library.append(back, kicker, title, description, empty);
    window.scrollTo(0, 0);
  }

  function openCreateDialog() {
    els.form.reset();
    selectedEmoji = '✦';
    document.querySelectorAll('.emoji-option').forEach(button => {
      button.classList.toggle('selected', button.dataset.emoji === selectedEmoji);
    });
    els.dialog.showModal();
    window.setTimeout(() => els.name.focus(), 80);
  }

  document.getElementById('addVaultButton').addEventListener('click', openCreateDialog);
  document.getElementById('emptyCreateButton').addEventListener('click', openCreateDialog);
  document.getElementById('iconOptions').addEventListener('click', event => {
    const button = event.target.closest('.emoji-option');
    if (!button) return;
    selectedEmoji = button.dataset.emoji;
    document.querySelectorAll('.emoji-option').forEach(option => {
      option.classList.toggle('selected', option === button);
    });
  });

  els.form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = els.name.value.trim();
    if (!name) {
      els.name.focus();
      return;
    }
    if (vaults.some(vault => vault.name.toLocaleLowerCase('vi') === name.toLocaleLowerCase('vi'))) {
      showNotice('Tên đã được sử dụng', 'Bạn đã có một không gian mang tên này. Hãy chọn tên khác nhé.');
      return;
    }
    const vault = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2),
      name,
      emoji: selectedEmoji,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      groups: []
    };
    try {
      await saveVault(vault);
      vaults.push(vault);
      renderVaults();
      els.dialog.close();
    } catch (error) {
      showNotice('Chưa thể lưu', error.message || 'Hãy kiểm tra dung lượng và quyền lưu trữ của trình duyệt.');
    }
  });

  document.querySelectorAll('.nav-item').forEach(button => {
    button.addEventListener('click', () => {
      const tab = button.dataset.tab;
      if (tab === 'home') {
        showHome();
        return;
      }
      if (tab === 'photos' || tab === 'videos' || tab === 'files') {
        showHome();
        const labels = { photos: 'Ảnh', videos: 'Video', files: 'Tệp' };
        showNotice(labels[tab], 'Khu vực này sẽ được triển khai sau khi hoàn thiện cấu trúc kho và nhóm lưu trữ.');
      }
    });
  });

  document.getElementById('settingsButton').addEventListener('click', () => {
    showNotice('Cài đặt', 'Các tùy chọn giao diện, sao lưu và bảo mật sẽ được thêm ở giai đoạn quản lý dữ liệu.');
  });

  async function init() {
    try {
      vaults = await readAll();
      renderVaults();
      updateStats();
    } catch (error) {
      showNotice('Không thể khởi tạo kho', error.message || 'Trình duyệt chưa cấp quyền lưu trữ cục bộ.');
    }
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  init();
})();