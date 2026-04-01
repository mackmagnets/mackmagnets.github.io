/**
 * Mack Magnets — Dynamic Products from Shopify
 * Built by AjayaDesign | Fingerprint: 414A4459-50524F44
 */

(function() {
  'use strict';

  const PRODUCTS_URL = 'https://mackmagnets.com/products.json';
  const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=400&h=400&fit=crop&auto=format';

  async function fetchProducts() {
    try {
      const res = await fetch(PRODUCTS_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.products || [];
    } catch (e) {
      console.warn('Failed to fetch products from Shopify:', e);
      return [];
    }
  }

  function renderProductCard(product) {
    const variant = product.variants?.[0];
    const price = variant?.price || '0.00';
    const variantId = variant?.id || '';
    const image = product.images?.[0]?.src || product.image?.src || FALLBACK_IMAGE;
    const title = product.title || 'Custom Magnet';

    const card = document.createElement('div');
    card.className = 'product-card fade-in';
    card.dataset.category = 'shopify';
    card.innerHTML = `
      <div class="product-card__image">
        <img src="${image}" alt="${title}" width="400" height="400" loading="lazy">
      </div>
      <div class="product-card__body">
        <h3 class="product-card__title">${title}</h3>
        <div class="product-card__price">$${parseFloat(price).toFixed(2)}</div>
        <button class="product-card__btn" data-variant-id="${variantId}" aria-label="Add ${title} to cart">Add to Cart</button>
      </div>
    `;

    card.querySelector('.product-card__btn').addEventListener('click', function() {
      const vid = this.dataset.variantId;
      if (vid && window.MackCart) {
        this.textContent = 'Adding...';
        this.disabled = true;
        window.MackCart.addToCart(vid, 1).then(() => {
          this.textContent = 'Added ✓';
          setTimeout(() => { this.textContent = 'Add to Cart'; this.disabled = false; }, 1500);
        }).catch(() => { this.textContent = 'Add to Cart'; this.disabled = false; });
      }
    });

    return card;
  }

  async function renderShopProducts() {
    const grid = document.getElementById('shopify-products-grid');
    if (!grid) return;

    grid.innerHTML = '<div class="products-loading" style="text-align:center;padding:2rem;color:var(--color-text-muted);">Loading products...</div>';

    const products = await fetchProducts();

    if (products.length === 0) {
      grid.innerHTML = '<p style="text-align:center;color:var(--color-text-muted);padding:2rem;">Products coming soon! Check back shortly.</p>';
      return;
    }

    grid.innerHTML = '';
    grid.classList.add('products-grid');
    products.forEach(p => grid.appendChild(renderProductCard(p)));
  }

  async function renderFeaturedProducts() {
    const grid = document.getElementById('featured-products-grid');
    if (!grid) return;

    const products = await fetchProducts();
    if (products.length === 0) return; // keep static fallback

    grid.innerHTML = '';
    grid.classList.add('products-grid');
    // Show up to 4 featured
    products.slice(0, 4).forEach(p => grid.appendChild(renderProductCard(p)));
  }

  // Also bind static Add to Cart buttons (existing cards not from Shopify)
  function bindStaticButtons() {
    document.querySelectorAll('.product-card__btn[data-variant-id]').forEach(btn => {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', function() {
        const vid = this.dataset.variantId;
        if (vid && window.MackCart) {
          this.textContent = 'Adding...';
          this.disabled = true;
          window.MackCart.addToCart(vid, 1).then(() => {
            this.textContent = 'Added ✓';
            setTimeout(() => { this.textContent = 'Add to Cart'; this.disabled = false; }, 1500);
          }).catch(() => { this.textContent = 'Add to Cart'; this.disabled = false; });
        }
      });
    });
  }

  function init() {
    renderShopProducts();
    renderFeaturedProducts();
    bindStaticButtons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
