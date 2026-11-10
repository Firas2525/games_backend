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

  // 5. Seamless Background Direct Download Handler (No Navigation!)
  const downloadBtns = document.querySelectorAll('.btn-download-trigger, #downloadApkBtn');
  const toast = document.getElementById('downloadToast');
  let toastTimer = null;

  function showToast() {
    if (!toast) return;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 6000);
  }

  downloadBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      showToast();

      // Trigger download via hidden iframe so the parent page NEVER reloads or navigates away!
      let iframe = document.getElementById('hiddenDownloadFrame');
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'hiddenDownloadFrame';
        iframe.style.display = 'none';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = 'none';
        document.body.appendChild(iframe);
      }
      iframe.src = '/download';
    });
  });
});

