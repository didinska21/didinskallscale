// bot.js
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { config } from 'dotenv';
import axios from 'axios';

config();

puppeteer.use(StealthPlugin());

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ===== TEMP MAIL CLIENTS =====
// Gunakan TempMail.org sebagai alternatif
async function createTempMailClient() {
  const baseURL = 'https://www.1secmail.com/api/v1/';
  
  // Generate random email
  const response = await axios.get(baseURL, {
    params: {
      action: 'genRandomMailbox',
      count: 1
    }
  });

  const email = response.data[0];
  const [login, domain] = email.split('@');

  return {
    email,
    login,
    domain,
    
    async checkEmail() {
      const res = await axios.get(baseURL, {
        params: {
          action: 'getMessages',
          login: login,
          domain: domain
        }
      });
      
      return res.data || [];
    },

    async getEmailBody(emailId) {
      const res = await axios.get(baseURL, {
        params: {
          action: 'readMessage',
          login: login,
          domain: domain,
          id: emailId
        }
      });
      
      return res.data;
    }
  };
}

// Guerrilla Mail sebagai backup
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
    // Setup Temp Mail (lebih reliable dari Guerrilla)
    console.log('📧 Setup email temporary...');
    emailClient = await createTempMailClient();
    const email = emailClient.email;
    console.log(`✅ Email generated: ${email}`);

    // Browser options
    const launchOptions = {
      headless: 'new', // Gunakan 'new' untuk headless mode modern
      executablePath: '/usr/bin/chromium-browser', // Path yang sudah ditemukan
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-gpu',
        '--disable-dev-shm-usage',
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
    await delay(2000);
    
    // Screenshot sebelum klik
    await page.screenshot({ path: 'step2b-before-click.png' });
    
    // Coba beberapa cara untuk klik tombol
    let buttonClicked = false;
    
    // Cara 1: Cari tombol dengan text
    try {
      const clicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, [role="button"], a'));
        const targetBtn = buttons.find(btn => {
          const text = btn.textContent.toLowerCase();
          return text.includes('login with email') ||
                 text.includes('continue with email') ||
                 text.includes('send') ||
                 text.includes('continue') ||
                 text.includes('submit');
        });
        
        if (targetBtn) {
          targetBtn.click();
          return true;
        }
        return false;
      });
      
      if (clicked) {
        buttonClicked = true;
        console.log('✅ Tombol diklik (method 1)');
      }
    } catch (e) {
      console.log('⚠️ Method 1 gagal:', e.message);
    }
    
    // Cara 2: Tekan Enter
    if (!buttonClicked) {
      await page.keyboard.press('Enter');
      buttonClicked = true;
      console.log('✅ Menggunakan Enter (method 2)');
    }

    await delay(3000);
    await page.screenshot({ path: 'step3-after-submit.png' });
    
    // Tunggu hingga halaman berubah atau muncul notifikasi
    console.log('⏳ Menunggu respons dari website...');
    await delay(3000);
    
    // Cek apakah ada pesan sukses atau error di halaman
    const pageText = await page.evaluate(() => document.body.innerText);
    console.log('📄 Page text sample:', pageText.substring(0, 200));
    
    // Screenshot setelah submit
    await page.screenshot({ path: 'step3b-waiting-otp.png' });

    // Tunggu OTP dikirim dan ambil dari email
    console.log('📬 Menunggu OTP dari email...');
    let otp = null;
    let attempts = 0;
    const maxAttempts = 40; // Perpanjang menjadi 40 detik

    while (!otp && attempts < maxAttempts) {
      await delay(3000); // Perpanjang delay menjadi 3 detik
      attempts++;
      
      try {
        const emails = await emailClient.checkEmail();
        console.log(`📨 Cek email attempt ${attempts}/${maxAttempts}... (${emails.length} email ditemukan)`);
        
        if (emails && emails.length > 0) {
          // Debug: tampilkan semua email
          for (const mail of emails) {
            console.log(`   📧 From: ${mail.from || mail.mail_from}, Subject: ${mail.subject || mail.mail_subject}`);
            
            // Get full email body untuk 1secmail
            let body = '';
            if (mail.id) {
              const fullMail = await emailClient.getEmailBody(mail.id);
              body = fullMail.textBody || fullMail.body || fullMail.htmlBody || '';
            } else {
              body = mail.mail_body || mail.mail_excerpt || '';
            }
            
            console.log(`   📄 Body preview: ${body.substring(0, 150)}...`);
            
            // Coba berbagai pattern OTP
            const patterns = [
              /\b(\d{6})\b/,                    // 6 digit
              /code.*?(\d{6})/i,                // "code: 123456"
              /otp.*?(\d{6})/i,                 // "OTP: 123456"
              /verification.*?(\d{6})/i,        // "verification code: 123456"
              /(\d{3}[\s-]?\d{3})/,             // "123-456" atau "123 456"
            ];
            
            for (const pattern of patterns) {
              const otpMatch = body.match(pattern);
              if (otpMatch) {
                otp = otpMatch[1].replace(/[\s-]/g, ''); // Hapus spasi/dash
                console.log(`✅ OTP ditemukan: ${otp}`);
                break;
              }
            }
            
            if (otp) break;
          }
        }
      } catch (emailError) {
        console.log(`⚠️ Error checking email: ${emailError.message}`);
      }
    }

    if (!otp) {
      console.log('❌ OTP tidak ditemukan. Cek screenshot untuk debug.');
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
