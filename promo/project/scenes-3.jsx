/* scenes-3.jsx — Scenes 6-7: Web Wiki reveal (timeline, map, graph, badges) + finale */

const { useTime, useTimeline, useSprite, Sprite, Easing, interpolate, animate, clamp,
  PHOTOS, REAL, Hairline, Caption } = window;

// =============== SCENE 6A: 58-65s — One photo → a web of wiki pages ====================
function Scene6A_WikiHome() {
  return (
    <Sprite start={58} end={65}>
      {({ localTime, progress }) => {
        const enter = Easing.easeOutCubic(clamp(localTime / 0.5, 0, 1));
        const exit = clamp((localTime - 6.2) / 0.8, 0, 1);
        const overall = enter * (1 - exit);

        // 9:16 portrait — 5 cards arranged: 2 above, 2 below, 1 to the side
        // canvas 1080×1920, center at (540, 960)
        const cards = [
          { kind: 'exhibit',   title: '坐着的女人',     sub: 'Picasso · 1953',        body: '毕加索的成熟期作品。多角度的面孔同时呈现,把"看见"本身打碎重组。',     tag: '展品', x: -260, y: -440, objPos: '50% 50%' },
          { kind: 'person',    title: '巴勃罗·毕加索',  sub: 'Pablo Picasso',         body: '1881–1973,西班牙出生,法国创作。20 世纪最具影响力的艺术家之一。',     tag: '人物', x:  260, y: -440, objPos: '50% 25%' },
          { kind: 'style',     title: '立体主义',       sub: 'Cubism · 1907→',        body: '由毕加索与勃拉克共同开创。打破单点透视,把同一物体的多个视角拼到一起。', tag: '风格', x:  300, y:  500, objPos: '50% 50%' },
          { kind: 'technique', title: '多视点并置',     sub: 'Multi-viewpoint',       body: '正面与侧面同时出现,三维"展平"为二维拼贴,彻底改变了现代绘画的语法。',  tag: '技法', x: -300, y:  500, objPos: '40% 30%' },
          { kind: 'theme',     title: '弗朗索瓦丝',     sub: 'Françoise Gilot',       body: '1953 年前后毕加索的伴侣与缪斯,这幅画完成于他们关系即将结束之时。',    tag: '主题', x:    0, y:  720, objPos: '50% 20%' },
        ];

        const tagColor = { '展品':'#b8924a','人物':'#7a6a92','风格':'#a4604a','技法':'#5e7a5a','主题':'#8a7048' };

        // central photo enters first
        const centerT = clamp(localTime / 0.8, 0, 1);
        const centerScale = interpolate(Easing.easeOutCubic(centerT), 0, 1, 0.6, 1);

        // cards stagger out at 1.0s
        const cardStart = 1.1;
        const cardStagger = 0.18;

        // lines start drawing at 3.6s
        const lineStart = 3.6;

        const cx = 540, cy = 960;

        return (
          <div style={{ position: 'absolute', inset: 0, background: '#f3eee4', opacity: overall, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0,
              background: 'radial-gradient(ellipse at 50% 45%, rgba(216,181,110,0.18), transparent 65%)' }}/>

            {/* header */}
            <div style={{ position: 'absolute', top: 230, left: 0, right: 0, textAlign: 'center' }}>
              <div className="mono" style={{ fontSize: 18, letterSpacing: '0.4em', color: '#b8924a', textTransform: 'uppercase' }}>· MY MUSEUM WIKI ·</div>
              <div className="serif" style={{ fontSize: 56, color: '#1a1612', fontWeight: 400, marginTop: 14, lineHeight: 1.1 }}>
                一次拍摄<br/>生成一张知识网
              </div>
            </div>

            {/* connection lines (SVG) */}
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              {/* center → each card */}
              {cards.map((c, i) => {
                const t = clamp((localTime - lineStart - i * 0.08) / 0.5, 0, 1);
                const x2 = cx + c.x, y2 = cy + c.y;
                return (
                  <line key={`r${i}`} x1={cx} y1={cy} x2={cx + (x2-cx)*t} y2={cy + (y2-cy)*t}
                    stroke="#b8924a" strokeWidth="1.5" strokeDasharray="4 6" opacity={0.55}/>
                );
              })}
              {/* card-to-card connections (knowledge net): exhibit↔person, exhibit↔style, person↔place, style↔technique */}
              {(() => {
                const pairs = [[0,1],[0,2],[1,4],[2,3],[3,0]];
                const t = clamp((localTime - lineStart - 0.9) / 0.7, 0, 1);
                return pairs.map(([a,b], i) => {
                  const A = cards[a], B = cards[b];
                  const x1 = cx + A.x, y1 = cy + A.y, x2 = cx + B.x, y2 = cy + B.y;
                  return (
                    <line key={`p${i}`} x1={x1} y1={y1} x2={x1 + (x2-x1)*t} y2={y1 + (y2-y1)*t}
                      stroke="#b8924a" strokeWidth="1" opacity={0.35}/>
                  );
                });
              })()}
            </svg>

            {/* central photo */}
            <div style={{
              position: 'absolute', left: cx, top: cy,
              transform: `translate(-50%, -50%) scale(${centerScale})`,
              opacity: Easing.easeOutCubic(centerT),
            }}>
              <div style={{
                width: 240, height: 300, background: '#fff', padding: 12,
                boxShadow: '0 16px 40px rgba(26,22,18,0.32)',
                borderRadius: 4,
              }}>
                <img src={REAL.picasso} style={{ width: '100%', height: 220, objectFit: 'cover', borderRadius: 2 }}/>
                <div className="mono" style={{ marginTop: 10, fontSize: 20, letterSpacing: '0.24em', color: '#b8924a', textTransform: 'uppercase' }}>YOUR CAPTURE</div>
                <div className="serif" style={{ fontSize: 18, color: '#1a1612', marginTop: 2 }}>1张照片</div>
              </div>
            </div>

            {/* satellite wiki cards */}
            {cards.map((c, i) => {
              const t = clamp((localTime - cardStart - i * cardStagger) / 0.6, 0, 1);
              const e = Easing.easeOutCubic(t);
              const x = cx + c.x, y = cy + c.y;
              const dx = c.x * (1 - e) * 0.3;
              const dy = c.y * (1 - e) * 0.3;
              return (
                <div key={i} style={{
                  position: 'absolute', left: x, top: y,
                  transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(${0.85 + e * 0.15})`,
                  opacity: e,
                  width: 420, background: '#fff',
                  borderRadius: 5, padding: 18,
                  boxShadow: '0 12px 32px rgba(26,22,18,0.18)',
                  borderTop: `4px solid ${tagColor[c.tag]}`,
                }}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    <img src={REAL.picasso} style={{ width: 80, height: 80, objectFit: 'cover', objectPosition: c.objPos || '50% 50%', borderRadius: 3, flexShrink: 0 }}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="mono" style={{ fontSize: 20, letterSpacing: '0.24em', color: tagColor[c.tag], textTransform: 'uppercase' }}>{c.kind}</div>
                      <div className="serif" style={{ fontSize: 24, color: '#1a1612', marginTop: 3, lineHeight: 1.15 }}>{c.title}</div>
                      <div className="mono" style={{ fontSize: 20, color: 'rgba(26,22,18,0.55)', marginTop: 4 }}>{c.sub}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 14, fontSize: 26, color: 'rgba(26,22,18,0.72)', lineHeight: 1.5, fontFamily: 'serif' }}>
                    {c.body}
                  </div>
                </div>
              );
            })}

            {/* bottom caption removed — five wiki cards already convey the message,
               and the bottom ~200px is YouTube-mobile chrome safe-area. */}
          </div>
        );
      }}
    </Sprite>
  );
}

// =============== SCENE 6B: 65-71s — Timeline ====================
function Scene6B_Timeline() {
  return (
    <Sprite start={64.5} end={71}>
      {({ localTime, progress }) => {
        const enter = Easing.easeOutCubic(clamp(localTime / 0.6, 0, 1));
        const exit = clamp((localTime - 5.7) / 0.8, 0, 1);
        const overall = enter * (1 - exit);

        const periods = [
          { y: '-1400', label: '古埃及',   src: REAL.mummy },
          { y: '-500',  label: '古希腊',   src: REAL.diana },
          { y: '1100',  label: '北宋',     src: REAL.guanyin },
          { y: '1758',  label: '洛可可',   src: REAL.boucher },
          { y: '1880',  label: '印象派',   src: PHOTOS[9] },
          { y: '1953',  label: '立体主义', src: REAL.picasso },
        ];

        const lineP = clamp(localTime / 1.5, 0, 1);

        return (
          <div style={{ position: 'absolute', inset: 0, background: '#0d0a08', opacity: overall, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0,
              background: 'radial-gradient(ellipse at 50% 100%, rgba(216,181,110,0.08), transparent 60%)' }}/>

            <div style={{ position: 'absolute', top: 230, left: 70, color: '#f3eee4' }}>
              <div className="mono" style={{ fontSize: 24, letterSpacing: '0.32em', color: '#d6b56e', textTransform: 'uppercase' }}>VIEW · 01</div>
              <div className="serif" style={{ fontSize: 56, fontWeight: 400, marginTop: 12, lineHeight: 1.1 }}>跨越三千年<br/>的时间轴</div>
            </div>

            {/* vertical timeline */}
            <div style={{
              position: 'absolute', left: '50%', transform: 'translateX(-50%)',
              top: 480, bottom: 240, width: 2,
              background: 'linear-gradient(to bottom, transparent, rgba(216,181,110,0.7) 10%, rgba(216,181,110,0.7) 90%, transparent)',
              transformOrigin: 'top',
              transform: `translateX(-50%) scaleY(${lineP})`,
            }}/>

            {periods.map((p, i) => {
              const t = clamp((localTime - 0.8 - i * 0.25) / 0.6, 0, 1);
              const yPos = 480 + (i * 200);
              const left = i % 2 === 0;
              return (
                <div key={i} style={{
                  position: 'absolute', top: yPos, left: left ? 100 : 'auto', right: left ? 'auto' : 100,
                  display: 'flex', alignItems: 'center', gap: 24,
                  flexDirection: left ? 'row' : 'row-reverse',
                  opacity: Easing.easeOutCubic(t),
                  transform: `translateX(${(1-t)*(left ? -30 : 30)}px)`,
                }}>
                  <div style={{
                    width: 120, height: 150, borderRadius: 4, overflow: 'hidden',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  }}>
                    <img src={p.src} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                  </div>
                  <div style={{ color: '#f3eee4', textAlign: left ? 'left' : 'right' }}>
                    <div className="mono" style={{ fontSize: 22, letterSpacing: '0.25em', color: '#d6b56e' }}>{p.y}</div>
                    <div className="serif" style={{ fontSize: 28, marginTop: 6 }}>{p.label}</div>
                  </div>
                </div>
              );
            })}

            {/* center pulse on line */}
            {periods.map((_, i) => {
              const t = clamp((localTime - 0.8 - i * 0.25) / 0.6, 0, 1);
              return (
                <div key={i} style={{
                  position: 'absolute', left: '50%', top: 480 + i * 200 + 75,
                  width: 14, height: 14, borderRadius: 999,
                  background: '#d6b56e',
                  transform: `translate(-50%, -50%) scale(${t})`,
                  boxShadow: '0 0 16px #d6b56e',
                }}/>
              );
            })}
          </div>
        );
      }}
    </Sprite>
  );
}

// =============== SCENE 6C: 70-76s — World Map ====================
function Scene6C_Map() {
  return (
    <Sprite start={70.5} end={76.5}>
      {({ localTime, progress }) => {
        const enter = Easing.easeOutCubic(clamp(localTime / 0.6, 0, 1));
        const exit = clamp((localTime - 5.2) / 0.8, 0, 1);
        const overall = enter * (1 - exit);

        // dots: china, egypt, greece, italy, france, mexico, peru, japan
        const pins = [
          { x: 0.78, y: 0.42, label: '中国', en: 'CN' },
          { x: 0.55, y: 0.48, label: '埃及', en: 'EG' },
          { x: 0.53, y: 0.42, label: '希腊', en: 'GR' },
          { x: 0.50, y: 0.40, label: '意大利', en: 'IT' },
          { x: 0.48, y: 0.36, label: '法国', en: 'FR' },
          { x: 0.22, y: 0.52, label: '墨西哥', en: 'MX' },
          { x: 0.27, y: 0.62, label: '秘鲁', en: 'PE' },
          { x: 0.85, y: 0.45, label: '日本', en: 'JP' },
        ];

        return (
          <div style={{ position: 'absolute', inset: 0, background: '#0a0805', opacity: overall, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 100, left: 70, color: '#f3eee4' }}>
              <div className="mono" style={{ fontSize: 24, letterSpacing: '0.32em', color: '#d6b56e', textTransform: 'uppercase' }}>VIEW · 02</div>
              <div className="serif" style={{ fontSize: 60, fontWeight: 400, marginTop: 12, lineHeight: 1.1 }}>八个国家<br/>的起源地</div>
            </div>

            {/* dotted world map (simplified) */}
            <svg viewBox="0 0 1080 800" style={{
              position: 'absolute', left: 0, top: 480, width: '100%', height: 800,
              opacity: 0.55,
            }}>
              {(() => {
                const dots = [];
                // sample continent shapes very roughly via dot density bands
                for (let y = 0; y < 80; y++) {
                  for (let x = 0; x < 108; x++) {
                    const px = x * 10 + 5;
                    const py = y * 10 + 5;
                    const nx = px / 1080;
                    const ny = py / 800;
                    // rough land mask
                    const land = (
                      (nx > 0.16 && nx < 0.34 && ny > 0.18 && ny < 0.78 && Math.sin(nx*40+ny*8) > -0.4) ||
                      (nx > 0.42 && nx < 0.56 && ny > 0.18 && ny < 0.62 && Math.sin(nx*30+ny*10) > -0.2) ||
                      (nx > 0.56 && nx < 0.92 && ny > 0.16 && ny < 0.7 && Math.sin(nx*22+ny*12) > -0.3)
                    );
                    if (land) {
                      dots.push(<circle key={`${x}-${y}`} cx={px} cy={py} r={1.4} fill="#d6b56e"/>);
                    }
                  }
                }
                return dots;
              })()}
            </svg>

            {/* pins */}
            {pins.map((p, i) => {
              const t = clamp((localTime - 1 - i * 0.18) / 0.5, 0, 1);
              const x = p.x * 1080;
              const y = 480 + p.y * 800;
              return (
                <div key={i} style={{ position: 'absolute', left: x, top: y, transform: 'translate(-50%, -50%)' }}>
                  {/* pulse ring */}
                  <div style={{
                    position: 'absolute', left: '50%', top: '50%',
                    width: 60, height: 60, borderRadius: 999,
                    border: '1.5px solid #d6b56e',
                    transform: `translate(-50%, -50%) scale(${0.4 + (Math.sin(localTime * 3 + i) * 0.5 + 0.5)})`,
                    opacity: t * (1 - (Math.sin(localTime * 3 + i) * 0.5 + 0.5)) * 0.8,
                  }}/>
                  <div style={{
                    width: 14, height: 14, borderRadius: 999,
                    background: '#d6b56e', boxShadow: '0 0 16px #d6b56e',
                    transform: `scale(${Easing.easeOutBack(t)})`,
                  }}/>
                  <div className="mono" style={{
                    position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
                    color: '#f3eee4', fontSize: 20, letterSpacing: '0.25em',
                    whiteSpace: 'nowrap', opacity: t,
                  }}>{p.en} · {p.label}</div>
                </div>
              );
            })}

            {/* arc lines (subtle) */}
            <svg style={{ position: 'absolute', left: 0, top: 480, width: 1080, height: 800, pointerEvents: 'none' }}>
              {pins.slice(0, 6).map((p, i) => {
                const next = pins[(i+1) % pins.length];
                const t = clamp((localTime - 2.5) / 2, 0, 1);
                const x1 = p.x * 1080, y1 = p.y * 800;
                const x2 = next.x * 1080, y2 = next.y * 800;
                const cx = (x1+x2)/2, cy = Math.min(y1,y2) - 80;
                return (
                  <path key={i}
                    d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
                    fill="none" stroke="#d6b56e" strokeWidth="1"
                    strokeDasharray="4 6"
                    opacity={t * 0.45}
                    pathLength="1"
                    strokeDashoffset={1 - t}
                  />
                );
              })}
            </svg>
          </div>
        );
      }}
    </Sprite>
  );
}

// =============== SCENE 6D: 76-82s — Knowledge bubble chart (d3.pack) + badges ===========
const BUBBLE_DATA_ZH = {
  name: 'root',
  children: [
    { name: '立体主义', group: 'concept',   value: 100 },
    { name: '毕加索',   group: 'pioneer',   value: 62  },
    { name: '勃拉克',   group: 'pioneer',   value: 55  },
    { name: 'Met',      group: 'museum',    value: 48  },
    { name: '非洲面具', group: 'influence', value: 40  },
    { name: '塞尚',     group: 'influence', value: 36  },
    { name: '多视点',   group: 'method',    value: 32  },
    { name: '蒙德里安', group: 'legacy',    value: 24  },
    { name: '抽象主义', group: 'legacy',    value: 22  },
  ],
};
const BUBBLE_GROUPS_ZH = {
  concept:   { fill: '#d6b56e',                stroke: 'none',    text: '#1a1612', sub: 'rgba(26,22,18,0.55)',    label: 'CONCEPT'   },
  pioneer:   { fill: 'rgba(232,200,137,0.18)', stroke: '#e8c889', text: '#e8c889', sub: 'rgba(232,200,137,0.55)', label: 'PIONEER'   },
  influence: { fill: 'rgba(243,238,228,0.08)', stroke: '#f3eee4', text: '#f3eee4', sub: 'rgba(243,238,228,0.5)',  label: 'INFLUENCE' },
  museum:    { fill: 'rgba(202,167,105,0.18)', stroke: '#caa769', text: '#caa769', sub: 'rgba(202,167,105,0.6)',  label: 'MUSEUM'    },
  method:    { fill: 'rgba(184,146,74,0.18)',  stroke: '#b8924a', text: '#b8924a', sub: 'rgba(184,146,74,0.65)',  label: 'METHOD'    },
  legacy:    { fill: 'rgba(138,111,61,0.18)',  stroke: '#8a6f3d', text: '#cba36a', sub: 'rgba(203,163,106,0.6)',  label: 'LEGACY'    },
};
const BUBBLE_PACK_ZH = (() => {
  const w = 900, h = 800;
  const pack = window.d3.pack().size([w, h]).padding(14);
  const root = pack(window.d3.hierarchy(BUBBLE_DATA_ZH).sum(d => d.value));
  return { w, h, leaves: root.leaves() };
})();

function Scene6D_Graph() {
  return (
    <Sprite start={70.5} end={79}>
      {({ localTime }) => {
        const enter = Easing.easeOutCubic(clamp(localTime / 0.6, 0, 1));
        const exit = clamp((localTime - 7.7) / 0.8, 0, 1);
        const overall = enter * (1 - exit);

        const { w, h, leaves } = BUBBLE_PACK_ZH;
        const cx = 540, cy = 1080;
        const x0 = cx - w / 2, y0 = cy - h / 2;

        return (
          <div style={{ position: 'absolute', inset: 0, background: '#0d0a08', opacity: overall, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 230, left: 70, color: '#f3eee4' }}>
              <div className="mono" style={{ fontSize: 24, letterSpacing: '0.32em', color: '#d6b56e', textTransform: 'uppercase' }}>VIEW · 02</div>
              <div className="serif" style={{ fontSize: 56, fontWeight: 400, marginTop: 12, lineHeight: 1.1 }}>知识开始<br/>互相连接</div>
            </div>

            <svg style={{ position: 'absolute', left: x0, top: y0, width: w, height: h, overflow: 'visible' }}>
              {leaves.map((d, i) => {
                const t = clamp((localTime - 0.4 - i * 0.10) / 0.55, 0, 1);
                const eased = Easing.easeOutBack(t);
                const g = BUBBLE_GROUPS_ZH[d.data.group] || BUBBLE_GROUPS_ZH.influence;
                const isConcept = d.data.group === 'concept';
                const showSub = d.r > 48;
                return (
                  <g key={i} transform={`translate(${d.x},${d.y}) scale(${eased})`} opacity={t}>
                    <circle r={d.r}
                      fill={g.fill}
                      stroke={isConcept ? 'none' : g.stroke}
                      strokeWidth={isConcept ? 0 : 1.5}
                      style={isConcept ? { filter: 'drop-shadow(0 0 28px rgba(216,181,110,0.55))' } : undefined} />
                    {d.r > 26 && (
                      <text y={showSub ? -8 : 0} textAnchor="middle" dominantBaseline="central"
                        fill={g.text}
                        style={{ fontFamily: '"Noto Serif SC", serif', fontSize: Math.min(d.r * 0.42, 32), fontWeight: 600 }}>
                        {d.data.name}
                      </text>
                    )}
                    {showSub && (
                      <text y={Math.max(18, d.r * 0.34)} textAnchor="middle" dominantBaseline="central"
                        fill={g.sub}
                        style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: Math.min(d.r * 0.18, 13), letterSpacing: '0.28em' }}>
                        {g.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* badges row at bottom (safe area for YT mobile) */}
            <div style={{ position: 'absolute', bottom: 200, left: 0, right: 0, textAlign: 'center' }}>
              <div className="mono" style={{ fontSize: 22, color: '#d6b56e', letterSpacing: '0.32em', marginBottom: 24, opacity: clamp((localTime - 3) / 1, 0, 1) }}>BADGES · 已解锁</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 40 }}>
                {[
                  { icon: '◈', name: '青铜猎人' },
                  { icon: '✺', name: '色彩侦探' },
                  { icon: '◉', name: '小小考古' },
                  { icon: '✦', name: '神话学徒' },
                ].map((b, i) => {
                  const t = clamp((localTime - 3.2 - i * 0.2) / 0.5, 0, 1);
                  return (
                    <div key={i} style={{
                      opacity: Easing.easeOutBack(t),
                      transform: `scale(${Easing.easeOutBack(t)})`,
                      textAlign: 'center', color: '#f3eee4',
                    }}>
                      <div style={{
                        width: 64, height: 64, borderRadius: 999,
                        border: '1.5px solid #d6b56e', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontSize: 28, color: '#d6b56e',
                        margin: '0 auto 10px',
                      }}>{b.icon}</div>
                      <div className="serif" style={{ fontSize: 24 }}>{b.name}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      }}
    </Sprite>
  );
}

// =============== SCENE 7: 82-90s — Logo finale ====================
function Scene7_Finale() {
  return (
    <Sprite start={78.5} end={90}>
      {({ localTime, progress }) => {
        const enter = Easing.easeOutCubic(clamp(localTime / 1.2, 0, 1));
        const titleP = clamp((localTime - 0.8) / 1.2, 0, 1);
        const sloP = clamp((localTime - 2.2) / 1.5, 0, 1);
        const enP = clamp((localTime - 3.5) / 1.2, 0, 1);

        return (
          <div style={{ position: 'absolute', inset: 0, background: '#0a0805', opacity: enter, overflow: 'hidden' }}>
            {/* radial light */}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'radial-gradient(ellipse at 50% 50%, rgba(216,181,110,0.18), transparent 50%)',
            }}/>

            {/* logo mark */}
            <div style={{
              position: 'absolute', left: '50%', top: '38%',
              transform: `translate(-50%, -50%) scale(${Easing.easeOutBack(titleP)})`,
              opacity: titleP,
              textAlign: 'center',
            }}>
              {/* simple geometric mark — open book / column */}
              <svg width="120" height="120" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="56" fill="none" stroke="#d6b56e" strokeWidth="1.5"/>
                <rect x="42" y="34" width="4" height="52" fill="#d6b56e"/>
                <rect x="74" y="34" width="4" height="52" fill="#d6b56e"/>
                <rect x="36" y="30" width="48" height="4" fill="#d6b56e"/>
                <rect x="36" y="86" width="48" height="4" fill="#d6b56e"/>
              </svg>
            </div>

            <div style={{
              position: 'absolute', left: '50%', top: '54%',
              transform: `translate(-50%, -50%) translateY(${(1-titleP)*16}px)`,
              opacity: titleP, textAlign: 'center', width: '100%',
            }}>
              <div className="mono" style={{
                fontSize: 24, color: '#d6b56e', letterSpacing: '0.45em',
                textTransform: 'uppercase', marginBottom: 16,
              }}>MY · MUSEUM · WIKI</div>
              <div className="serif" style={{
                fontSize: 96, color: '#f3eee4', fontWeight: 400, lineHeight: 1.05,
                letterSpacing: '0.02em',
              }}>我的<span style={{color:'#d6b56e'}}>·</span>博物馆</div>
            </div>

            <div style={{
              position: 'absolute', left: '50%', top: '70%',
              transform: `translate(-50%, -50%) translateY(${(1-sloP)*12}px)`,
              opacity: sloP, textAlign: 'center', width: '90%',
            }}>
              <div style={{ width: 80, height: 1, background: '#d6b56e', margin: '0 auto 32px' }}/>
              <div className="serif" style={{
                fontSize: 36, color: '#f3eee4', fontWeight: 400, lineHeight: 1.3,
                fontStyle: 'italic',
              }}>每一次驻足,都成为一页知识。</div>
            </div>

            <div style={{
              position: 'absolute', left: '50%', bottom: 340,
              transform: `translateX(-50%) translateY(${(1-enP)*12}px)`,
              opacity: enP * 0.75, textAlign: 'center', width: '100%',
            }}>
              <div className="mono" style={{
                fontSize: 24, color: '#f3eee4', letterSpacing: '0.32em',
                textTransform: 'uppercase', lineHeight: 1.6,
              }}>Turn every museum visit<br/>into a personal learning wiki</div>
            </div>

            <div style={{
              position: 'absolute', bottom: 240, left: 0, right: 0, textAlign: 'center',
              opacity: enP * 0.5,
            }}>
              <div className="mono" style={{ fontSize: 22, color: '#d6b56e', letterSpacing: '0.4em' }}>museiq.com</div>
            </div>
          </div>
        );
      }}
    </Sprite>
  );
}

Object.assign(window, { Scene6A_WikiHome, Scene6B_Timeline, Scene6C_Map, Scene6D_Graph, Scene7_Finale });
