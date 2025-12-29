const inquirer = require('inquirer');
const fs = require('fs');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const cfonts = require('cfonts');
const UserAgent = require('user-agents');

// Color codes
const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const WHITE = '\x1b[37m';
const GREEN = '\x1b[32m';

// Spinner frames
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// ==================== UTILITY FUNCTIONS ====================

function createSpinner(message) {
  let frameIndex = 0;
  let intervalId = null;
  let isSpinning = false;

  function clearLine() {
    try {
      process.stdout.moveCursor(0, -1);
      process.stdout.clearLine(1);
    } catch (e) {}
  }

  return {
    start() {
      if (isSpinning) return;
      isSpinning = true;
      clearLine();
      process.stdout.write(`${CYAN}${SPINNER_FRAMES[frameIndex]} ${message}${RESET}`);
      intervalId = setInterval(() => {
        frameIndex = (frameIndex + 1) % SPINNER_FRAMES.length;
        clearLine();
        process.stdout.write(`${CYAN}${SPINNER_FRAMES[frameIndex]} ${message}${RESET}`);
      }, 100);
    },
    succeed(msg) {
      if (!isSpinning) return;
      clearInterval(intervalId);
      isSpinning = false;
      clearLine();
      process.stdout.write(`${GREEN}✔ ${msg}${RESET}\n`);
    },
    fail(msg) {
      if (!isSpinning) return;
      clearInterval(intervalId);
      isSpinning = false;
      clearLine();
      process.stdout.write(`${RED}✖ ${msg}${RESET}\n`);
    },
    stop() {
      if (!isSpinning) return;
      clearInterval(intervalId);
      isSpinning = false;
      clearLine();
    }
  };
}

function centerText(text) {
  const width = process.stdout.columns || 80;
  const length = text.replace(/\x1b\[[0-9;]*m/g, '').length;
  const padding = Math.max(0, Math.floor((width - length) / 2));
  return ' '.repeat(padding) + text;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function countdown(ms, msg = 'Waiting') {
  const seconds = Math.floor(ms / 1000);
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`${YELLOW}\r${msg} ${i} seconds...${RESET}`);
    await delay(1000);
  }
  process.stdout.write('\r' + ' '.repeat(50) + '\r');
}

function readProxiesFromFile(filename) {
  try {
    const content = fs.readFileSync(filename, 'utf8');
    return content.split('\n').map(line => line.trim()).filter(line => line !== '');
  } catch (error) {
    console.log(`${RED}Failed to read proxy file: ${error.message}${RESET}`);
    return [];
  }
}

// ==================== EMAIL PROVIDERS ====================

const providers = ['mail.tm', 'guerrillamail'];

async function getTempEmail(provider, axiosInstance, ipAddress, userAgent) {
  if (provider === 'mail.tm') {
    try {
      // Get available domains
      let domains = [];
      let page = 1;
      while (true) {
        const url = `https://api.mail.tm/domains?page=${page}`;
        const response = await axiosInstance.get(url);
        
        if (response.status !== 200) {
          throw new Error('Failed to get domains');
        }
        
        const data = response.data;
        const members = data['hydra:member'] || [];
        const activeDomains = members.filter(d => d.domain && !d.isDisabled);
        domains = domains.concat(activeDomains);
        
        if (!data['hydra:view'] || !data['hydra:view'].next) {
          break;
        }
        page++;
      }
      
      if (domains.length === 0) {
        throw new Error('No active domains available');
      }
      
      // Select random domain
      const domain = domains[Math.floor(Math.random() * domains.length)];
      const domainName = domain.domain;
      const username = Math.random().toString(36).substring(2, 15);
      const email = `${username}@${domainName}`;
      const password = 'Password123!';
      
      // Create account
      const createUrl = 'https://api.mail.tm/accounts';
      const createPayload = {
        address: email,
        password: password
      };
      
      const createResponse = await axiosInstance.post(createUrl, createPayload);
      
      if (createResponse.status === 201) {
        console.log(`${GREEN}✓ Created temp email: ${email}${RESET}`);
        return {
          provider: 'mail.tm',
          address: email,
          password: password,
          login: username,
          domain: domainName
        };
      } else {
        throw new Error('Failed to create email account');
      }
    } catch (error) {
      console.log(`${RED}Failed to generate mail.tm email: ${error.message}${RESET}`);
      return null;
    }
  } else if (provider === 'guerrillamail') {
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
      if (response.headers['set-cookie']) {
        response.headers['set-cookie'].forEach(cookie => {
          if (cookie.includes('PHPSESSID')) {
            phpsessid = cookie.split(';')[0].split('=')[1];
          }
        });
      }
      
      console.log(`${GREEN}✓ Created temp email: ${email}${RESET}`);
      return {
        provider: 'guerrillamail',
        address: email,
        sid_token: sidToken,
        phpsessid: phpsessid
      };
    } catch (error) {
      console.log(`${RED}Failed to generate guerrillamail email: ${error.message}${RESET}`);
      return null;
    }
  }
  
  return null;
}

async function getMailTmToken(axiosInstance, email, password) {
  const url = 'https://api.mail.tm/token';
  const payload = {
    address: email,
    password: password
  };
  
  try {
    const response = await axiosInstance.post(url, payload);
    return response.data.token;
  } catch (error) {
    console.log(`${RED}Failed to get mail.tm token: ${error.message}${RESET}`);
    return null;
  }
}

async function checkInbox(provider, axiosInstance, emailData, maxAttempts = 15, delayMs = 2000) {
  if (provider === 'mail.tm') {
    const token = await getMailTmToken(axiosInstance, emailData.address, emailData.password);
    if (!token) return null;
    
    for (let i = 1; i <= maxAttempts; i++) {
      const url = 'https://api.mail.tm/messages';
      try {
        const response = await axiosInstance.get(url, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        const messages = response.data['hydra:member'];
        if (messages.length > 0) {
          const messageId = messages[0].id;
          const messageUrl = `https://api.mail.tm/messages/${messageId}`;
          const messageResponse = await axiosInstance.get(messageUrl, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          
          const body = messageResponse.data.text || messageResponse.data.html;
          const match = body.match(/verification code is (\d{6})/);
          if (match) {
            return match[1];
          }
        }
      } catch (error) {
        console.log(`${YELLOW}Attempt ${i}/${maxAttempts} failed: ${error.message}${RESET}`);
      }
      
      await delay(delayMs);
    }
    
    console.log(`${RED}No OTP code received after ${maxAttempts} attempts${RESET}`);
    return null;
  } else if (provider === 'guerrillamail') {
    const phpsessid = emailData.phpsessid;
    const headers = {
      'Cookie': `PHPSESSID=${phpsessid}`
    };
    
    for (let i = 1; i <= maxAttempts; i++) {
      const url = 'https://api.guerrillamail.com/ajax.php';
      const params = {
        f: 'check_email',
        seq: 0
      };
      
      try {
        const response = await axiosInstance.get(url, { params, headers });
        const emails = response.data.list || [];
        
        if (emails.length > 0) {
          const emailId = emails[0].mail_id;
          const fetchParams = {
            f: 'fetch_email',
            email_id: emailId
          };
          
          const fetchResponse = await axiosInstance.get(url, {
            params: fetchParams,
            headers
          });
          
          const body = fetchResponse.data.mail_body || '';
          const match = body.match(/verification code is (\d{6})/);
          if (match) {
            return match[1];
          }
        }
      } catch (error) {
        console.log(`${YELLOW}Attempt ${i}/${maxAttempts} failed: ${error.message}${RESET}`);
      }
      
      await delay(delayMs);
    }
    
    console.log(`${RED}No OTP code received after ${maxAttempts} attempts${RESET}`);
    return null;
  }
  
  return null;
}

async function getIpAddress(axiosInstance) {
  const url = 'https://api.ipify.org?format=json';
  try {
    const response = await axiosInstance.get(url);
    return response.data.ip;
  } catch (error) {
    console.log(`${RED}Failed to get IP address: ${error.message}${RESET}`);
    return 'unknown';
  }
}

// ==================== ALLSCALE API FUNCTIONS (UPDATED) ====================

async function sendOtp(axiosInstance, email, userAgent) {
  const endpoint = 'https://app.allscale.io/api/public/turnkey/send_email_otp';
  const timestamp = Math.floor(Date.now() / 1000);
  
  const payload = {
    email: email,
    check_user_existence: false
  };
  
  const headers = {
    'accept': 'application/json, text/plain, */*',
    'accept-encoding': 'gzip, deflate, br, zstd',
    'accept-language': 'en-US,en;q=0.9',
    'content-type': 'application/json',
    'origin': 'https://app.allscale.io',
    'referer': 'https://app.allscale.io/pay/register',
    'sec-ch-ua': '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent': userAgent,
    // TODO: Update secret-key jika diperlukan dari DevTools
    'secret-key': '6fd572c8807298a8086bea02fd8c7e577751b60b3437133bf01fe7f2d3c15a47',
    'timestamp': timestamp.toString()
  };
  
  const spinner = createSpinner('Sending OTP to email...');
  spinner.start();
  
  try {
    const response = await axiosInstance.post(endpoint, payload, { headers });
    
    if (response.data.code === 0) {
      spinner.succeed('OTP sent successfully');
      // PERUBAHAN: response.data.data sekarang langsung string otp_id
      return {
        success: true,
        otp_id: response.data.data
      };
    } else {
      throw new Error(`Server error: ${JSON.stringify(response.data)}`);
    }
  } catch (error) {
    const errorMsg = error.response 
      ? JSON.stringify(error.response.data) 
      : error.message;
    spinner.fail(`Failed to send OTP: ${errorMsg}`);
    return { success: false };
  }
}

async function verifyOtp(axiosInstance, email, otpCode, otpId, userAgent) {
  const endpoint = 'https://app.allscale.io/api/public/turnkey/email_otp_auth';
  const timestamp = Math.floor(Date.now() / 1000);
  
  // PERUBAHAN: referer_id (referral code) dihapus
  const payload = {
    email: email,
    otp_id: otpId,
    otp_code: otpCode
  };
  
  const headers = {
    'accept': 'application/json, text/plain, */*',
    'accept-encoding': 'gzip, deflate, br, zstd',
    'accept-language': 'en-US,en;q=0.9',
    'content-type': 'application/json',
    'origin': 'https://app.allscale.io',
    'referer': 'https://app.allscale.io/pay/register',
    'sec-ch-ua': '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent': userAgent,
    // TODO: Update secret-key jika diperlukan dari DevTools
    'secret-key': '9cdf8af5683bcacda9006738ec893a60ea50f615b0e7774a612f05781005e1',
    'timestamp': timestamp.toString()
  };
  
  const spinner = createSpinner('Verifying OTP and registering account...');
  spinner.start();
  
  try {
    const response = await axiosInstance.post(endpoint, payload, { headers });
    
    if (response.data.code === 0) {
      spinner.succeed('Account registered successfully!');
      // TODO: Verifikasi format response.data.data
      return {
        success: true,
        token: response.data.data.token || response.data.data,
        refresh_token: response.data.data.refresh_token || response.data.data.token || ''
      };
    } else {
      throw new Error(`Server error: ${JSON.stringify(response.data)}`);
    }
  } catch (error) {
    const errorMsg = error.response 
      ? JSON.stringify(error.response.data) 
      : error.message;
    spinner.fail(`Failed to verify OTP: ${errorMsg}`);
    return { success: false };
  }
}

// ==================== MAIN REGISTRATION FUNCTION ====================

async function doRegister(axiosInstance, accountNumber) {
  const userAgent = new UserAgent().toString();
  const ipAddress = await getIpAddress(axiosInstance);
  
  // Select random email provider
  const provider = providers[Math.floor(Math.random() * providers.length)];
  const emailData = await getTempEmail(provider, axiosInstance, ipAddress, userAgent);
  
  if (!emailData) {
    return { success: false };
  }
  
  const email = emailData.address;
  console.log(`${GREEN}✓ Generated Email: ${email}${RESET}`);
  
  // STEP 1: Send OTP (tanpa referral code)
  const { success: sendSuccess, otp_id: otpId } = await sendOtp(
    axiosInstance, 
    email, 
    userAgent
  );
  
  if (!sendSuccess) {
    return { success: false };
  }
  
  // Delay before checking inbox
  const delayTime = Math.floor(Math.random() * (10000 - 5000 + 1)) + 5000;
  await delay(delayTime);
  
  // STEP 2: Check inbox for OTP code
  const otpCode = await checkInbox(provider, axiosInstance, emailData);
  
  if (!otpCode) {
    return { success: false };
  }
  
  console.log(`${GREEN}✓ OTP Code received: ${otpCode}${RESET}`);
  
  // STEP 3: Verify OTP (tanpa referral code)
  const { success: verifySuccess, token, refresh_token } = await verifyOtp(
    axiosInstance,
    email,
    otpCode,
    otpId,
    userAgent
  );
  
  if (!verifySuccess) {
    return { success: false };
  }
  
  return {
    success: true,
    email: email,
    token: token,
    refresh_token: refresh_token
  };
}

// ==================== MAIN FUNCTION ====================

async function main() {
  // Display banner
  cfonts.say('ALLSCALE', {
    font: 'block',
    align: 'center',
    colors: ['cyan', 'magenta']
  });
  
  console.log(centerText(`${BLUE}============================================${RESET}`));
  console.log(centerText(`${CYAN}✪ BOT AUTO REFERRAL ASP (UPDATED) ✪${RESET}\n`));
  
  // Ask if user wants to use proxy
  const { useProxy } = await inquirer.prompt([{
    type: 'confirm',
    name: 'useProxy',
    message: `${CYAN}Do you want to use proxy?${RESET}`,
    default: false
  }]);
  
  let proxies = [];
  let proxyType = null;
  let axiosInstance = axios.create();
  
  if (useProxy) {
    const { proxyType: pType } = await inquirer.prompt([{
      type: 'list',
      name: 'proxyType',
      message: `${CYAN}Select proxy type:${RESET}`,
      choices: ['Rotating', 'Static']
    }]);
    
    proxyType = pType;
    proxies = readProxiesFromFile('proxy.txt');
    
    if (proxies.length > 0) {
      console.log(`${BLUE}✓ Loaded ${proxies.length} proxies from proxy.txt${RESET}\n`);
    } else {
      console.log(`${YELLOW}proxy.txt is empty or not found, proceeding without proxy.${RESET}\n`);
    }
  }
  
  // Ask for number of accounts to create
  let accountCount;
  while (true) {
    const { count } = await inquirer.prompt([{
      type: 'input',
      name: 'count',
      message: `${CYAN}How many accounts to create?${RESET}`,
      validate: input => {
        const num = parseInt(input, 10);
        return isNaN(num) || num <= 0 
          ? `${RED}Please enter a valid positive number${RESET}` 
          : true;
      }
    }]);
    
    accountCount = parseInt(count, 10);
    if (accountCount > 0) break;
  }
  
  console.log(`${YELLOW}${'='.repeat(50)}${RESET}`);
  console.log(`${YELLOW}Starting to create ${accountCount} accounts...${RESET}`);
  console.log(`${YELLOW}Note: Referral system has been removed from API${RESET}`);
  console.log(`${YELLOW}${'='.repeat(50)}${RESET}`);
  console.log(`${YELLOW}Please wait, this may take a while...${RESET}\n`);
  
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
  
  // Main loop
  for (let i = 0; i < accountCount; i++) {
    console.log(`${CYAN}${'='.repeat(60)}${RESET}`);
    console.log(`${CYAN}Processing Account ${i + 1}/${accountCount}${RESET}`);
    console.log(`${CYAN}${'='.repeat(60)}${RESET}`);
    
    // Setup proxy if enabled
    let proxyUrl = null;
    if (useProxy && proxies.length > 0) {
      if (proxyType === 'Rotating') {
        proxyUrl = proxies[Math.floor(Math.random() * proxies.length)];
      } else {
        proxyUrl = proxies.shift();
      }
      
      if (!proxyUrl) {
        console.log(`${RED}No more proxies available!${RESET}`);
        process.exit(1);
      }
      
      console.log(`${WHITE}Using proxy: ${proxyUrl}${RESET}`);
      
      const proxyAgent = new HttpsProxyAgent(proxyUrl);
      axiosInstance = axios.create({
        httpAgent: proxyAgent,
        httpsAgent: proxyAgent
      });
    } else {
      axiosInstance = axios.create();
    }
    
    // Get IP address
    let ipAddress = '';
    try {
      const ipResponse = await axiosInstance.get('https://api.ipify.org?format=json');
      ipAddress = ipResponse.data.ip;
    } catch (error) {
      ipAddress = 'unknown';
      console.log(`${RED}Failed to get IP: ${error.message}${RESET}`);
    }
    
    console.log(`${WHITE}IP Address: ${ipAddress}${RESET}\n`);
    
    // Register account
    const {
      success,
      email,
      token,
      refresh_token
    } = await doRegister(axiosInstance, `account_${i + 1}`);
    
    if (!success) {
      failCount++;
      console.log(`${YELLOW}Summary: Account ${i + 1}/${accountCount} (Success: ${successCount}, Failed: ${failCount})${RESET}`);
      console.log(`${CYAN}${'='.repeat(60)}${RESET}\n`);
      continue;
    }
    
    // Save account
    accounts.push({
      email: email,
      token: token,
      refresh_token: refresh_token,
      registeredAt: new Date().toISOString()
    });
    
    try {
      fs.writeFileSync(accountFile, JSON.stringify(accounts, null, 2));
      console.log(`${GREEN}✓ Account saved to ${accountFile}${RESET}`);
    } catch (error) {
      console.log(`${RED}Failed to save to ${accountFile}: ${error.message}${RESET}`);
    }
    
    successCount++;
    console.log(`${YELLOW}Summary: Account ${i + 1}/${accountCount} (Success: ${successCount}, Failed: ${failCount})${RESET}`);
    console.log(`${CYAN}${'='.repeat(60)}${RESET}\n`);
    
    // Delay before next account (except for last one)
    if (i < accountCount - 1) {
      const delayTime = Math.floor(Math.random() * 15000) + 25000; // 25-40 seconds
      await countdown(delayTime, 'Next account in');
    }
  }
  
  // Final summary
  console.log(`${BLUE}${'='.repeat(60)}${RESET}`);
  console.log(`${BLUE}REGISTRATION COMPLETED!${RESET}`);
  console.log(`${BLUE}${'='.repeat(60)}${RESET}`);
  console.log(`${GREEN}✓ Successfully created: ${successCount} accounts${RESET}`);
  console.log(`${RED}✖ Failed: ${failCount} accounts${RESET}`);
  console.log(`${BLUE}All accounts saved to ${accountFile}${RESET}`);
}

// Run main function
main().catch(error => {
  console.log(`${RED}Fatal error: ${error.message}${RESET}`);
  process.exit(1);
});
