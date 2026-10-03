// Runs after the complete upstream frontend. Only connects its controls to AOS.
(() => {
  const fit = document.createElement('style');
  fit.textContent = '@media (min-width:901px) and (max-width:1320px){#main-stage,#bottom-panels{width:100vw}#game-container{width:100vw;height:56.25vw}#bottom-panels{gap:12px;padding:0 8px}#memo-panel,#control-bar,#guest-agent-panel{flex:1;min-width:0;width:auto}}';
  document.head.append(fit);
  for (const language of Object.values(I18N)) {
    language.authDefaultPassHint = 'Use editor_password from D:/agentic-os/star-office/editor-credentials.json';
  }
  const allowedOrigins = new Set(['http://127.0.0.1:5173', 'http://127.0.0.1:7400']);
  const parentOrigin = (() => { try { return new URL(document.referrer).origin; } catch { return ''; } })();
  function chat(profile) {
    if (window.parent !== window && allowedOrigins.has(parentOrigin)) {
      window.parent.postMessage({ type: 'aos:star-office:chat', profile }, parentOrigin);
    }
  }
  function clickable(sprite, profile) {
    if (!sprite || sprite.__aosChat) return;
    sprite.__aosChat = true;
    sprite.setInteractive({ useHandCursor: true });
    sprite.on('pointerdown', () => chat(profile));
  }
  const nativeRender = renderGuestAgentsInScene;
  const nativeAreaPoint = getAreaPoint;
  getAreaPoint = function (area, index) {
    // Upstream has eight slots; the imported roster has nine guests.
    if (index === 8) return area === 'writing' ? { x: 450, y: 670 }
      : area === 'error' ? { x: 1130, y: 365 } : { x: 830, y: 440 };
    return nativeAreaPoint(area, index);
  };
  renderGuestAgentsInScene = function () {
    nativeRender();
    for (const [profile, view] of Object.entries(guestSprites)) {
      const agent = guestAgents.find(a => a.agentId === profile);
      clickable(view.sprite, profile);
      clickable(view.nameText, profile);
      if (agent && view.sprite) view.sprite.setAlpha(agent.aosStatus === 'Offline' ? 0.4 : 1);
      if (agent && view.nameText) {
        view.nameText.setText(profile);
        view.nameText.setFontSize(12);
        view.nameText.setAlpha(agent.aosStatus === 'Offline' ? 0.55 : 1);
      }
    }
  };
  const nativeList = renderGuestAgentList;
  renderGuestAgentList = function () {
    nativeList();
    document.querySelectorAll('.guest-agent-item').forEach(row => {
      const profile = row.dataset.name;
      const agent = guestAgents.find(a => a.agentId === profile);
      if (!agent) return;
      const buttons = row.querySelector('.guest-agent-buttons');
      if (buttons) {
        buttons.replaceChildren();
        const button = document.createElement('button');
        button.textContent = 'Chat';
        button.onclick = () => chat(profile);
        buttons.append(button);
      }
      const subtitle = row.querySelector('.guest-agent-name')?.nextElementSibling;
      if (subtitle) subtitle.textContent = agent.aosStatus;
    });
  };
  document.querySelectorAll('button[onclick*="setState("]').forEach(button => {
    button.disabled = true;
    button.title = 'Live status comes from Agentic OS / Hermes';
  });
  const notice = document.createElement('div');
  notice.textContent = 'Agentic OS · Live Hermes status · Click a character to chat';
  notice.style.cssText = 'color:#cbd5e1;text-align:center;font:12px monospace;padding:10px';
  document.body.prepend(notice);
  if (allowedOrigins.has(parentOrigin)) window.parent.postMessage({ type: 'aos:star-office:ready' }, parentOrigin);
  setInterval(() => {
    const chief = guestAgents.find(agent => agent.isMain);
    if (typeof star !== 'undefined') {
      clickable(star, 'chief');
      if (star && chief) star.setAlpha(chief.aosStatus === 'Offline' ? 0.4 : 1);
    }
    clickable(window.starWorking, 'chief');
    if (typeof syncAnimSprite !== 'undefined') clickable(syncAnimSprite, 'chief');
  }, 700);
})();
