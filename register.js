/**
 * ALLSCALE AUTO REGISTER
 * - VPS Ready (headless mode)
 * - Proxy support (static/rotating)
 * - Temp email (1secmail.com)
 * - Auto save accounts
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const readline = require('readline');
const { getTempEmail, getOTP } = require('./tempmail');
const { sleep, saveAccount, log } = require('./utils');

puppeteer.use(StealthPlugin());

// Load config
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

// Interactive proxy selection
async function selectProxy() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    console.log('\n========== PROXY SELECTION ==========');
    console.log('1. No Proxy');
    console.log('2. Static Proxy');
    console.log('3. Rotating Proxy');
    console.log('=====================================\n');
    
    rl.question('Choose proxy option (1/2/3): ', (answer) => {
      rl.close();
      
      const choice = answer.trim();
      
      if (choice === '1') {
        resolve({ mode: 'none', proxy: null });
      } else if (choice === '2') {
        const proxy = config.proxy.static;
        if (!proxy || proxy.includes('user:pass')) {
          console.log('⚠️  Static proxy not configured in config.json');
          resolve({ mode: 'none', proxy: null });
        } else {
          resolve({ mode: 'static', proxy });
        }
      } else if (choice === '3') {
        const proxy = config.proxy.rotating;
        if (!proxy || proxy.includes('user:pass')) {
          console.log('⚠️  Rotating proxy not configured in config.json');
          resolve({ mode: 'none', proxy: null });
        } else {
          resolve({ mode: 'rotating', proxy });
        }
      } else {
        console.log('Invalid choice, using no proxy');
        resolve({ mode: 'none', proxy: null });
      }
    });
  });
}

async function register() {
  let browser;
  
  try {
    log('🚀 Starting registration...');
    
    // Select proxy interactively
    const { mode, proxy } = await selectProxy();
    
    // Browser args
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled'
    ];
    
    // Add proxy if selected
    if (proxy) {
      args.push(`--proxy-server=${proxy}`);
      log(`🌐 Using ${mode} proxy: ${proxy}`);
    } else {
      log('🌐 No proxy');
    }
    
    // Launch browser
    browser = await puppeteer.launch({
      headless: 'new',
      args,
      defaultViewport: { width: 1280, height: 720 }
    });
    
    const page = await browser.newPage();
    
    // Set user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Get temp email
    log('📧 Getting temp email...');
    const emailData = await getTempEmail();
    log(`📧 Email: ${emailData.email}`);
    
    // Go to register page with referral
    const registerUrl = `https://app.allscale.io/pay/register?code=${config.referral_code}`;
    log(`🌍 Opening: ${registerUrl}`);
    
    await page.goto(registerUrl, { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });
    
    await sleep(3000);
    
    // Take screenshot for debugging
    await page.screenshot({ path: 'step1-loaded.png' });
    log('📸 Screenshot saved: step1-loaded.png');
    
    // Input email
    log('✍️ Typing email...');
    const emailInput = await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await emailInput.click();
    await sleep(500);
    await emailInput.type(emailData.email, { delay: 100 });
    
    await sleep(1000);
    
    // Check all checkboxes
    log('✅ Checking checkboxes...');
    const checkedCount = await page.evaluate(() => {
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      let count = 0;
      checkboxes.forEach(cb => {
        if (!cb.checked) {
          cb.click();
          count++;
        }
      });
      return count;
    });
    log(`✅ Checked ${checkedCount} checkboxes`);
    
    await sleep(1000);
    await page.screenshot({ path: 'step2-filled.png' });
    
    // Find and click submit button
    log('🔘 Looking for submit button...');
    const buttonClicked = await page.evaluate(() => {
      // Try different button texts
      const texts = ['create with email', 'sign up', 'register', 'continue'];
      const buttons = Array.from(document.querySelectorAll('button'));
      
      for (const text of texts) {
        const btn = buttons.find(b => 
          b.innerText.toLowerCase().includes(text) ||
          b.textContent.toLowerCase().includes(text)
        );
        if (btn && !btn.disabled) {
          btn.click();
          return text;
        }
      }
      return null;
    });
    
    if (buttonClicked) {
      log(`✅ Clicked button: "${buttonClicked}"`);
    } else {
      log('⚠️ Button not found, trying Enter...');
      await page.keyboard.press('Enter');
    }
    
    await sleep(3000);
    await page.screenshot({ path: 'step3-submitted.png' });
    
    // Debug: Print current page info
    const currentUrlAfterSubmit = page.url();
    log(`📍 Current URL after submit: ${currentUrlAfterSubmit}`);
    
    // Check for Cloudflare Turnstile challenge
    log('🔍 Checking for Cloudflare challenge...');
    const hasTurnstile = await page.evaluate(() => {
      return document.querySelector('iframe[src*="cloudflare"]') !== null ||
             document.querySelector('[id*="turnstile"]') !== null ||
             document.querySelector('[name*="cf-turnstile"]') !== null;
    });
    
    if (hasTurnstile) {
      log('🤖 Cloudflare Turnstile detected, waiting for solve...');
      
      // Wait for turnstile iframe
      await page.waitForSelector('iframe[src*="cloudflare"]', { timeout: 10000 }).catch(() => {});
      
      // Try to click the checkbox
      try {
        const frame = page.frames().find(f => f.url().includes('cloudflare'));
        if (frame) {
          await sleep(2000);
          // Click turnstile checkbox
          await frame.evaluate(() => {
            const checkbox = document.querySelector('input[type="checkbox"]');
            if (checkbox) checkbox.click();
          });
          log('✅ Clicked Turnstile checkbox');
        }
      } catch (e) {
        log('⚠️ Could not auto-click Turnstile, waiting for manual solve...');
      }
      
      // Wait for turnstile to be solved (max 60 seconds)
      log('⏳ Waiting for Turnstile verification (max 60s)...');
      for (let i = 0; i < 60; i++) {
        const solved = await page.evaluate(() => {
          const input = document.querySelector('input[name="cf-turnstile-response"]');
          return input && input.value && input.value.length > 0;
        });
        
        if (solved) {
          log('✅ Turnstile solved!');
          break;
        }
        
        await sleep(1000);
        
        if ((i + 1) % 10 === 0) {
          log(`⏳ Still waiting for Turnstile... (${i + 1}s)`);
        }
      }
      
      await sleep(2000);
      await page.screenshot({ path: 'step3-after-turnstile.png' });
    }
    
    // Check if there's any error message
    const errorMsg = await page.evaluate(() => {
      const errorElements = document.querySelectorAll('[class*="error"], [class*="alert"], [role="alert"]');
      return Array.from(errorElements).map(e => e.textContent.trim()).join(' | ');
    });
    if (errorMsg) {
      log(`⚠️ Error message found: ${errorMsg}`);
    }
    
    // Wait for OTP input (try multiple selectors)
    log('⏳ Waiting for OTP input field...');
    
    let otpInputFound = false;
    const otpSelectors = [
      'input[inputmode="numeric"]',
      'input[type="text"][maxlength="6"]',
      'input[type="text"][maxlength="4"]',
      'input[name*="code"]',
      'input[name*="otp"]',
      'input[name*="verification"]',
      'input[placeholder*="code" i]',
      'input[placeholder*="otp" i]',
      'input[autocomplete="one-time-code"]'
    ];
    
    for (const selector of otpSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        log(`✅ Found OTP input with selector: ${selector}`);
        otpInputFound = true;
        break;
      } catch (e) {
        // Try next selector
      }
    }
    
    if (!otpInputFound) {
      log('❌ No OTP input found, taking debug screenshot...');
      await page.screenshot({ path: 'step3-no-otp.png', fullPage: true });
      
      // Print all input fields for debugging
      const allInputs = await page.evaluate(() => {
        const inputs = document.querySelectorAll('input');
        return Array.from(inputs).map(inp => ({
          type: inp.type,
          name: inp.name,
          id: inp.id,
          placeholder: inp.placeholder,
          maxlength: inp.maxLength
        }));
      });
      log('📋 All input fields found:');
      console.log(JSON.stringify(allInputs, null, 2));
      
      throw new Error('OTP input field not found after submit');
    }
    
    log('🔐 Getting OTP from email...');
    const otp = await getOTP(emailData);
    log(`🔐 OTP: ${otp}`);
    
    // Input OTP
    log('✍️ Entering OTP...');
    const otpEntered = await page.evaluate((code) => {
      // Method 1: Individual inputs
      const inputs = document.querySelectorAll('input[inputmode="numeric"]');
      if (inputs.length === code.length) {
        inputs.forEach((input, i) => {
          input.value = code[i];
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        return 'individual';
      }
      
      // Method 2: Single input
      const singleInput = document.querySelector('input[type="text"][maxlength="6"]');
      if (singleInput) {
        singleInput.value = code;
        singleInput.dispatchEvent(new Event('input', { bubbles: true }));
        return 'single';
      }
      
      return null;
    }, otp);
    
    log(`✅ OTP entered using: ${otpEntered}`);
    
    await sleep(2000);
    await page.screenshot({ path: 'step4-otp.png' });
    
    // Auto-submit or press Enter
    await page.keyboard.press('Enter');
    
    await sleep(5000);
    await page.screenshot({ path: 'step5-final.png' });
    
    // Check if success
    const currentUrl = page.url();
    log(`📍 Final URL: ${currentUrl}`);
    
    if (currentUrl.includes('dashboard') || currentUrl.includes('home') || !currentUrl.includes('register')) {
      log('✅ REGISTRATION SUCCESS!');
      saveAccount(emailData.email, config.referral_code);
      return true;
    } else {
      log('⚠️ Registration may have failed - check screenshots');
      return false;
    }
    
  } catch (err) {
    log(`❌ ERROR: ${err.message}`);
    console.error(err);
    
    if (browser) {
      await browser.pages().then(pages => 
        pages[0]?.screenshot({ path: 'error.png' }).catch(() => {})
      );
    }
    
    return false;
  } finally {
    if (browser) {
      await sleep(2000);
      await browser.close();
    }
  }
}

// Run
(async () => {
  const success = await register();
  process.exit(success ? 0 : 1);
})();
