const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const readline = require("readline-sync");
const { createTempEmail, waitForOTP } = require("./email");
const { loadProxy } = require("./proxy");

puppeteer.use(StealthPlugin());

(async () => {
  // ===== CLI INPUT =====
  const referral = readline.question("Referral code (ENTER jika sudah di link): ");
  const proxyType = readline.question("Proxy type (static/rotating/none): ");

  let registerUrl = "https://app.allscale.io/pay/register";
  if (referral) {
    registerUrl += `?code=${referral}`;
  }

  // ===== PROXY =====
  let proxy = null;
  if (proxyType !== "none") {
    proxy = loadProxy(proxyType);
    console.log("🌐 Proxy:", proxy || "NONE");
  }

  const args = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-blink-features=AutomationControlled"
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

  const { email, login, domain } = await createTempEmail();
  console.log("📧 Email:", email);

  await page.goto(registerUrl, { waitUntil: "networkidle2" });

  // ===== FORM =====
  await page.waitForSelector('input[type="email"]');
  await page.type('input[type="email"]', email, { delay: 80 });

  const checkboxes = await page.$$('input[type="checkbox"]');
  for (const cb of checkboxes) await cb.click();

  // create with email
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")]
      .find(b => b.innerText.toLowerCase().includes("create with email"));
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

  console.log("✅ REGISTER DONE");

})();
