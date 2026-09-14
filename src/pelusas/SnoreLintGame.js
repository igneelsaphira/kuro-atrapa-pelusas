import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, Image, useWindowDimensions } from 'react-native';

const ROOM = require('../../assets/kuro/sillon-sala.png');
const KURO_STRIP = require('../../assets/kuro/kuro-snore-nocushion.png');
const PELUSA_STRIP = require('../../assets/kuro/pelusa-sprite.png');
const PLANT_FRONT = require('../../assets/kuro/plant-front.png');
// Caja de la planta derecha (fracción de imagen): capa de frente + escondite.
const PLANT_BOX = { x0: 0.79, x1: 0.96, y0: 0.13, y1: 0.78 };
// Caja de la lámpara (fracción de imagen): capa de frente + escondite.
const LAMP_BOX = { x0: 0.09, x1: 0.27, y0: 0.45, y1: 0.88 };

const KURO_FW = 543; const KURO_FH = 724; const KURO_FRAMES = 4;
const PEL_FW = 887; const PEL_FH = 887;
const TOTAL = 12; const START_COUNT = 8; const SNORE_MS = 7000;
const IMG_W = 1536; const IMG_H = 1024;
// Image fractions (0-1 over the background art) so Kuro + fuzz sit on the
// couch on any screen: cover-fit crops differently per aspect ratio.
const KURO_FX = 0.48; const KURO_FY = 0.49; // centro del sprite; panza apoyada en el asiento
const KURO_W_IMG = 0.156; // ancho de Kuro en fracción de imagen
const ZONE_F = { x0: 0.30, x1: 0.70, y0: 0.50, y1: 0.60 };
// Roam: toda la sala visible menos la librería (izquierda).
const ROAM_F = { x0: 0.16, x1: 1.0, y0: 0.42, y1: 0.95 };

// Map background-image fractions to screen pixels under resizeMode="cover".
function imgToScreen(fx, fy, size) {
  const scale = Math.max(size.width / IMG_W, size.height / IMG_H);
  const dw = IMG_W * scale; const dh = IMG_H * scale;
  const ox = (size.width - dw) / 2; const oy = (size.height - dh) / 2;
  return { x: ox + fx * dw, y: oy + fy * dh };
}
// Map screen pixels back to background-image fractions.
function screenToImg(x, y, size) {
  const scale = Math.max(size.width / IMG_W, size.height / IMG_H);
  const dw = IMG_W * scale; const dh = IMG_H * scale;
  const ox = (size.width - dw) / 2; const oy = (size.height - dh) / 2;
  return { fx: (x - ox) / dw, fy: (y - oy) / dh };
}
function inBoxPx(x, y, size, B) {
  const { fx, fy } = screenToImg(x, y, size);
  return fx >= B.x0 && fx <= B.x1 && fy >= B.y0 && fy <= B.y1;
}
function inBehindPx(x, y, size) {
  return inBoxPx(x, y, size, PLANT_BOX) || inBoxPx(x, y, size, LAMP_BOX);
}
function visibleRange(size) {
  const scale = Math.max(size.width / IMG_W, size.height / IMG_H);
  const dw = IMG_W * scale; const dh = IMG_H * scale;
  const ox = (size.width - dw) / 2; const oy = (size.height - dh) / 2;
  return { x0: -ox / dw, x1: (size.width - ox) / dw, y0: -oy / dh, y1: (size.height - oy) / dh };
}
const PIXELS = Platform.OS === 'web' ? { imageRendering: 'pixelated' } : {};

let nextId = 1;
function spawnPelusa(zone) {
  return {
    id: nextId++,
    x: zone.x0 + Math.random() * (zone.x1 - zone.x0),
    y: zone.y0 + Math.random() * (zone.y1 - zone.y0),
    vx: (Math.random() - 0.5) * 0.25,
    vy: 0,
    hopT: Math.random() * 2,
    state: 'idle', // idle | giggle | poof
    stateT: 0,
  };
}

export default function SnoreLintGame({ onComplete }) {
  const { width: ww, height: wh } = useWindowDimensions();
  const [size, setSize] = useState({ width: ww, height: wh });
  const [started, setStarted] = useState(false);
  const [caught, setCaught] = useState(0);
  const [spawned, setSpawned] = useState(0);
  const [pelusas, setPelusas] = useState([]);
  const [sparks, setSparks] = useState([]);
  const [snoreFrame, setSnoreFrame] = useState(0);
  const [zzz, setZzz] = useState([]);
  const [won, setWon] = useState(false);
  const pointer = useRef(null);
  const stateRef = useRef({ pelusas: [], sparks: [], zzz: [], caught: 0, spawned: 0, started: false, won: false, size: { width: ww, height: wh } });
  const [, force] = useState(0);

  // Couch zone in screen fractions, derived from the background art so it
  // lands on the couch whether the screen is portrait or landscape.
  const rectOf = (sz, F) => {
    const a = imgToScreen(F.x0, F.y0, sz);
    const b = imgToScreen(F.x1, F.y1, sz);
    const cl = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    return {
      x0: cl(a.x / sz.width, 0.02, 0.98), y0: cl(a.y / sz.height, 0.05, 0.95),
      x1: cl(b.x / sz.width, 0.02, 0.98), y1: cl(b.y / sz.height, 0.05, 0.95),
    };
  };
  const here = stateRef.current.size.width ? stateRef.current.size : { width: ww, height: wh };
  const roam = rectOf(here, ROAM_F);
  const kuroPos = imgToScreen(KURO_FX, KURO_FY, here);

  const start = useCallback(() => {
    nextId = 1;
    const list = [];
    for (let i = 0; i < START_COUNT; i++) list.push(spawnPelusa(roam));
    stateRef.current = { ...stateRef.current, pelusas: list, sparks: [], zzz: [], caught: 0, spawned: START_COUNT, started: true, won: false };
    setPelusas(list); setSparks([]); setZzz([]); setCaught(0); setSpawned(START_COUNT); setWon(false); setStarted(true);
  }, []);

  // breathing frames
  useEffect(() => {
    if (!started) return undefined;
    const t = setInterval(() => setSnoreFrame((f) => (f + 1) % KURO_FRAMES), 900);
    return () => clearInterval(t);
  }, [started]);

  // snore spawner
  useEffect(() => {
    if (!started || won) return undefined;
    const t = setInterval(() => {
      const s = stateRef.current;
      setZzz((z) => [...z.slice(-2), { id: Date.now(), born: Date.now() }]);
      if (s.spawned < TOTAL) {
        const p = spawnPelusa(rectOf(s.size, ROAM_F));
        s.pelusas = [...s.pelusas, p];
        s.spawned += 1;
        setPelusas(s.pelusas); setSpawned(s.spawned);
      }
    }, SNORE_MS);
    return () => clearInterval(t);
  }, [started, won]);

  // main loop ~30fps
  useEffect(() => {
    if (!started || won) return undefined;
    let raf; let last = 0;
    const step = (now) => {
      raf = requestAnimationFrame(step);
      if (now - last < 33) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const s = stateRef.current;
      const W = s.size.width; const H = s.size.height;
      const zn = rectOf(s.size, ROAM_F);
      const px = pointer.current;
      let changed = false; let caughtNow = 0;
      const next = [];
      for (const p of s.pelusas) {
        if (p.state === 'poof') { changed = true; continue; }
        if (p.state === 'giggle') {
          p.stateT -= dt;
          if (p.stateT <= 0) {
            p.state = 'poof';
            for (let i = 0; i < 8; i++) {
              s.sparks.push({ id: Date.now() + Math.random(), x: p.x, y: p.y, vx: (Math.random() - 0.5) * 0.5, vy: -Math.random() * 0.4, life: 0.7 });
            }
            caughtNow += 1;
          }
          changed = true; next.push(p); continue;
        }
        // idle physics (fractions/sec)
        p.hopT -= dt;
        if (p.hopT <= 0) {
          p.vy = -(0.25 + Math.random() * 0.3);
          p.vx = (Math.random() - 0.5) * 0.4;
          p.hopT = 0.8 + Math.random() * 2;
        }
        // flee from finger
        if (px) {
          const dx = p.x * W - px.x; const dy = p.y * H - px.y;
          const d = Math.hypot(dx, dy);
          if (d < 110 && d > 1) {
            p.vx += (dx / d) * dt * 1.2;
            p.vy += (dy / d) * dt * 0.9 - dt * 0.4;
          }
          if (d < 36 && !inBehindPx(p.x * W, p.y * H, s.size)) {
            p.state = 'giggle'; p.stateT = 0.25; changed = true; next.push(p); continue;
          }
        }
        p.vy += dt * 1.6; // gravity
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.x < zn.x0) { p.x = zn.x0; p.vx = Math.abs(p.vx); }
        if (p.x > zn.x1) { p.x = zn.x1; p.vx = -Math.abs(p.vx); }
        if (p.y > zn.y1) { p.y = zn.y1; p.vy = -(0.2 + Math.random() * 0.25); }
        if (p.y < zn.y0 - 0.12) { p.y = zn.y0 - 0.12; p.vy = 0; }
        changed = true; next.push(p);
      }
      // sparks decay
      if (s.sparks.length) {
        s.sparks = s.sparks.map((sp) => ({ ...sp, x: sp.x + sp.vx * dt, y: sp.y + sp.vy * dt, life: sp.life - dt })).filter((sp) => sp.life > 0);
        changed = true;
      }
      if (caughtNow) {
        s.caught += caughtNow;
        setCaught(s.caught);
        if (s.caught >= TOTAL) {
          s.won = true; setWon(true);
          setPelusas(next); setSparks([...s.sparks]); force((v) => v + 1);
          return;
        }
      }
      if (changed) { s.pelusas = next; setPelusas([...next]); setSparks([...s.sparks]); }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [started, won]);

  const onTouch = useCallback((evt) => {
    const { locationX, locationY } = evt.nativeEvent;
    pointer.current = { x: locationX, y: locationY };
    const s = stateRef.current;
    s.sparks = [...s.sparks.slice(-24), { id: Date.now() + Math.random(), x: locationX / s.size.width, y: locationY / s.size.height, vx: (Math.random() - 0.5) * 0.1, vy: -0.08, life: 0.5 }];
  }, []);

  const kuroWScreen = (() => {
    const sz = stateRef.current.size.width ? stateRef.current.size : { width: ww, height: wh };
    const scale = Math.max(sz.width / IMG_W, sz.height / IMG_H);
    return Math.min(sz.width * 0.55, KURO_W_IMG * IMG_W * scale);
  })();
  const kuroW = kuroWScreen;
  const kuroH = kuroW * (KURO_FH / KURO_FW);
  const pel = Math.max(40, Math.min(60, size.width * 0.14));
  // Exact cover rect so JS mapping matches painted pixels on every screen.
  const bgScale = Math.max(size.width / IMG_W, size.height / IMG_H);
  const bgW = IMG_W * bgScale; const bgH = IMG_H * bgScale;
  const bgX = (size.width - bgW) / 2; const bgY = (size.height - bgH) / 2;
  const roamS = rectOf(size, ROAM_F);
  // Plant foreground rect (bottom-aligned so the pot sits on the floor).
  const plantA = imgToScreen(PLANT_BOX.x0, PLANT_BOX.y0, size);
  const plantB = imgToScreen(PLANT_BOX.x1, PLANT_BOX.y1, size);
  const plantW = Math.max(1, plantB.x - plantA.x);
  const plantH = plantW * (1536 / 1024);
  const plantL = plantA.x;
  const plantT = plantB.y - plantH;

  return (
    <View
      testID="pelusa-viewport"
      style={styles.viewport}
      onLayout={({ nativeEvent: { layout } }) => {
        if (layout.width > 0 && layout.height > 0) {
          stateRef.current.size = { width: layout.width, height: layout.height };
          setSize({ width: layout.width, height: layout.height });
        }
      }}
      onStartShouldSetResponder={() => started && !won}
      onMoveShouldSetResponder={() => started && !won}
      onResponderGrant={onTouch}
      onResponderMove={onTouch}
      onResponderRelease={() => { pointer.current = null; }}
    >
      <Image source={ROOM} resizeMode="stretch" style={[{ position: 'absolute', left: bgX, top: bgY, width: bgW, height: bgH }, PIXELS]} />
      {/* Kuro snoring on couch */}
      <View style={[styles.kuroFrame, { width: kuroW, height: kuroH, left: kuroPos.x - kuroW / 2, top: kuroPos.y - kuroH / 2 }]}>
        <Image source={KURO_STRIP} resizeMode="stretch" style={[PIXELS, { width: kuroW * KURO_FRAMES, height: kuroH, left: -snoreFrame * kuroW }]} />
      </View>
      {zzz.slice(-3).map((z, i) => (
        <Text key={z.id} style={[styles.zzz, { left: kuroPos.x + 50, top: kuroPos.y - 130 - i * 26 }]}>z</Text>
      ))}
      {/* pelusas */}
      {pelusas.filter((p) => p.state !== 'poof' && !inBehindPx(p.x * size.width, p.y * size.height, size)).map((p) => {
        const t = Math.min(1, Math.max(0, (p.y - roamS.y0) / Math.max(0.01, roamS.y1 - roamS.y0)));
        const ps = pel * (0.7 + 0.5 * t);
        const po = 0.75 + 0.15 * t;
        return (
        <View key={p.id} style={[styles.pelFrame, { width: ps, height: ps, left: p.x * size.width - ps / 2, top: p.y * size.height - ps / 2, opacity: po }]}>
          <Image source={PELUSA_STRIP} resizeMode="stretch" style={[PIXELS, { width: ps * 2, height: ps, left: p.state === 'giggle' ? -ps : 0 }]} />
        </View>
        );
      })}
      {/* plant foreground: pelusas behind it disappear */}
      <Image source={PLANT_FRONT} resizeMode="stretch" style={[PIXELS, { position: 'absolute', left: plantL, top: plantT, width: plantW, height: plantH }]} />
      {/* pelusas entre las hojas / tras el tubo: se asoman tenues, no atrapables ahí */}
      {pelusas.filter((p) => p.state !== 'poof' && inBehindPx(p.x * size.width, p.y * size.height, size)).map((p) => {
        const ps0 = pel * 0.8;
        return (
        <View key={'b' + p.id} style={[styles.pelFrame, { width: ps0, height: ps0, left: p.x * size.width - ps0 / 2, top: p.y * size.height - ps0 / 2, opacity: 0.45 }]}>
          <Image source={PELUSA_STRIP} resizeMode="stretch" style={[PIXELS, { width: ps0 * 2, height: ps0, left: 0 }]} />
        </View>
        );
      })}
      {/* sparks */}
      {sparks.map((sp) => (
        <Text key={sp.id} style={[styles.spark, { left: sp.x * size.width, top: sp.y * size.height, opacity: Math.max(0, sp.life) }]}>✦</Text>
      ))}
      {/* counter */}
      <View style={styles.topBar} pointerEvents="box-none">
        <View style={styles.counter} pointerEvents="none"><Text style={styles.counterText}>✦ {caught}/{TOTAL}</Text></View>
      </View>
      {!started ? (
        <View style={styles.overlay}>
          <View style={styles.panel}>
            <Text style={styles.eyebrow}>Kuro ronca en el sillón</Text>
            <Text style={styles.title}>Atrapa las pelusas sin despertarlo.</Text>
            <Text style={styles.description}>Arrastra el dedo: deja brillitos y atrapa las 12 pelusas por toda la sala. Cada ronquido trae una más.</Text>
            <Pressable accessibilityRole="button" onPress={start} style={({ pressed }) => [styles.play, pressed && styles.pressed]}><Text style={styles.playText}>Jugar  →</Text></Pressable>
          </View>
        </View>
      ) : null}
      {won ? (
        <View style={styles.overlay}>
          <View style={styles.panel}>
            <Text style={styles.eyebrow}>Sillón limpio</Text>
            <Text style={styles.title}>Kuro ni se enteró.</Text>
            <Text style={styles.score}>{TOTAL} <Text style={styles.scoreLabel}>PELUSAS</Text></Text>
            <Pressable accessibilityRole="button" onPress={start} style={({ pressed }) => [styles.play, pressed && styles.pressed]}><Text style={styles.playText}>Otra vez  →</Text></Pressable>
            {onComplete ? <Pressable accessibilityRole="button" accessibilityLabel="Cobrar recompensa" onPress={() => onComplete?.()} style={({ pressed }) => [styles.collect, pressed && styles.pressed]}><Text style={styles.playText}>Cobrar recompensa  ✦</Text></Pressable> : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, backgroundColor: '#171223', overflow: 'hidden' },
  kuroFrame: { position: 'absolute', overflow: 'hidden' },
  pelFrame: { position: 'absolute', overflow: 'hidden', opacity: 0.9 },
  zzz: { position: 'absolute', color: '#cfd4ff', fontSize: 22, fontWeight: '800', opacity: 0.8 },
  spark: { position: 'absolute', color: '#ffe9a8', fontSize: 16, fontWeight: '800' },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, padding: 22, flexDirection: 'row', justifyContent: 'center' },
  counter: { borderRadius: 22, backgroundColor: 'rgba(9,12,29,0.6)', paddingHorizontal: 16, paddingVertical: 11 },
  counterText: { color: '#ffdc85', fontWeight: '800', fontSize: 15 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,12,28,0.58)', justifyContent: 'center', alignItems: 'center', padding: 18 },
  panel: { width: '100%', maxWidth: 420, padding: 28, backgroundColor: 'rgba(20,25,46,0.96)', borderRadius: 24, borderWidth: 1, borderColor: '#3c3c55' },
  eyebrow: { color: '#f4ce87', fontSize: 10, letterSpacing: 1.6, fontWeight: '700', marginBottom: 14 },
  title: { color: '#fff1da', fontSize: 30, lineHeight: 35, fontWeight: '800', marginBottom: 16 },
  description: { color: '#c1bed1', fontSize: 15, lineHeight: 23, marginBottom: 24 },
  play: { minHeight: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f6d18a', borderRadius: 14 },
  collect: { marginTop: 10, minHeight: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: '#8fd6a4', borderRadius: 14 },
  pressed: { opacity: 0.8 },
  playText: { color: '#272137', fontSize: 16, fontWeight: '800' },
  score: { color: '#f6d18a', fontSize: 32, fontWeight: '800', marginBottom: 22 },
  scoreLabel: { color: '#b2adc3', fontSize: 11, letterSpacing: 1 },
});
