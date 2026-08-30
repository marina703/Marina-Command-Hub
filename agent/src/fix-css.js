// Fix stone-surface to use CSS variables instead of hardcoded values
const fs = require('fs');
const path = require('path');

const cssPath = path.join(process.cwd(), 'agent', 'src', 'index.css');
let content = fs.readFileSync(cssPath, 'utf8');

// The old .stone-surface block - match it precisely
const oldBlock = `.stone-surface {
    background-color: rgba(9, 22, 25, 0.62);
    background-image:
      linear-gradient(135deg, rgba(255,255,255,0.12), transparent 25%, rgba(255,255,255,0.035) 64%, transparent 100%),
      radial-gradient(circle at 18% 20%, rgba(0, 214, 208, 0.1) 0 1px, transparent 1.5px),
      radial-gradient(circle at 78% 72%, rgba(242, 61, 120, 0.08) 0 1px, transparent 1.5px);
    background-size: auto, 30px 30px, 38px 38px;
    backdrop-filter: blur(28px) saturate(160%);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.11), inset 0 0 0 1px rgba(0,214,208,0.035), 0 18px 48px rgba(0,0,0,0.46);
  }`;

const newBlock = `.stone-surface {
    /* Light theme uses CSS variables from [data-theme="light"] */
    --stone-bg: var(--color-surface-2, #ffffff);
    --stone-accent: var(--color-accent-primary, #00d6d0);
    --stone-accent-soft: var(--color-accent-primary-soft, rgba(0, 214, 208, 0.14));
    --stone-text: var(--color-text-primary, #ffffff);
    --stone-border: var(--color-border-muted, rgba(0, 0, 0, 0.1));
    --stone-shadow: var(--shadow-card, 0 18px 44px rgba(0, 0, 0, 0.12));
    background-color: var(--stone-bg);
    background-image:
      linear-gradient(135deg, rgba(255,255,255,0.12), transparent 25%, rgba(255,255,255,0.035) 64%, transparent 100%),
      radial-gradient(circle at 18% 20%, var(--stone-accent) 0 1px, transparent 1.5px),
      radial-gradient(circle at 78% 72%, var(--color-border-muted, rgba(0, 0, 0, 0.08)) 0 1px, transparent 1.5px);
    background-size: auto, 30px 30px, 38px 38px;
    backdrop-filter: blur(28px) saturate(160%);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.11), inset 0 0 0 1px var(--stone-border), var(--stone-shadow);
  }`;

if (content.includes(oldBlock)) {
    content = content.replace(oldBlock, newBlock);
    fs.writeFileSync(cssPath, content, 'utf8');
    console.log('SUCCESS: CSS updated - stone-surface now uses CSS variables');
} else {
    console.log('FAIL: old .stone-surface block not found, here is what exists:');
    // Show the actual .stone-surface block
    const match = content.match(/\.stone-surface\s*\{[\s\S]*?\}/);
    if (match) {
        console.log(match[0]);
    } else {
        console.log('No .stone-surface block found at all');
    }
}