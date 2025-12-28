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
// ===================================================================
// CHECK INBOX & GET VERIFICATION CODE
// ===================================================================
async function checkInbox(provider, axiosInstance, emailData, maxAttempts = 15, delayMs = 2000) {
  
  // ===================================================================
  // MAIL.TM INBOX CHECKER
  // ===================================================================
  if (provider === 'mail.tm') {
    const token = await getMailTmToken(axiosInstance, emailData.address, emailData.password);
    
    if (!token) {
      return null;
    }
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
          
          const messageBody = messageResponse.data.text || messageResponse.data.html;
          const codeMatch = messageBody.match(/verification code is (\d{6})/);
          
          if (codeMatch) {
            return codeMatch[1]; // Return the 6-digit code
          }
        }
        
      } catch (error) {
        console.log(`${YELLOW}Attempt ${attempt}/${maxAttempts} - ${error.message}${RESET}`);
      }
      
      await delay(delayMs);
    }
    
    console.log(`${RED}No verification code found after ${maxAttempts} attempts.${RESET}`);
    return null;
  }
  
  // ===================================================================
  // GUERRILLA MAIL INBOX CHECKER
  // ===================================================================
  else if (provider === 'guerrillamail') {
    const phpsessid = emailData.phpsessid;
    const headers = {
      'Cookie': `PHPSESSID=${phpsessid}`
    };
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const url = 'https://api.guerrillamail.com/ajax.php';
      const params = {
        f: 'get_email_list',
        seq: 0
      };
      
      try {
        const response = await axiosInstance.get(url, {
          params: params,
          headers: headers
        });
        
        const emails = response.data.list || [];
        
        if (emails.length > 0) {
          const firstEmail = emails[0];
          const fetchParams = {
            f: 'fetch_email',
            email_id: firstEmail.mail_id
          };
          
          const emailResponse = await axiosInstance.get(url, {
            params: fetchParams,
            headers: headers
          });
          
          const emailBody = emailResponse.data.mail_body || '';
          const codeMatch = emailBody.match(/verification code is (\d{6})/);
          
          if (codeMatch) {
            return codeMatch[1]; // Return the 6-digit code
          }
        }
        
      } catch (error) {
        console.log(`${YELLOW}Attempt ${attempt}/${maxAttempts} - ${error.message}${RESET}`);
      }
      
      await delay(delayMs);
    }
    
    console.log(`${RED}No verification code found after ${maxAttempts} attempts.${RESET}`);
    return null;
  }
  
  return null;
}

// ===================================================================
// SEND VERIFICATION EMAIL
// ===================================================================
async function sendVerification(axiosInstance, emailAddress, token) {
  const url = 'https://dashboard.allscale.io/api/secure/misc/send/verification/mail';
  const data = {
    email: emailAddress
  };
  
  const headers = {
    ...getGlobalHeaders(url, ''),
    'authorization': `Bearer ${token}`,
    'referer': 'https://dashboard.allscale.io/pay'
  };
  
  const spinner = createSpinner('Sending verification email...');
  spinner.start();
  
  try {
    const response = await axiosInstance.post(url, data, { headers });
    
    if (response.data.code === 0) {
      spinner.succeed('Verification email sent successfully');
      return true;
    } else {
      throw new Error('Server error: ' + JSON.stringify(response.data));
    }
    
  } catch (error) {
    const errorMsg = error.response 
      ? JSON.stringify(error.response.data) 
      : error.message;
    spinner.fail('Failed to send verification: ' + errorMsg);
    return false;
  }
}

// ===================================================================
// VERIFY EMAIL WITH CODE
// ===================================================================
async function verifyEmail(axiosInstance, emailAddress, code, token) {
  const url = 'https://dashboard.allscale.io/api/secure/misc/verify/mail';
  const data = {
    email: emailAddress,
    code: code
  };
  
  const headers = {
    ...getGlobalHeaders(url, ''),
    'authorization': `Bearer ${token}`,
    'referer': 'https://dashboard.allscale.io/pay'
  };
  
  const spinner = createSpinner('Verifying email...');
  spinner.start();
  
  try {
    const response = await axiosInstance.post(url, data, { headers });
    
    if (response.data.code === 0) {
      spinner.succeed('Email verified successfully!');
      return true;
    } else {
      throw new Error('Server error: ' + JSON.stringify(response.data));
    }
    
  } catch (error) {
    const errorMsg = error.response 
      ? JSON.stringify(error.response.data) 
      : error.message;
    spinner.fail('Failed to verify email: ' + errorMsg);
    return false;
  }
}

// ===================================================================
// GET WEBAUTHN OPTIONS
// ===================================================================
async function getOptions(axiosInstance, emailAddress, refCode) {
  const data = {
    email: emailAddress,
    type: 0
  };
  
  const spinner = createSpinner('Getting registration options...');
  spinner.start();
  
  try {
    const response = await axiosInstance.post(
      'https://dashboard.allscale.io/api/public/businesses/webauthn/options',
      data,
      {
        headers: getGlobalHeaders(
          'https://dashboard.allscale.io/api/public/businesses/webauthn/options',
          refCode
        )
      }
    );
    
    if (response.data.code === 0) {
      spinner.succeed('Options retrieved successfully');
      return response.data.data;
    } else {
      throw new Error('Server error: ' + JSON.stringify(response.data));
    }
    
  } catch (error) {
    const errorMsg = error.response 
      ? JSON.stringify(error.response.data) 
      : error.message;
    spinner.fail('Failed to get options: ' + errorMsg);
    return null;
  }
}
// ===================================================================
// GENERATE WEBAUTHN CREDENTIAL
// ===================================================================
async function generateCredential(options) {
  const challenge = options.challenge;
  const rpId = options.rp.id;
  const origin = 'https://dashboard.allscale.io';
  
  // Step 1: Create client data JSON
  const clientData = {
    type: 'webauthn.create',
    challenge: challenge,
    origin: origin,
    crossOrigin: false
  };
  
  const clientDataBuffer = Buffer.from(JSON.stringify(clientData));
  const clientDataJSON = clientDataBuffer.toString('base64');
  
  // Step 2: Generate EC key pair (P-256 curve)
  const keyPair = await new Promise((resolve, reject) => {
    crypto.generateKeyPair('ec', {
      namedCurve: 'prime256v1'
    }, (err, publicKey, privateKey) => {
      if (err) {
        reject(err);
      } else {
        resolve({ publicKey, privateKey });
      }
    });
  });
  
  // Step 3: Export public key
  const publicKeyPem = keyPair.publicKey.export({
    type: 'spki',
    format: 'der'
  });
  
  const publicKeyData = publicKeyPem.slice(26); // Skip header
  const xCoord = publicKeyData.slice(1, 33);    // X coordinate (32 bytes)
  const yCoord = publicKeyData.slice(33);        // Y coordinate (32 bytes)
  
  // Step 4: Create COSE key (CBOR format)
  const coseKey = new Map();
  coseKey.set(1, 2);        // kty: EC2
  coseKey.set(3, -7);       // alg: ES256
  coseKey.set(-1, 1);       // crv: P-256
  coseKey.set(-2, xCoord);  // x coordinate
  coseKey.set(-3, yCoord);  // y coordinate
  
  const coseKeyEncoded = cbor.encode(coseKey);
  
  // Step 5: Generate credential ID
  const credentialId = crypto.randomBytes(16);
  const credentialIdBase64 = credentialId.toString('base64');
  
  // Step 6: Create authenticator data
  const rpIdHash = crypto.createHash('sha256').update(rpId).digest();
  const flags = Buffer.from([0x41]); // User present + Attested credential
  const signCount = Buffer.alloc(4, 0);
  const aaguid = Buffer.alloc(16, 0);
  const credIdLength = Buffer.alloc(2);
  credIdLength.writeUInt16BE(credentialId.length, 0);
  
  const authenticatorData = Buffer.concat([
    rpIdHash,
    flags,
    signCount,
    aaguid,
    credIdLength,
    credentialId,
    coseKeyEncoded
  ]);
  
  // Step 7: Create attestation object
  const attestationObject = new Map();
  attestationObject.set('fmt', 'none');
  attestationObject.set('attStmt', new Map());
  attestationObject.set('authData', authenticatorData);
  
  const attestationEncoded = cbor.encode(attestationObject);
  const attestationBase64 = attestationEncoded.toString('base64');
  
  // Step 8: Create credential ID (URL-safe base64)
  const credentialIdUrlSafe = credentialIdBase64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  
  return {
    id: credentialIdUrlSafe,
    type: 'public-key',
    rawId: Buffer.from(credentialId).toString('base64'),
    response: {
      clientDataJSON: clientDataJSON,
      attestationObject: attestationBase64
    }
  };
}

// ===================================================================
// REGISTER NEW ACCOUNT
// ===================================================================
async function registerAccount(
  axiosInstance,
  emailAddress,
  password,
  refCode,
  userAgent,
  ipAddress
) {
  // Step 1: Get WebAuthn options
  const optionsData = await getOptions(axiosInstance, emailAddress, refCode);
  
  if (!optionsData) {
    return { success: false };
  }
  
  // Step 2: Generate credential
  const credential = await generateCredential(optionsData.options);
  
  // Step 3: Register account
  const url = 'https://dashboard.allscale.io/api/public/businesses/webauthn/register';
  const data = {
    credential_json: credential,
    email: emailAddress,
    user_id: optionsData.user_id,
    referer_id: refCode,
    device_id_str: uuidv4(),
    device_type: 1,
    ip_address: ipAddress,
    user_agent: userAgent
  };
  
  const spinner = createSpinner('Registering account...');
  spinner.start();
  
  try {
    const response = await axiosInstance.post(url, data, {
      headers: getGlobalHeaders(url, refCode)
    });
    
    if (response.data.code === 0) {
      spinner.succeed('Account registered successfully!');
      return {
        success: true,
        data: response.data.data
      };
    } else {
      throw new Error('Server error: ' + JSON.stringify(response.data));
    }
    
  } catch (error) {
    const errorMsg = error.response 
      ? JSON.stringify(error.response.data) 
      : error.message;
    spinner.fail('Failed to register: ' + errorMsg);
    return { success: false };
  }
}

// ===================================================================
// MAIN REGISTRATION FLOW
// ===================================================================
async function doRegister(axiosInstance, refCode, accountIndex) {
  const userAgent = new UserAgent().toString();
  const ipAddress = await getIpAddress(axiosInstance);
  
  // Step 1: Get temporary email
  const provider = EMAIL_PROVIDERS[Math.floor(Math.random() * EMAIL_PROVIDERS.length)];
  const emailData = await getTempEmail(provider, axiosInstance, ipAddress, userAgent);
  
  if (!emailData) {
    return { success: false };
  }
  
  const emailAddress = emailData.address;
  console.log(`\x1b[32m\x1b[1m📧 Using Email: ${emailAddress}${RESET}`);
  
  // Step 2: Register account
  const { success, data } = await registerAccount(
    axiosInstance,
    emailAddress,
    null,
    refCode,
    userAgent,
    ipAddress
  );
  
  if (!success) {
    return { success: false };
  }
  
  // Step 3: Wait before sending verification
  const waitTime = Math.floor(Math.random() * (10000 - 5000 + 1)) + 5000;
  await delay(waitTime);
  
  // Step 4: Send verification email
  const verificationSent = await sendVerification(
    axiosInstance,
    emailAddress,
    data.token
  );
  
  if (!verificationSent) {
    return { success: false };
  }
  
  // Step 5: Check inbox for verification code
  const verificationCode = await checkInbox(provider, axiosInstance, emailData);
  
  if (!verificationCode) {
    return { success: false };
  }
  
  // Step 6: Verify email with code
  const verified = await verifyEmail(
    axiosInstance,
    emailAddress,
    verificationCode,
    data.token
  );
  
  if (!verified) {
    return { success: false };
  }
  
  // Step 7: Return success with account data
  return {
    success: true,
    email: emailAddress,
    token: data.token,
    refresh_token: data.token
  };
    }
// ===================================================================
// MAIN FUNCTION - CLI INTERFACE
// ===================================================================
async function main() {
  console.log('\n');
  
  // ===================================================================
  // STEP 1: ASK FOR PROXY USAGE
  // ===================================================================
  const { useProxy } = await inquirer.prompt([{
    type: 'confirm',
    name: 'useProxy',
    message: `${CYAN}Do you want to use proxy?${RESET}`,
    default: false
  }]);
  
  let proxies = [];
  let proxyType = null;
  let axiosInstance = axios.create();
  
  // ===================================================================
  // STEP 2: SETUP PROXY (IF ENABLED)
  // ===================================================================
  if (useProxy) {
    const { proxyType: selectedType } = await inquirer.prompt([{
      type: 'list',
      name: 'proxyType',
      message: `${CYAN}Select proxy type:${RESET}`,
      choices: ['Rotating', 'Static']
    }]);
    
    proxyType = selectedType;
    proxies = readProxiesFromFile('proxy.txt');
    
    if (proxies.length > 0) {
      console.log(`${BLUE}Loaded ${proxies.length} proxies from proxy.txt${RESET}\n`);
    } else {
      console.log(`${YELLOW}File proxy.txt is empty or not found, proceeding without proxy.${RESET}\n`);
    }
  }
  
  // ===================================================================
  // STEP 3: ASK FOR NUMBER OF ACCOUNTS
  // ===================================================================
  let accountCount;
  while (true) {
    const { count } = await inquirer.prompt([{
      type: 'input',
      name: 'count',
      message: `${CYAN}How many accounts do you want to create?${RESET}`,
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
  
  // ===================================================================
  // STEP 4: ASK FOR REFERRAL CODE
  // ===================================================================
  const { referralCode } = await inquirer.prompt([{
    type: 'input',
    name: 'referralCode',
    message: `${CYAN}Enter your referral code:${RESET}`
  }]);
  
  // ===================================================================
  // DISPLAY CONFIGURATION
  // ===================================================================
  console.log(`${YELLOW}${'='.repeat(70)}${RESET}`);
  console.log(`${YELLOW}\x1b[1m🚀 Starting registration process for ${accountCount} accounts...${RESET}`);
  console.log(`${YELLOW}📋 Referral Code: ${referralCode}${RESET}`);
  console.log(`${YELLOW}🌐 Proxy: ${useProxy ? `Enabled (${proxyType})` : 'Disabled'}${RESET}`);
  console.log(`${YELLOW}${'='.repeat(70)}${RESET}\n`);
  
  // ===================================================================
  // STEP 5: LOAD EXISTING ACCOUNTS
  // ===================================================================
  const accountsFile = 'account.json';
  let accounts = [];
  
  if (fs.existsSync(accountsFile)) {
    try {
      accounts = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
    } catch (error) {
      accounts = [];
    }
  }
  
  // ===================================================================
  // STEP 6: REGISTRATION LOOP
  // ===================================================================
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < accountCount; i++) {
    console.log(`${CYAN}\x1b[1m${'='.repeat(70)}${RESET}`);
    console.log(`${CYAN}\x1b[1m📝 Processing Account ${i + 1}/${accountCount}${RESET}`);
    console.log(`${CYAN}\x1b[1m${'='.repeat(70)}${RESET}`);
    
    // ===================================================================
    // SETUP PROXY FOR THIS REQUEST
    // ===================================================================
    let currentProxy = null;
    
    if (useProxy && proxies.length > 0) {
      if (proxyType === 'Rotating') {
        // Random proxy for each account
        currentProxy = proxies[Math.floor(Math.random() * proxies.length)];
      } else {
        // Sequential proxy (Static)
        currentProxy = proxies.shift();
      }
      
      if (!currentProxy) {
        console.log(`${RED}No more proxies available!${RESET}`);
        process.exit(1);
      }
      
      console.log(`${WHITE}🌐 Using Proxy: ${currentProxy}${RESET}`);
      
      const proxyAgent = new HttpsProxyAgent(currentProxy);
      axiosInstance = axios.create({
        httpAgent: proxyAgent,
        httpsAgent: proxyAgent
      });
    } else {
      axiosInstance = axios.create();
    }
    
    // ===================================================================
    // GET IP ADDRESS
    // ===================================================================
    let ipAddress = '';
    try {
      const ipResponse = await axiosInstance.get('https://api.ipify.org?format=json');
      ipAddress = ipResponse.data.ip;
    } catch (error) {
      ipAddress = 'unknown';
      console.log(`${RED}Failed to get IP: ${error.message}${RESET}`);
    }
    
    console.log(`${WHITE}📍 IP Address: ${ipAddress}${RESET}\n`);
    
    // ===================================================================
    // REGISTER ACCOUNT
    // ===================================================================
    const {
      success,
      email,
      token,
      refresh_token
    } = await doRegister(
      axiosInstance,
      referralCode,
      `account_${i + 1}`
    );
    
    // ===================================================================
    // HANDLE RESULT
    // ===================================================================
    if (!success) {
      failCount++;
      console.log(`${YELLOW}⚠️  Account ${i + 1}/${accountCount} FAILED (Success: ${successCount}, Failed: ${failCount})${RESET}`);
      console.log(`${CYAN}\x1b[1m${'='.repeat(70)}${RESET}\n`);
      continue;
    }
    
    // ===================================================================
    // SAVE ACCOUNT DATA
    // ===================================================================
    accounts.push({
      email: email,
      token: token,
      refresh_token: refresh_token,
      registeredAt: new Date().toISOString()
    });
    
    try {
      fs.writeFileSync(accountsFile, JSON.stringify(accounts, null, 2));
      console.log(`\x1b[32m\x1b[1m💾 Account saved to ${accountsFile}${RESET}`);
    } catch (error) {
      console.log(`${RED}Failed to save to ${accountsFile}: ${error.message}${RESET}`);
    }
    
    successCount++;
    console.log(`${YELLOW}✅ Account ${i + 1}/${accountCount} SUCCESS (Success: ${successCount}, Failed: ${failCount})${RESET}`);
    console.log(`${CYAN}\x1b[1m${'='.repeat(70)}${RESET}\n`);
    
    // ===================================================================
    // DELAY BETWEEN ACCOUNTS (except last one)
    // ===================================================================
    if (i < accountCount - 1) {
      const waitTime = Math.floor(Math.random() * 15000 + 1) + 25000; // 25-40 seconds
      await countdown(waitTime);
    }
  }
  
  // ===================================================================
  // FINAL SUMMARY
  // ===================================================================
  console.log(`${BLUE}\x1b[1m${'='.repeat(70)}${RESET}`);
  console.log(`${BLUE}\x1b[1m🎉 REGISTRATION COMPLETED!${RESET}`);
  console.log(`${BLUE}\x1b[1m✅ Success: ${successCount}/${accountCount}${RESET}`);
  console.log(`${BLUE}\x1b[1m❌ Failed: ${failCount}/${accountCount}${RESET}`);
  console.log(`${BLUE}\x1b[1m💾 Data saved to: ${accountsFile}${RESET}`);
  console.log(`${BLUE}\x1b[1m${'='.repeat(70)}${RESET}\n`);
}

// ===================================================================
// RUN MAIN FUNCTION
// ===================================================================
main().catch(error => {
  console.log(`${RED}❌ Fatal Error: ${error.message}${RESET}`);
  process.exit(1);
});

// ===================================================================
// END OF SCRIPT
// ===================================================================
