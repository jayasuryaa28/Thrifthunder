/* =============================================
   THRIFTHUNDER — script.js
   Supabase backend · No Firebase
   ============================================= */

// ─── SUPABASE CONFIG ────────────────────────────────────────────────────────
// Replace these with your actual Supabase project URL and anon key
const SUPABASE_URL = 'https://lszighwpcecbqfvuhtvu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_mHYxEJKjqWSPx9g8MyIJgw_N29xAiXK';

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Supabase Storage bucket name — create this in Supabase Dashboard > Storage
const STORAGE_BUCKET = 'products';

// Admin password (plain client-side check — fine for a solo store)
const ADMIN_PASSWORD = 'thrifthunder2026';

// ─── STATE ──────────────────────────────────────────────────────────────────
let allProducts = [];
let cart = JSON.parse(localStorage.getItem('tt_cart') || '[]');
let wishlist = JSON.parse(localStorage.getItem('tt_wishlist') || '[]');
let currentProduct = null;
let currentGalleryIndex = 0;
let previousPage = 'home';
let pendingDeleteId = null;
let pendingImageFiles = []; // { file, previewUrl, uploading, url }
let existingImageUrls = []; // when editing a product
let activeCategory = 'all';
let activeBrand = 'all';
let activeSort = 'newest';
let adminProducts = []; // cached for admin list

// ─── INIT ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setupNavScroll();
  setupDragDrop();
  updateBadges();
  document.getElementById('admin-date').textContent =
    new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  await loadProducts();
  hideLoading();
});

function hideLoading() {
  const el = document.getElementById('firebase-loading');
  if (el) {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.4s ease';
    setTimeout(() => el.remove(), 400);
  }
}

// ─── SUPABASE: LOAD PRODUCTS ────────────────────────────────────────────────
async function loadProducts() {
  try {
    const { data, error } = await sb
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    allProducts = data || [];
    renderAll();
    animateStatCounter('stat-products', allProducts.length);
  } catch (err) {
    console.error('Failed to load products:', err);
    showToast('Could not load products. Check Supabase config.', 'error');
    allProducts = [];
    renderAll();
    hideLoading();
  }
}

// Re-render everything after data changes
function renderAll() {
  renderFeatured();
  renderAllProducts();
  buildBrandFilter();
  renderWishlist();
  updateDashboard();
  renderAdminList();
  animateStatCounter('stat-products', allProducts.length);
}

// ─── PRODUCT RENDERING ──────────────────────────────────────────────────────
function getFilteredProducts() {
  let products = [...allProducts];

  if (activeCategory !== 'all') {
    products = products.filter(p => p.category === activeCategory);
  }
  if (activeBrand !== 'all') {
    products = products.filter(p => (p.brand || '').toLowerCase() === activeBrand.toLowerCase());
  }

  switch (activeSort) {
    case 'price-asc':  products.sort((a, b) => a.price - b.price); break;
    case 'price-desc': products.sort((a, b) => b.price - a.price); break;
    case 'name':       products.sort((a, b) => a.name.localeCompare(b.name)); break;
    default:           products.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  return products;
}

function renderFeatured() {
  const grid = document.getElementById('featured-grid');
  if (!grid) return;
  const featured = allProducts.filter(p => p.featured);
  grid.innerHTML = featured.length
    ? featured.map(p => createProductCard(p)).join('')
    : '<p style="color:var(--text-3);font-family:var(--font-ui);font-size:.9rem">No featured items yet.</p>';
}

function renderAllProducts() {
  const grid = document.getElementById('all-products-grid');
  const empty = document.getElementById('no-products-home');
  if (!grid) return;

  const filtered = getFilteredProducts();

  if (allProducts.length === 0) {
    grid.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  grid.innerHTML = filtered.length
    ? filtered.map(p => createProductCard(p)).join('')
    : '<p style="color:var(--text-3);font-family:var(--font-ui);font-size:.9rem;grid-column:1/-1">No products match this filter.</p>';

  observeReveal();
}

function createProductCard(p) {
  const img = p.images?.[0] || 'https://placehold.co/400x533/f2efe9/888?text=No+Image';
  const inWishlist = wishlist.some(w => w.id === p.id);
  const sizes = p.sizes ? p.sizes.slice(0, 4).map(s => `<span class="card-size-tag">${s}</span>`).join('') : '';
  const isSold = p.status === 'soldout';

  const badges = [
    p.featured ? `<span class="card-badge badge-new">New</span>` : '',
    p.condition === 'Thrifted' ? `<span class="card-badge badge-thrifted">Thrifted</span>` : '',
    p.condition === 'New' ? `<span class="card-badge badge-new-tag">New w/ Tags</span>` : '',
    isSold ? `<span class="card-badge badge-sold">Sold Out</span>` : '',
  ].join('');

  return `
    <div class="product-card reveal" data-id="${p.id}">
      <div class="card-img-wrap">
        <img src="${img}" alt="${escHtml(p.name)}" loading="lazy" onerror="this.src='https://placehold.co/400x533/f2efe9/888?text=No+Image'" />
        <div class="card-badges">${badges}</div>
        <button class="card-wishlist-btn ${inWishlist ? 'active' : ''}"
          onclick="event.stopPropagation();toggleWishlist('${p.id}')" title="Save to Wishlist">
          <i class="${inWishlist ? 'fas' : 'far'} fa-heart"></i>
        </button>
        <div class="card-actions-overlay">
          ${sizes}
          <button class="card-quick-view" onclick="event.stopPropagation();openProductDetail('${p.id}')">Quick View</button>
        </div>
        ${isSold ? '<div class="soldout-overlay"><span class="soldout-label">Sold Out</span></div>' : ''}
      </div>
      <div class="card-body" onclick="openProductDetail('${p.id}')">
        <p class="card-brand">${escHtml(p.brand || '')}</p>
        <p class="card-name">${escHtml(p.name)}</p>
        <div class="card-footer">
          <span class="card-price">₹${Number(p.price).toLocaleString('en-IN')}</span>
          ${!isSold ? `<button class="card-add-btn" onclick="event.stopPropagation();quickAddToCart('${p.id}')" title="Add to Bag"><i class="fa fa-plus"></i></button>` : ''}
        </div>
      </div>
    </div>`;
}

// ─── BRAND FILTER ───────────────────────────────────────────────────────────
function buildBrandFilter() {
  const bar = document.getElementById('brand-filter-bar');
  if (!bar) return;

  const brands = [...new Set(allProducts.map(p => p.brand).filter(Boolean))].sort();
  bar.innerHTML = `<button class="filter-btn active" data-brand="all" onclick="filterProducts('all', this)">All</button>` +
    brands.map(b => `<button class="filter-btn" data-brand="${escHtml(b)}" onclick="filterProducts('${escHtml(b)}', this)">${escHtml(b)}</button>`).join('');
}

function filterProducts(brand, btn) {
  activeBrand = brand;
  document.querySelectorAll('#brand-filter-bar .filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderAllProducts();
}

function filterByCategory(cat, btn) {
  activeCategory = cat;
  document.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderAllProducts();
}

function handleSort(val) {
  activeSort = val;
  renderAllProducts();
}

// ─── PRODUCT DETAIL ─────────────────────────────────────────────────────────
function openProductDetail(id) {
  const p = allProducts.find(x => x.id === id || x.id == id);
  if (!p) return;

  currentProduct = p;
  currentGalleryIndex = 0;

  document.getElementById('detail-main-img').src = p.images?.[0] || '';
  document.getElementById('detail-brand').textContent = p.brand || '';
  document.getElementById('detail-name').textContent = p.name;
  document.getElementById('detail-price').textContent = `₹${Number(p.price).toLocaleString('en-IN')}`;
  document.getElementById('detail-desc').textContent = p.description || '';

  // Badges
  const badges = [
    p.featured && `<span class="card-badge badge-new">New Arrival</span>`,
    p.condition && `<span class="card-badge badge-thrifted">${escHtml(p.condition)}</span>`,
    p.status === 'soldout' && `<span class="card-badge badge-sold">Sold Out</span>`,
  ].filter(Boolean).join('');
  document.getElementById('detail-badges').innerHTML = badges;

  // Meta grid
  document.getElementById('detail-meta-grid').innerHTML = `
    <div class="detail-meta-item"><label>Category</label><span>${escHtml(p.category || '—')}</span></div>
    <div class="detail-meta-item"><label>Condition</label><span>${escHtml(p.condition || '—')}</span></div>
    <div class="detail-meta-item"><label>Brand</label><span>${escHtml(p.brand || '—')}</span></div>
    <div class="detail-meta-item"><label>Status</label><span>${p.status === 'soldout' ? 'Sold Out' : 'Available'}</span></div>`;

  // Gallery thumbs
  const thumbs = document.getElementById('detail-thumbs');
  const imgs = p.images || [];
  thumbs.innerHTML = imgs.map((img, i) =>
    `<img src="${img}" class="thumb-img ${i === 0 ? 'active' : ''}" onclick="setGalleryImage(${i})" alt="Image ${i + 1}" loading="lazy" />`
  ).join('');

  // Sizes
  const sizeSection = document.getElementById('size-section');
  const sizesEl = document.getElementById('detail-sizes');
  if (p.sizes && p.sizes.length > 0) {
    sizeSection.style.display = 'block';
    sizesEl.innerHTML = p.sizes.map(s =>
      `<button class="size-opt" onclick="selectSize(this)">${escHtml(s)}</button>`
    ).join('');
  } else {
    sizeSection.style.display = 'none';
  }

  // Wishlist btn
  const inWishlist = wishlist.some(w => w.id === p.id);
  const wb = document.getElementById('detail-wishlist-btn');
  wb.classList.toggle('active', inWishlist);
  wb.querySelector('i').className = inWishlist ? 'fas fa-heart' : 'far fa-heart';

  // Disable add to bag if sold out
  const cartBtn = document.querySelector('.detail-cart-btn');
  if (cartBtn) {
    cartBtn.disabled = p.status === 'soldout';
    cartBtn.textContent = p.status === 'soldout' ? 'Sold Out' : '';
    if (p.status !== 'soldout') {
      cartBtn.innerHTML = '<i class="fa fa-shopping-bag"></i> Add to Bag';
    }
  }

  // Related
  renderRelated(p);

  showPage('product');
}

function setGalleryImage(index) {
  if (!currentProduct?.images) return;
  currentGalleryIndex = index;
  document.getElementById('detail-main-img').src = currentProduct.images[index] || '';
  document.querySelectorAll('.thumb-img').forEach((t, i) => t.classList.toggle('active', i === index));
}

function galleryNav(dir) {
  if (!currentProduct?.images?.length) return;
  const len = currentProduct.images.length;
  currentGalleryIndex = (currentGalleryIndex + dir + len) % len;
  setGalleryImage(currentGalleryIndex);
}

function selectSize(btn) {
  document.querySelectorAll('.size-opt').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

function getSelectedSize() {
  return document.querySelector('.size-opt.selected')?.textContent || null;
}

function addToCartFromDetail() {
  if (!currentProduct) return;
  if (currentProduct.status === 'soldout') return;
  const size = getSelectedSize();
  if (currentProduct.sizes?.length > 0 && !size) {
    showToast('Please select a size first', 'error');
    document.getElementById('detail-sizes').style.animation = 'none';
    setTimeout(() => document.getElementById('detail-sizes').style.animation = '', 100);
    return;
  }
  addToCart(currentProduct, size);
}

function buyNowFromDetail() {
  if (!currentProduct) return;
  const size = getSelectedSize();
  const msg = `Hi! I'd like to buy:\n\n*${currentProduct.name}*\nBrand: ${currentProduct.brand || '—'}\nPrice: ₹${Number(currentProduct.price).toLocaleString('en-IN')}${size ? `\nSize: ${size}` : ''}\n\nCan you help me complete the purchase?`;
  window.open(`https://wa.me/919042489937?text=${encodeURIComponent(msg)}`, '_blank');
}

function toggleWishlistDetail() {
  if (!currentProduct) return;
  toggleWishlist(currentProduct.id);
  const inWishlist = wishlist.some(w => w.id === currentProduct.id);
  const wb = document.getElementById('detail-wishlist-btn');
  wb.classList.toggle('active', inWishlist);
  wb.querySelector('i').className = inWishlist ? 'fas fa-heart' : 'far fa-heart';
}

function renderRelated(current) {
  const grid = document.getElementById('related-grid');
  if (!grid) return;
  const related = allProducts
    .filter(p => p.id !== current.id && p.category === current.category)
    .slice(0, 4);
  grid.innerHTML = related.length
    ? related.map(p => createProductCard(p)).join('')
    : '<p style="color:var(--text-3);font-family:var(--font-ui);font-size:.9rem">No related items found.</p>';
}

// ─── CART ────────────────────────────────────────────────────────────────────
function quickAddToCart(id) {
  const p = allProducts.find(x => x.id === id || x.id == id);
  if (!p || p.status === 'soldout') return;
  addToCart(p, null);
}

function addToCart(product, size) {
  const key = `${product.id}_${size || 'any'}`;
  const existing = cart.find(c => c.key === key);

  if (existing) {
    existing.qty = (existing.qty || 1) + 1;
  } else {
    cart.push({
      key,
      id: product.id,
      name: product.name,
      brand: product.brand || '',
      price: product.price,
      image: product.images?.[0] || '',
      size,
      qty: 1,
    });
  }

  saveCart();
  renderCart();
  updateBadges();
  showToast(`${product.name} added to bag`, 'success');

  // Briefly show added state on card
  const addBtn = document.querySelector(`.product-card[data-id="${product.id}"] .card-add-btn`);
  if (addBtn) {
    addBtn.classList.add('added');
    addBtn.innerHTML = '<i class="fa fa-check"></i>';
    setTimeout(() => {
      addBtn.classList.remove('added');
      addBtn.innerHTML = '<i class="fa fa-plus"></i>';
    }, 1200);
  }
}

function changeQty(key, delta) {
  const item = cart.find(c => c.key === key);
  if (!item) return;
  item.qty = (item.qty || 1) + delta;
  if (item.qty <= 0) cart = cart.filter(c => c.key !== key);
  saveCart();
  renderCart();
  updateBadges();
}

function removeFromCart(key) {
  cart = cart.filter(c => c.key !== key);
  saveCart();
  renderCart();
  updateBadges();
}

function clearCart() {
  cart = [];
  saveCart();
  renderCart();
  updateBadges();
}

function saveCart() {
  localStorage.setItem('tt_cart', JSON.stringify(cart));
}

function renderCart() {
  const container = document.getElementById('cart-items');
  const footer = document.getElementById('cart-footer');
  const label = document.getElementById('cart-item-count-label');

  if (!cart.length) {
    container.innerHTML = `<div class="cart-empty"><i class="fa fa-shopping-bag"></i><p>Your bag is empty.<br/>Browse the collection!</p></div>`;
    if (footer) footer.style.display = 'none';
    if (label) label.textContent = '0 items';
    return;
  }

  if (footer) footer.style.display = 'block';
  const total = cart.reduce((s, c) => s + (c.price * (c.qty || 1)), 0);
  const count = cart.reduce((s, c) => s + (c.qty || 1), 0);
  if (label) label.textContent = `${count} item${count !== 1 ? 's' : ''}`;

  container.innerHTML = cart.map(c => `
    <div class="cart-item">
      <img class="cart-item-img" src="${c.image || 'https://placehold.co/72x84/f2efe9/888?text=?'}" alt="${escHtml(c.name)}" onerror="this.src='https://placehold.co/72x84/f2efe9/888?text=?'" />
      <div class="cart-item-info">
        <p class="cart-item-name">${escHtml(c.name)}</p>
        <p class="cart-item-brand">${escHtml(c.brand)}</p>
        ${c.size ? `<p class="cart-item-size">Size: ${escHtml(c.size)}</p>` : ''}
        <p class="cart-item-price">₹${Number(c.price).toLocaleString('en-IN')}</p>
      </div>
      <div class="cart-item-right">
        <div class="qty-controls">
          <button class="qty-btn" onclick="changeQty('${c.key}', -1)">−</button>
          <span class="qty-val">${c.qty || 1}</span>
          <button class="qty-btn" onclick="changeQty('${c.key}', 1)">+</button>
        </div>
        <button class="remove-btn" onclick="removeFromCart('${c.key}')">Remove</button>
      </div>
    </div>`).join('');

  document.getElementById('cart-subtotal').textContent = `₹${total.toLocaleString('en-IN')}`;
  document.getElementById('cart-total-price').textContent = `₹${total.toLocaleString('en-IN')}`;
}

function toggleCart() {
  const sidebar = document.getElementById('cart-sidebar');
  const overlay = document.getElementById('cart-overlay');
  const open = sidebar.classList.toggle('open');
  overlay.classList.toggle('open', open);
  if (open) renderCart();
}

function checkoutWhatsApp() {
  if (!cart.length) return;
  const lines = cart.map(c =>
    `• ${c.name}${c.size ? ` (${c.size})` : ''} × ${c.qty || 1} — ₹${(c.price * (c.qty || 1)).toLocaleString('en-IN')}`
  ).join('\n');
  const total = cart.reduce((s, c) => s + (c.price * (c.qty || 1)), 0);
  const msg = `Hi THRIFTHUNDER! 👋\n\nI'd like to order:\n\n${lines}\n\n*Total: ₹${total.toLocaleString('en-IN')}*\n\nPlease confirm availability and share payment details.`;
  window.open(`https://wa.me/919042489937?text=${encodeURIComponent(msg)}`, '_blank');
}

// ─── WISHLIST ────────────────────────────────────────────────────────────────
function toggleWishlist(id) {
  const p = allProducts.find(x => x.id === id || x.id == id);
  if (!p) return;

  const idx = wishlist.findIndex(w => w.id === id);
  if (idx >= 0) {
    wishlist.splice(idx, 1);
    showToast('Removed from wishlist');
  } else {
    wishlist.push({ id: p.id, name: p.name, brand: p.brand, price: p.price, images: p.images, status: p.status, category: p.category, condition: p.condition, sizes: p.sizes, featured: p.featured, description: p.description });
    showToast('Saved to wishlist ♥', 'success');
  }

  localStorage.setItem('tt_wishlist', JSON.stringify(wishlist));
  updateBadges();
  renderWishlist();

  // Update card heart
  const btn = document.querySelector(`.product-card[data-id="${id}"] .card-wishlist-btn`);
  if (btn) {
    const inWl = wishlist.some(w => w.id === id);
    btn.classList.toggle('active', inWl);
    btn.innerHTML = `<i class="${inWl ? 'fas' : 'far'} fa-heart"></i>`;
  }
}

function renderWishlist() {
  const grid = document.getElementById('wishlist-grid');
  const empty = document.getElementById('wishlist-empty');
  if (!grid) return;

  if (!wishlist.length) {
    grid.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  // Merge with latest product data
  const items = wishlist.map(w => {
    const live = allProducts.find(p => p.id === w.id);
    return live || w;
  });

  grid.innerHTML = items.map(p => createProductCard(p)).join('');
}

// ─── SEARCH ──────────────────────────────────────────────────────────────────
let searchTimeout;
function handleSearch(val) {
  const clearBtn = document.getElementById('search-clear');
  if (clearBtn) clearBtn.classList.toggle('visible', val.length > 0);

  clearTimeout(searchTimeout);
  if (!val.trim()) {
    if (document.getElementById('page-search')?.classList.contains('active')) {
      showPage('home');
    }
    return;
  }

  searchTimeout = setTimeout(() => {
    const q = val.trim().toLowerCase();
    const results = allProducts.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      p.brand?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q)
    );

    document.getElementById('search-query-title').textContent = `"${val}"`;
    document.getElementById('search-result-count').textContent = `${results.length} result${results.length !== 1 ? 's' : ''}`;

    const grid = document.getElementById('search-results-grid');
    const empty = document.getElementById('search-empty');
    const msg = document.getElementById('search-empty-msg');

    if (results.length) {
      grid.innerHTML = results.map(p => createProductCard(p)).join('');
      if (empty) empty.style.display = 'none';
    } else {
      grid.innerHTML = '';
      if (empty) empty.style.display = 'block';
      if (msg) msg.textContent = `No products match "${val}". Try a different search.`;
    }

    showPage('search');
  }, 300);
}

function clearSearch() {
  document.getElementById('search-input').value = '';
  document.getElementById('search-clear')?.classList.remove('visible');
  if (document.getElementById('page-search')?.classList.contains('active')) {
    showPage('home');
  }
}

// ─── PAGE NAVIGATION ─────────────────────────────────────────────────────────
function showPage(page) {
  if (!['home', 'product', 'search'].includes(page)) {
    previousPage = document.querySelector('.page.active')?.id?.replace('page-', '') || 'home';
  }

  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  const target = document.getElementById(`page-${page}`);
  if (target) {
    target.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function goBack() {
  showPage(previousPage || 'home');
}

function scrollToSection(id) {
  if (!document.getElementById('page-home')?.classList.contains('active')) {
    showPage('home');
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
  } else {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ─── NAVBAR ──────────────────────────────────────────────────────────────────
function setupNavScroll() {
  window.addEventListener('scroll', () => {
    document.getElementById('navbar')?.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });
}

function toggleMenu() {
  const menu = document.getElementById('mobile-menu');
  const ham = document.getElementById('hamburger');
  menu?.classList.toggle('open');
  ham?.classList.toggle('open');
}

function closeMenu() {
  document.getElementById('mobile-menu')?.classList.remove('open');
  document.getElementById('hamburger')?.classList.remove('open');
}

function updateBadges() {
  const cartCount = cart.reduce((s, c) => s + (c.qty || 1), 0);
  const wlCount = wishlist.length;

  const cc = document.getElementById('cart-count');
  const wc = document.getElementById('wishlist-count');

  if (cc) { cc.textContent = cartCount; cc.classList.toggle('show', cartCount > 0); }
  if (wc) { wc.textContent = wlCount; wc.classList.toggle('show', wlCount > 0); }
}

// ─── ADMIN AUTH ───────────────────────────────────────────────────────────────
function openAdmin() {
  closeMenu();
  if (sessionStorage.getItem('tt_admin') === '1') {
    showPage('admin');
    updateDashboard();
  } else {
    showPage('admin-login');
  }
}

function adminLogin() {
  const pass = document.getElementById('admin-pass')?.value;
  if (pass === ADMIN_PASSWORD) {
    sessionStorage.setItem('tt_admin', '1');
    document.getElementById('admin-pass').value = '';
    showPage('admin');
    updateDashboard();
  } else {
    showToast('Incorrect password', 'error');
    document.getElementById('admin-pass')?.select();
  }
}

function togglePassVisibility() {
  const input = document.getElementById('admin-pass');
  const eye = document.getElementById('pass-eye');
  if (!input || !eye) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  eye.className = show ? 'fa fa-eye-slash' : 'fa fa-eye';
}

// ─── ADMIN TABS ───────────────────────────────────────────────────────────────
function switchAdminTab(tab, btn) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${tab}`)?.classList.add('active');
  if (btn) btn.classList.add('active');

  if (tab === 'products') renderAdminList();
  if (tab === 'dashboard') updateDashboard();
  if (tab === 'add') {
    const formTitle = document.getElementById('form-mode-title');
    if (formTitle && !document.getElementById('edit-product-id')?.value) {
      formTitle.textContent = 'Add New Product';
    }
  }
}

// ─── ADMIN DASHBOARD ──────────────────────────────────────────────────────────
function updateDashboard() {
  const total = allProducts.length;
  const avail = allProducts.filter(p => p.status !== 'soldout').length;
  const sold = allProducts.filter(p => p.status === 'soldout').length;
  const featured = allProducts.filter(p => p.featured).length;

  setEl('dash-total', total);
  setEl('dash-available', avail);
  setEl('dash-sold', sold);
  setEl('dash-featured', featured);

  const recent = [...allProducts].slice(0, 5);
  const list = document.getElementById('recent-products-list');
  if (list) {
    list.innerHTML = recent.length
      ? recent.map(p => `
          <div class="recent-item">
            <img src="${p.images?.[0] || 'https://placehold.co/44x50/f2efe9/888?text=?'}" alt="${escHtml(p.name)}" onerror="this.src='https://placehold.co/44x50/f2efe9/888?text=?'" />
            <div class="recent-item-info">
              <strong>${escHtml(p.name)}</strong>
              <small>${escHtml(p.brand || '')} · ${escHtml(p.category || '')}</small>
            </div>
            <span class="recent-item-price">₹${Number(p.price).toLocaleString('en-IN')}</span>
          </div>`).join('')
      : '<p style="color:var(--text-3);font-family:var(--font-ui);font-size:.875rem">No products yet.</p>';
  }
}

// ─── ADMIN PRODUCT LIST ───────────────────────────────────────────────────────
function renderAdminList(filter = '') {
  const container = document.getElementById('admin-product-list');
  const empty = document.getElementById('admin-empty');
  const countEl = document.getElementById('admin-product-count');
  if (!container) return;

  adminProducts = filter
    ? allProducts.filter(p =>
        p.name?.toLowerCase().includes(filter.toLowerCase()) ||
        p.brand?.toLowerCase().includes(filter.toLowerCase())
      )
    : [...allProducts];

  if (countEl) countEl.textContent = adminProducts.length;

  if (!adminProducts.length) {
    container.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  container.innerHTML = adminProducts.map(p => `
    <div class="admin-product-item">
      <img class="admin-product-img" src="${p.images?.[0] || 'https://placehold.co/58x66/f2efe9/888?text=?'}" alt="${escHtml(p.name)}" onerror="this.src='https://placehold.co/58x66/f2efe9/888?text=?'" />
      <div class="admin-product-details">
        <p class="admin-product-name">${escHtml(p.name)}</p>
        <p class="admin-product-meta">${escHtml(p.brand || '')} · ${escHtml(p.category || '')} · ${escHtml(p.condition || '')}</p>
      </div>
      <span class="admin-product-price">₹${Number(p.price).toLocaleString('en-IN')}</span>
      <span class="status-pill ${p.status === 'soldout' ? 'status-soldout' : 'status-available'}">${p.status === 'soldout' ? 'Sold Out' : 'Available'}</span>
      <div class="admin-item-btns">
        <button class="admin-btn admin-btn-edit" onclick="editProduct('${p.id}')"><i class="fa fa-pen"></i> Edit</button>
        <button class="admin-btn admin-btn-del" onclick="confirmDelete('${p.id}', '${escHtml(p.name)}')"><i class="fa fa-trash"></i></button>
      </div>
    </div>`).join('');
}

function filterAdminList(val) {
  renderAdminList(val);
}

// ─── PRODUCT FORM ─────────────────────────────────────────────────────────────
function resetProductForm() {
  document.getElementById('edit-product-id').value = '';
  document.getElementById('p-name').value = '';
  document.getElementById('p-brand').value = '';
  document.getElementById('p-price').value = '';
  document.getElementById('p-category').value = 'Tops';
  document.getElementById('p-condition').value = 'Thrifted';
  document.getElementById('p-status').value = 'available';
  document.getElementById('p-sizes').value = '';
  document.getElementById('p-featured').checked = false;
  document.getElementById('p-desc').value = '';
  document.getElementById('image-preview-grid').innerHTML = '';
  document.getElementById('form-mode-title').textContent = 'Add New Product';
  pendingImageFiles = [];
  existingImageUrls = [];
  hideUploadProgress();
}

function editProduct(id) {
  const p = allProducts.find(x => x.id === id || x.id == id);
  if (!p) return;

  document.getElementById('edit-product-id').value = p.id;
  document.getElementById('p-name').value = p.name || '';
  document.getElementById('p-brand').value = p.brand || '';
  document.getElementById('p-price').value = p.price || '';
  document.getElementById('p-category').value = p.category || 'Tops';
  document.getElementById('p-condition').value = p.condition || 'Thrifted';
  document.getElementById('p-status').value = p.status || 'available';
  document.getElementById('p-sizes').value = (p.sizes || []).join(', ');
  document.getElementById('p-featured').checked = !!p.featured;
  document.getElementById('p-desc').value = p.description || '';
  document.getElementById('form-mode-title').textContent = 'Edit Product';

  // Load existing images
  existingImageUrls = [...(p.images || [])];
  pendingImageFiles = [];
  renderImagePreviews();

  switchAdminTab('add', document.querySelector('.admin-nav-btn:nth-child(2)'));
  window.scrollTo({ top: 0 });
}

// ─── IMAGE HANDLING ───────────────────────────────────────────────────────────
function setupDragDrop() {
  const zone = document.getElementById('upload-zone');
  if (!zone) return;

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    handleFileSelect(e.dataTransfer.files);
  });
  zone.addEventListener('click', e => {
    if (e.target.closest('.upload-choose-btn')) return;
    document.getElementById('img-file-input')?.click();
  });
}

function handleFileSelect(files) {
  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const newFiles = Array.from(files).filter(f => validTypes.includes(f.type));

  if (!newFiles.length) {
    showToast('Please select JPG, PNG, or WebP images', 'error');
    return;
  }

  newFiles.forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      pendingImageFiles.push({ file, previewUrl: e.target.result, url: null });
      renderImagePreviews();
    };
    reader.readAsDataURL(file);
  });
}

function renderImagePreviews() {
  const grid = document.getElementById('image-preview-grid');
  if (!grid) return;

  // Existing images
  const existingHtml = existingImageUrls.map((url, i) => `
    <div class="preview-item" data-existing="${i}">
      <img src="${url}" alt="Image ${i + 1}" />
      <button class="preview-remove" onclick="removeExistingImage(${i})"><i class="fa fa-times"></i></button>
      ${i === 0 && pendingImageFiles.length === 0 ? '<span class="preview-badge">Cover</span>' : ''}
    </div>`).join('');

  // New pending images
  const pendingHtml = pendingImageFiles.map((item, i) => `
    <div class="preview-item" data-pending="${i}">
      <img src="${item.previewUrl}" alt="New image ${i + 1}" />
      <button class="preview-remove" onclick="removePendingImage(${i})"><i class="fa fa-times"></i></button>
      ${existingImageUrls.length === 0 && i === 0 ? '<span class="preview-badge">Cover</span>' : ''}
    </div>`).join('');

  grid.innerHTML = existingHtml + pendingHtml;
}

function removeExistingImage(i) {
  existingImageUrls.splice(i, 1);
  renderImagePreviews();
}

function removePendingImage(i) {
  pendingImageFiles.splice(i, 1);
  renderImagePreviews();
}

function showUploadProgress(pct, label) {
  const wrap = document.getElementById('upload-progress-wrap');
  const bar = document.getElementById('upload-progress-bar');
  const lbl = document.getElementById('upload-progress-label');
  if (wrap) wrap.style.display = 'flex';
  if (bar) bar.style.setProperty('--progress', `${pct}%`);
  if (lbl) lbl.textContent = label;
}

function hideUploadProgress() {
  const wrap = document.getElementById('upload-progress-wrap');
  if (wrap) wrap.style.display = 'none';
}

// ─── SUPABASE: SAVE PRODUCT ───────────────────────────────────────────────────
async function saveProduct() {
  const name = document.getElementById('p-name')?.value.trim();
  const brand = document.getElementById('p-brand')?.value.trim();
  const price = parseFloat(document.getElementById('p-price')?.value);

  if (!name) { showToast('Product name is required', 'error'); return; }
  if (!brand) { showToast('Brand is required', 'error'); return; }
  if (!price || isNaN(price) || price <= 0) { showToast('Enter a valid price', 'error'); return; }
  if (pendingImageFiles.length === 0 && existingImageUrls.length === 0) {
    showToast('Add at least one image', 'error'); return;
  }

  const editId = document.getElementById('edit-product-id')?.value;
  const btn = document.querySelector('.form-actions .btn-primary');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Saving…'; }

  try {
    // Upload new images to Supabase Storage
    const uploadedUrls = [...existingImageUrls];

    for (let i = 0; i < pendingImageFiles.length; i++) {
      const { file } = pendingImageFiles[i];
      const pct = Math.round(((i) / pendingImageFiles.length) * 80);
      showUploadProgress(pct, `Uploading image ${i + 1} of ${pendingImageFiles.length}…`);

      const ext = file.name.split('.').pop();
      const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

      const { data: uploadData, error: uploadError } = await sb.storage
        .from(STORAGE_BUCKET)
        .upload(path, file, { cacheControl: '3600', upsert: false });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(uploadData.path);
      uploadedUrls.push(publicUrl);
    }

    showUploadProgress(90, 'Saving product…');

    const sizes = document.getElementById('p-sizes')?.value
      .split(',')
      .map(s => s.trim())
      .filter(Boolean) || [];

    const productData = {
      name,
      brand,
      price,
      category: document.getElementById('p-category')?.value || 'Tops',
      condition: document.getElementById('p-condition')?.value || 'Thrifted',
      status: document.getElementById('p-status')?.value || 'available',
      sizes,
      featured: document.getElementById('p-featured')?.checked || false,
      description: document.getElementById('p-desc')?.value.trim() || '',
      images: uploadedUrls,
    };

    let error;
    if (editId) {
      ({ error } = await sb.from('products').update(productData).eq('id', editId));
    } else {
      ({ error } = await sb.from('products').insert([productData]));
    }

    if (error) throw error;

    showUploadProgress(100, 'Done!');
    showToast(editId ? 'Product updated!' : 'Product added!', 'success');
    resetProductForm();
    hideUploadProgress();

    await loadProducts();
    switchAdminTab('products', document.querySelector('.admin-nav-btn:nth-child(3)'));

  } catch (err) {
    console.error('Save product error:', err);
    showToast(`Error: ${err.message || 'Could not save product'}`, 'error');
    hideUploadProgress();
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa fa-save"></i> Save Product'; }
  }
}

// ─── SUPABASE: DELETE PRODUCT ─────────────────────────────────────────────────
function confirmDelete(id, name) {
  pendingDeleteId = id;
  document.getElementById('modal-msg').textContent = `"${name}" will be permanently deleted.`;
  document.getElementById('modal-confirm-btn').onclick = () => deleteProduct(id);
  document.getElementById('modal-overlay')?.classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay')?.classList.remove('open');
  pendingDeleteId = null;
}

async function deleteProduct(id) {
  closeModal();
  try {
    const { error } = await sb.from('products').delete().eq('id', id);
    if (error) throw error;
    showToast('Product deleted', 'success');
    await loadProducts();
  } catch (err) {
    console.error('Delete error:', err);
    showToast(`Delete failed: ${err.message}`, 'error');
  }
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
function showToast(msg, type = '') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fa ${icon}"></i> ${escHtml(msg)}`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('out');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, 3200);
}

// ─── REVEAL ANIMATIONS ────────────────────────────────────────────────────────
function observeReveal() {
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
    return;
  }
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal:not(.visible)').forEach(el => obs.observe(el));
}

// ─── STAT COUNTER ─────────────────────────────────────────────────────────────
function animateStatCounter(elId, target) {
  const el = document.getElementById(elId);
  if (!el) return;
  let current = 0;
  const step = Math.ceil(target / 30);
  const interval = setInterval(() => {
    current = Math.min(current + step, target);
    el.textContent = current;
    if (current >= target) clearInterval(interval);
  }, 30);
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// Close cart when clicking overlay
document.getElementById('cart-overlay')?.addEventListener('click', toggleCart);

// Close modal on overlay click
document.getElementById('modal-overlay')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

// Keyboard: ESC to close modal/cart/menu
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal();
    const cartOpen = document.getElementById('cart-sidebar')?.classList.contains('open');
    if (cartOpen) toggleCart();
    closeMenu();
  }
});