/**
 * Mack Magnets — Dynamic Products from Shopify Storefront API
 * Built by AjayaDesign | Fingerprint: 414A4459-50524F44
 *
 * Uses Storefront API (CORS-friendly) for dynamic product loading.
 * Static cards from sync script serve as SEO fallback.
 */

(function() {
  'use strict';

  const SHOPIFY_DOMAIN = '1pp0pw-1f.myshopify.com';
  const STOREFRONT_TOKEN = 'e0369b1b658648502923373bb0cf6d27';
  const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=400&h=400&fit=crop&auto=format';

  async function fetchProducts() {
    try {
      // Try Storefront API (CORS-friendly)
      const query = `{
        products(first: 50, sortKey: PRICE) {
          nodes {
            id handle title availableForSale
            priceRange { minVariantPrice { amount } }
            featuredImage { url altText }
            variants(first: 5) { nodes { id title price { amount } availableForSale } }
          }
        }
      }`;
      const res = await fetch(`https://${SHOPIFY_DOMAIN}/api/2024-01/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': STOREFRONT_TOKEN
        },
        body: JSON.stringify({ query })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.errors) throw new Error(data.errors[0].message);
      return data.data.products.nodes || [];
    } catch (e) {
      console.warn('Storefront API failed, using static cards:', e);
      return [];
    }
  }

  function renderProductCard(product) {
    const variant = product.variants?.nodes?.[0];
    const price = variant?.price?.amount || product.priceRange?.minVariantPrice?.amount || '0.00';
    const variantId = variant?.id || '';
    const image = product.featuredImage?.url || FALLBACK_IMAGE;
    const imageAlt = product.featuredImage?.altText || product.title || '';
    const title = product.title || 'Custom Magnet';
    const handle = product.handle || '';

    const card = document.createElement('div');
    card.className = 'product-card fade-in';
    card.dataset.category = 'shopify';
    card.innerHTML = `
      <div class="product-card__image">
        <img src="${image}${image.includes('?') ? '&' : '?'}width=400" alt="${imageAlt}" width="400" height="400" loading="lazy">
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

    // If static cards exist (from sync script), just bind their buttons and done
    // The static cards are the primary display; dynamic is an enhancement
    const hasStaticCards = grid.querySelectorAll('.product-card').length > 0;

    const products = await fetchProducts();

    if (products.length > 0) {
      // Dynamic cards available — replace static with fresh data
      grid.innerHTML = '';
      grid.classList.add('products-grid');
      products.forEach(p => grid.appendChild(renderProductCard(p)));
    } else if (hasStaticCards) {
      // Keep static cards, just bind buttons
      bindStaticButtons();
    } else {
      // No static cards AND no dynamic — show fallback message
      grid.innerHTML = '<p style="text-align:center;color:var(--color-text-muted);padding:2rem;">Products coming soon! Check back shortly.</p>';
    }
  }

  async function renderFeaturedProducts() {
    const grid = document.getElementById('featured-products-grid');
    if (!grid) return;

    const products = await fetchProducts();
    if (products.length === 0) {
      // Keep static fallback cards
      bindStaticButtons();
      return;
    }

    grid.innerHTML = '';
    grid.classList.add('products-grid');
    products.slice(0, 4).forEach(p => grid.appendChild(renderProductCard(p)));
  }

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
