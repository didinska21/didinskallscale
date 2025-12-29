// bot.js
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { config } from 'dotenv';
import axios from 'axios';

config();

puppeteer.use(StealthPlugin());

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ===== TEMP MAIL CLIENTS =====
// Mail.tm - Reliable temp mail service
async function createMailTmClient() {
  const baseURL = 'https://api.mail.tm';
  
  // Generate random email
  const randomString = Math.random().toString(36).substring(2, 10);
  
  // Get available domains
  const domainsRes = await axios.get(`${baseURL}/domains`);
  const domain = domainsRes.data['hydra:member'][0].domain;
  
  const email = `${randomString}@${domain}`;
  const password = Math.random().toString(36).substring(2, 15);
  
  // Create account
  await axios.post(`${baseURL}/accounts`, {
    address: email,
    password: password
  });
  
  // Get token
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
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        return res.data['hydra:member'] || [];
      } catch (e) {
        return [];
      }
    },
    
    async getEmailBody(emailId) {
      const res = await axios.get(`${baseURL}/messages/${emailId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      return res.data;
    }
  };
}

// TempMail.lol - Simple fallback
async function createTempMailLolClient() {
  const baseURL = 'https://api.tempmail.lol';
  
  // Generate inbox
  const response = await axios.post(`${baseURL}/generate/rush`, {}, {
    headers: {
      'Content-Type': 'application/json'
    }
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
    // Setup Temp Mail dengan fallback
    console.log('📧 Setup email temporary...');
    let emailClient;
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

    // Cari dan klik tombol "Create with Email" (BUKAN "Continue with Passkey")
    console.log('🔍 Mencari tombol Create with Email...');
    await delay(2000);
    
    // Screenshot sebelum klik
    await page.screenshot({ path: 'step2b-before-click.png' });
    
    // Klik tombol "Create with Email" yang ada di bawah
    let buttonClicked = false;
    
    try {
      const clicked = await page.evaluate(() => {
        // Cari semua elemen yang bisa diklik
        const allClickable = Array.from(document.querySelectorAll('button, [role="button"], a, div[class*="button"]'));
        
        // Cari tombol "Create with Email"
        const emailBtn = allClickable.find(el => {
          const text = el.textContent.toLowerCase().trim();
          return text.includes('create with email') || 
                 (text.includes('email') && !text.includes('passkey'));
        });
        
        if (emailBtn) {
          emailBtn.click();
          return true;
        }
        return false;
      });
      
      if (clicked) {
        buttonClicked = true;
        console.log('✅ Tombol "Create with Email" diklik');
      }
    } catch (e) {
      console.log('⚠️ Method 1 gagal:', e.message);
    }
    
    // Fallback: coba cari dengan XPath atau selector lain
    if (!buttonClicked) {
      try {
        // Cari button dengan ikon envelope/email
        await page.click('button:has-text("Create with Email"), button:has-text("Email")');
        buttonClicked = true;
        console.log('✅ Button diklik (method 2)');
      } catch (e) {
        console.log('⚠️ Method 2 gagal');
      }
    }
    
    if (!buttonClicked) {
      console.log('⚠️ Tombol tidak ditemukan, mencoba scroll dan cari lagi...');
      await page.evaluate(() => window.scrollBy(0, 200));
      await delay(1000);
      
      // Screenshot after scroll
      await page.screenshot({ path: 'step2c-after-scroll.png' });
      
      // Try clicking any button with "email" in text that's NOT passkey
      const finalAttempt = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('*'));
        const target = buttons.find(el => {
          const text = el.textContent.toLowerCase();
          const isVisible = el.offsetParent !== null;
          return isVisible && text.includes('email') && !text.includes('passkey');
        });
        
        if (target) {
          target.click();
          return true;
        }
        return false;
      });
      
      if (finalAttempt) {
        buttonClicked = true;
        console.log('✅ Button diklik (final attempt)');
      }
    }
    
    if (!buttonClicked) {
      console.log('⚠️ Tidak bisa menemukan tombol, akan lanjut ke email check...');
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
            const from = mail.from?.address || mail.from || mail.sender || 'unknown';
            const subject = mail.subject || mail.title || 'no subject';
            console.log(`   📧 From: ${from}, Subject: ${subject}`);
            
            // Get full email body
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
