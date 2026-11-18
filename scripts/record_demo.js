const { chromium } = require('/home/ayoub/.nvm/versions/node/v20.19.4/lib/node_modules/@playwright/cli/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

function resetDatabase() {
  console.log('Resetting production_demo schemas and sources in PostgreSQL...');
  try {
    execSync(`.venv/bin/python -c "
from backend.core.config import Settings
from backend.database.pool import connect_pool
import asyncio

async def reset():
    settings = Settings()
    pool = await connect_pool(settings.database_url.get_secret_value())
    async with pool.acquire() as conn:
        await conn.execute(\\\"DELETE FROM chat_olap.sources WHERE schema_name LIKE 'production_demo%'\\\")
        rows = await conn.fetch(\\\"SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'production_demo%'\\\")
        for r in rows:
            await conn.execute(f\\\"DROP SCHEMA IF EXISTS {r['schema_name']} CASCADE\\\")
        # Ensure default model is openai.gpt-oss-120b
        await conn.execute('''
            UPDATE chat_olap.users 
            SET model_settings = '{\\\"model\\\": \\\"openai.gpt-oss-120b\\\", \\\"max_steps\\\": 12, \\\"temperature\\\": 0.1, \\\"process_mode\\\": \\\"standard\\\", \\\"custom_instructions\\\": \\\"\\\"}'::jsonb,
                credits = 1000
            WHERE email = 'demo@querylens.io';
        ''')

asyncio.run(reset())
"`, { stdio: 'inherit' });
    console.log('Database reset successfully with Bedrock Mantle GPT-OSS 120B.');
  } catch (err) {
    console.error('Reset error:', err.message);
  }
}

async function injectHudAndCursor(page) {
  await page.evaluate(() => {
    if (!document.getElementById('demo-hud-overlay')) {
      const hud = document.createElement('div');
      hud.id = 'demo-hud-overlay';
      hud.innerHTML = `
        <style>
          #demo-hud-overlay {
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 2147483647;
            background: rgba(13, 17, 23, 0.94);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.18);
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.08);
            border-radius: 9999px;
            padding: 12px 28px;
            display: flex;
            align-items: center;
            gap: 18px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            pointer-events: none;
            transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            animation: hudSlideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
          }
          @keyframes hudSlideUp {
            from { opacity: 0; transform: translate(-50%, 25px); }
            to { opacity: 1; transform: translate(-50%, 0); }
          }
          .hud-badge {
            color: #ffffff;
            font-weight: 700;
            font-size: 11px;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            padding: 5px 12px;
            border-radius: 9999px;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            white-space: nowrap;
            transition: all 0.3s ease;
          }
          .hud-badge.blue {
            background: linear-gradient(135deg, #2563eb, #4f46e5);
            box-shadow: 0 2px 10px rgba(37, 99, 235, 0.45);
          }
          .hud-badge.emerald {
            background: linear-gradient(135deg, #059669, #10b981);
            box-shadow: 0 2px 10px rgba(16, 185, 129, 0.45);
          }
          .hud-badge.amber {
            background: linear-gradient(135deg, #d97706, #f59e0b);
            box-shadow: 0 2px 10px rgba(245, 158, 11, 0.45);
          }
          .hud-badge.purple {
            background: linear-gradient(135deg, #7c3aed, #8b5cf6);
            box-shadow: 0 2px 10px rgba(139, 92, 246, 0.45);
          }
          .hud-content {
            display: flex;
            flex-direction: column;
            gap: 2px;
          }
          .hud-title {
            font-size: 15px;
            font-weight: 700;
            color: #f8fafc;
            letter-spacing: -0.01em;
            white-space: nowrap;
          }
          .hud-subtitle {
            font-size: 12.5px;
            color: #94a3b8;
            white-space: nowrap;
          }
          #demo-virtual-cursor {
            position: fixed;
            top: 0;
            left: 0;
            width: 20px;
            height: 20px;
            background: rgba(59, 130, 246, 0.85);
            border: 2px solid #ffffff;
            border-radius: 50%;
            pointer-events: none;
            z-index: 2147483646;
            box-shadow: 0 0 16px rgba(59, 130, 246, 0.9);
            transform: translate(-50%, -50%);
            transition: opacity 0.2s ease;
          }
        </style>
        <div id="hud-badge" class="hud-badge blue">QueryLens</div>
        <div class="hud-content">
          <div id="hud-title" class="hud-title">Conversational Data Analytics</div>
          <div id="hud-subtitle" class="hud-subtitle">Grounded in PostgreSQL with inspectable SQL evidence</div>
        </div>
      `;
      document.body.appendChild(hud);
    }

    if (!document.getElementById('demo-virtual-cursor')) {
      const cur = document.createElement('div');
      cur.id = 'demo-virtual-cursor';
      document.body.appendChild(cur);
      window.addEventListener('mousemove', (e) => {
        cur.style.left = e.clientX + 'px';
        cur.style.top = e.clientY + 'px';
      });
    }
  });
}

async function updateHud(page, { badge, color = 'blue', title, subtitle }) {
  await page.evaluate(({ badge, color, title, subtitle }) => {
    const badgeEl = document.getElementById('hud-badge');
    const titleEl = document.getElementById('hud-title');
    const subtitleEl = document.getElementById('hud-subtitle');
    if (!badgeEl || !titleEl || !subtitleEl) return;

    badgeEl.className = 'hud-badge ' + (color || 'blue');
    badgeEl.textContent = badge;
    titleEl.textContent = title;
    subtitleEl.textContent = subtitle;
  }, { badge, color, title, subtitle });
}

async function smoothClick(page, target) {
  let box = null;
  if (typeof target === 'string') {
    const el = page.locator(target).first();
    await el.waitFor({ state: 'visible', timeout: 7000 }).catch(() => {});
    await el.scrollIntoViewIfNeeded().catch(() => {});
    box = await el.boundingBox().catch(() => null);
  } else if (target && target.boundingBox) {
    await target.scrollIntoViewIfNeeded().catch(() => {});
    box = await target.boundingBox().catch(() => null);
  } else if (target && typeof target.x === 'number') {
    box = { x: target.x - 5, y: target.y - 5, width: 10, height: 10 };
  }

  if (box) {
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y, { steps: 18 });
    await page.waitForTimeout(80);
    await page.mouse.click(x, y);
  } else {
    if (typeof target === 'string') {
      await page.locator(target).first().click().catch(() => {});
    } else if (target && target.click) {
      await target.click().catch(() => {});
    }
  }
}

async function main() {
  resetDatabase();

  const recordingsDir = path.join(__dirname, '..', 'recordings');
  if (!fs.existsSync(recordingsDir)) {
    fs.mkdirSync(recordingsDir, { recursive: true });
  }

  console.log('Starting Playwright Chromium recording (1920x1080)...');
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: recordingsDir,
      size: { width: 1920, height: 1080 },
    },
  });

  const page = await context.newPage();
  page.on('load', async () => {
    try { await injectHudAndCursor(page); } catch (_) {}
  });

  // ==========================================
  // SCENE 1: Hook & Landing Page (0:00 - 0:10)
  // ==========================================
  console.log('[0:00 - 0:10] Scene 1: Landing Page');
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle' });
  await injectHudAndCursor(page);
  await updateHud(page, {
    badge: 'QueryLens',
    color: 'blue',
    title: 'Conversational Data Analytics',
    subtitle: 'Zero hallucinations · Read-only PostgreSQL · Auditable SQL evidence',
  });

  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'smooth' }));
  await page.waitForTimeout(1800);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(1000);

  await updateHud(page, {
    badge: 'Fast Onboarding',
    color: 'emerald',
    title: 'Entering Workspace',
    subtitle: 'Sign in to access schemas, live agents & settings',
  });

  await smoothClick(page, 'a:has-text("Sign in")');
  await page.waitForURL('**/login**', { timeout: 8000 });
  await injectHudAndCursor(page);

  await page.fill('input[type="email"], input[name="email"]', 'demo@querylens.io');
  await page.waitForTimeout(250);
  await page.fill('input[type="password"], input[name="password"]', 'demo123456');
  await page.waitForTimeout(350);
  await smoothClick(page, 'button[type="submit"]');

  await page.waitForURL('**/workspace**', { timeout: 10000 });
  await page.waitForTimeout(1500);
  await injectHudAndCursor(page);

  // ==========================================
  // SCENE 2: Settings Configuration - GPT-OSS 120B (0:10 - 0:22)
  // ==========================================
  console.log('[0:10 - 0:22] Scene 2: Settings Configuration (GPT-OSS 120B)');
  await updateHud(page, {
    badge: 'AI Engine Settings',
    color: 'purple',
    title: 'Configuring Bedrock Mantle GPT-OSS 120B',
    subtitle: 'Select authorized enterprise model & configure reasoning depth',
  });

  const settingsNavBtn = page.getByLabel('Workspace navigation').getByRole('button', { name: 'Settings' });
  await smoothClick(page, settingsNavBtn);
  await page.waitForTimeout(2000);

  // Select Bedrock Mantle GPT-OSS 120B card
  const modelCard = page.locator('*:has-text("Bedrock Mantle GPT-OSS 120B")').last();
  await smoothClick(page, modelCard);
  await page.waitForTimeout(1200);

  // Click Save Configuration
  const saveConfigBtn = page.locator('button:has-text("Save Configuration")');
  await smoothClick(page, saveConfigBtn);
  await page.waitForTimeout(1800);

  await updateHud(page, {
    badge: 'Model Active',
    color: 'emerald',
    title: 'Bedrock GPT-OSS 120B Enabled',
    subtitle: '5 credits / query · 120B parameter reasoning engine active',
  });
  await page.waitForTimeout(1500);

  // ==========================================
  // SCENE 3: Multi-Sheet Ingestion (0:22 - 0:38)
  // ==========================================
  console.log('[0:22 - 0:38] Scene 3: Upload Data');
  await updateHud(page, {
    badge: 'Multi-Sheet Ingestion',
    color: 'emerald',
    title: 'Drag & Drop Excel Spreadsheets',
    subtitle: 'Automatic relational decomposition & strict type inference',
  });

  await smoothClick(page, page.getByRole('button', { name: 'Upload Data', exact: true }));
  await page.waitForTimeout(1500);

  const fileInput = page.locator('input[type="file"]');
  const xlsxPath = path.resolve(__dirname, '..', 'data_demo', 'production_demo.xlsx');
  await fileInput.setInputFiles(xlsxPath);
  console.log('Uploaded production_demo.xlsx');

  await page.waitForTimeout(2500);
  await updateHud(page, {
    badge: '10 Tables Detected',
    color: 'purple',
    title: 'Relational Schema Discovered',
    subtitle: 'Products · Lines · Machines · ProductionLog · Downtime · QualityChecks',
  });

  await page.waitForTimeout(2000);
  console.log('Clicking Import 10 tables...');
  await smoothClick(page, 'button:has-text("Import 10 tables")');
  await page.waitForTimeout(4000);
  await injectHudAndCursor(page);

  // ==========================================
  // SCENE 4: Zero-Shot Profiling (0:38 - 0:50)
  // ==========================================
  console.log('[0:38 - 0:50] Scene 4: Zero-Shot Profiling & Catalog');
  await updateHud(page, {
    badge: 'Zero-Shot Profiling',
    color: 'amber',
    title: 'Instant Schema Catalog & Profiling',
    subtitle: '10 Tables · 54 Columns · 58 Measures · Zero LLM latency or cost',
  });

  await page.waitForTimeout(2200);

  const erdTab = page.locator('button:has-text("Relational Map"), button:has-text("ERD")').first();
  if (await erdTab.isVisible().catch(() => false)) {
    await smoothClick(page, erdTab);
    await page.waitForTimeout(2000);
  }

  const ddlTab = page.locator('button:has-text("SQL Schema (DDL)")').first();
  if (await ddlTab.isVisible().catch(() => false)) {
    await smoothClick(page, ddlTab);
    await page.waitForTimeout(2000);
  }

  const catalogTab = page.locator('button:has-text("Table Catalog & Schema")').first();
  if (await catalogTab.isVisible().catch(() => false)) {
    await smoothClick(page, catalogTab);
    await page.waitForTimeout(1200);
  }

  // ==========================================
  // SCENE 5: Conversational SQL Agent with GPT-OSS 120B (0:50 - 1:08)
  // ==========================================
  console.log('[0:50 - 1:08] Scene 5: Conversational AI Agent (GPT-OSS 120B)');
  await updateHud(page, {
    badge: 'GPT-OSS 120B Agent',
    color: 'blue',
    title: 'Multi-Table Natural Language Query',
    subtitle: 'Autonomous schema inspection, join generation & PostgreSQL execution',
  });

  const startChatBtn = page.locator('.start-chat-cta, button:has-text("Start AI Chat")').first();
  await smoothClick(page, startChatBtn);
  await page.waitForTimeout(2000);
  await injectHudAndCursor(page);

  const textarea = page.locator('textarea#question');
  await textarea.waitFor({ state: 'visible', timeout: 5000 });

  const query1 = 'Which machines have the highest downtime, and what are the main reasons?';
  await textarea.focus();
  await textarea.pressSequentially(query1, { delay: 14 });
  await page.waitForTimeout(400);

  await updateHud(page, {
    badge: 'GPT-OSS 120B Reasoning',
    color: 'purple',
    title: 'Executing Multi-Table JOIN Query',
    subtitle: 'Joining machines and downtime tables in PostgreSQL...',
  });

  const sendBtn = page.locator('.send-button');
  await smoothClick(page, sendBtn);
  console.log('Submitted Query 1 to GPT-OSS 120B:', query1);

  // Wait for the response to render
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(1500);
    const results = await page.locator('.result, .conversation-message').count();
    const isSpinning = await page.locator('.spin').count();
    if (results >= 1 && isSpinning === 0 && i > 3) {
      console.log('Query 1 finished rendering.');
      break;
    }
  }

  await updateHud(page, {
    badge: 'Verified Result',
    color: 'emerald',
    title: 'Exact Numerical Findings Delivered',
    subtitle: 'Multi-table join executed with verified machine downtime statistics',
  });
  await page.waitForTimeout(3000);

  // ==========================================
  // SCENE 6: Interactive Visualizations & Evidence (1:08 - 1:24)
  // ==========================================
  console.log('[1:08 - 1:24] Scene 6: Interactive Graphs & Audit Evidence');
  await updateHud(page, {
    badge: 'Graph Agent',
    color: 'blue',
    title: 'Interactive Visualizations on the Fly',
    subtitle: 'Grounded in executed query results with full data provenance',
  });

  const query2 = 'Plot a bar chart of total downtime minutes grouped by reason';
  await textarea.focus();
  await textarea.pressSequentially(query2, { delay: 14 });
  await page.waitForTimeout(400);

  await smoothClick(page, sendBtn);
  console.log('Submitted Query 2 (Chart):', query2);

  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(1500);
    const hasSvg = await page.locator('svg.recharts-surface, .recharts-responsive-container').count();
    const isSpinning = await page.locator('.spin').count();
    if (hasSvg > 0 && isSpinning === 0 && i > 3) {
      console.log('Chart finished rendering!');
      break;
    }
  }

  await updateHud(page, {
    badge: 'Grounded Visuals',
    color: 'emerald',
    title: 'Dynamic Chart & Tooltip Exploration',
    subtitle: 'Interactive hover tooltips · Toggle chart types · Download source CSV',
  });

  const chartRect = page.locator('.recharts-bar-rectangle, .recharts-surface').first();
  if (await chartRect.isVisible().catch(() => false)) {
    const box = await chartRect.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.5, { steps: 15 });
      await page.waitForTimeout(1200);
      await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.45, { steps: 15 });
      await page.waitForTimeout(1200);
    }
  }

  // Open "Inspect query & evidence"
  await updateHud(page, {
    badge: '100% Auditable',
    color: 'amber',
    title: 'Inspectable Query & Execution Evidence',
    subtitle: 'Inspect raw SQL statement, execution latency (~15ms) and parameters',
  });

  const inspectBtn = page.locator('summary:has-text("Inspect query & evidence"), button:has-text("Inspect query & evidence"), [data-state="closed"]:has-text("Inspect")').first();
  if (await inspectBtn.isVisible().catch(() => false)) {
    await smoothClick(page, inspectBtn);
    await page.waitForTimeout(2800);
  }

  // ==========================================
  // SCENE 7: Outro & Call to Action (1:24 - 1:30)
  // ==========================================
  console.log('[1:24 - 1:30] Scene 7: Outro');
  await updateHud(page, {
    badge: 'QueryLens',
    color: 'blue',
    title: 'Conversational Analytics Grounded in Reality',
    subtitle: 'Bedrock GPT-OSS 120B · Self-Hosted · github.com/ayoub/chat-olap',
  });

  await page.waitForTimeout(6000);

  console.log('Finalizing recording and closing browser...');
  await page.close();
  await context.close();
  await browser.close();

  // Find generated .webm and transcode
  const files = fs.readdirSync(recordingsDir).filter(f => f.endsWith('.webm'));
  if (files.length > 0) {
    const latestFile = files.sort((a, b) => fs.statSync(path.join(recordingsDir, b)).mtimeMs - fs.statSync(path.join(recordingsDir, a)).mtimeMs)[0];
    const webmPath = path.join(recordingsDir, latestFile);
    const rawMp4Path = path.join(recordingsDir, 'querylens_demo_gptoss120b_raw.mp4');
    const finalMp4Path = path.join(recordingsDir, 'querylens_demo_gptoss120b_90s.mp4');
    
    console.log(`WebM recording saved at: ${webmPath}`);
    console.log(`Transcoding to intermediate MP4...`);
    execSync(`ffmpeg -y -i "${webmPath}" -c:v libx264 -pix_fmt yuv420p -crf 18 -preset fast "${rawMp4Path}"`, { stdio: 'inherit' });

    // Speed-ramp to exact 90s
    console.log('Calculating speed factor for exactly 90.0 seconds...');
    const durationStr = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${rawMp4Path}"`).toString().trim();
    const duration = parseFloat(durationStr) || 120;
    const factor = (90.0 / duration).toFixed(4);
    console.log(`Raw duration: ${duration}s, target: 90s, setpts factor: ${factor}`);

    execSync(`ffmpeg -y -i "${rawMp4Path}" -filter:v "setpts=${factor}*PTS" -r 30 -c:v libx264 -pix_fmt yuv420p -crf 18 -preset fast -movflags +faststart "${finalMp4Path}"`, { stdio: 'inherit' });
    console.log(`SUCCESS! Final 90s video generated at: ${finalMp4Path}`);
  }
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
