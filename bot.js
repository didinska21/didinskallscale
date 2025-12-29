// bot.js
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { config } from 'dotenv';
import axios from 'axios';

config();

puppeteer.use(StealthPlugin());

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ===== GUERRILLA MAIL CLIENT =====
async function createGuerrillaMailClient() {
  const baseURL = 'https://api.guerrillamail.com/ajax.php';
  
  // Get email address
  const response = await axios.get(baseURL, {
    params: {
      f: 'get_email_address',
      ip: '127.0.0.1',
      agent: 'Mozilla'
    }
  });

  const email = response.data.email_addr;
  const sid = response.data.sid_token;

  return {
    email,
    sid,
    
    async checkEmail() {
      const res = await axios.get(baseURL, {
        params: {
          f: 'check_email',
          sid_token: sid,
          seq: 0
        }
      });
      
      return res.data.list || [];
    },

    async getEmail(emailId) {
      const res = await axios.get(baseURL, {
        params: {
          f: 'fetch_email',
          sid_token: sid,
          email_id: emailId
        }
      });
      
      return res.data;
    }
  };
}

// ===== CLOUDFLARE BYPASS =====
async function waitForCloudflareBypass(page, timeout = 60000) {
  console.log('⏳ Menunggu Cloudflare bypass...');
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const title = await page.title();
      const url = page.url();
      
      // Cek apakah masih di halaman Cloudflare
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

// ===== MAIN REGISTRATION FUNCTION =====
async function registerAllscale() {
  const referralCode = process.env.REFERRAL_CODE;
  const proxyString = process.env.PROXY; // format: user:pass@hostname:port
  
  if (!referralCode) {
    throw new Error('REFERRAL_CODE tidak ditemukan di .env');
  }

  let browser;
  let emailClient;

  try {
    // Setup Guerrilla Mail
    console.log('📧 Setup email temporary...');
    emailClient = await createGuerrillaMailClient();
    const email = emailClient.email;
    console.log(`✅ Email generated: ${email}`);

    // Browser options
    const launchOptions = {
      headless: false,
      executablePath: '/usr/bin/chromium-browser', // Path yang sudah ditemukan
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
      ]
    };

    // Tambahkan proxy jika ada
    if (proxyString && proxyString.trim() !== '') {
      try {
        const [auth, hostPort] = proxyString.split('@');
        const [user, pass] = auth.split(':');
        const [hostname, port] = hostPort.split(':');
        
        launchOptions.args.push(`--proxy-server=http://${hostname}:${port}`);
        console.log(`🌐 Menggunakan proxy: ${hostname}:${port}`);
      } catch (proxyError) {
        console.log('⚠️ Format proxy salah, melanjutkan tanpa proxy');
      }
    } else {
      console.log('ℹ️ Tidak menggunakan proxy');
    }

    console.log('🚀 Meluncurkan browser...');
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    // Authenticate proxy jika ada
    if (proxyString && proxyString.trim() !== '') {
      try {
        const [auth] = proxyString.split('@');
        const [user, pass] = auth.split(':');
        await page.authenticate({ username: user, password: pass });
        console.log('✅ Proxy authentication berhasil');
      } catch (authError) {
        console.log('⚠️ Proxy authentication gagal, melanjutkan...');
      }
    }

    // Set viewport dan user agent
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Buka halaman register
    const registerUrl = `https://app.allscale.io/pay/register?code=${referralCode}`;
    console.log(`🌐 Membuka: ${registerUrl}`);
    await page.goto(registerUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    // Bypass Cloudflare
    await waitForCloudflareBypass(page);
    await delay(2000);

    // Screenshot untuk debugging
    await page.screenshot({ path: 'step1-loaded.png' });

    // Tunggu dan isi email
    console.log('📝 Mengisi form email...');
    await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 30000 });
    await delay(1000);
    
    const emailInput = await page.$('input[type="email"], input[name="email"]');
    await emailInput.click({ clickCount: 3 });
    await emailInput.type(email, { delay: 100 });
    
    await delay(1000);
    await page.screenshot({ path: 'step2-email-filled.png' });

    // Cari dan klik tombol "Login with Email" (bukan "Login with Passkey")
    console.log('🔍 Mencari tombol Login with Email...');
    await delay(1000);
    
    const loginButton = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find(btn => 
        btn.textContent.toLowerCase().includes('login with email') ||
        btn.textContent.toLowerCase().includes('continue with email') ||
        btn.textContent.toLowerCase().includes('continue')
      );
    });

    if (loginButton) {
      await loginButton.click();
      console.log('✅ Tombol login diklik');
    } else {
      // Fallback: cari form submit
      await page.keyboard.press('Enter');
      console.log('⚠️ Menggunakan Enter sebagai fallback');
    }

    await delay(3000);
    await page.screenshot({ path: 'step3-after-submit.png' });

    // Tunggu OTP dikirim dan ambil dari email
    console.log('📬 Menunggu OTP dari email...');
    let otp = null;
    let attempts = 0;
    const maxAttempts = 30; // 30 detik

    while (!otp && attempts < maxAttempts) {
      await delay(2000);
      attempts++;
      
      const emails = await emailClient.checkEmail();
      console.log(`📨 Cek email attempt ${attempts}/${maxAttempts}...`);
      
      if (emails && emails.length > 0) {
        // Cari email dengan OTP
        for (const mail of emails) {
          const body = mail.mail_body || mail.mail_excerpt || '';
          // Regex untuk mencari 6 digit OTP
          const otpMatch = body.match(/\b(\d{6})\b/);
          
          if (otpMatch) {
            otp = otpMatch[1];
            console.log(`✅ OTP ditemukan: ${otp}`);
            break;
          }
        }
      }
    }

    if (!otp) {
      throw new Error('OTP tidak ditemukan dalam waktu yang ditentukan');
    }

    // Input OTP
    console.log('🔢 Memasukkan OTP...');
    await delay(2000);
    
    // Cari input OTP (bisa single input atau multiple)
    const otpInputs = await page.$$('input[type="text"], input[type="number"]');
    
    if (otpInputs.length === 1) {
      // Single input
      await otpInputs[0].type(otp, { delay: 100 });
    } else if (otpInputs.length >= 6) {
      // Multiple inputs (satu digit per input)
      for (let i = 0; i < 6; i++) {
        await otpInputs[i].type(otp[i], { delay: 100 });
      }
    } else {
      throw new Error('Format input OTP tidak dikenali');
    }

    await delay(2000);
    await page.screenshot({ path: 'step4-otp-filled.png' });

    // Submit OTP (biasanya auto-submit atau ada tombol verify)
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

    // Tunggu redirect atau konfirmasi sukses
    console.log('⏳ Menunggu konfirmasi...');
    await delay(5000);
    await page.screenshot({ path: 'step5-final.png' });

    const finalUrl = page.url();
    console.log(`📍 URL final: ${finalUrl}`);

    if (finalUrl.includes('dashboard') || finalUrl.includes('home') || !finalUrl.includes('register')) {
      console.log('🎉 Registrasi berhasil!');
      console.log(`📧 Email: ${email}`);
    } else {
      console.log('⚠️ Status tidak pasti, silakan cek screenshot');
    }

    await delay(3000);

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (browser) {
      const pages = await browser.pages();
      if (pages[0]) {
        await pages[0].screenshot({ path: 'error-screenshot.png' });
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
registerAllscale().catch(console.error);
