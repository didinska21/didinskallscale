// ===================================================================
// AUTO REFERRAL BOT - ALLSCALE.IO
// De-obfuscated Version for Educational Purpose Only
// ===================================================================

const inquirer = require('inquirer');
const fs = require('fs');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const cfonts = require('cfonts');
const UserAgent = require('user-agents');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const cbor = require('cbor');

// ===================================================================
// COLOR CONSTANTS
// ===================================================================
const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const WHITE = '\x1b[37m';

// ===================================================================
// SPINNER ANIMATION
// ===================================================================
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function createSpinner(message) {
  let frameIndex = 0;
  let interval = null;
  let isRunning = false;

  function clearLine() {
    try {
      process.stdout.moveCursor(0, -1);
      process.stdout.cursorTo(0);
    } catch (error) {}
  }

  return {
    start() {
      if (isRunning) return;
      isRunning = true;
      clearLine();
      process.stdout.write(`${CYAN}${SPINNER_FRAMES[frameIndex]} ${message}${RESET}`);
      
      interval = setInterval(() => {
        frameIndex = (frameIndex + 1) % SPINNER_FRAMES.length;
        clearLine();
        process.stdout.write(`${CYAN}${SPINNER_FRAMES[frameIndex]} ${message}${RESET}`);
      }, 100);
    },

    succeed(successMessage) {
      if (!isRunning) return;
      clearInterval(interval);
      isRunning = false;
      clearLine();
      process.stdout.write(`\x1b[32m\x1b[1m✔ ${successMessage}${RESET}\n`);
    },

    fail(errorMessage) {
      if (!isRunning) return;
      clearInterval(interval);
      isRunning = false;
      clearLine();
      process.stdout.write(`${RED}✖ ${errorMessage}${RESET}\n`);
    },

    stop() {
      if (!isRunning) return;
      clearInterval(interval);
      isRunning = false;
      clearLine();
    }
  };
}

// ===================================================================
// UTILITY FUNCTIONS
// ===================================================================
function centerText(text) {
  const terminalWidth = process.stdout.columns || 80;
  const textLength = text.replace(/\x1b\[[0-9;]*m/g, '').length;
  const padding = Math.max(0, Math.floor((terminalWidth - textLength) / 2));
  return ' '.repeat(padding) + text;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function countdown(milliseconds, prefix = 'Waiting') {
  const seconds = Math.floor(milliseconds / 1000);
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`${YELLOW}\r${prefix} ${i} seconds...${RESET}`);
    await delay(1000);
  }
  process.stdout.write('\r' + ' '.repeat(50) + '\r');
}

function readProxiesFromFile(filename) {
  try {
    const content = fs.readFileSync(filename, 'utf8');
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line !== '');
  } catch (error) {
    console.log(`${RED}Gagal membaca file proxy.txt: ${error.message}${RESET}`);
    return [];
  }
}

// ===================================================================
// BANNER
// ===================================================================
cfonts.say('ALLSCALE', {
  font: 'block',
  align: 'center',
  colors: ['cyan', 'magenta']
});

console.log(centerText(`${BLUE}═════════════════════════════════${RESET}`));
console.log(centerText(`${CYAN}✪ BOT AUTO REFERRAL ASP ✪${RESET}\n`));

// ===================================================================
// HTTP HEADERS GENERATOR
// ===================================================================
function getGlobalHeaders(url, refCode, additionalHeaders = {}) {
  const userAgent = new UserAgent();
  
  const headers = {
    'accept': '*/*',
    'accept-encoding': 'gzip, deflate, br, zstd',
    'accept-language': 'en-US,en;q=0.9',
    'cache-control': 'no-cache',
    'content-type': 'application/json',
    'origin': 'https://dashboard.allscale.io',
    'pragma': 'no-cache',
    'priority': 'u=1, i',
    'referer': `https://dashboard.allscale.io/sign-up?ref=${refCode}`,
    'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent': userAgent.toString()
  };

  // Add timestamp and signature for specific endpoints
  if (url.includes('/api/public/businesses/webauthn')) {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto
      .createHash('sha256')
      .update('vT*IUEGgyL' + timestamp)
      .digest('hex');
    
    headers['x-timestamp'] = timestamp;
    headers['x-signature'] = signature;
  }

  Object.assign(headers, additionalHeaders);
  return headers;
}

// ===================================================================
// TEMPORARY EMAIL - MAIL.TM PROVIDER
// ===================================================================
async function getTempEmailMailTm(axiosInstance) {
  try {
    // Step 1: Get available domains
    let allDomains = [];
    let page = 1;
    
    while (true) {
      const url = `https://api.mail.tm/domains?page=${page}`;
      const response = await axiosInstance.get(url);
      
      if (response.status !== 200) {
        throw new Error('Failed to fetch domains');
      }
      
      const data = response.data;
      const domains = data['hydra:member'] || [];
      const activeDomains = domains.filter(d => d.isActive && !d.isPrivate);
      
      allDomains = allDomains.concat(activeDomains);
      
      if (!data['hydra:view'] || !data['hydra:view'].next) {
        break;
      }
      page++;
    }
    
    if (allDomains.length === 0) {
      throw new Error('No available domains found');
    }
    
    // Step 2: Generate random email
    const randomDomain = allDomains[Math.floor(Math.random() * allDomains.length)];
    const domainName = randomDomain.domain;
    const randomUsername = Math.random().toString(36).substring(2, 15);
    const emailAddress = `${randomUsername}@${domainName}`;
    const password = 'TempPass123!';
    
    // Step 3: Register email account
    const registerUrl = 'https://api.mail.tm/accounts';
    const registerData = {
      address: emailAddress,
      password: password
    };
    
    const registerResponse = await axiosInstance.post(registerUrl, registerData);
    
    if (registerResponse.status === 201) {
      console.log(`\x1b[32mEmail created: ${emailAddress}${RESET}`);
      return {
        provider: 'mail.tm',
        address: emailAddress,
        password: password,
        login: randomUsername,
        domain: domainName
      };
    } else {
      throw new Error('Failed to create email account');
    }
    
  } catch (error) {
    console.log(`${RED}Failed to generate mail.tm email: ${error.message}${RESET}`);
    return null;
  }
}

// ===================================================================
// TEMPORARY EMAIL - GUERRILLA MAIL PROVIDER
// ===================================================================
async function getTempEmailGuerrilla(axiosInstance, ipAddress, userAgent) {
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
    
    const emailAddress = data.email_addr;
    const sidToken = data.sid_token || '';
    
    let phpsessid = '';
    if (response.headers['set-cookie']) {
      response.headers['set-cookie'].forEach(cookie => {
        if (cookie.includes('PHPSESSID')) {
          phpsessid = cookie.split(';')[0].split('=')[1];
        }
      });
    }
    
    console.log(`\x1b[32mEmail created: ${emailAddress}${RESET}`);
    return {
      provider: 'guerrillamail',
      address: emailAddress,
      sid_token: sidToken,
      phpsessid: phpsessid
    };
    
  } catch (error) {
    console.log(`${RED}Failed to generate guerrilla email: ${error.message}${RESET}`);
    return null;
  }
}

// ===================================================================
// MAIN TEMP EMAIL FUNCTION
// ===================================================================
const EMAIL_PROVIDERS = ['mail.tm', 'guerrillamail'];

async function getTempEmail(provider, axiosInstance, ipAddress, userAgent) {
  if (provider === 'mail.tm') {
    return await getTempEmailMailTm(axiosInstance);
  } else if (provider === 'guerrillamail') {
    return await getTempEmailGuerrilla(axiosInstance, ipAddress, userAgent);
  }
  return null;
}

// ===================================================================
// GET MAIL.TM AUTH TOKEN
// ===================================================================
async function getMailTmToken(axiosInstance, emailAddress, password) {
  const url = 'https://api.mail.tm/token';
  const data = {
    address: emailAddress,
    password: password
  };
  
  try {
    const response = await axiosInstance.post(url, data);
    return response.data.token;
  } catch (error) {
    console.log(`${RED}Failed to get mail.tm token: ${error.message}${RESET}`);
    return null;
  }
}

// ===================================================================
// GET IP ADDRESS
// ===================================================================
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
