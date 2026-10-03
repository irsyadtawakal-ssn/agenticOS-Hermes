// Adapted from Star Office UI frontend/index.html, renderGuestAgentsInScene.
// Copyright (c) 2026 Ring Hyacinth & Simon Lee. MIT; see LICENSE and NOTICE.md.
// Original pinned source is preserved in upstream-index.html.
export function createGuestRenderer(game, getMergedVisitors, getAreaPoint) {
    const DEMO_MODE = false;
    const GUEST_AVATARS = [];
    const guestSprites = {};
    const guestTweens = {};
    const guestBubbles = {};
    function getAreaRect() { return {}; }
    function randomPointInRect() { throw new Error('Demo simulation is disabled in Agentic OS'); }
        function renderGuestAgentsInScene() {
            if (!game) return;
            const visitors = getMergedVisitors();
            const seenIds = new Set();
            let idxBreak = 0, idxWrite = 0, idxError = 0;

            visitors.forEach(agent => {
                const id = agent.agentId;
                seenIds.add(id);

                const isDemo = !!agent.isDemo || (DEMO_MODE && (id === 'demo_nika' || id === 'demo_mercury' || agent.name === '尼卡' || agent.name === '水星'));
                const area = agent.area || (agent.state === 'error' ? 'error' : (agent.state === 'idle' ? 'breakroom' : 'writing'));

                const idx = area === 'breakroom' ? idxBreak++ : area === 'error' ? idxError++ : idxWrite++;
                const p = isDemo
                    ? randomPointInRect(getAreaRect(area))
                    : getAreaPoint(area, idx, agent);

                if (!guestSprites[id]) {
                    // 优先用图标：demo visitor 有专门映射
                    let sprite;
                    const isDemoNika = DEMO_MODE && (agent.agentId === 'demo_nika' || agent.name === '尼卡');
                    const isDemoMercury = DEMO_MODE && (agent.agentId === 'demo_mercury' || agent.name === '水星');
                    
                    if (isDemoNika || isDemoMercury) {
                        // 统一使用动态像素角色，避免依赖已删除的 demo 静态图
                        const animKey = 'guest_anim_1';
                        const f = 0;
                        sprite = game.add.sprite(p.x, p.y, animKey, f).setOrigin(0.5, 1).setScale(1.1);
                        if (sprite.anims && sprite.anims.play) sprite.anims.play(animKey, true);
                    } else {
                        // 非 demo 访客：优先用动画精灵（guest_anim_x），其次静态图，兜底星星
                        // 先确定角色索引（1-6）
                        let animIdx = agent.avatar
                            ? parseInt((agent.avatar.match(/_(\d+)$/) || [])[1] || '0', 10)
                            : 0;
                        if (!animIdx || animIdx < 1 || animIdx > 6) {
                            const aid = String(agent.agentId || '');
                            let hash = 0;
                            for (let i = 0; i < aid.length; i++) hash = (hash * 31 + aid.charCodeAt(i)) >>> 0;
                            animIdx = (hash % 6) + 1;
                        }
                        const animKey = `guest_anim_${animIdx}`;
                        const animIdleKey = `guest_anim_${animIdx}_idle`;

                        if (agent.avatar && game.textures.exists(agent.avatar)) {
                            sprite = game.add.sprite(p.x, p.y, agent.avatar, 4).setOrigin(0.5, 1).setScale(2.5);
                        } else if (game.textures.exists(animKey) && game.anims.exists(animIdleKey)) {
                            sprite = game.add.sprite(p.x, p.y, animKey).setOrigin(0.5, 1).setScale(4.0);
                            sprite.anims.play(animIdleKey, true);
                        } else {
                            const staticAvatarKey = agent.avatar && game.textures.exists(agent.avatar)
                                ? agent.avatar
                                : (() => {
                                    const aid = String(agent.agentId || '');
                                    let hash = 0;
                                    for (let i = 0; i < aid.length; i++) hash = (hash * 31 + aid.charCodeAt(i)) >>> 0;
                                    return GUEST_AVATARS[hash % GUEST_AVATARS.length];
                                })();

                            if (staticAvatarKey && game.textures.exists(staticAvatarKey)) {
                                sprite = game.add.image(p.x, p.y, staticAvatarKey).setOrigin(0.5, 1).setScale(1.15);
                            } else {
                                sprite = game.add.text(p.x, p.y, '⭐', { fontFamily: 'ArkPixel, monospace', fontSize: '30px' }).setOrigin(0.5, 1);
                            }
                        }
                    }
                    sprite.setDepth(p.y);
                    if (DEMO_MODE && (agent.agentId === 'demo_mercury' || agent.name === '水星')) {
                        sprite.y = sprite.y + 10;
                    }

                    // demo 水星下移 10px（仅 demo_mercury）
                    const yOffset = (DEMO_MODE && (agent.agentId === 'demo_mercury' || agent.name === '水星')) ? 10 : 0;

                    const nameTextY = isDemo ? ((p.y + yOffset) - 80) : ((p.y + yOffset) - 78);
                    const nameText = game.add.text(p.x, nameTextY, agent.name || '访客', {
                        fontFamily: 'ArkPixel, monospace',
                        fontSize: isDemo ? '16px' : '15px',
                        fill: '#ffffff',
                        stroke: '#000',
                        strokeThickness: 3
                    }).setOrigin(0.5);
                    nameText.setDepth(3000);

                    guestSprites[id] = { sprite, nameText };
                } else {
                    const g = guestSprites[id];
                    const yOffset = (DEMO_MODE && (agent.agentId === 'demo_mercury' || agent.name === '水星')) ? 10 : 0;

                    // demo：平滑移动（避免闪现）；非 demo：保持稳定位置（避免轮询抖动）
                    if (isDemo) {
                        // kill previous tweens for this id
                        if (guestTweens[id] && guestTweens[id].move) {
                            guestTweens[id].move.stop();
                        }
                        if (guestTweens[id] && guestTweens[id].name) {
                            guestTweens[id].name.stop();
                        }

                        const duration = 2000 + Math.floor(Math.random() * 1000); // 2~3s 走路感
                        const ease = 'Sine.easeInOut';

                        const moveTween = game.tweens.add({
                            targets: g.sprite,
                            x: p.x,
                            y: p.y + yOffset,
                            duration,
                            ease
                        });
                        const nameTween = game.tweens.add({
                            targets: g.nameText,
                            x: p.x,
                            y: (p.y + yOffset) - 80,
                            duration,
                            ease
                        });
                        guestTweens[id] = { move: moveTween, name: nameTween };
                    } else {
                        g.sprite.x = p.x;
                        g.sprite.y = p.y + yOffset;
                        g.nameText.x = p.x;
                        g.nameText.y = (p.y + yOffset) - 78;
                    }

                    g.nameText.setText(agent.name || '访客');
                }
            });

            // 删除消失的 agent + 清理其气泡/tween
            Object.keys(guestSprites).forEach(id => {
                if (!seenIds.has(id)) {
                    guestSprites[id].sprite.destroy();
                    guestSprites[id].nameText.destroy();
                    delete guestSprites[id];
                    if (guestBubbles[id]) {
                        guestBubbles[id].destroy();
                        delete guestBubbles[id];
                    }
                    if (guestTweens[id]) {
                        try { guestTweens[id].move && guestTweens[id].move.stop(); } catch(e) {}
                        try { guestTweens[id].name && guestTweens[id].name.stop(); } catch(e) {}
                        delete guestTweens[id];
                    }
                }
            });
        }

    return { render: renderGuestAgentsInScene, sprites: guestSprites };
}