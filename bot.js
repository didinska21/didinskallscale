// bot.js - Enhanced Version with Advanced Cloudflare Bypass
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { config } from 'dotenv';
import axios from 'axios';

config();

puppeteer.use(StealthPlugin());

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const randomDelay = (min, max) => delay(Math.floor(Math.random() * (max - min + 1)) + min);

// ===== ENHANCED STEALTH FUNCTIONS =====
async function setupEnhancedStealth(page) {
  // Remove webdriver traces
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
    
    // Mock plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
    
    // Mock languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
    
    // Chrome runtime
    window.chrome = {
      runtime: {},
    };
    
    // Permissions
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );
  });
}

// Simulate human mouse movements
async function humanMouseMove(page) {
  const dimensions = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight
  }));
  
  for (let i = 0; i < 3; i++) {
    const x = Math.floor(Math.random() * dimensions.width);
    const y = Math.floor(Math.random() * dimensions.height);
    await page.mouse.move(x, y, { steps: 10 });
    await randomDelay(100, 300);
  }
}

// ===== TEMP MAIL CLIENTS =====
async function createMailTmClient() {
  const baseURL = 'https://api.mail.tm';
  
  const randomString = Math.random().toString(36).substring(2, 10);
  
  const domainsRes = await axios.get(`${baseURL}/domains`);
  const domain = domainsRes.data['hydra:member'][0].domain;
  
  const email = `${randomString}@${domain}`;
  const password = Math.random().toString(36).substring(2, 15);
  
  await axios.post(`${baseURL}/accounts`, {
    address: email,
    password: password
  });
  
  const tokenRes = await axios.post(`${baseURL}/token`, {
    address: email,
    password: password
  });
  
  const token = tokenRes.data.token;
  
  return {
    email,
    token,
    baseURL,
    
    async checkEmail() {
      try {
        const res = await axios.get(`${baseURL}/messages`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        return res.data['hydra:member'] || [];
      } catch (e) {
        return [];
      }
    },
    
    async getEmailBody(emailId) {
      const res = await axios.get(`${baseURL}/messages/${emailId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return res.data;
    }
  };
}

async function createTempMailLolClient() {
  const baseURL = 'https://api.tempmail.lol';
  
  const response = await axios.post(`${baseURL}/generate/rush`, {}, {
    headers: { 'Content-Type': 'application/json' }
  });

  const email = response.data.address;
  const token = response.data.token;

  return {
    email,
    token,
    
    async checkEmail() {
      try {
        const res = await axios.get(`${baseURL}/auth/${token}`);
        return res.data.email || [];
      } catch (e) {
        return [];
      }
    }
  };
}

// ===== ENHANCED CLOUDFLARE BYPASS =====
async function waitForCloudflareBypass(page, timeout = 60000) {
  console.log('⏳ Menunggu Cloudflare bypass...');
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const title = await page.title();
      const url = page.url();
      
      if (!title.includes('Just a moment') && 
          !url.includes('cdn-cgi/challenge-platform')) {
        console.log('✅ Cloudflare bypass berhasil!');
        return true;
      }
      
      await delay(1000);
    } catch (error) {
      console.log('Error checking Cloudflare:', error.message);
    }
  }
  
  throw new Error('Cloudflare bypass timeout');
}

// ENHANCED: Smart Turnstile Handler dengan multiple strategies
async function waitForTurnstileComplete(page, timeout = 180000) {
  console.log('🛡️ Menunggu Cloudflare Turnstile dengan smart detection...');
  const startTime = Date.now();
  let lastStrategy = '';
  
  while (Date.now() - startTime < timeout) {
    try {
      // Strategy 1: Check if Turnstile iframe exists
      const turnstileState = await page.evaluate(() => {
        const iframe = document.querySelector('iframe[src*="cloudflare"], iframe[src*="turnstile"]');
        if (!iframe) return 'no_turnstile';
        
        // Check if challenge is in progress
        const verifyingText = document.body.innerText.toLowerCase();
        if (verifyingText.includes('verifying')) return 'verifying';
        
        return 'has_turnstile';
      });
      
      if (turnstileState === 'no_turnstile') {
        console.log('✅ Turnstile tidak ditemukan atau sudah selesai');
        return true;
      }
      
      // Strategy 2: Simulate human behavior
      if (turnstileState === 'verifying' && lastStrategy !== 'mouse_move') {
        console.log('🖱️ Simulasi gerakan mouse...');
        await humanMouseMove(page);
        lastStrategy = 'mouse_move';
      }
      
      // Strategy 3: Check for success indicators
      const hasSuccessIndicators = await page.evaluate(() => {
        const text = document.body.innerText.toLowerCase();
        return text.includes('verify to receive') || 
               text.includes('enter the code') ||
               text.includes('check your email');
      });
      
      if (hasSuccessIndicators) {
        console.log('✅ Turnstile berhasil - halaman verifikasi muncul');
        return true;
      }
      
      // Strategy 4: Check URL change
      const currentUrl = page.url();
      if (!currentUrl.includes('register') && !currentUrl.includes('challenge')) {
        console.log('✅ Turnstile berhasil - URL berubah');
        return true;
      }
      
      // Strategy 5: Wait and retry
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      if (elapsed % 10 === 0) {
        console.log(`⏱️ Turnstile progress: ${elapsed}s / ${timeout/1000}s`);
      }
      
      await delay(2000);
      
    } catch (error) {
      console.log('⚠️ Error checking Turnstile:', error.message);
      await delay(2000);
    }
  }
  
  console.log('⚠️ Turnstile timeout, melanjutkan...');
  return false;
}

// ===== PROXY HANDLER (FIXED) =====
function parseProxy(proxyString) {
  if (!proxyString || proxyString.trim() === '') {
    return null;
  }
  
  try {
    // Format: user:pass@hostname:port atau hostname:port
    const hasAuth = proxyString.includes('@');
    
    if (hasAuth) {
      const [auth, hostPort] = proxyString.split('@');
      const [username, password] = auth.split(':');
      const [hostname, port] = hostPort.split(':');
      
      if (!hostname || !port) {
        throw new Error('Invalid proxy format');
      }
      
      return {
        server: `${hostname}:${port}`,
        username,
        password
      };
    } else {
      // Format: hostname:port (no auth)
      const [hostname, port] = proxyString.split(':');
      
      if (!hostname || !port) {
        throw new Error('Invalid proxy format');
      }
      
      return {
        server: `${hostname}:${port}`,
        username: null,
        password: null
      };
    }
  } catch (error) {
    console.error('❌ Error parsing proxy:', error.message);
    console.log('💡 Format proxy yang benar:');
    console.log('   - Dengan auth: user:pass@hostname:port');
    console.log('   - Tanpa auth: hostname:port');
    return null;
  }
}

// ===== MAIN REGISTRATION FUNCTION =====
async function registerAllscale() {
  const referralCode = process.env.REFERRAL_CODE;
  const proxyString = process.env.PROXY;
  
  if (!referralCode) {
    throw new Error('REFERRAL_CODE tidak ditemukan di .env');
  }

  let browser;
  let emailClient;

  try {
    // Setup Temp Mail
    console.log('📧 Setup email temporary...');
    let email;
    
    try {
      console.log('⏳ Mencoba Mail.tm...');
      emailClient = await createMailTmClient();
      email = emailClient.email;
      console.log(`✅ Email generated (Mail.tm): ${email}`);
    } catch (e) {
      console.log('⚠️ Mail.tm gagal, mencoba TempMail.lol...');
      try {
        emailClient = await createTempMailLolClient();
        email = emailClient.email;
        console.log(`✅ Email generated (TempMail.lol): ${email}`);
      } catch (e2) {
        throw new Error('Semua email provider gagal');
      }
    }

    // Parse proxy
    const proxyConfig = parseProxy(proxyString);

    // Browser options
    const launchOptions = {
      headless: 'new',
      executablePath: '/usr/bin/chromium-browser',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--window-size=1280,800',
        // Additional stealth args
        '--disable-infobars',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ]
    };

    // Add proxy if configured
    if (proxyConfig) {
      launchOptions.args.push(`--proxy-server=${proxyConfig.server}`);
      console.log(`🌐 Menggunakan proxy: ${proxyConfig.server}`);
    } else {
      console.log('ℹ️ Tidak menggunakan proxy');
    }

    console.log('🚀 Meluncurkan browser...');
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    // Authenticate proxy if needed
    if (proxyConfig && proxyConfig.username && proxyConfig.password) {
      await page.authenticate({ 
        username: proxyConfig.username, 
        password: proxyConfig.password 
      });
      console.log('✅ Proxy authentication berhasil');
    }

    // Setup enhanced stealth
    await setupEnhancedStealth(page);

    // Set viewport dan user agent
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Extra headers untuk lebih natural
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    });

    // Buka halaman register
    const registerUrl = `https://app.allscale.io/pay/register?code=${referralCode}`;
    console.log(`🌐 Membuka: ${registerUrl}`);
    await page.goto(registerUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    // Bypass Cloudflare
    await waitForCloudflareBypass(page);
    await randomDelay(2000, 4000);

    // Human-like behavior
    await humanMouseMove(page);

    // Screenshot
    await page.screenshot({ path: 'step1-loaded.png' });

    // Tunggu dan isi email
    console.log('📝 Mengisi form email...');
    await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 30000 });
    await randomDelay(800, 1500);
    
    const emailInput = await page.$('input[type="email"], input[name="email"]');
    await emailInput.click({ clickCount: 3 });
    await randomDelay(300, 600);
    
    // Type dengan delay random seperti manusia
    for (const char of email) {
      await emailInput.type(char, { delay: Math.random() * 50 + 50 });
    }
    
    await randomDelay(1000, 2000);
    await page.screenshot({ path: 'step2-email-filled.png' });

    // Centang checkbox
    console.log('🔍 Mencari dan centang checkbox...');
    const checkboxFound = await page.evaluate(() => {
      const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
      let found = false;
      
      for (const cb of checkboxes) {
        const parent = cb.closest('label') || cb.parentElement;
        const text = parent?.textContent.toLowerCase() || '';
        
        if (text.includes('agree') || text.includes('terms') || 
            text.includes('privacy') || text.includes('policy')) {
          if (!cb.checked) {
            cb.click();
            found = true;
          }
        }
      }
      return found;
    });
    
    if (checkboxFound) {
      console.log('✅ Checkbox terms dicentang');
      await randomDelay(1000, 2000);
      await page.screenshot({ path: 'step2b-checkbox.png' });
    }

    // Klik button dengan retry logic
    console.log('🔍 Mencari button "Create with Email"...');
    let clickAttempts = 0;
    let buttonClicked = false;
    
    while (!buttonClicked && clickAttempts < 3) {
      clickAttempts++;
      
      buttonClicked = await page.evaluate(() => {
        const allButtons = Array.from(document.querySelectorAll('button, [role="button"]'));
        
        for (const btn of allButtons) {
          const text = btn.textContent.toLowerCase().trim();
          
          if (text.includes('create with email') || 
              (text.includes('create') && text.includes('email'))) {
            
            if (btn.disabled) {
              return false;
            }
            
            btn.click();
            return true;
          }
        }
        return false;
      });
      
      if (!buttonClicked) {
        console.log(`⚠️ Attempt ${clickAttempts}: Button tidak ditemukan atau disabled, retry...`);
        await randomDelay(1500, 2500);
      }
    }
    
    if (buttonClicked) {
      console.log('✅ Button "Create with Email" diklik!');
    } else {
      throw new Error('Button tidak bisa diklik setelah 3 attempts');
    }

    await randomDelay(3000, 5000);
    await page.screenshot({ path: 'step3-after-click.png' });

    // ENHANCED: Smart Turnstile handler
    console.log('🛡️ Menangani Cloudflare Turnstile dengan smart detection...');
    const turnstileSuccess = await waitForTurnstileComplete(page, 180000);
    
    if (!turnstileSuccess) {
      console.log('⚠️ Turnstile mungkin tidak selesai sempurna, tapi melanjutkan...');
    }
    
    await randomDelay(5000, 8000);
    await page.screenshot({ path: 'step4-post-turnstile.png' });

    // Check apakah sudah di halaman verifikasi
    const isVerificationPage = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      return text.includes('verify to receive') || 
             text.includes('enter the code') ||
             text.includes('check your email');
    });
    
    if (!isVerificationPage) {
      console.log('⚠️ Belum sampai halaman verifikasi, mungkin Turnstile gagal');
      console.log('💡 Coba lagi atau gunakan headless: false untuk debug manual');
      throw new Error('Gagal melewati Turnstile - tidak sampai halaman verifikasi');
    }
    
    console.log('✅ Berhasil sampai halaman verifikasi!');

    // Tunggu OTP dengan waktu lebih lama
    console.log('📬 Menunggu OTP dari email (max 3 menit)...');
    let otp = null;
    let attempts = 0;
    const maxAttempts = 60;

    while (!otp && attempts < maxAttempts) {
      await delay(3000);
      attempts++;
      
      try {
        const emails = await emailClient.checkEmail();
        
        if (attempts % 5 === 0) {
          console.log(`📨 Cek email attempt ${attempts}/${maxAttempts}... (${emails.length} email)`);
        }
        
        if (emails && emails.length > 0) {
          for (const mail of emails) {
            const from = mail.from?.address || mail.from || 'unknown';
            const subject = mail.subject || mail.title || 'no subject';
            console.log(`   📧 From: ${from}, Subject: ${subject}`);
            
            let body = '';
            if (mail.id) {
              try {
                const fullMail = await emailClient.getEmailBody(mail.id);
                body = fullMail.text || fullMail.intro || fullMail.body || fullMail.html || '';
              } catch (e) {
                body = mail.intro || mail.text || '';
              }
            } else {
              body = mail.text || mail.intro || mail.body || '';
            }
            
            console.log(`   📄 Body snippet: ${body.substring(0, 150)}...`);
            
            const patterns = [
              /\b(\d{6})\b/,
              /code.*?(\d{6})/i,
              /otp.*?(\d{6})/i,
              /verification.*?(\d{6})/i,
              /(\d{3}[\s-]?\d{3})/,
            ];
            
            for (const pattern of patterns) {
              const otpMatch = body.match(pattern);
              if (otpMatch) {
                otp = otpMatch[1].replace(/[\s-]/g, '');
                console.log(`✅ OTP ditemukan: ${otp}`);
                break;
              }
            }
            
            if (otp) break;
          }
        }
      } catch (emailError) {
        console.log(`⚠️ Error cek email: ${emailError.message}`);
      }
    }

    if (!otp) {
      console.log('❌ OTP tidak ditemukan setelah 3 menit.');
      console.log('💡 Kemungkinan:');
      console.log('   1. Turnstile tidak diselesaikan dengan benar');
      console.log('   2. Email belum terkirim (coba wait lebih lama)');
      console.log('   3. Email provider diblokir');
      throw new Error('OTP tidak diterima');
    }

    // Input OTP
    console.log('🔢 Memasukkan OTP...');
    await randomDelay(2000, 3000);
    
    const otpInputs = await page.$$('input[type="text"], input[type="number"], input[inputmode="numeric"]');
    
    if (otpInputs.length === 1) {
      await otpInputs[0].type(otp, { delay: 100 });
    } else if (otpInputs.length >= 6) {
      for (let i = 0; i < 6; i++) {
        await otpInputs[i].type(otp[i], { delay: 100 });
      }
    } else {
      throw new Error('Format input OTP tidak dikenali');
    }

    await randomDelay(2000, 3000);
    await page.screenshot({ path: 'step5-otp-filled.png' });

    // Submit OTP
    const verifyButton = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find(btn => 
        btn.textContent.toLowerCase().includes('verify') ||
        btn.textContent.toLowerCase().includes('confirm') ||
        btn.textContent.toLowerCase().includes('submit')
      );
    });

    if (verifyButton) {
      await verifyButton.click();
      console.log('✅ OTP submitted');
    }

    // Tunggu konfirmasi
    console.log('⏳ Menunggu konfirmasi...');
    await delay(5000);
    await page.screenshot({ path: 'step6-final.png' });

    const finalUrl = page.url();
    console.log(`📍 URL final: ${finalUrl}`);

    if (finalUrl.includes('dashboard') || finalUrl.includes('home') || !finalUrl.includes('register')) {
      console.log('🎉 REGISTRASI BERHASIL!');
      console.log(`📧 Email: ${email}`);
      console.log(`🔗 Referral Code: ${referralCode}`);
    } else {
      console.log('⚠️ Status tidak pasti, cek screenshot step6-final.png');
    }

    await delay(3000);

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error('Stack:', error.stack);
    
    if (browser) {
      const pages = await browser.pages();
      if (pages[0]) {
        await pages[0].screenshot({ path: 'error-screenshot.png' });
        console.log('📸 Error screenshot saved: error-screenshot.png');
      }
    }
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// ===== JALANKAN BOT =====
console.log('🤖 AllScale Auto Register Bot - Enhanced Version');
console.log('🛡️ With Advanced Cloudflare Turnstile Bypass\n');

registerAllscale().catch(error => {
  console.error('\n💥 Bot failed:', error.message);
  process.exit(1);
});
