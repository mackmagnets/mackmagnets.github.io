/* AjayaDesign Intellectual Property — Demo Purpose Only — Fingerprint: 414A4459-44455349474E-4D41434B4D41474E455453 */
(function(){
  'use strict';

  // --- Navbar scroll effect ---
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      navbar.classList.toggle('scrolled', window.scrollY > 20);
    }, { passive: true });
  }

  // --- Mobile menu ---
  const toggle = document.querySelector('.navbar__toggle');
  const navLinks = document.querySelector('.navbar__links');
  const overlay = document.querySelector('.mobile-overlay');

  function closeMenu() {
    toggle?.classList.remove('active');
    navLinks?.classList.remove('open');
    overlay?.classList.remove('show');
    document.body.style.overflow = '';
  }

  if (toggle) {
    toggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.contains('open');
      if (isOpen) {
        closeMenu();
      } else {
        toggle.classList.add('active');
        navLinks.classList.add('open');
        overlay?.classList.add('show');
        document.body.style.overflow = 'hidden';
      }
    });
  }

  if (overlay) {
    overlay.addEventListener('click', closeMenu);
  }

  // Close menu on link click
  navLinks?.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeMenu);
  });

  // --- FAQ Accordion ---
  document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const isActive = item.classList.contains('active');

      // Close all within same category card (or page)
      const parent = item.closest('.faq-category-card__body') || document;
      parent.querySelectorAll('.faq-item').forEach(el => {
        el.classList.remove('active');
        el.querySelector('.faq-question')?.setAttribute('aria-expanded', 'false');
      });

      // Toggle clicked
      if (!isActive) {
        item.classList.add('active');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // --- Scroll Animations (Intersection Observer) ---
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

  document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));

  // --- Shop Filters ---
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const category = btn.dataset.filter;

      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll('.product-card').forEach(card => {
        if (category === 'all' || card.dataset.category === category) {
          card.style.display = '';
          card.style.animation = 'fadeInUp 0.4s ease forwards';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });

  // --- Simple Carousel ---
  document.querySelectorAll('.carousel').forEach(carousel => {
    const track = carousel.querySelector('.carousel__track');
    const dots = carousel.querySelectorAll('.carousel__dot');
    let current = 0;

    function goTo(index) {
      const slides = carousel.querySelectorAll('.carousel__slide');
      if (index < 0) index = slides.length - 1;
      if (index >= slides.length) index = 0;
      current = index;
      track.style.transform = `translateX(-${current * 100}%)`;
      dots.forEach((d, i) => d.classList.toggle('active', i === current));
    }

    dots.forEach((dot, i) => {
      dot.addEventListener('click', () => goTo(i));
    });

    // Auto-advance
    setInterval(() => goTo(current + 1), 5000);
  });

  // --- Contact Form (demo handler) ---
  const contactForm = document.querySelector('.contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const btn = contactForm.querySelector('button[type="submit"]');
      const original = btn.textContent;
      btn.textContent = 'Message Sent! ✓';
      btn.disabled = true;
      btn.style.background = 'var(--color-secondary)';
      setTimeout(() => {
        btn.textContent = original;
        btn.disabled = false;
        btn.style.background = '';
        contactForm.reset();
      }, 3000);
    });
  }

  // --- Newsletter Form (demo handler) ---
  const nlForm = document.querySelector('.newsletter__form');
  if (nlForm) {
    nlForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = nlForm.querySelector('input');
      const btn = nlForm.querySelector('button');
      btn.textContent = 'Subscribed! ✓';
      setTimeout(() => {
        btn.textContent = 'Subscribe';
        input.value = '';
      }, 3000);
    });
  }

  // --- Active nav link ---
  const currentPath = window.location.pathname.replace(/\/index\.html$/, '/');
  document.querySelectorAll('.navbar__links a').forEach(link => {
    const href = link.getAttribute('href');
    if (href && (currentPath === href || currentPath.startsWith(href) && href !== '/')) {
      link.classList.add('active');
    }
  });

})();
