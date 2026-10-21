/* ==========================================================================
 * 龙裔王座 · Dragonblood Throne
 * audio.js — WebAudio 程序化音效（无外部音频文件）
 * ========================================================================== */
(function (root) {
  'use strict';

  let ctx = null;
  let master = null;
  let enabled = true;
  let last = {};

  function ensure() {
    if (typeof window === 'undefined') return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function now() { return ctx ? ctx.currentTime : 0; }

  function tone(opts) {
    if (!enabled || !ensure()) return;
    const t0 = now() + (opts.delay || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(opts.freq || 440, t0);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t0 + (opts.dur || 0.2));
    const vol = (opts.vol == null ? 0.2 : opts.vol);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + (opts.dur || 0.2));
    osc.connect(gain); gain.connect(master);
    osc.start(t0); osc.stop(t0 + (opts.dur || 0.2) + 0.03);
  }

  let noiseBuffer = null;
  function getNoise() {
    if (!noiseBuffer) {
      const len = Math.floor(ctx.sampleRate * 1.2);
      noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return noiseBuffer;
  }

  function noise(opts) {
    if (!enabled || !ensure()) return;
    const t0 = now() + (opts.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = getNoise();
    const filter = ctx.createBiquadFilter();
    filter.type = opts.filterType || 'bandpass';
    filter.frequency.setValueAtTime(opts.freq || 900, t0);
    if (opts.to) filter.frequency.exponentialRampToValueAtTime(Math.max(40, opts.to), t0 + (opts.dur || 0.2));
    filter.Q.value = opts.q || 1;
    const gain = ctx.createGain();
    const vol = (opts.vol == null ? 0.18 : opts.vol);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + (opts.dur || 0.2));
    src.connect(filter); filter.connect(gain); gain.connect(master);
    src.start(t0); src.stop(t0 + (opts.dur || 0.2) + 0.05);
  }

  function throttle(key, ms) {
    const t = Date.now();
    if (last[key] && t - last[key] < ms) return false;
    last[key] = t;
    return true;
  }

  const SFX = {
    click() { if (throttle('click', 40)) tone({ freq: 620, to: 460, dur: 0.06, type: 'triangle', vol: 0.1 }); },
    select() { tone({ freq: 440, to: 660, dur: 0.09, type: 'sine', vol: 0.12 }); },
    error() {
      tone({ freq: 220, to: 150, dur: 0.16, type: 'square', vol: 0.08 });
      tone({ freq: 180, to: 120, dur: 0.16, type: 'square', vol: 0.07, delay: 0.1 });
    },
    draw() { tone({ freq: 900, to: 1200, dur: 0.08, type: 'triangle', vol: 0.08 }); },
    deploy() {
      tone({ freq: 150, to: 50, dur: 0.32, type: 'sine', vol: 0.34 });
      noise({ freq: 500, to: 120, dur: 0.28, vol: 0.12, filterType: 'lowpass' });
    },
    attack() {
      noise({ freq: 2400, to: 400, dur: 0.2, vol: 0.2, q: 0.8 });
      tone({ freq: 320, to: 90, dur: 0.14, type: 'sawtooth', vol: 0.1 });
    },
    windup() {
      noise({ freq: 220, to: 1200, dur: 0.5, vol: 0.09, q: 1.1 });
      tone({ freq: 150, to: 430, dur: 0.55, type: 'sawtooth', vol: 0.07 });
    },
    damage() {
      noise({ freq: 700, to: 180, dur: 0.12, vol: 0.14, filterType: 'lowpass' });
      tone({ freq: 140, to: 70, dur: 0.14, type: 'square', vol: 0.08 });
    },
    death() {
      tone({ freq: 240, to: 50, dur: 0.5, type: 'sawtooth', vol: 0.14 });
      noise({ freq: 900, to: 100, dur: 0.5, vol: 0.12, filterType: 'lowpass' });
    },
    heal() {
      tone({ freq: 620, to: 940, dur: 0.24, type: 'sine', vol: 0.12 });
      tone({ freq: 930, to: 1240, dur: 0.22, type: 'sine', vol: 0.07, delay: 0.08 });
    },
    buff() {
      tone({ freq: 520, to: 780, dur: 0.16, type: 'triangle', vol: 0.1 });
      tone({ freq: 780, to: 1040, dur: 0.18, type: 'triangle', vol: 0.08, delay: 0.09 });
    },
    freeze() {
      tone({ freq: 1500, to: 800, dur: 0.3, type: 'sine', vol: 0.1 });
      noise({ freq: 4000, to: 1800, dur: 0.3, vol: 0.06, filterType: 'highpass' });
    },
    burn() {
      noise({ freq: 1200, to: 300, dur: 0.25, vol: 0.1, q: 1.4 });
    },
    equip() {
      noise({ freq: 2600, to: 1400, dur: 0.12, vol: 0.12, filterType: 'highpass' });
      tone({ freq: 880, dur: 0.07, type: 'triangle', vol: 0.08 });
    },
    turn() {
      tone({ freq: 330, dur: 0.5, type: 'sine', vol: 0.08 });
      tone({ freq: 494, dur: 0.5, type: 'sine', vol: 0.06, delay: 0.06 });
    },
    win() {
      [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.5, type: 'triangle', vol: 0.14, delay: i * 0.14 }));
    },
    lose() {
      [392, 330, 262, 196].forEach((f, i) => tone({ freq: f, dur: 0.6, type: 'sine', vol: 0.13, delay: i * 0.16 }));
    },
    surrender() {
      tone({ freq: 300, to: 120, dur: 0.6, type: 'sawtooth', vol: 0.1 });
    }
  };

  function play(name) {
    if (!enabled) return;
    const fn = SFX[name];
    if (fn) { try { fn(); } catch (e) { /* 忽略音频错误 */ } }
  }

  function setEnabled(v) {
    enabled = !!v;
    if (enabled) { try { ensure(); } catch (e) { /* 浏览器不支持音频时静默失败 */ } }
  }
  function isEnabled() { return enabled; }

  root.DBAudio = { play, setEnabled, isEnabled, ensure };
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.DBAudio;
