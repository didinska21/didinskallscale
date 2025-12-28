/**
 * TEMP EMAIL HANDLER
 * Using mail.tm (free, reliable, no rate limit)
 */

const axios = require('axios');

const API_BASE = 'https://api.mail.tm';

// Generate random string
function randomString(length = 10) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Get available domain
async function getDomain() {
  try {
    const res = await axios.get(`${API_BASE}/domains`);
    return res.data['hydra:member'][0].domain;
  } catch (err) {
    throw new Error(`Failed to get domain: ${err.message}`);
  }
}

// Create account
async function getTempEmail() {
  try {
    const domain = await getDomain();
    const username = randomString(12);
    const email = `${username}@${domain}`;
    const password = randomString(16);
    
    // Register account
    await axios.post(`${API_BASE}/accounts`, {
      address: email,
      password: password
    });
    
    // Get token
    const tokenRes = await axios.post(`${API_BASE}/token`, {
      address: email,
      password: password
    });
    
    const token = tokenRes.data.token;
    
    return { email, token };
  } catch (err) {
    throw new Error(`Failed to create temp email: ${err.message}`);
  }
}

// Get OTP from email
async function getOTP(emailData, maxRetries = 30) {
  const { email, token } = emailData;
  
  console.log('⏳ Waiting for OTP email (max 3 minutes)...');
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      // Get messages
      const res = await axios.get(`${API_BASE}/messages`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const messages = res.data['hydra:member'];
      
      if (messages && messages.length > 0) {
        // Get latest message
        const msgId = messages[0].id;
        const msgRes = await axios.get(`${API_BASE}/messages/${msgId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const body = msgRes.data.text || msgRes.data.html || '';
        
        // Extract OTP (6 digits)
        const otpMatch = body.match(/\b(\d{6})\b/);
        if (otpMatch) {
          return otpMatch[1];
        }
        
        // Try alternative patterns
        const altMatch = body.match(/code[:\s]+(\d{6})/i) || 
                        body.match(/verification[:\s]+(\d{6})/i) ||
                        body.match(/otp[:\s]+(\d{6})/i);
        if (altMatch) {
          return altMatch[1];
        }
      }
      
      // Wait 6 seconds before retry
      await new Promise(r => setTimeout(r, 6000));
      
      if ((i + 1) % 5 === 0) {
        console.log(`⏳ Still waiting... (${i + 1}/${maxRetries})`);
      }
      
    } catch (err) {
      // Ignore errors, keep retrying
    }
  }
  
  throw new Error('OTP not received after 3 minutes');
}

module.exports = { getTempEmail, getOTP };
