#!/usr/bin/env python3
"""
Shopify Product Sync — Mack Magnets
====================================
Fetches all products from the Shopify /products.json endpoint and:
  1. Saves raw data to _data/products.json
  2. Generates SEO-friendly static HTML product cards
  3. Injects them into shop/index.html and index.html
  4. Generates JSON-LD Product structured data for SEO

Run locally:  python3 scripts/sync-products.py
Run in CI:    triggered by .github/workflows/sync-products.yml
"""

import json
import os
import re
import shutil
import sys
from datetime import datetime, timezone
from html import escape
from urllib.request import Request, urlopen

# ─── Config ──────────────────────────────────────────────
SHOPIFY_DOMAIN = os.environ.get('SHOPIFY_DOMAIN', '1pp0pw-1f.myshopify.com')
SITE_URL = 'https://mackmagnets.com'
BRAND_NAME = 'Mack Magnets'

# Paths (relative to repo root)
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(REPO_ROOT, '_data')
DATA_FILE = os.path.join(DATA_DIR, 'products.json')
SHOP_HTML = os.path.join(REPO_ROOT, 'shop', 'index.html')
HOME_HTML = os.path.join(REPO_ROOT, 'index.html')


def fetch_products():
    """Fetch all products from Shopify /products.json (no auth needed)."""
    url = f'https://{SHOPIFY_DOMAIN}/products.json'
    print(f'Fetching products from {url}...')

    all_products = []
    page = 1
    while True:
        page_url = f'{url}?limit=250&page={page}'
        req = Request(page_url)
        req.add_header('User-Agent', 'MackMagnets-Sync/1.0')
        resp = urlopen(req, timeout=30)
        data = json.loads(resp.read().decode())
        products = data.get('products', [])
        if not products:
            break
        all_products.extend(products)
        print(f'  Page {page}: {len(products)} products')
        if len(products) < 250:
            break
        page += 1

    print(f'  Total: {len(all_products)} products')
    return all_products


def save_json(products):
    """Save products to _data/products.json."""
    os.makedirs(DATA_DIR, exist_ok=True)
    payload = {
        'lastUpdated': datetime.now(timezone.utc).isoformat(),
        'shopifyDomain': SHOPIFY_DOMAIN,
        'productCount': len(products),
        'products': products,
    }
    with open(DATA_FILE, 'w') as f:
        json.dump(payload, f, indent=2)
    print(f'  Saved {DATA_FILE}')


def is_custom_product(product):
    """Check if product requires Shopify hosted page (photo upload).

    A product is "custom" (needs photo upload) when:
    - tag includes 'custom photo magnets', 'custom', or 'custom-bottle-openers', OR
    - title contains 'custom photo' or 'custom bottle' or 'custom keychain', OR
    - product_type starts with 'Custom'
    """
    tags_raw = product.get('tags', [])
    if isinstance(tags_raw, str):
        tags = [t.lower().strip() for t in tags_raw.split(',') if t.strip()]
    else:
        tags = [str(t).lower().strip() for t in tags_raw]

    custom_tags = {'custom photo magnets', 'custom', 'custom bottle openers', 'custom-bottle-openers'}
    if any(t in custom_tags for t in tags):
        return True

    title_lower = product.get('title', '').lower()
    if 'custom photo' in title_lower or 'custom bottle' in title_lower or 'custom keychain' in title_lower:
        return True

    ptype = (product.get('product_type', '') or '').lower()
    if ptype.startswith('custom'):
        return True

    return False


def get_badge(product):
    """Determine badge text from tags."""
    tags = [t.lower().strip() for t in product.get('tags', '').split(',') if t.strip()] if isinstance(product.get('tags'), str) else [t.lower() for t in product.get('tags', [])]
    if 'bestseller' in tags or 'best seller' in tags:
        return 'Best Seller'
    if 'new' in tags:
        return 'New'
    if 'sale' in tags:
        return 'Sale'
    return None


def format_price(product):
    """Format price display string."""
    variants = product.get('variants', [])
    if not variants:
        return 'Price TBD'
    prices = [float(v.get('price', '0')) for v in variants]
    min_price = min(prices)
    max_price = max(prices)

    if min_price == 0:
        return 'Free'

    formatted_min = f'${min_price:.2f}'
    if min_price != max_price:
        return f'From {formatted_min}'
    return formatted_min


def get_image_url(product, width=400):
    """Get first image URL with width parameter."""
    images = product.get('images', [])
    if not images:
        return ''
    src = images[0].get('src', '')
    if not src:
        return ''
    # Shopify CDN supports _WIDTHx in filename or ?width=
    if '?' in src:
        return src + f'&width={width}'
    return src + f'?width={width}'


def get_image_alt(product):
    """Get image alt text."""
    images = product.get('images', [])
    if images and images[0].get('alt'):
        return escape(images[0]['alt'])
    return escape(product.get('title', ''))


def get_first_variant_id(product):
    """Get the first variant ID for add-to-cart."""
    variants = product.get('variants', [])
    if variants:
        return str(variants[0].get('id', ''))
    return ''


def is_available(product):
    """Check if any variant is available."""
    variants = product.get('variants', [])
    return any(v.get('available', True) for v in variants)


def build_product_card(product):
    """Generate a single product card HTML matching Mack Magnets BEM classes."""
    title = escape(product.get('title', ''))
    handle = product.get('handle', '')
    price_html = format_price(product)
    image_url = get_image_url(product)
    image_alt = get_image_alt(product)
    available = is_available(product)
    is_custom = is_custom_product(product)
    variant_id = get_first_variant_id(product)

    # All products link to local PDP pages
    product_url = f'/shop/{handle}/'

    # CTA button
    if is_custom:
        cta = f'<a href="{escape(product_url)}" class="product-card__btn">View &amp; Customize →</a>'
    elif not available:
        cta = f'<button class="product-card__btn" data-variant-id="{escape(variant_id)}" disabled>Sold Out</button>'
    else:
        cta = f'<button class="product-card__btn" data-variant-id="{escape(variant_id)}" aria-label="Add {title} to cart">Add to Cart</button>'

    sold_class = ' sold-out' if not available else ''

    # Image HTML (fallback if no image)
    if image_url:
        img_html = f'<img src="{image_url}" alt="{image_alt}" width="400" height="400" loading="lazy">'
    else:
        img_html = f'<div style="width:400px;height:400px;background:var(--color-surface,#f5f5f5);display:flex;align-items:center;justify-content:center;color:var(--color-text-muted,#999);">No image</div>'

    return f"""        <div class="product-card fade-in{sold_class}" data-category="shopify">
          <a href="{escape(product_url)}" class="product-card__link">
            <div class="product-card__image">
              {img_html}
            </div>
            <div class="product-card__body">
              <h3 class="product-card__title">{title}</h3>
              <div class="product-card__price">{price_html}</div>
            </div>
          </a>
          <div class="product-card__actions" style="padding: 0 1.25rem 1.25rem;">
            {cta}
          </div>
        </div>"""


def build_product_page_html(product, all_products):
    """Generate a full product detail page HTML for SEO."""
    title = escape(product.get('title', ''))
    handle = product.get('handle', '')
    body_html = product.get('body_html', '') or ''
    product_id = str(product.get('id', ''))
    is_custom = is_custom_product(product)
    available = is_available(product)
    variant_id = get_first_variant_id(product)
    price_html = format_price(product)
    badge = get_badge(product)

    # Description text (strip HTML)
    description_text = re.sub(r'<[^>]+>', '', body_html).strip()[:200]

    # Images
    images = product.get('images', [])
    og_image = ''
    if images and images[0].get('src'):
        og_image = images[0]['src']
        og_image += ('&width=1200' if '?' in og_image else '?width=1200')

    # Price info for JSON-LD
    variants = product.get('variants', [])
    prices = [float(v.get('price', '0')) for v in variants] if variants else [0]
    min_price = f'{min(prices):.2f}'

    # Badge HTML
    badge_html = ''
    if badge:
        badge_html = f'<span class="pdp-badge">{badge}</span>'
    if not available:
        badge_html = '<span class="pdp-badge pdp-badge--soldout">Sold Out</span>'

    # Build image gallery
    gallery_items = []
    for i, img in enumerate(images):
        img_url = img.get('src', '')
        if not img_url:
            continue
        img_alt = escape(img.get('alt') or title)
        gallery_url = img_url + ('&width=800' if '?' in img_url else '?width=800')
        thumb_url = img_url + ('&width=150' if '?' in img_url else '?width=150')
        active_class = ' active' if i == 0 else ''
        gallery_items.append(
            f'<button class="pdp-thumb{active_class}" data-index="{i}" aria-label="View image {i+1}">'
            f'<img src="{thumb_url}" alt="{img_alt}" width="150" height="150" loading="lazy">'
            f'</button>'
        )

    thumbs_html = '\n            '.join(gallery_items) if gallery_items else ''
    thumbs_section = ''
    if len(gallery_items) > 1:
        thumbs_section = f'''
          <div class="pdp-thumbs">
            {thumbs_html}
          </div>'''

    # Main image
    main_img_url = ''
    main_img_alt = title
    if images:
        main_img_url = images[0].get('src', '')
        main_img_alt = escape(images[0].get('alt') or title)
        if main_img_url:
            main_img_url += '&width=800' if '?' in main_img_url else '?width=800'

    all_img_urls_json = json.dumps([
        (img.get('src', '') + ('&width=800' if '?' in img.get('src', '') else '?width=800'))
        for img in images if img.get('src')
    ])

    # CTA — for custom products, link to Shopify hosted page (photo upload via Uploadery app)
    # Variant ID is appended via JS as customer changes selection
    if is_custom:
        shopify_url = f'https://{SHOPIFY_DOMAIN}/products/{handle}?variant={variant_id}'
        if not available:
            cta_html = f'<a href="{escape(shopify_url)}" class="btn btn--primary btn--lg pdp-cta" id="pdp-cta" target="_blank" rel="noopener" style="pointer-events:none;opacity:0.5;">Sold Out</a>'
        else:
            cta_html = f'<a href="{escape(shopify_url)}" class="btn btn--primary btn--lg pdp-cta" id="pdp-cta" target="_blank" rel="noopener">Customize Your Photo →</a>'
    elif not available:
        cta_html = f'<button class="btn btn--primary btn--lg pdp-cta" id="pdp-cta" data-variant-id="{escape(variant_id)}" disabled>Sold Out</button>'
    else:
        cta_html = f'<button class="btn btn--primary btn--lg pdp-cta" id="pdp-cta" data-variant-id="{escape(variant_id)}" aria-label="Add {title} to cart">Add to Cart</button>'

    # Related products (excluding self, max 4)
    related = [p for p in all_products if str(p.get('id', '')) != product_id][:4]
    related_cards = []
    for rp in related:
        rp_title = escape(rp.get('title', ''))
        rp_handle = rp.get('handle', '')
        rp_price = format_price(rp)
        rp_img_url = get_image_url(rp, 400)
        rp_img_alt = get_image_alt(rp)
        related_cards.append(f'''        <a href="/shop/{rp_handle}/" class="related-card">
          <div class="related-card-image">
            <img src="{rp_img_url}" alt="{rp_img_alt}" width="400" height="400" loading="lazy">
          </div>
          <h4 class="related-card-title">{rp_title}</h4>
          <p class="related-card-price">{rp_price}</p>
        </a>''')
    related_html = '\n\n'.join(related_cards)

    # ─── Variant selector ───────────────────────────────────────
    # Build a multi-axis option selector (Quantity, Type, etc.).
    # Shopify products have `options` (e.g. [{name:"Quantity", values:["1","3","6"]}])
    # and `variants` with option1/option2/option3 fields.
    variant_section = ''
    options_meta = product.get('options', []) or []
    # Filter out the default "Title" option that Shopify adds for single-variant products
    real_options = [
        o for o in options_meta
        if not (len(o.get('values', [])) == 1 and o.get('values', [''])[0] == 'Default Title')
    ]

    if len(variants) > 1 and real_options:
        option_groups = []
        for opt_idx, opt in enumerate(real_options, start=1):
            opt_name = opt.get('name', f'Option {opt_idx}')
            opt_values = opt.get('values', [])
            opt_key = f'option{opt_idx}'
            buttons = []
            for val in opt_values:
                val_esc = escape(val)
                # Check if any available variant uses this value (for disabled state)
                has_available = any(
                    v.get(opt_key) == val and v.get('available', True)
                    for v in variants
                )
                disabled_attr = '' if has_available else ' data-unavailable="true"'
                # First value is selected by default
                checked = ' aria-pressed="true"' if val == opt_values[0] else ' aria-pressed="false"'
                buttons.append(
                    f'<button type="button" class="pdp-option-chip" '
                    f'data-option-index="{opt_idx}" data-option-value="{val_esc}"'
                    f'{checked}{disabled_attr}>{val_esc}</button>'
                )
            option_groups.append(
                f'<div class="pdp-option-group" data-option-name="{escape(opt_name)}">\n'
                f'              <h3 class="pdp-variants-label">{escape(opt_name)}</h3>\n'
                f'              <div class="pdp-option-chips">\n                '
                + '\n                '.join(buttons) +
                f'\n              </div>\n'
                f'            </div>'
            )
        variant_section = (
            '<div class="pdp-variants" id="pdp-variants">\n            '
            + '\n            '.join(option_groups)
            + '\n          </div>'
        )

    # Variants data for client-side JS (variant lookup by option combo)
    variants_data = []
    for v in variants:
        variants_data.append({
            'id': str(v.get('id', '')),
            'title': v.get('title', ''),
            'price': v.get('price', '0'),
            'available': v.get('available', True),
            'option1': v.get('option1', ''),
            'option2': v.get('option2', ''),
            'option3': v.get('option3', ''),
        })
    variants_json = json.dumps(variants_data)
    is_custom_json = json.dumps(is_custom)
    shopify_product_url = f'https://{SHOPIFY_DOMAIN}/products/{handle}'

    # Description fallback
    if not body_html:
        body_html = f'<p>{escape(description_text)}</p>' if description_text else f'<p>Custom photo magnet by {BRAND_NAME}.</p>'

    # JSON-LD
    jsonld_images = [
        (img.get('src', '') + ('&width=1200' if '?' in img.get('src', '') else '?width=1200'))
        for img in images if img.get('src')
    ]
    product_jsonld = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        'name': product.get('title', ''),
        'description': description_text,
        'image': jsonld_images if len(jsonld_images) > 1 else (jsonld_images[0] if jsonld_images else ''),
        'url': f'{SITE_URL}/shop/{handle}/',
        'brand': {'@type': 'Brand', 'name': BRAND_NAME},
        'offers': {
            '@type': 'Offer',
            'price': min_price,
            'priceCurrency': 'USD',
            'availability': 'https://schema.org/InStock' if available else 'https://schema.org/OutOfStock',
            'url': f'{SITE_URL}/shop/{handle}/',
            'seller': {'@type': 'Organization', 'name': BRAND_NAME}
        }
    }
    jsonld_str = json.dumps(product_jsonld, indent=2).replace('\n', '\n  ')

    return f'''<!DOCTYPE html>
<html lang="en">
<!-- Built by AjayaDesign — For Demo Purpose Only | Fingerprint: 414A4459-504450 -->
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title} — {BRAND_NAME} | Rancho Cucamonga, CA</title>
  <meta name="description" content="{escape(description_text)}">
  <meta name="keywords" content="{title}, custom magnets, photo magnets, gifts, Rancho Cucamonga, California, fridge magnets">
  <link rel="canonical" href="{SITE_URL}/shop/{handle}/">
  <meta property="og:type" content="product">
  <meta property="og:title" content="{title} — {BRAND_NAME}">
  <meta property="og:description" content="{escape(description_text)}">
  <meta property="og:url" content="{SITE_URL}/shop/{handle}/">
  <meta property="og:image" content="{og_image}">
  <meta property="og:site_name" content="{BRAND_NAME}">
  <meta property="og:locale" content="en_US">
  <meta property="product:price:amount" content="{min_price}">
  <meta property="product:price:currency" content="USD">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{title} — {BRAND_NAME}">
  <meta name="twitter:description" content="{escape(description_text)}">
  <meta name="twitter:image" content="{og_image}">

  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <meta name="theme-color" content="#81B29A">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Inter:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/css/style.css">
  <script type="application/ld+json">
  {jsonld_str}
  </script>
</head>
<body data-ajaya-design="demo-property-2026">
  <a href="#main" class="skip-link">Skip to main content</a>
  <div class="mobile-overlay" aria-hidden="true"></div>

  <!-- Announcement Bar -->
  <div class="announcement-bar" role="banner">
    ✨ Women-Owned Small Business — Proudly Crafted in Rancho Cucamonga, CA ✨
  </div>

  <!-- Navbar -->
  <nav class="navbar" role="navigation" aria-label="Main navigation">
    <div class="navbar__inner">
      <a href="/" class="navbar__logo" aria-label="Mack Magnets Home"><img src="/assets/images/logo.svg" alt="Mack Magnets" height="40"></a>
      <button class="navbar__toggle" aria-label="Toggle menu" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
      <ul class="navbar__links">
        <li><a href="/">Home</a></li>
        <li><a href="/shop/">Shop</a></li>
        <li><a href="/events/">Events</a></li>
        <li><a href="/about/">About</a></li>
        <li><a href="/faq/">FAQ</a></li>
        <li><a href="/contact/">Contact</a></li>
        <li><a href="/shop/" class="navbar__cta">Order Now</a></li>
        <li><button class="cart-icon-btn" aria-label="Open cart">🛒<span class="cart-count">0</span></button></li>
      </ul>
    </div>
  </nav>

  <main id="main">

  <!-- Breadcrumb -->
  <section class="page-header" style="padding: 1.5rem 0 0.5rem;">
    <div class="container">
      <nav class="breadcrumb" aria-label="Breadcrumb" style="font-size:0.88rem;">
        <a href="/">Home</a>
        <span style="margin:0 0.4rem;color:var(--color-text-muted);">/</span>
        <a href="/shop/">Shop</a>
        <span style="margin:0 0.4rem;color:var(--color-text-muted);">/</span>
        <span>{title}</span>
      </nav>
    </div>
  </section>

  <!-- Product Detail -->
  <section class="pdp"
           data-product-id="{escape(product_id)}"
           data-product-handle="{escape(handle)}"
           data-shopify-url="{escape(shopify_product_url)}"
           data-is-custom="{str(is_custom).lower()}">
    <div class="container">
      <div class="pdp-layout">

        <!-- Gallery -->
        <div class="pdp-gallery">
          {badge_html}
          <div class="pdp-main-image">
            <img id="pdp-main-img" src="{main_img_url}" alt="{main_img_alt}" width="800" height="800">
          </div>{thumbs_section}
        </div>

        <!-- Info -->
        <div class="pdp-info">
          <h1 class="pdp-title">{title}</h1>
          <p class="pdp-price" id="pdp-price">{price_html}</p>

          {variant_section}

          {cta_html}

          <script type="application/json" id="pdp-variants-data">{variants_json}</script>

          <div class="pdp-description">
            {body_html}
          </div>

          <div class="pdp-features">
            <div class="pdp-feature">
              <span>🚚</span>
              <span>Ships nationwide across the USA</span>
            </div>
            <div class="pdp-feature">
              <span>📦</span>
              <span>Free shipping on orders $75+</span>
            </div>
            <div class="pdp-feature">
              <span>🎁</span>
              <span>Perfect gift for every occasion</span>
            </div>
            <div class="pdp-feature">
              <span>📸</span>
              <span>Handcrafted in Rancho Cucamonga, CA</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  </section>

  <!-- Related Products -->
  <section class="related-products" style="padding:3rem 0;">
    <div class="container">
      <h2 class="section-header__title" style="text-align:center;margin-bottom:2rem;">You May Also Like</h2>
      <div class="related-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:1.5rem;">
{related_html}
      </div>
      <div style="text-align:center;margin-top:2rem;">
        <a href="/shop/" class="btn btn--secondary">View All Products →</a>
      </div>
    </div>
  </section>

  </main>

  <!-- Footer -->
  <footer class="footer" role="contentinfo">
    <div class="container">
      <div class="footer__grid">
        <div class="footer__brand">
          <span class="footer__logo"><img src="/assets/images/logo.svg" alt="Mack Magnets" height="36"></span>
          <p>We believe in making your memories stick — literally! Transforming your special moments into vibrant, high-quality magnets since 2024.</p>
          <p style="margin-top: 0.75rem;">📍 Rancho Cucamonga, California</p>
          <div class="footer__social">
            <a href="https://www.instagram.com/mackmagnets/" aria-label="Instagram" target="_blank" rel="noopener noreferrer">📷</a>
            <a href="mailto:anita@mackmagnets.com" aria-label="Email">✉️</a>
          </div>
        </div>
        <div>
          <h4>Quick Links</h4>
          <ul class="footer__links">
            <li><a href="/">Home</a></li>
            <li><a href="/shop/">Shop</a></li>
            <li><a href="/events/">Events</a></li>
            <li><a href="/about/">About Us</a></li>
            <li><a href="/wholesale/">Wholesale</a></li>
          </ul>
        </div>
        <div>
          <h4>Help</h4>
          <ul class="footer__links">
            <li><a href="/faq/">FAQ</a></li>
            <li><a href="/contact/">Contact</a></li>
            <li><a href="/policies/shipping/">Shipping</a></li>
            <li><a href="/policies/refund/">Refund Policy</a></li>
          </ul>
        </div>
        <div>
          <h4>Policies</h4>
          <ul class="footer__links">
            <li><a href="/policies/privacy/">Privacy Policy</a></li>
            <li><a href="/policies/terms/">Terms of Service</a></li>
          </ul>
        </div>
      </div>
      <div class="footer__bottom">
        <p>&copy; 2026 Mack Magnets. All rights reserved.</p>
        <p class="footer-credit">Designed by <a href="https://ajayadesign.com" target="_blank" rel="noopener">AjayaDesign</a></p>
      </div>
    </div>
  </footer>

  <script src="/assets/js/main.js" defer></script>
  <script src="/assets/js/shopify-cart.js" defer></script>
  <script src="/assets/js/products.js" defer></script>

  <!-- Image gallery -->
  <script>
  (function() {{
    var images = {all_img_urls_json};
    var mainImg = document.getElementById('pdp-main-img');
    var thumbs = document.querySelectorAll('.pdp-thumb');
    if (thumbs.length > 1 && mainImg) {{
      thumbs.forEach(function(thumb) {{
        thumb.addEventListener('click', function() {{
          var idx = parseInt(this.getAttribute('data-index'), 10);
          if (images[idx]) {{
            mainImg.src = images[idx];
            mainImg.alt = this.querySelector('img').alt;
            thumbs.forEach(function(t) {{ t.classList.remove('active'); }});
            this.classList.add('active');
          }}
        }});
      }});
    }}
  }})();
  </script>

  <!-- Cart Drawer -->
  <div id="cart-overlay"></div>
  <div id="cart-drawer" aria-label="Shopping cart">
    <div class="cart-drawer__header">
      <h3>Your Cart</h3>
      <button id="cart-drawer-close" aria-label="Close cart">&times;</button>
    </div>
    <div id="cart-drawer-items"></div>
    <div id="cart-drawer-empty" style="display:block;">
      <p>Your cart is empty</p>
      <a href="/shop/" class="btn btn--primary" style="margin-top:1rem;display:inline-block;">Browse Products</a>
    </div>
    <div id="cart-drawer-footer" style="display:none;">
      <div class="cart-drawer__total">
        <span>Total</span>
        <span id="cart-drawer-total">$0.00</span>
      </div>
      <button id="cart-checkout-btn">Checkout</button>
    </div>
  </div>

</body>
</html>'''


def generate_product_pages(products):
    """Generate individual product detail pages for SEO."""
    print('\\nGenerating product detail pages...')
    shop_dir = os.path.join(REPO_ROOT, 'shop')
    generated = 0
    current_handles = set()

    for product in products:
        handle = product.get('handle', '')
        if not handle:
            continue
        current_handles.add(handle)

        page_dir = os.path.join(shop_dir, handle)
        page_file = os.path.join(page_dir, 'index.html')
        os.makedirs(page_dir, exist_ok=True)

        html = build_product_page_html(product, products)
        with open(page_file, 'w') as f:
            f.write(html)

        generated += 1
        print(f'  ✓ /shop/{handle}/index.html')

    # Clean up stale PDP pages
    removed = 0
    for entry in os.listdir(shop_dir):
        entry_path = os.path.join(shop_dir, entry)
        if not os.path.isdir(entry_path):
            continue
        if entry in current_handles:
            continue
        pdp_file = os.path.join(entry_path, 'index.html')
        if os.path.exists(pdp_file):
            shutil.rmtree(entry_path)
            removed += 1
            print(f'  🗑 Removed stale /shop/{entry}/')

    print(f'  Generated {generated} product pages')
    if removed:
        print(f'  Cleaned up {removed} stale product page(s)')
    return generated


def build_jsonld_products(products):
    """Build JSON-LD Product structured data for SEO."""
    items = []
    for p in products:
        variants = p.get('variants', [])
        min_price = str(min(float(v.get('price', '0')) for v in variants)) if variants else '0'
        currency = 'USD'
        image_url = get_image_url(p, 1200)
        available = is_available(p)

        item = {
            '@type': 'Product',
            'name': p.get('title', ''),
            'description': p.get('body_html', '').replace('<p>', '').replace('</p>', '').replace('<em>', '').replace('</em>', '')[:200] if p.get('body_html') else '',
            'image': image_url,
            'url': f"{SITE_URL}/shop/{p.get('handle', '')}/",
            'brand': {
                '@type': 'Brand',
                'name': BRAND_NAME
            },
            'offers': {
                '@type': 'Offer',
                'price': min_price,
                'priceCurrency': currency,
                'availability': 'https://schema.org/InStock' if available else 'https://schema.org/OutOfStock',
                'seller': {
                    '@type': 'Organization',
                    'name': BRAND_NAME
                }
            }
        }
        items.append(item)

    return {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        'name': f'{BRAND_NAME} Products',
        'numberOfItems': len(items),
        'itemListElement': [
            {'@type': 'ListItem', 'position': i + 1, 'item': item}
            for i, item in enumerate(items)
        ]
    }


def inject_into_html(filepath, start_marker, end_marker, new_content):
    """Replace content between markers in an HTML file."""
    with open(filepath, 'r') as f:
        html = f.read()

    if start_marker not in html or end_marker not in html:
        print(f'  ⚠ Markers not found in {filepath}: {start_marker}...{end_marker}')
        return False

    start_idx = html.index(start_marker) + len(start_marker)
    end_idx = html.index(end_marker)
    html = html[:start_idx] + '\n' + new_content + '\n        ' + html[end_idx:]

    with open(filepath, 'w') as f:
        f.write(html)

    print(f'  ✓ Updated {filepath}')
    return True


def inject_jsonld(filepath, new_jsonld_str):
    """Replace or insert JSON-LD Product data in an HTML file."""
    with open(filepath, 'r') as f:
        html = f.read()

    marker_start = '<!-- PRODUCTS_JSONLD_START -->'
    marker_end = '<!-- PRODUCTS_JSONLD_END -->'

    if marker_start in html:
        start_idx = html.index(marker_start)
        end_idx = html.index(marker_end) + len(marker_end)
        html = html[:start_idx] + marker_start + '\n  ' + new_jsonld_str + '\n  ' + marker_end + html[end_idx:]
    else:
        insertion = f'  {marker_start}\n  {new_jsonld_str}\n  {marker_end}\n'
        html = html.replace('</head>', insertion + '</head>')

    with open(filepath, 'w') as f:
        f.write(html)

    print(f'  ✓ Updated JSON-LD in {filepath}')


def update_shop_page(products):
    """Update the shop page with all products."""
    print('\nUpdating shop page...')

    cards = [build_product_card(p) for p in products]
    cards_html = '\n\n'.join(cards)

    inject_into_html(
        SHOP_HTML,
        '<!-- PRODUCTS_START -->',
        '<!-- PRODUCTS_END -->',
        cards_html
    )

    jsonld = build_jsonld_products(products)
    jsonld_str = '<script type="application/ld+json">\n  ' + json.dumps(jsonld, indent=2).replace('\n', '\n  ') + '\n  </script>'
    inject_jsonld(SHOP_HTML, jsonld_str)


def update_home_page(products):
    """Update the home page with featured products."""
    print('\nUpdating home page...')

    # Featured = products tagged 'featured' first, then fill up to 4 with the rest
    tags_list = lambda p: [t.lower().strip() for t in p.get('tags', '').split(',') if t.strip()] if isinstance(p.get('tags'), str) else [t.lower() for t in p.get('tags', [])]
    tagged = [p for p in products if 'featured' in tags_list(p)]
    rest = [p for p in products if 'featured' not in tags_list(p)]
    featured = (tagged + rest)[:4]

    print(f'  {len(featured)} featured products')

    cards = [build_product_card(p) for p in featured]
    cards_html = '\n\n'.join(cards)

    inject_into_html(
        HOME_HTML,
        '<!-- FEATURED_START -->',
        '<!-- FEATURED_END -->',
        cards_html
    )

    jsonld = build_jsonld_products(featured)
    jsonld_str = '<script type="application/ld+json">\n  ' + json.dumps(jsonld, indent=2).replace('\n', '\n  ') + '\n  </script>'
    inject_jsonld(HOME_HTML, jsonld_str)


def main():
    print('=' * 50)
    print(f'Shopify Product Sync — {BRAND_NAME}')
    print('=' * 50)

    products = fetch_products()

    if not products:
        print('No products found! Skipping update.')
        sys.exit(0)

    save_json(products)
    generate_product_pages(products)
    update_shop_page(products)
    update_home_page(products)

    print('\n✅ Sync complete!')
    print(f'   Products: {len(products)}')
    print(f'   Data: {DATA_FILE}')
    print(f'   Shop: {SHOP_HTML}')
    print(f'   Home: {HOME_HTML}')
    print(f'   Product pages: /shop/<handle>/index.html')


if __name__ == '__main__':
    main()
