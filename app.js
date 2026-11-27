(() => {
  'use strict';

  const DB_NAME = 'kho-cua-tui';
  const APP_VERSION = '0.3.0';
  const APP_RELEASE_DATE = '27/11/2026';
  const DB_VERSION = 2;
  const STORE = 'vaults';
  const MEDIA_STORE = 'media';
  const FILE_STORE = 'mediaFiles';
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
  let selectedGroupType = 'photos';
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
        if (!db.objectStoreNames.contains(MEDIA_STORE)) {
          const mediaStore = db.createObjectStore(MEDIA_STORE, { keyPath: 'id' });
          mediaStore.createIndex('vaultId', 'vaultId');
          mediaStore.createIndex('groupId', 'groupId');
          mediaStore.createIndex('createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains(FILE_STORE)) {
          db.createObjectStore(FILE_STORE, { keyPath: 'id' });
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

  async function readAllMedia() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const request = db.transaction(MEDIA_STORE, 'readonly').objectStore(MEDIA_STORE).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }


  function sortMediaRecords(records, mode) {
    const copy = [...records];
    switch (mode) {
      case 'oldest':
        return copy.sort((a, b) => a.createdAt - b.createdAt);
      case 'name-asc':
        return copy.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi', { sensitivity: 'base' }));
      case 'name-desc':
        return copy.sort((a, b) => (b.name || '').localeCompare(a.name || '', 'vi', { sensitivity: 'base' }));
      case 'manual':
        return copy.sort((a, b) => {
          const left = Number.isFinite(a.orderIndex) ? a.orderIndex : a.createdAt;
          const right = Number.isFinite(b.orderIndex) ? b.orderIndex : b.createdAt;
          return left - right;
        });
      case 'newest':
      default:
        return copy.sort((a, b) => b.createdAt - a.createdAt);
    }
  }

  async function readMediaForGroup(groupId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const request = db.transaction(MEDIA_STORE, 'readonly')
        .objectStore(MEDIA_STORE).index('groupId').getAll(groupId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async function readMediaFile(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const request = db.transaction(FILE_STORE, 'readonly').objectStore(FILE_STORE).get(id);
      request.onsuccess = () => resolve(request.result ? request.result.blob : null);
      request.onerror = () => reject(request.error);
    });
  }

  async function savePhotoRecord(record, originalBlob) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([MEDIA_STORE, FILE_STORE], 'readwrite');
      tx.objectStore(MEDIA_STORE).put(record);
      tx.objectStore(FILE_STORE).put({ id: record.id, blob: originalBlob });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Không thể lưu ảnh.'));
      tx.onabort = () => reject(tx.error || new Error('Lưu ảnh bị gián đoạn.'));
    });
  }

  async function getGroupPhotoCounts() {
    const records = await readAllMedia();
    const counts = new Map();
    records.forEach(record => {
      if (record.kind === 'photo') counts.set(record.groupId, (counts.get(record.groupId) || 0) + 1);
    });
    return counts;
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

  async function updateStats() {
    try {
      const records = await readAllMedia();
      document.getElementById('photoCount').textContent = String(records.filter(item => item.kind === 'photo').length);
      document.getElementById('videoCount').textContent = String(records.filter(item => item.kind === 'video').length);
      document.getElementById('fileCount').textContent = String(records.filter(item => item.kind === 'file').length);
    } catch (error) {
      console.warn('Không thể cập nhật thống kê:', error);
    }
  }

  function showNotice(title, message) {
    els.noticeTitle.textContent = title;
    els.noticeText.textContent = message;
    els.notice.showModal();
  }

  function showHome() {
    photoPageToken += 1;
    revokePageUrls();
    activeVault = null;
    els.main.hidden = false;
    els.library.hidden = true;
    els.settings.hidden = true;
    document.querySelectorAll('.nav-item').forEach(button => {
      button.classList.toggle('active', button.dataset.tab === 'home');
    });
    photoPageToken += 1;
    window.scrollTo(0, 0);
  }

  function openVault(id) {
    photoPageToken += 1;
    revokePageUrls();
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
    const description = createElement('p', 'page-description', 'Các nhóm trong không gian này được lưu riêng biệt.');
    const heading = createElement('div', 'library-heading');
    const headingLabel = createElement('h2', '', 'Nhóm lưu trữ');
    const addGroup = createElement('button', 'text-button', '＋ Tạo nhóm');
    addGroup.type = 'button';
    addGroup.addEventListener('click', openGroupDialog);
    heading.append(headingLabel, addGroup);

    const groupGrid = createElement('div', 'vault-grid');
    const groups = Array.isArray(activeVault.groups) ? activeVault.groups : [];
    if (groups.length === 0) {
      const empty = createElement('div', 'category-empty', 'Chưa có nhóm nào trong không gian này.\nTạo nhóm Ảnh, Video, Tài liệu hoặc Khác để bắt đầu sắp xếp.');
      els.library.append(back, kicker, title, description, heading, empty);
    } else {
      const fragment = document.createDocumentFragment();
      groups.forEach((group, index) => {
        const card = createElement('button', 'vault-card group-card');
        card.type = 'button';
        card.style.setProperty('--glow', PALETTE[index % PALETTE.length][1]);
        card.style.setProperty('--symbol-bg', PALETTE[index % PALETTE.length][1]);
        const symbol = createElement('span', 'vault-symbol', group.emoji);
        const name = createElement('span', 'vault-name', group.name);
        const groupCount = Number(group.photoCount || 0);
        const metaText = group.type === 'photos'
          ? group.typeLabel + ' · ' + groupCount + ' ảnh'
          : group.typeLabel + ' · Chưa có tệp';
        const meta = createElement('span', 'vault-meta', metaText);
        const arrow = createElement('span', 'vault-arrow', '↗');
        card.append(symbol, name, meta, arrow);
        card.addEventListener('click', () => {
          if (group.type === 'photos') {
            renderPhotoGroup(activeVault.id, group.id);
          } else {
            showNotice(group.typeLabel, 'Phần này sẽ được triển khai ở giai đoạn tiếp theo.');
          }
        });
        fragment.append(card);
      });
      groupGrid.append(fragment);
      els.library.append(back, kicker, title, description, heading, groupGrid);
    }
    window.scrollTo(0, 0);
  }

  function openGroupDialog() {
    if (!activeVault) return;
    const form = document.getElementById('groupForm');
    form.reset();
    selectedGroupType = 'photos';
    document.querySelectorAll('.group-type').forEach(button => {
      button.classList.toggle('selected', button.dataset.type === selectedGroupType);
    });
    document.getElementById('groupDialog').showModal();
    window.setTimeout(() => document.getElementById('groupName').focus(), 80);
  }

  let pageObjectUrls = [];
  let viewerObjectUrl = null;
  let viewerRecords = [];
  let viewerIndex = 0;
  let photoPageToken = 0;

  function revokePageUrls() {
    pageObjectUrls.forEach(url => URL.revokeObjectURL(url));
    pageObjectUrls = [];
  }

  function makeObjectUrl(blob, collection) {
    const url = URL.createObjectURL(blob);
    if (collection) collection.push(url);
    return url;
  }

  function isImageFile(file) {
    if (file.type && file.type.toLowerCase().startsWith('image/')) return true;
    return /\.(jpe?g|png|gif|webp|heic|heif|avif|bmp|tiff?|svg)$/i.test(file.name || '');
  }

  async function makeThumbnail(file) {
    let source = null;
    let bitmap = null;
    let temporaryUrl = null;
    try {
      if (typeof createImageBitmap === 'function') {
        try {
          bitmap = await createImageBitmap(file);
          source = bitmap;
        } catch (_) {
          source = null;
        }
      }
      if (!source) {
        temporaryUrl = URL.createObjectURL(file);
        const image = new Image();
        image.decoding = 'async';
        image.src = temporaryUrl;
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = () => reject(new Error('Trình duyệt chưa đọc được ảnh này để tạo ảnh thu nhỏ.'));
        });
        source = image;
      }

      const width = source.width || source.naturalWidth;
      const height = source.height || source.naturalHeight;
      if (!width || !height) return null;
      const maxEdge = 480;
      const scale = Math.min(1, maxEdge / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) return null;
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      return await new Promise(resolve => {
        canvas.toBlob(blob => resolve(blob || null), 'image/jpeg', 0.76);
      });
    } catch (_) {
      return null;
    } finally {
      if (bitmap && typeof bitmap.close === 'function') bitmap.close();
      if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);
    }
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function buildPhotoGrid(container, records, showContext) {
    revokePageUrls();
    container.replaceChildren();
    const pageSize = 90;
    let cursor = 0;
    let moreButton = null;

    const appendBatch = () => {
      if (moreButton) {
        moreButton.remove();
        moreButton = null;
      }
      const fragment = document.createDocumentFragment();
      const limit = Math.min(cursor + pageSize, records.length);
      for (let index = cursor; index < limit; index += 1) {
        const record = records[index];
        const card = createElement('button', 'photo-card');
        card.type = 'button';
        card.setAttribute('aria-label', 'Mở ảnh ' + record.name);
        if (record.thumbnail) {
          const image = document.createElement('img');
          image.alt = record.name || 'Ảnh đã lưu';
          image.loading = 'lazy';
          image.decoding = 'async';
          image.src = makeObjectUrl(record.thumbnail, pageObjectUrls);
          image.addEventListener('load', () => image.classList.add('is-ready'), { once: true });
          image.addEventListener('error', () => {
            image.remove();
            card.append(createElement('span', 'photo-fallback', '▧'));
          }, { once: true });
          card.append(image);
        } else {
          card.append(createElement('span', 'photo-fallback', '▧'));
        }
        const caption = createElement('span', 'photo-caption', record.name || 'Ảnh không tên');
        card.append(caption);
        if (showContext && record.contextLabel) {
          card.append(createElement('span', 'photo-context', record.contextLabel));
        }
        card.addEventListener('click', () => openPhotoViewer(records, index));
        fragment.append(card);
      }
      container.append(fragment);
      cursor = limit;

      if (cursor < records.length) {
        moreButton = createElement('button', 'photo-load-more', 'Tải thêm ảnh · ' + (records.length - cursor) + ' còn lại');
        moreButton.type = 'button';
        moreButton.addEventListener('click', appendBatch, { once: true });
        container.after(moreButton);
      }
    };

    appendBatch();
  }

  function createPhotoGridElement() {
    return createElement('div', 'photo-grid');
  }

  async function renderPhotoGroup(vaultId, groupId) {
    const token = ++photoPageToken;
    const vault = vaults.find(item => item.id === vaultId);
    const group = vault && (vault.groups || []).find(item => item.id === groupId);
    if (!vault || !group) return;
    activeVault = vault;
    els.main.hidden = true;
    els.settings.hidden = true;
    els.library.hidden = false;
    els.library.replaceChildren();
    revokePageUrls();

    const back = createElement('button', 'page-back', '←  ' + vault.name);
    back.addEventListener('click', () => openVault(vault.id));
    const kicker = createElement('div', 'section-kicker', 'THƯ VIỆN ẢNH');
    const title = createElement('h1', '', group.name);
    const description = createElement('p', 'page-description', 'Ảnh gốc được giữ nguyên. Ảnh thu nhỏ chỉ dùng để hiển thị lưới nhanh hơn.');
    const toolbar = createElement('div', 'photo-toolbar');
    const countLabel = createElement('span', 'photo-total', 'Đang tải danh sách…');
    const sortWrap = createElement('label', 'photo-sort-wrap');
    sortWrap.setAttribute('aria-label', 'Sắp xếp ảnh');
    const sortLabel = createElement('span', '', 'Sắp xếp');
    const sortSelect = document.createElement('select');
    sortSelect.className = 'photo-sort-select';
    sortSelect.setAttribute('aria-label', 'Thứ tự ảnh');
    [
      ['newest', 'Mới nhất'],
      ['oldest', 'Cũ nhất'],
      ['name-asc', 'Tên A–Z'],
      ['name-desc', 'Tên Z–A']
    ].forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      sortSelect.append(option);
    });
    sortSelect.value = group.photoSortMode || 'newest';
    sortWrap.append(sortLabel, sortSelect);
    const importButton = createElement('button', 'primary-button', '＋ Thêm ảnh');
    importButton.type = 'button';
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.className = 'visually-hidden';
    input.setAttribute('aria-label', 'Chọn ảnh từ thiết bị');
    importButton.addEventListener('click', () => input.click());
    const status = createElement('p', 'import-status', '');
    const grid = createPhotoGridElement();
    toolbar.append(countLabel, sortWrap, importButton);
    els.library.append(back, kicker, title, description, toolbar, input, status, grid);
    window.scrollTo(0, 0);

    sortSelect.addEventListener('change', async () => {
      group.photoSortMode = sortSelect.value;
      activeVault.updatedAt = Date.now();
      try {
        await saveVault(activeVault);
        const records = await readMediaForGroup(groupId);
        const ordered = sortMediaRecords(records, group.photoSortMode);
        countLabel.textContent = ordered.length + ' ảnh';
        if (!ordered.length) {
          grid.replaceWith(createElement('div', 'category-empty photo-empty', 'Chưa có ảnh trong nhóm này.'));
        } else {
          buildPhotoGrid(grid, ordered, false);
        }
      } catch (error) {
        showNotice('Chưa lưu được cách sắp xếp', error.message || 'Hãy thử lại.');
      }
    });

    input.addEventListener('change', async () => {
      const picked = Array.from(input.files || []);
      input.value = '';
      if (!picked.length) return;
      const selected = picked.filter(isImageFile);
      if (!selected.length) {
        showNotice('Định dạng chưa phù hợp', 'Hãy chọn tệp hình ảnh như JPG, PNG, HEIC hoặc WebP.');
        return;
      }
      importButton.disabled = true;
      let saved = 0;
      let failed = 0;
      for (let index = 0; index < selected.length; index += 1) {
        const file = selected[index];
        status.textContent = 'Đang lưu ảnh ' + (index + 1) + '/' + selected.length + '…';
        try {
          const thumbnail = await makeThumbnail(file);
          const record = {
            id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2),
            vaultId,
            groupId,
            kind: 'photo',
            name: file.name || ('Ảnh ' + (index + 1)),
            mimeType: file.type || 'application/octet-stream',
            size: file.size,
            lastModified: file.lastModified || 0,
            createdAt: Date.now(),
            thumbnail
          };
          await savePhotoRecord(record, file);
          saved += 1;
        } catch (error) {
          failed += 1;
          console.error('Không thể lưu ảnh:', file.name, error);
          if (error && (error.name === 'QuotaExceededError' || /quota|space/i.test(error.message || ''))) {
            status.textContent = 'Bộ nhớ thiết bị không còn đủ dung lượng.';
            showNotice('Không đủ dung lượng', 'iPhone không còn đủ bộ nhớ dành cho dữ liệu website. Một số ảnh có thể chưa được lưu. Hãy kiểm tra dung lượng Safari/iPhone rồi thử lại.');
            break;
          }
        }
      }
      importButton.disabled = false;
      status.textContent = saved + ' ảnh đã lưu' + (failed ? ' · ' + failed + ' ảnh chưa lưu được' : '');
      if (saved > 0) {
        const owner = vaults.find(item => item.id === vaultId);
        const ownerGroup = owner && (owner.groups || []).find(item => item.id === groupId);
        if (ownerGroup) {
          ownerGroup.photoCount = Number(ownerGroup.photoCount || 0) + saved;
          owner.updatedAt = Date.now();
          try { await saveVault(owner); } catch (error) { console.warn('Không cập nhật được số ảnh trong nhóm:', error); }
        }
      }
      await updateStats();
      await renderPhotoGroup(vaultId, groupId);
      const refreshedStatus = els.library.querySelector('.import-status');
      if (refreshedStatus) refreshedStatus.textContent = saved + ' ảnh đã lưu' + (failed ? ' · ' + failed + ' ảnh chưa lưu được' : '');
      if (failed && saved === 0) {
        showNotice('Chưa lưu được ảnh', 'Hãy thử chọn ít ảnh hơn hoặc kiểm tra dung lượng lưu trữ của Safari.');
      }
    });

    try {
      const rawRecords = await readMediaForGroup(groupId);
      if (token !== photoPageToken) return;
      const records = sortMediaRecords(rawRecords, group.photoSortMode || 'newest');
      countLabel.textContent = records.length + ' ảnh';
      if (!records.length) {
        grid.replaceWith(createElement('div', 'category-empty photo-empty', 'Chưa có ảnh trong nhóm này.\nNhấn “Thêm ảnh” để chọn ảnh từ thư viện iPhone.'));
      } else {
        buildPhotoGrid(grid, records, false);
      }
    } catch (error) {
      countLabel.textContent = 'Không tải được ảnh';
      showNotice('Lỗi đọc thư viện', error.message || 'Không thể đọc dữ liệu ảnh đã lưu.');
    }
  }

  async function renderAllPhotos() {
    const token = ++photoPageToken;
    activeVault = null;
    els.main.hidden = true;
    els.settings.hidden = true;
    els.library.hidden = false;
    els.library.replaceChildren();
    revokePageUrls();
    const kicker = createElement('div', 'section-kicker', 'TẤT CẢ NỘI DUNG');
    const title = createElement('h1', '', 'Ảnh của bạn');
    const description = createElement('p', 'page-description', 'Tập hợp ảnh đã lưu trong các không gian của bạn.');
    const grid = createPhotoGridElement();
    els.library.append(kicker, title, description, grid);
    try {
      const records = (await readAllMedia()).filter(item => item.kind === 'photo').sort((a, b) => b.createdAt - a.createdAt);
      if (token !== photoPageToken) return;
      const groupLookup = new Map();
      vaults.forEach(vault => (vault.groups || []).forEach(group => {
        groupLookup.set(group.id, vault.name + ' / ' + group.name);
      }));
      records.forEach(record => { record.contextLabel = groupLookup.get(record.groupId) || 'Không gian đã lưu'; });
      if (!records.length) {
        grid.replaceWith(createElement('div', 'category-empty photo-empty', 'Bạn chưa lưu ảnh nào.\nHãy vào một không gian, tạo nhóm Ảnh rồi thêm ảnh từ iPhone.'));
      } else {
        buildPhotoGrid(grid, records, true);
      }
    } catch (error) {
      showNotice('Không tải được thư viện', error.message || 'Hãy thử tải lại ứng dụng.');
    }
  }

  async function openPhotoViewer(records, index) {
    viewerRecords = records;
    viewerIndex = index;
    await showPhotoAt(index);
  }

  async function showPhotoAt(index) {
    if (index < 0 || index >= viewerRecords.length) return;

    const dialog = document.getElementById('photoViewerDialog');
    const image = document.getElementById('viewerImage');
    const previousIndex = viewerIndex;
    const isChangingPhoto = dialog.open && previousIndex !== index;
    const direction = index > previousIndex ? 1 : -1;

    viewerIndex = index;
    resetViewerZoom();
    setViewerChrome(true);

    const record = viewerRecords[index];
    const title = document.getElementById('viewerTitle');
    const counter = document.getElementById('viewerCounter');
    const download = document.getElementById('viewerDownload');
    const token = ++viewerLoadToken;
    const canAnimatePhoto = typeof image.animate === 'function' &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof image.getAnimations === 'function') {
      image.getAnimations().forEach(animation => animation.cancel());
    }

    title.textContent = record.name || 'Ảnh';
    counter.textContent = (index + 1) + ' / ' + viewerRecords.length;
    document.getElementById('viewerPrev').disabled = index === 0;
    document.getElementById('viewerNext').disabled = index === viewerRecords.length - 1;

    if (isChangingPhoto && canAnimatePhoto) {
      const exitAnimation = image.animate([
        { opacity: 1, transform: 'translate3d(0,0,0) scale(1)', filter: 'blur(0px)' },
        { opacity: 0, transform: 'translate3d(' + (direction > 0 ? '-20px' : '20px') + ',0,0) scale(.99)', filter: 'blur(2px)' }
      ], {
        duration: 155,
        easing: 'cubic-bezier(.4,0,1,1)',
        fill: 'forwards'
      });
      try { await exitAnimation.finished; } catch (_) {}
      if (token !== viewerLoadToken) return;
      image.style.opacity = '0';
      exitAnimation.cancel();
    } else {
      image.classList.add('is-loading');
    }

    try {
      const blob = await readMediaFile(record.id);
      if (token !== viewerLoadToken) return;
      if (!blob) throw new Error('Không tìm thấy tệp ảnh gốc trong bộ nhớ.');

      const nextUrl = URL.createObjectURL(blob);
      const previousUrl = viewerObjectUrl;
      viewerObjectUrl = nextUrl;

      image.onload = () => {
        if (token !== viewerLoadToken) {
          URL.revokeObjectURL(nextUrl);
          return;
        }
        image.classList.remove('is-loading');
        image.style.opacity = '';
        if (previousUrl && previousUrl !== nextUrl) URL.revokeObjectURL(previousUrl);

        if (isChangingPhoto && canAnimatePhoto) {
          image.animate([
            { opacity: 0, transform: 'translate3d(' + (direction > 0 ? '20px' : '-20px') + ',0,0) scale(.99)', filter: 'blur(2px)' },
            { opacity: 1, transform: 'translate3d(0,0,0) scale(1)', filter: 'blur(0px)' }
          ], {
            duration: 235,
            easing: 'cubic-bezier(.18,.72,.2,1)'
          });
        }
      };

      image.onerror = () => {
        if (token !== viewerLoadToken) return;
        image.classList.remove('is-loading');
        image.style.opacity = '';
        if (previousUrl && previousUrl !== nextUrl) URL.revokeObjectURL(previousUrl);
        URL.revokeObjectURL(nextUrl);
        if (viewerObjectUrl === nextUrl) viewerObjectUrl = null;
        showNotice('Không mở được ảnh', 'Tệp gốc đã được lưu, nhưng trình duyệt trên thiết bị này chưa hỗ trợ hiển thị định dạng ảnh đó.');
      };

      image.src = nextUrl;
      download.onclick = () => {
        const link = document.createElement('a');
        link.href = nextUrl;
        link.download = record.name || 'anh';
        link.rel = 'noopener';
        document.body.append(link);
        link.click();
        link.remove();
      };
      if (!dialog.open) dialog.showModal();
    } catch (error) {
      if (token !== viewerLoadToken) return;
      image.classList.remove('is-loading');
      image.style.opacity = '';
      showNotice('Không mở được ảnh', error.message || 'Không thể đọc tệp ảnh.');
    }
  }

  let viewerLoadToken = 0;

  function closePhotoViewer() {
    viewerLoadToken += 1;
    clearChromeTapTimer();
    setViewerChrome(true);
    const dialog = document.getElementById('photoViewerDialog');
    if (dialog.open) dialog.close();
    const image = document.getElementById('viewerImage');
    image.removeAttribute('src');
    image.classList.remove('is-loading');
    if (viewerObjectUrl) URL.revokeObjectURL(viewerObjectUrl);
    viewerObjectUrl = null;
    resetViewerZoom();
  }

  document.getElementById('viewerClose').addEventListener('click', closePhotoViewer);
  document.getElementById('viewerPrev').addEventListener('click', () => showPhotoAt(viewerIndex - 1));
  document.getElementById('viewerNext').addEventListener('click', () => showPhotoAt(viewerIndex + 1));
  document.getElementById('photoViewerDialog').addEventListener('click', event => {
    if (event.target.id === 'photoViewerDialog') closePhotoViewer();
  });
  document.getElementById('photoViewerDialog').addEventListener('close', () => {
    viewerLoadToken += 1;
    clearChromeTapTimer();
    setViewerChrome(true);
    const image = document.getElementById('viewerImage');
    image.removeAttribute('src');
    image.classList.remove('is-loading');
    if (viewerObjectUrl) URL.revokeObjectURL(viewerObjectUrl);
    viewerObjectUrl = null;
    viewerRecords = [];
  });

  const viewerStage = document.getElementById('viewerStage');
  const viewerImage = document.getElementById('viewerImage');
  const viewerHeader = document.querySelector('.viewer-header');
  const viewerPrevButton = document.getElementById('viewerPrev');
  const viewerNextButton = document.getElementById('viewerNext');
  let viewerChromeVisible = true;
  let chromeTapTimer = null;

  function clearChromeTapTimer() {
    if (chromeTapTimer !== null) {
      window.clearTimeout(chromeTapTimer);
      chromeTapTimer = null;
    }
  }

  function setViewerChrome(visible) {
    viewerChromeVisible = Boolean(visible);
    viewerHeader.classList.toggle('is-hidden', !viewerChromeVisible);
    viewerStage.classList.toggle('chrome-hidden', !viewerChromeVisible);
    viewerHeader.setAttribute('aria-hidden', String(!viewerChromeVisible));
    viewerPrevButton.setAttribute('aria-hidden', String(!viewerChromeVisible));
    viewerNextButton.setAttribute('aria-hidden', String(!viewerChromeVisible));
  }

  function scheduleChromeToggle() {
    clearChromeTapTimer();
    chromeTapTimer = window.setTimeout(() => {
      setViewerChrome(!viewerChromeVisible);
      chromeTapTimer = null;
      lastTap = null;
    }, 330);
  }

  let viewerScale = 1;
  let viewerPanX = 0;
  let viewerPanY = 0;
  let activePointers = new Map();
  let viewerGesture = null;
  let lastTap = null;

  function applyViewerTransform() {
    viewerImage.style.transform = 'translate3d(' + viewerPanX + 'px,' + viewerPanY + 'px,0) scale(' + viewerScale + ')';
    viewerStage.classList.toggle('is-zoomed', viewerScale > 1.001);
  }

  function clampViewerPan() {
    const maxX = Math.max(0, (viewerImage.offsetWidth * viewerScale - viewerStage.clientWidth) / 2);
    const maxY = Math.max(0, (viewerImage.offsetHeight * viewerScale - viewerStage.clientHeight) / 2);
    viewerPanX = Math.min(maxX, Math.max(-maxX, viewerPanX));
    viewerPanY = Math.min(maxY, Math.max(-maxY, viewerPanY));
    if (viewerScale <= 1.001) {
      viewerScale = 1;
      viewerPanX = 0;
      viewerPanY = 0;
    }
  }

  function resetViewerZoom() {
    viewerScale = 1;
    viewerPanX = 0;
    viewerPanY = 0;
    activePointers.clear();
    viewerGesture = null;
    lastTap = null;
    if (viewerImage) {
      viewerImage.style.transform = 'translate3d(0,0,0) scale(1)';
      viewerStage.classList.remove('is-zoomed');
    }
  }

  function setViewerZoomAt(nextScale, clientX, clientY) {
    const rect = viewerStage.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const pointX = clientX - centerX;
    const pointY = clientY - centerY;
    const anchorX = (pointX - viewerPanX) / viewerScale;
    const anchorY = (pointY - viewerPanY) / viewerScale;
    viewerScale = Math.min(5, Math.max(1, nextScale));
    viewerPanX = pointX - anchorX * viewerScale;
    viewerPanY = pointY - anchorY * viewerScale;
    clampViewerPan();
    applyViewerTransform();
  }

  function pointerDistance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function pointerMidpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  viewerStage.addEventListener('pointerdown', event => {
    if (event.target.closest('button') || !document.getElementById('photoViewerDialog').open) return;
    event.preventDefault();
    viewerStage.setPointerCapture?.(event.pointerId);
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (activePointers.size === 1) {
      viewerGesture = {
        type: viewerScale > 1.001 ? 'pan' : 'swipe',
        startX: event.clientX,
        startY: event.clientY,
        startPanX: viewerPanX,
        startPanY: viewerPanY,
        moved: false,
        multi: false
      };
      return;
    }

    if (activePointers.size === 2) {
      if (viewerGesture) viewerGesture.multi = true;
      const points = Array.from(activePointers.values());
      const midpoint = pointerMidpoint(points[0], points[1]);
      const rect = viewerStage.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      viewerGesture = {
        type: 'pinch',
        multi: true,
        startDistance: Math.max(1, pointerDistance(points[0], points[1])),
        startScale: viewerScale,
        anchorX: (midpoint.x - centerX - viewerPanX) / viewerScale,
        anchorY: (midpoint.y - centerY - viewerPanY) / viewerScale
      };
    }
  }, { passive: false });

  viewerStage.addEventListener('pointermove', event => {
    if (!activePointers.has(event.pointerId)) return;
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (activePointers.size >= 2 && viewerGesture?.type === 'pinch') {
      const points = Array.from(activePointers.values()).slice(0, 2);
      const midpoint = pointerMidpoint(points[0], points[1]);
      const rect = viewerStage.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const scaleFactor = pointerDistance(points[0], points[1]) / viewerGesture.startDistance;
      viewerScale = Math.min(5, Math.max(1, viewerGesture.startScale * scaleFactor));
      viewerPanX = midpoint.x - centerX - viewerGesture.anchorX * viewerScale;
      viewerPanY = midpoint.y - centerY - viewerGesture.anchorY * viewerScale;
      clampViewerPan();
      applyViewerTransform();
      return;
    }

    if (activePointers.size === 1 && viewerGesture?.type === 'pan') {
      const pointer = activePointers.get(event.pointerId);
      viewerPanX = viewerGesture.startPanX + pointer.x - viewerGesture.startX;
      viewerPanY = viewerGesture.startPanY + pointer.y - viewerGesture.startY;
      clampViewerPan();
      applyViewerTransform();
    }
  }, { passive: false });

  function finishViewerPointer(event) {
    if (!activePointers.has(event.pointerId)) return;
    const pointer = activePointers.get(event.pointerId);
    const beforeCount = activePointers.size;
    const gesture = viewerGesture;
    activePointers.delete(event.pointerId);

    if (beforeCount === 1 && gesture && !gesture.multi) {
      const deltaX = pointer.x - gesture.startX;
      const deltaY = pointer.y - gesture.startY;
      const moved = Math.hypot(deltaX, deltaY);

      if (gesture.type === 'swipe' && viewerScale <= 1.001 &&
          Math.abs(deltaX) > 48 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
        clearChromeTapTimer();
        lastTap = null;
        if (deltaX < 0) showPhotoAt(viewerIndex + 1);
        else showPhotoAt(viewerIndex - 1);
        viewerGesture = null;
        return;
      }

      if (moved < 12) {
        const now = Date.now();
        if (lastTap && now - lastTap.time < 320 &&
            Math.hypot(pointer.x - lastTap.x, pointer.y - lastTap.y) < 34) {
          clearChromeTapTimer();
          if (viewerScale > 1.001) {
            resetViewerZoom();
          } else {
            setViewerZoomAt(2.5, pointer.x, pointer.y);
          }
          setViewerChrome(true);
          lastTap = null;
        } else {
          lastTap = { time: now, x: pointer.x, y: pointer.y };
          scheduleChromeToggle();
        }
      } else {
        clearChromeTapTimer();
        lastTap = null;
      }
    } else if (beforeCount === 2 && activePointers.size === 1) {
      clearChromeTapTimer();
      lastTap = null;
      const remaining = Array.from(activePointers.values())[0];
      viewerGesture = {
        type: viewerScale > 1.001 ? 'pan' : 'swipe',
        startX: remaining.x,
        startY: remaining.y,
        startPanX: viewerPanX,
        startPanY: viewerPanY,
        multi: true
      };
    } else if (activePointers.size === 0) {
      viewerGesture = null;
    }
  }

  viewerStage.addEventListener('pointerup', finishViewerPointer);
  viewerStage.addEventListener('pointercancel', finishViewerPointer);
  viewerStage.addEventListener('lostpointercapture', finishViewerPointer);

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
      if (tab === 'photos') {
        renderAllPhotos();
        document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item === button));
        return;
      }
      if (tab === 'videos' || tab === 'files') {
        showHome();
        document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item === button));
        const labels = { videos: 'Video', files: 'Tệp' };
        showNotice(labels[tab], 'Khu vực này sẽ được triển khai ở giai đoạn tiếp theo.');
      }
    });
  });

  document.getElementById('groupTypeOptions').addEventListener('click', event => {
    const button = event.target.closest('.group-type');
    if (!button) return;
    selectedGroupType = button.dataset.type;
    document.querySelectorAll('.group-type').forEach(option => {
      option.classList.toggle('selected', option === button);
    });
  });

  document.getElementById('groupForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!activeVault) return;
    const name = document.getElementById('groupName').value.trim();
    if (!name) {
      document.getElementById('groupName').focus();
      return;
    }
    const groups = Array.isArray(activeVault.groups) ? activeVault.groups : [];
    if (groups.some(group => group.name.toLocaleLowerCase('vi') === name.toLocaleLowerCase('vi'))) {
      showNotice('Tên nhóm đã tồn tại', 'Trong không gian này đã có một nhóm cùng tên.');
      return;
    }
    const types = {
      photos: { label: 'Ảnh', emoji: '▧' },
      videos: { label: 'Video', emoji: '▶' },
      documents: { label: 'Tài liệu', emoji: '▤' },
      other: { label: 'Khác', emoji: '✧' }
    };
    const type = types[selectedGroupType] || types.photos;
    const group = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2),
      name,
      type: selectedGroupType,
      typeLabel: type.label,
      emoji: type.emoji,
      createdAt: Date.now()
    };
    activeVault.groups = [...groups, group];
    activeVault.updatedAt = Date.now();
    try {
      await saveVault(activeVault);
      const index = vaults.findIndex(vault => vault.id === activeVault.id);
      if (index >= 0) vaults[index] = activeVault;
      document.getElementById('groupDialog').close();
      openVault(activeVault.id);
      renderVaults();
    } catch (error) {
      showNotice('Chưa thể lưu nhóm', error.message || 'Hãy thử lại sau.');
    }
  });


  async function calculateAppStorageBytes() {
    const [allVaults, allMedia] = await Promise.all([readAll(), readAllMedia()]);
    let bytes = 0;
    allVaults.forEach(vault => {
      bytes += new Blob([JSON.stringify(vault)]).size;
    });
    allMedia.forEach(record => {
      bytes += Number(record.size) || 0;
      bytes += Number(record.thumbnail && record.thumbnail.size) || 0;
      bytes += 256;
    });
    return bytes;
  }

  function formatStorageQuota(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return 'Chưa xác định';
    if (bytes >= 1024 ** 3) return (bytes / (1024 ** 3)).toFixed(2) + ' GB';
    if (bytes >= 1024 ** 2) return (bytes / (1024 ** 2)).toFixed(1) + ' MB';
    return formatBytes(bytes);
  }

  async function refreshStorageInfo() {
    const usedLabel = document.getElementById('appStorageUsed');
    const originLabel = document.getElementById('originStorageUsed');
    const quotaLabel = document.getElementById('originStorageQuota');
    const bar = document.getElementById('storageProgress');
    const note = document.getElementById('storageNote');
    if (!usedLabel || !originLabel || !quotaLabel || !bar || !note) return;

    usedLabel.textContent = 'Đang tính…';
    originLabel.textContent = 'Đang kiểm tra…';
    quotaLabel.textContent = 'Đang kiểm tra…';
    bar.style.width = '0%';

    try {
      const appBytes = await calculateAppStorageBytes();
      usedLabel.textContent = formatStorageQuota(appBytes);

      if (navigator.storage && typeof navigator.storage.estimate === 'function') {
        const estimate = await navigator.storage.estimate();
        const used = Number(estimate.usage) || 0;
        const quota = Number(estimate.quota) || 0;
        originLabel.textContent = formatStorageQuota(used);
        quotaLabel.textContent = formatStorageQuota(quota);
        const percent = quota > 0 ? Math.min(100, (used / quota) * 100) : 0;
        bar.style.width = percent.toFixed(1) + '%';
        note.textContent = 'Dung lượng trình duyệt là ước tính cho toàn bộ dữ liệu của website trên cùng địa chỉ, không chỉ riêng Kho của tui. Số liệu có thể thay đổi theo iOS.';
      } else {
        originLabel.textContent = 'Không hỗ trợ đo';
        quotaLabel.textContent = 'Không xác định';
        note.textContent = 'Safari chưa cung cấp API đo dung lượng trong phiên này. Dung lượng Kho của tui ở trên được ước tính từ các ảnh và dữ liệu đã lưu.';
      }
    } catch (error) {
      usedLabel.textContent = 'Không đọc được';
      originLabel.textContent = 'Không đọc được';
      quotaLabel.textContent = 'Không xác định';
      note.textContent = 'Không thể đọc thông tin lưu trữ lúc này. Hãy thử tải lại ứng dụng.';
    }
  }

  async function openSettingsDialog() {
    document.getElementById('appVersionLabel').textContent = 'v' + APP_VERSION;
    document.getElementById('appReleaseDate').textContent = APP_RELEASE_DATE;
    document.getElementById('settingsDialog').showModal();
    await refreshStorageInfo();
  }

  document.getElementById('settingsButton').addEventListener('click', openSettingsDialog);
  document.getElementById('refreshStorageButton').addEventListener('click', refreshStorageInfo);

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