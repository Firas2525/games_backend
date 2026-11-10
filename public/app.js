// SM Store - Landing Page Scripts

document.addEventListener('DOMContentLoaded', () => {
  // 1. Mobile Menu Toggle
  const mobileToggle = document.getElementById('mobileToggle');
  const navLinks = document.getElementById('navLinks');

  if (mobileToggle && navLinks) {
    mobileToggle.addEventListener('click', () => {
      navLinks.classList.toggle('active');
      const icon = mobileToggle.querySelector('i');
      if (icon) {
        icon.classList.toggle('fa-bars');
        icon.classList.toggle('fa-xmark');
      }
    });

    // Close mobile nav when clicking any link
    navLinks.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('active');
        const icon = mobileToggle.querySelector('i');
        if (icon) {
          icon.classList.add('fa-bars');
          icon.classList.remove('fa-xmark');
        }
      });
    });
  }

  // 2. FAQ Accordion Toggle
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach((item) => {
    const question = item.querySelector('.faq-question');
    if (question) {
      question.addEventListener('click', () => {
        const isActive = item.classList.contains('active');
        // Close all other items
        faqItems.forEach((other) => other.classList.remove('active'));
        if (!isActive) {
          item.classList.add('active');
        }
      });
    }
  });

  // 3. Stats Counter Animation on Scroll
  const stats = document.querySelectorAll('.stat-number');
  let hasAnimated = false;

  const animateStats = () => {
    stats.forEach((stat) => {
      const target = +stat.getAttribute('data-target');
      const duration = 2000;
      const stepTime = 30;
      const totalSteps = duration / stepTime;
      const increment = target / totalSteps;
      let current = 0;

      const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
          stat.innerText = target.toLocaleString();
          clearInterval(timer);
        } else {
          stat.innerText = Math.floor(current).toLocaleString();
        }
      }, stepTime);
    });
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !hasAnimated) {
          hasAnimated = true;
          animateStats();
        }
      });
    },
    { threshold: 0.3 }
  );

  const statsSection = document.querySelector('.stats-section');
  if (statsSection) {
    observer.observe(statsSection);
  }

  // 4. Dynamic Live Support Links from Backend API
  const API_BASE = 'https://games-backend-c0h7.onrender.com/api/v1';

  async function loadLiveSettings() {
    try {
      const response = await fetch(`${API_BASE}/settings`);
      if (!response.ok) return;
      const json = await response.json();
      const settings = json.data;

      if (!settings) return;

      const whatsapp = (settings.whatsappSupport || '').trim();

      // Format WhatsApp link
      if (whatsapp) {
        const cleanNumber = whatsapp.replace(/[^0-9]/g, '');
        const waUrl = `https://wa.me/${cleanNumber}?text=${encodeURIComponent('مرحباً، أود الاستفسار بخصوص تطبيق SM Store')}`;
        const waLink = document.getElementById('footerWhatsappLink');
        const heroWa = document.getElementById('heroWhatsappLink');
        if (waLink) waLink.href = waUrl;
        if (heroWa) heroWa.href = waUrl;
      }
    } catch (_) {
      // Graceful fallback to default links
    }
  }

  loadLiveSettings();

  // 5. Download Button Handler
  const downloadBtn = document.getElementById('downloadApkBtn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', (e) => {
      // You can place the actual SM-Store.apk file in this folder,
      // or change downloadBtn.href to a Google Drive or Mediafire direct link.
    });
  }
});

