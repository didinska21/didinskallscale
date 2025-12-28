const inquirer = require('inquirer');
const fs = require('fs');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const cfonts = require('cfonts');
const UserAgent = require('user-agents');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// Colors
const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const WHITE = '\x1b[37m';
const BOLD = '\x1b[1m';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// === HELPER FUNCTIONS ===

function createSpinner(message) {
  let frame = 0;
  let interval = null;
  let active = false;

  function clearLine() {
    try {
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
    } catch (e) {}
  }

  return {
    start() {
      if (active) return;
      active = true;
      clearLine();
      process.stdout.write(`${CYAN}${SPINNER_FRAMES[frame]} ${message}${RESET}`);
      interval = setInterval(() => {
        frame = (frame + 1) % SPINNER_FRAMES.length;
        clearLine();
        process.stdout.write(`${CYAN}${SPINNER_FRAMES[frame]} ${message}${RESET}`);
      }, 100);
    },
    succeed(msg) {
      if (!active) return;
      clearInterval(interval);
      active = false;
      clearLine();
      process.stdout.write(`${GREEN}${BOLD}✔ ${msg}${RESET}\n`);
    },
    fail(msg) {
      if (!active) return;
      clearInterval(interval);
      active = false;
      clearLine();
      process.stdout.write(`${RED}✖ ${msg}${RESET}\n`);
    },
    stop() {
      if (!active) return;
      clearInterval(interval);
      active = false;
      clearLine();
    }
  };
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function countdown(seconds, message = 'Waiting') {
  const totalSeconds = Math.floor(seconds / 1000);
  for (let i = totalSeconds; i > 0; i--) {
    process.stdout.write(`${YELLOW}\r${message} ${i} seconds...${RESET}`);
    await delay(1000);
  }
  process.stdout.write('\r' + ' '.repeat(50) + '\r');
}

function readProxiesFromFile(filename) {
  try {
    const content = fs.readFileSync(filename, 'utf8');
    return content.split('\n').map(line => line.trim()).filter(line => line !== '');
  } catch (error) {
    console.log(`${RED}Gagal membaca file proxy.txt: ${error.message}${RESET}`);
    return [];
  }
}

function getGlobalHeaders(url, refCode, extraHeaders = {}) {
  const ua = new UserAgent();
  const headers = {
    'accept': '*/*',
    'accept-encoding': 'gzip, deflate, br',
    'accept-language': 'en-US,en;q=0.9',
    'cache-control': 'no-cache',
    'content-type': 'application/json',
    'origin': 'https://dashboard.allscale.io',
    'pragma': 'no-cache',
    'priority': 'u=1, i',
    'referer': `https://dashboard.allscale.io/signup?refCode=${refCode}`,
    'sec-ch-ua': '"Chromium";v="130", "Not?A_Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'user-agent': ua.toString()
  };

  // Add timestamp and signature for specific endpoints
  if (url.includes('/api/')) {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto.createHash('sha256')
      .update('vT*IUEGgyL' + timestamp)
      .digest('hex');
    headers['x-timestamp'] = timestamp;
    headers['x-signature'] = signature;
  }

  return Object.assign(headers, extraHeaders);
}

// === TEMP EMAIL FUNCTIONS ===

const providers = ['https://api.mail.tm', 'https://www.guerrillamail.com'];

async function getTempEmail(provider, axiosInstance, ipAddress, userAgent) {
  if (provider === 'https://api.mail.tm') {
    try {
      // Get available domains
      let domains = [];
      let page = 1;
      
      while (true) {
        const domainUrl = `https://api.mail.tm/domains?page=${page}`;
        const response = await axiosInstance.get(domainUrl);
        
        if (response.status !== 200) {
          throw new Error('Failed to get domains');
        }
        
        const data = response.data;
        const hydraMembers = data['hydra:member'] || [];
        const activeDomains = hydraMembers.filter(d => d.domain && !d.isPrivate);
        
        domains = domains.concat(activeDomains);
        
        if (!data['hydra:view'] || !data['hydra:view'].next) break;
        page++;
      }
      
      if (domains.length <= 0) {
        throw new Error('No available domains');
      }
      
      // Select random domain
      const selectedDomain = domains[Math.floor(Math.random() * domains.length)];
      const domain = selectedDomain.domain;
      const username = Math.random().toString(36).substring(2, 15);
      const email = `${username}@${domain}`;
      const password = 'TempPass123!';
      
      // Register email
      const registerUrl = 'https://api.mail.tm/accounts';
      const registerData = { address: email, password: password };
      const registerResponse = await axios.post(registerUrl, registerData);
      
      if (registerResponse.status === 201) {
        console.log(`${GREEN}Created temp email: ${email}${RESET}`);
        return {
          provider: 'https://api.mail.tm',
          address: email,
          password: password,
          login: username,
          domain: domain
        };
      } else {
        throw new Error('Failed to register email');
      }
      
    } catch (error) {
      console.log(`${RED}Failed to generate temp email: ${error.message}${RESET}`);
      return null;
    }
  } else if (provider === 'https://www.guerrillamail.com') {
    const url = 'https://api.guerrillamail.com/ajax.php';
    const params = {
      f: 'get_email_address',
      lang: 'en',
      ip: ipAddress,
      agent: userAgent
    };
    
    try {
      const response = await axiosInstance.get(url, { params });
      const data = response.data;
      const email = data.email_addr;
      const sidToken = data.sid_token || '';
      let phpsessid = '';
      
      // Extract PHPSESSID from cookies
      if (response.headers['set-cookie']) {
        response.headers['set-cookie'].forEach(cookie => {
          if (cookie.includes('PHPSESSID')) {
            phpsessid = cookie.split(';')[0].split('=')[1];
          }
        });
      }
      
      console.log(`${GREEN}Created temp email: ${email}${RESET}`);
      return {
        provider: 'https://www.guerrillamail.com',
        address: email,
        sid_token: sidToken,
        phpsessid: phpsessid
      };
      
    } catch (error) {
      console.log(`${RED}Failed to generate temp email: ${error.message}${RESET}`);
      return null;
    }
  }
  
  return null;
}

async function getMailTmToken(axiosInstance, email, password) {
  const url = 'https://api.mail.tm/token';
  const data = { address: email, password: password };
  
  try {
    const response = await axios.post(url, data);
    return response.data.token;
  } catch (error) {
    console.log(`${RED}Failed to get token: ${error.message}${RESET}`);
    return null;
  }
}

async function checkInbox(provider, axiosInstance, emailData, maxAttempts = 15, delayMs = 2000) {
  if (provider === 'https://api.mail.tm') {
    const token = await getMailTmToken(axiosInstance, emailData.address, emailData.password);
    if (!token) return null;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const url = 'https://api.mail.tm/messages';
      
      try {
        const response = await axios.get(url, {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        
        const messages = response.data['hydra:member'];
        
        if (messages.length > 0) {
          const messageId = messages[0].id;
          const messageUrl = `https://api.mail.tm/messages/${messageId}`;
          const messageResponse = await axios.get(messageUrl, {
            headers: { 'Authorization': 'Bearer ' + token }
          });
          
          const body = messageResponse.data.text || messageResponse.data.html;
          const codeMatch = body.match(/verification code is (\d{6})/);
          
          if (codeMatch) {
            return codeMatch[1];
          }
        }
      } catch (error) {
        console.log(`${YELLOW}Checking inbox attempt ${attempt}...: ${error.message}${RESET}`);
      }
      
      await delay(delayMs);
    }
    
    console.log(`${RED}No verification code found after ${maxAttempts} attempts.${RESET}`);
    return null;
    
  } else if (provider === 'https://www.guerrillamail.com') {
    const sidToken = emailData.sid_token;
    const phpsessid = emailData.phpsessid;
    const headers = { 'Cookie': `PHPSESSID=${phpsessid}` };
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const url = 'https://api.guerrillamail.com/ajax.php';
      const params = { f: 'get_email_list', seq: 0 };
      
      try {
        const response = await axiosInstance.get(url, { params, headers });
        const emails = response.data.list || [];
        
        if (emails.length > 0) {
          const firstEmail = emails[0];
          const fetchParams = { f: 'fetch_email', email_id: firstEmail.mail_id };
          const fetchResponse = await axiosInstance.get(url, { 
            params: fetchParams, 
            headers 
          });
          
          const body = fetchResponse.data.mail_body || '';
          const codeMatch = body.match(/verification code is (\d{6})/);
          
          if (codeMatch) {
            return codeMatch[1];
          }
        }
      } catch (error) {
        console.log(`${YELLOW}Checking inbox attempt ${attempt}...: ${error.message}${RESET}`);
      }
      
      await delay(delayMs);
    }
    
    console.log(`${RED}No verification code found after ${maxAttempts} attempts.${RESET}`);
    return null;
  }
  
  return null;
}

// === NEW OTP-BASED REGISTRATION ===

async function sendOTPCode(axiosInstance, email, refCode) {
  // Coba beberapa endpoint yang mungkin
  const endpoints = [
    'https://dashboard.allscale.io/api/public/send/verification/mail',
    'https://dashboard.allscale.io/api/send/verification/mail',
    'https://dashboard.allscale.io/api/public/verification/send',
    'https://dashboard.allscale.io/api/public/otp/send'
  ];
  
  const spinner = createSpinner('Sending OTP code...');
  spinner.start();
  
  for (const url of endpoints) {
    try {
      const data = { 
        email: email,
        referrer_id: refCode
      };
      const headers = getGlobalHeaders(url, refCode);
      
      const response = await axiosInstance.post(url, data, { headers });
      
      if (response.data.code === 0 || response.status === 200) {
        spinner.succeed(`OTP code sent successfully via ${url}`);
        return true;
      }
    } catch (error) {
      // Coba endpoint berikutnya
      continue;
    }
  }
  
  spinner.fail('Failed to send OTP from all endpoints');
  return false;
}

async function verifyOTPAndRegister(axiosInstance, email, otpCode, refCode, userAgent, ipAddress) {
  const url = 'https://dashboard.allscale.io/api/public/businesses/register/with/otp';
  const data = {
    email: email,
    otp_code: otpCode,
    referrer_id: refCode,
    device_id_str: uuidv4(),
    device_type: 1,
    ip_address: ipAddress,
    user_agent: userAgent
  };
  
  const headers = getGlobalHeaders(url, refCode);
  const spinner = createSpinner('Verifying OTP and registering...');
  spinner.start();
  
  try {
    const response = await axiosInstance.post(url, data, { headers });
    
    if (response.data.code === 0) {
      spinner.succeed('Registration successful!');
      return {
        success: true,
        data: response.data.data
      };
    } else {
      throw new Error('Server error: ' + JSON.stringify(response.data));
    }
  } catch (error) {
    const errorMsg = error.response ? 
      JSON.stringify(error.response.data) : 
      error.message;
    spinner.fail('Failed to register: ' + errorMsg);
    return { success: false };
  }
}

async function doRegister(axiosInstance, refCode, accountPrefix) {
  const userAgent = new UserAgent().toString();
  const ipAddress = await getIpAddress(axiosInstance);
  
  // Get temp email
  const providerIndex = Math.floor(Math.random() * providers.length);
  const provider = providers[providerIndex];
  const emailData = await getTempEmail(provider, axiosInstance, ipAddress, userAgent);
  
  if (!emailData) {
    return { success: false };
  }
  
  const email = emailData.address;
  console.log(`${GREEN}${BOLD}📧 Email: ${email}${RESET}`);
  
  // Send OTP
  const otpSent = await sendOTPCode(axiosInstance, email, refCode);
  if (!otpSent) {
    return { success: false };
  }
  
  // Wait a bit before checking inbox
  const randomDelay = Math.floor(Math.random() * (10000 - 5000 + 1)) + 5000;
  await delay(randomDelay);
  
  // Check inbox for OTP
  const otpCode = await checkInbox(provider, axiosInstance, emailData);
  if (!otpCode) {
    return { success: false };
  }
  
  console.log(`${GREEN}${BOLD}🔑 OTP Code: ${otpCode}${RESET}`);
  
  // Register with OTP
  const result = await verifyOTPAndRegister(
    axiosInstance, 
    email, 
    otpCode, 
    refCode, 
    userAgent, 
    ipAddress
  );
  
  if (!result.success) {
    return { success: false };
  }
  
  return {
    success: true,
    email: email,
    token: result.data.token,
    refresh_token: result.data.token
  };
}

async function getIpAddress(axiosInstance) {
  const url = 'https://api.ipify.org?format=json';
  try {
    const response = await axiosInstance.get(url);
    return response.data.ip;
  } catch (error) {
    console.log(`${RED}Failed to get IP: ${error.message}${RESET}`);
    return 'unknown';
  }
}

// === MAIN FUNCTION ===

async function main() {
  // Banner
  cfonts.say('ALLSCALE', {
    font: 'block',
    align: 'center',
    colors: ['cyan', 'magenta']
  });
  
  console.log(BLUE + '════════════════════════════════════════════════════════' + RESET);
  console.log(CYAN + '☆ BOT AUTO REFERRAL ASP ☆' + RESET + '\n');
  
  // Proxy setup
  const { useProxy } = await inquirer.prompt([{
    type: 'confirm',
    name: 'useProxy',
    message: CYAN + 'Apakah Anda ingin menggunakan proxy?' + RESET,
    default: false
  }]);
  
  let proxies = [];
  let proxyType = null;
  let axiosInstance = axios.create();
  
  if (useProxy) {
    const { proxyType: selectedType } = await inquirer.prompt([{
      type: 'list',
      name: 'proxyType',
      message: CYAN + 'Pilih tipe proxy:' + RESET,
      choices: ['Rotating', 'Static']
    }]);
    
    proxyType = selectedType;
    proxies = readProxiesFromFile('proxy.txt');
    
    if (proxies.length > 0) {
      console.log(`${BLUE}Loaded ${proxies.length} proxies.${RESET}\n`);
    } else {
      console.log(`${YELLOW}File proxy.txt kosong atau tidak ditemukan.${RESET}\n`);
    }
  }
  
  // Get account count
  let accountCount;
  while (true) {
    const { count } = await inquirer.prompt([{
      type: 'input',
      name: 'count',
      message: CYAN + 'Berapa akun yang ingin dibuat?' + RESET,
      validate: input => {
        const num = parseInt(input, 10);
        return isNaN(num) || num <= 0 ? 
          RED + 'Masukkan angka yang valid!' + RESET : 
          true;
      }
    }]);
    
    accountCount = parseInt(count, 10);
    if (accountCount > 0) break;
  }
  
  // Get referral code
  const { referralCode } = await inquirer.prompt([{
    type: 'input',
    name: 'referralCode',
    message: CYAN + 'Masukkan kode referral:' + RESET
  }]);
  
  console.log(`${YELLOW}Memulai proses registrasi...${RESET}`);
  console.log(`${YELLOW}${BOLD}Total: ${accountCount} Akun ..${RESET}`);
  console.log(`${YELLOW}Harap tunggu, proses sedang berjalan...${RESET}`);
  console.log(`${YELLOW}Jangan tutup terminal ini!${RESET}\n`);
  
  // Load existing accounts
  const accountFile = 'account.json';
  let accounts = [];
  
  if (fs.existsSync(accountFile)) {
    try {
      accounts = JSON.parse(fs.readFileSync(accountFile, 'utf8'));
    } catch (e) {
      accounts = [];
    }
  }
  
  let successCount = 0;
  let failCount = 0;
  
  // Main registration loop
  for (let i = 0; i < accountCount; i++) {
    console.log(`${CYAN}${BOLD}═══ Akun ${i + 1}/${accountCount} ═══════════════════════════════${RESET}`);
    
    // Setup proxy
    let currentProxy = null;
    if (useProxy && proxies.length > 0) {
      if (proxyType === 'Rotating') {
        currentProxy = proxies[Math.floor(Math.random() * proxies.length)];
      } else {
        currentProxy = proxies.shift();
        if (!currentProxy) {
          console.log(`${RED}Proxy habis!${RESET}`);
          process.exit(1);
        }
      }
      
      console.log(`${WHITE}🔌 Using proxy: ${currentProxy}${RESET}`);
      const proxyAgent = new HttpsProxyAgent(currentProxy);
      axiosInstance = axios.create({
        httpAgent: proxyAgent,
        httpsAgent: proxyAgent
      });
    } else {
      axiosInstance = axios.create();
    }
    
    // Get IP
    let ipAddress = '';
    try {
      const ipResponse = await axiosInstance.get('https://api.ipify.org?format=json');
      ipAddress = ipResponse.data.ip;
    } catch (error) {
      ipAddress = 'unknown';
      console.log(`${RED}Failed to get IP: ${error.message}${RESET}`);
    }
    
    console.log(`${WHITE}🌐 IP Address: ${ipAddress}${RESET}\n`);
    
    // Register account
    const { success, email, token, refresh_token } = await doRegister(
      axiosInstance,
      referralCode,
      `account_${i + 1}`
    );
    
    if (!success) {
      failCount++;
      console.log(`${YELLOW}Status Akun ${i + 1}/${accountCount} (Berhasil: ${successCount}, Gagal: ${failCount})${RESET}`);
      console.log(`${CYAN}${BOLD}════════════════════════════════════════════════════════════════════${RESET}\n`);
      continue;
    }
    
    // Save account
    accounts.push({
      email,
      token,
      refresh_token,
      registeredAt: new Date().toISOString()
    });
    
    try {
      fs.writeFileSync(accountFile, JSON.stringify(accounts, null, 2));
      console.log(`${GREEN}${BOLD}💾 Saved to ${accountFile}${RESET}`);
    } catch (error) {
      console.log(`${RED}Failed to save to ${accountFile}: ${error.message}${RESET}`);
    }
    
    successCount++;
    console.log(`${YELLOW}Status Akun ${i + 1}/${accountCount} (Berhasil: ${successCount}, Gagal: ${failCount})${RESET}`);
    console.log(`${CYAN}${BOLD}════════════════════════════════════════════════════════════════════${RESET}\n`);
    
    // Delay before next account
    if (i < accountCount - 1) {
      const delayTime = Math.floor(Math.random() * (40000 - 25000 + 1)) + 25000;
      await countdown(delayTime);
    }
  }
  
  console.log(`${BLUE}${BOLD}🎉 Proses selesai!${RESET}`);
}

// Run
main().catch(error => console.log(`${RED}Error: ${error.message}${RESET}`));
