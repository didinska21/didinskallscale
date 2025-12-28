const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const readline = require("readline-sync");
const fs = require("fs");

const { createTempEmail, waitForOTP } = require("./email");
const { loadProxy } = require("./proxy");
const { logError } = require("./logger");

puppeteer.use(StealthPlugin());

(async () => {
  try {
    // ===== LOAD CONFIG =====
    const config = JSON.parse(fs.readFileSync("config.json"));
    const referral = config.referral_code;

    let url = "https://app.allscale.io/pay/register";
    if (referral) url += `?code=${referral}`;

    // ===== PROXY MENU =====
    console.log("\nPILIH PROXY:");
    console.log("1. Tanpa Proxy");
    console.log("2. Proxy Static");
    console.log("3. Proxy Rotating");

    const choice = readline.question("Pilih (1/2/3): ");

    let proxy = null;
    if (choice === "2") proxy = loadProxy("static");
    if (choice === "3") proxy = loadProxy("rotating");

    if (proxy) console.log("🌐 Proxy:", proxy);
    else console.log("🌐 Proxy: NONE");

    const args = [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-gpu",
      "--disable-dev-shm-usage"
    ];

    if (proxy) args.push(`--proxy-server=${proxy}`);

    const browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args
    });

    const page = await browser.newPage();

    // proxy auth
    if (proxy && proxy.includes("@")) {
      const auth = proxy.split("//")[1].split("@")[0].split(":");
      await page.authenticate({
        username: auth[0],
        password: auth[1]
      });
    }

    // ===== TEMP EMAIL =====
    const { email, login, domain } = await createTempEmail();
    console.log("📧 Temp Email:", email);

    await page.goto(url, { waitUntil: "networkidle2" });

    // ===== FORM =====
    await page.waitForSelector('input[type="email"]');
    await page.type('input[type="email"]', email, { delay: 80 });

    const checkboxes = await page.$$('input[type="checkbox"]');
    for (const cb of checkboxes) await cb.click();

    await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")]
        .find(b =>
          b.innerText.toLowerCase().includes("create with email")
        );
      btn?.click();
    });

    console.log("⏳ Waiting OTP...");

    const otp = await waitForOTP(login, domain);
    console.log("🔐 OTP:", otp);

    // ===== OTP INPUT =====
    await page.waitForSelector('input[inputmode="numeric"]');
    const inputs = await page.$$('input[inputmode="numeric"]');

    for (let i = 0; i < otp.length; i++) {
      await inputs[i].type(otp[i], { delay: 120 });
    }

    console.log("✅ REGISTER SUCCESS");

  } catch (err) {
    logError("REGISTER_MAIN", err);
    console.log("❌ REGISTER FAILED – cek error.log");
  }
})();
