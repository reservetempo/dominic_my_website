  // const [tracks, setTracks] = useState([
  //   { id: "1", name: "Bass Kick", type: "sine", freq: 185, timeSig: "64/4", attack: 0.065, attackCurve: "logarithmic", decay: 1.24, decayCurve: "linear", cutoff: 150, resonance: 1.5, lfoRate: 0, lfoDepth: 0, steps: 4, stepLength: 1.0, pattern: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0], localStep: 0, nextStepTime: 0.0, active: true },
  //   { id: "2", name: "Analog Snare", type: "square", freq: 50, timeSig: "4/4", attack: 0.2, attackCurve: "logarithmic", decay: 0.18, decayCurve: "logarithmic", cutoff: 500, resonance: 1.0, lfoRate: 3.5, lfoDepth: 400, steps: 4, stepLength: 1.0, pattern: [0, 0, 1, 0], localStep: 0, nextStepTime: 0.0, active: true },
  //   { id: "3", name: "Synth Cymbal", type: "noise", freq: 5000, timeSig: "8/8", attack: 0.002, attackCurve: "exponential", decay: 0.23, decayCurve: "exponential", cutoff: 4000, resonance: 0.5, lfoRate: 15, lfoDepth: 800, steps: 8, stepLength: 0.5, pattern: [0, 1, 0, 0, 0, 0, 0, 0], localStep: 0, nextStepTime: 0.0, active: true }
  // ]);

  "use client";

import React, { useState, useEffect, useRef } from "react";

export default function SequencerPage() {
  // --- REACT STATES ---
  const [tracks, setTracks] = useState([
    { id: "1", name: "Bass Kick", type: "sine", freq: 85, freqEnd: 30, timeSig: "4/4", attack: 0.005, attackCurve: "linear", decay: 0.18, decayCurve: "exponential", cutoff: 350, resonance: 1.5, filterType: "lowpass", lfoRate: 0, lfoDepth: 0, lfoWave: "sine", volume: 0.9, drive: 0.0, steps: 4, stepLength: 1.0, pattern: [1, 0, 0, 0], localStep: 0, nextStepTime: 0.0, active: true },
    { id: "2", name: "Analog Snare", type: "noise", freq: 320, freqEnd: 320, timeSig: "3/4", attack: 0.01, attackCurve: "linear", decay: 0.14, decayCurve: "exponential", cutoff: 1200, resonance: 1.0, filterType: "lowpass", lfoRate: 8, lfoDepth: 300, lfoWave: "sine", volume: 0.7, drive: 0.0, steps: 3, stepLength: 1.0, pattern: [0, 0, 1], localStep: 0, nextStepTime: 0.0, active: true },
    { id: "3", name: "Synth Cymbal", type: "noise", freq: 1400, freqEnd: 1400, timeSig: "5/8", attack: 0.002, attackCurve: "linear", decay: 0.05, decayCurve: "linear", cutoff: 4000, resonance: 0.5, filterType: "lowpass", lfoRate: 15, lfoDepth: 800, lfoWave: "sine", volume: 0.6, drive: 0.0, steps: 5, stepLength: 0.5, pattern: [1, 0, 0, 0, 0], localStep: 0, nextStepTime: 0.0, active: true }
  ]);
  const [activeTrackIndex, setActiveTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(120);

  // --- ENGINE REFS (Persistent Audio Hardware Sandboxes) ---
  const audioCtxRef = useRef(null);
  const masterAnalyserRef = useRef(null);
  const masterGainRef = useRef(null);
  const noiseBufferRef = useRef(null);
  const timerIdRef = useRef(null);
  const audioClockStartTimeRef = useRef(0);
  const bpmRef = useRef(120);
  
  const tracksRef = useRef(tracks);
  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  const lcdCanvasRef = useRef(null);
  const tkCanvasRef = useRef(null);

  const lookahead = 25.0;
  const scheduleAheadTime = 0.1;

  // --- INITIALIZE MASTER AUDIO NETWORK ---
  const initAudioEngine = () => {
    if (!audioCtxRef.current) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContextClass();
      audioCtxRef.current = ctx;

      // Master Node Intercept Matrix
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.8, ctx.currentTime);
      
      const masterAnalyser = ctx.createAnalyser();
      masterAnalyser.fftSize = 512; // Higher resolution window for accurate drawing

      // Router Pipeline Connections
      masterGain.connect(masterAnalyser);
      masterAnalyser.connect(ctx.destination);

      masterGainRef.current = masterGain;
      masterAnalyserRef.current = masterAnalyser;

      // Generate Pink/White Noise Buffer Array
      const bufferSize = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      noiseBufferRef.current = buffer;
    }
  };

  const applyEnvelopeCurve = (param, targetValue, startTime, duration, type) => {
    const minVal = 0.0001; 
    if (type === "exponential") {
      param.exponentialRampToValueAtTime(Math.max(minVal, targetValue), startTime + duration);
    } else if (type === "logarithmic") {
      const segments = 10;
      for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        const logT = Math.log10(1 + 9 * t);
        const intermediateVal = minVal + (targetValue - minVal) * logT;
        param.linearRampToValueAtTime(intermediateVal, startTime + (duration * t));
      }
    } else {
      param.linearRampToValueAtTime(targetValue, startTime + duration);
    }
  };

  const playSound = (track, time) => {
    const ctx = audioCtxRef.current;
    const masterGain = masterGainRef.current;
    if (!ctx || !masterGain) return;

    const voiceGain = ctx.createGain();
    const mainFilter = ctx.createBiquadFilter();

    // Distortion waveshaper (drive)
    let lastNode = mainFilter;
    if (track.drive > 0) {
      const waveshaper = ctx.createWaveShaper();
      const driveAmount = Math.max(1, track.drive * 400);
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i * 2) / 256 - 1;
        curve[i] = ((Math.PI + driveAmount) * x) / (Math.PI + driveAmount * Math.abs(x));
      }
      waveshaper.curve = curve;
      waveshaper.oversample = '4x';
      mainFilter.connect(waveshaper);
      waveshaper.connect(voiceGain);
    } else {
      mainFilter.connect(voiceGain);
    }

    voiceGain.connect(masterGain);

    const peakVolume = Math.max(0.001, (track.volume ?? 0.7) * 0.5);
    voiceGain.gain.setValueAtTime(0.0001, time);
    applyEnvelopeCurve(voiceGain.gain, peakVolume, time, track.attack, track.attackCurve);
    const totalDuration = track.attack + track.decay;
    voiceGain.gain.setValueAtTime(peakVolume, time + track.attack);
    applyEnvelopeCurve(voiceGain.gain, 0.0001, time + track.attack, track.decay, track.decayCurve);

    mainFilter.type = track.filterType || 'lowpass';
    mainFilter.frequency.setValueAtTime(track.cutoff, time);
    mainFilter.Q.setValueAtTime(track.resonance, time);

    if (track.lfoRate > 0 && track.lfoDepth > 0) {
      const lfoOsc = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfoOsc.type = track.lfoWave || 'sine';
      lfoOsc.frequency.setValueAtTime(track.lfoRate, time);
      lfoGain.gain.setValueAtTime(track.lfoDepth, time);
      lfoOsc.connect(lfoGain);
      lfoGain.connect(mainFilter.frequency);
      lfoOsc.start(time);
      lfoOsc.stop(time + totalDuration + 0.05);
    }

    if (track.type === 'noise') {
      if (!noiseBufferRef.current) return;
      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = noiseBufferRef.current;
      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime(track.freq, time);
      noiseSrc.connect(bandpass);
      bandpass.connect(mainFilter);
      noiseSrc.start(time);
      noiseSrc.stop(time + totalDuration + 0.05);
    } else {
      const osc = ctx.createOscillator();
      osc.type = track.type;
      const endFreq = track.freqEnd ?? track.freq * 0.1;
      if (track.type === 'sine' || track.name.toLowerCase().includes('kick')) {
        osc.frequency.setValueAtTime(track.freq, time);
        osc.frequency.exponentialRampToValueAtTime(Math.max(0.01, endFreq), time + totalDuration);
      } else {
        osc.frequency.setValueAtTime(track.freq, time);
      }
      osc.connect(mainFilter);
      osc.start(time);
      osc.stop(time + totalDuration + 0.05);
    }
  };

  // --- CLOCK-BASED CO-SCHEDULER ENGINE ---
  const runScheduler = () => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const baseStepDuration = 60.0 / bpmRef.current / 4;

    tracksRef.current.forEach((track) => {
      if (!track.active) return;
      const trackStepDuration = baseStepDuration * track.stepLength;

      while (track.nextStepTime < ctx.currentTime + scheduleAheadTime) {
        if (track.pattern[track.localStep] === 1) {
          playSound(track, track.nextStepTime);
        }

        const delay = (track.nextStepTime - ctx.currentTime) * 1000;
        const currentFiredStep = track.localStep;
        const trackId = track.id;

        setTimeout(() => {
          triggerVisualStepFlash(trackId, currentFiredStep);
        }, Math.max(0, delay));

        track.nextStepTime += trackStepDuration;
        track.localStep = (track.localStep + 1) % track.steps;
      }
    });

    timerIdRef.current = setTimeout(runScheduler, lookahead);
  };

  const triggerVisualStepFlash = (trackId, stepIndex) => {
    const stepNodes = document.querySelectorAll(`.step-node-${trackId}`);
    stepNodes.forEach((node, idx) => {
      if (idx === stepIndex) {
        node.classList.add("border-white");
        node.style.boxShadow = "0 0 10px #ffffff";
      } else {
        node.classList.remove("border-white");
        node.style.boxShadow = "none";
      }
    });
  };

  const toggleTransport = () => {
    initAudioEngine();
    const ctx = audioCtxRef.current;

    if (isPlaying) {
      clearTimeout(timerIdRef.current);
      setIsPlaying(false);
      tracks.forEach(t => triggerVisualStepFlash(t.id, -1));
    } else {
      if (ctx.state === 'suspended') ctx.resume();
      audioClockStartTimeRef.current = ctx.currentTime;
      
      const startTime = ctx.currentTime + 0.05;
      const resetTracks = tracks.map(track => ({
        ...track,
        nextStepTime: startTime,
        localStep: 0
      }));

      setTracks(resetTracks);
      setIsPlaying(true);
      bpmRef.current = bpm;
      
      setTimeout(runScheduler, 0);
    }
  };

  const addNewTrack = () => {
    initAudioEngine();
    const newId = Date.now().toString();

    const nextTrackList = [
      ...tracks,
      {
        id: newId, name: "Perc Gen", type: "triangle", freq: 180, freqEnd: 180, timeSig: "4/4", attack: 0.01, attackCurve: "linear", decay: 0.12, decayCurve: "exponential", cutoff: 1500, resonance: 1.0, filterType: "lowpass",
        lfoRate: 0, lfoDepth: 0, lfoWave: "sine", volume: 0.7, drive: 0.0, steps: 4, stepLength: 1.0, pattern: [0, 0, 0, 0], localStep: 0, nextStepTime: audioCtxRef.current ? audioCtxRef.current.currentTime : 0.0,
        active: true
      }
    ];

    setTracks(nextTrackList);
    setActiveTrackIndex(nextTrackList.length - 1);
  };

  const deleteTrack = (targetIndex) => {
    const updated = tracks.filter((_, idx) => idx !== targetIndex);
    setTracks(updated);
    if (activeTrackIndex >= updated.length && activeTrackIndex > 0) {
      setActiveTrackIndex(updated.length - 1);
    }
  };

  const updateTrackParameter = (field, value) => {
    const updated = [...tracks];
    
    if (field === 'timeSig') {
      updated[activeTrackIndex].timeSig = value;
      const parts = value.split('/');
      const numSteps = Math.max(1, Math.min(parseInt(parts[0]) || 4, 32));
      const denominator = parseInt(parts[1]) || 4;
      
      let stepLen = 1.0; 
      if (denominator === 16) stepLen = 0.25;
      if (denominator === 8) stepLen = 0.5;
      if (denominator === 2) stepLen = 2.0;

      updated[activeTrackIndex].steps = numSteps;
      updated[activeTrackIndex].stepLength = stepLen;

      let pattern = [...updated[activeTrackIndex].pattern];
      while (pattern.length < numSteps) pattern.push(0);
      if (pattern.length > numSteps) pattern = pattern.slice(0, numSteps);
      updated[activeTrackIndex].pattern = pattern;
    } else {
      updated[activeTrackIndex][field] = value;
    }

    setTracks(updated);
  };

  const toggleStepNode = (stepIndex) => {
    const updated = [...tracks];
    const currentVal = updated[activeTrackIndex].pattern[stepIndex];
    updated[activeTrackIndex].pattern[stepIndex] = currentVal === 1 ? 0 : 1;
    setTracks(updated);
  };

  // --- ANIMATION LOOP: LCD only ---
  useEffect(() => {
    let animFrameId;
    const renderingContextLoop = () => {
      animFrameId = requestAnimationFrame(renderingContextLoop);
      const ctx = audioCtxRef.current;
      const lcd = lcdCanvasRef.current;
      if (lcd) {
        const lcdCtx = lcd.getContext('2d');
        if (lcd.width !== lcd.clientWidth) { lcd.width = lcd.clientWidth; lcd.height = lcd.clientHeight; }
        lcdCtx.clearRect(0, 0, lcd.width, lcd.height);
        const cellCount = 128;
        const cellWidth = lcd.width / cellCount;
        const laneHeight = lcd.height / Math.max(1, tracksRef.current.length);
        tracksRef.current.forEach((track, idx) => {
          const y = idx * laneHeight;
          lcdCtx.strokeStyle = "rgba(85, 255, 85, 0.03)";
          lcdCtx.strokeRect(0, y, lcd.width, laneHeight);
          for (let c = 0; c < cellCount; c++) {
            if (track.pattern[c % track.steps] === 1) {
              lcdCtx.fillStyle = idx === activeTrackIndex ? "rgba(0, 255, 157, 0.22)" : "rgba(85, 255, 85, 0.10)";
              lcdCtx.fillRect(c * cellWidth + 1, y + 2, cellWidth - 2, laneHeight - 4);
            }
          }
        });
        if (isPlaying && ctx) {
          const baseStepDuration = 60.0 / bpmRef.current / 4;
          const totalElapsedSeconds = ctx.currentTime - audioClockStartTimeRef.current;
          const currentGlobalStepIndex = Math.floor(totalElapsedSeconds / baseStepDuration) % cellCount;
          const playheadX = currentGlobalStepIndex * cellWidth;
          lcdCtx.fillStyle = "rgba(85, 255, 255, 0.85)";
          lcdCtx.fillRect(playheadX, 0, Math.max(2, cellWidth), lcd.height);
        }
      }
    };
    renderingContextLoop();
    return () => cancelAnimationFrame(animFrameId);
  }, [isPlaying, activeTrackIndex]);

  // --- STATIC WAVEFORM: redraws whenever active track settings change ---
  useEffect(() => {
    const oscCanvas = tkCanvasRef.current;
    if (!oscCanvas) return;
    oscCanvas.width = oscCanvas.clientWidth || oscCanvas.offsetWidth || 800;
    oscCanvas.height = oscCanvas.clientHeight || oscCanvas.offsetHeight || 256;
    const oCtx = oscCanvas.getContext('2d');
    const w = oscCanvas.width;
    const h = oscCanvas.height;
    const track = tracks[activeTrackIndex];
    if (!track) return;
    oCtx.clearRect(0, 0, w, h);

    const paddingLeft = 55, paddingRight = 20, paddingTop = 25, paddingBottom = 25;
    const graphW = w - paddingLeft - paddingRight;
    const graphH = h - paddingTop - paddingBottom;
    const centerY = paddingTop + graphH / 2;

    // Graticule
    oCtx.strokeStyle = "rgba(36, 36, 47, 0.6)"; oCtx.lineWidth = 1;
    for (let i = 1; i < 4; i++) { const gy = paddingTop + graphH * (i / 4); oCtx.beginPath(); oCtx.moveTo(paddingLeft, gy); oCtx.lineTo(w - paddingRight, gy); oCtx.stroke(); }
    for (let i = 1; i < 8; i++) { const gx = paddingLeft + graphW * (i / 8); oCtx.beginPath(); oCtx.moveTo(gx, paddingTop); oCtx.lineTo(gx, h - paddingBottom); oCtx.stroke(); }
    // 0V axis
    oCtx.strokeStyle = "rgba(100, 100, 120, 0.5)"; oCtx.lineWidth = 1.5;
    oCtx.beginPath(); oCtx.moveTo(paddingLeft, centerY); oCtx.lineTo(w - paddingRight, centerY); oCtx.stroke();
    // Border
    oCtx.strokeStyle = "#242431"; oCtx.lineWidth = 1;
    oCtx.strokeRect(paddingLeft, paddingTop, graphW, graphH);

    const totalDuration = track.attack + track.decay;
    const numPoints = graphW * 4;
    const sampleRateLocal = numPoints / totalDuration;

    const getEnvelope = (t) => {
      const minV = 0.0001, peak = 0.95;
      if (t < 0) return 0;
      if (t <= track.attack) {
        const p = t / track.attack;
        if (track.attackCurve === 'exponential') return minV + (peak - minV) * (Math.pow(100, p) - 1) / 99;
        if (track.attackCurve === 'logarithmic') return minV + (peak - minV) * Math.log10(1 + 9 * p);
        return minV + (peak - minV) * p;
      } else {
        const p = (t - track.attack) / track.decay;
        if (p >= 1) return 0;
        if (track.decayCurve === 'exponential') return peak * Math.pow(minV / peak, p);
        if (track.decayCurve === 'logarithmic') return peak * (1 - Math.log10(1 + 9 * p));
        return peak * (1 - p);
      }
    };

    const getOscillator = (t, freq) => {
      const phase = (t * freq) % 1;
      switch (track.type) {
        case 'sine':     return Math.sin(2 * Math.PI * phase);
        case 'triangle': return 1 - 4 * Math.abs(phase - 0.5);
        case 'square':   return phase < 0.5 ? 1 : -1;
        case 'sawtooth': return 2 * phase - 1;
        case 'noise':    return Math.random() * 2 - 1;
        default:         return Math.sin(2 * Math.PI * phase);
      }
    };

    const rc = 1.0 / (2 * Math.PI * track.cutoff);
    const dt = 1.0 / sampleRateLocal;
    const alphaC = Math.min(1, Math.max(0.01, dt / (rc + dt)));
    const isSweeping = track.type === 'sine' || track.name.toLowerCase().includes('kick');
    const endFreq = track.freqEnd ?? track.freq;

    let prevFiltered = 0;
    const points = [];
    for (let i = 0; i < numPoints; i++) {
      const t = (i / numPoints) * totalDuration;
      const env = getEnvelope(t);
      let instFreq = track.freq;
      if (isSweeping && totalDuration > 0) {
        instFreq = Math.max(0.5, track.freq * Math.pow(Math.max(0.01, endFreq) / Math.max(track.freq, 1), t / totalDuration));
      }
      const lfoMod = (track.lfoRate > 0 && track.lfoDepth > 0) ? Math.sin(2 * Math.PI * track.lfoRate * t) * track.lfoDepth : 0;
      const effectiveFreq = Math.max(1, instFreq + lfoMod);
      const raw = getOscillator(t, effectiveFreq);
      const filtered = prevFiltered + alphaC * (raw - prevFiltered);
      prevFiltered = filtered;
      const resonanceBoost = 1 + Math.max(0, track.resonance - 1) * 0.25;
      // Soft-clip drive approximation for display
      let signal = filtered * resonanceBoost * env;
      if (track.drive > 0) {
        const k = Math.max(1, track.drive * 400);
        signal = ((Math.PI + k) * signal) / (Math.PI + k * Math.abs(signal));
      }
      points.push(signal);
    }

    const maxAmp = Math.max(...points.map(Math.abs), 0.001);
    const normalized = points.map(v => v / maxAmp);

    // Waveform trace
    oCtx.lineWidth = 1.5; oCtx.strokeStyle = '#00ff9d';
    oCtx.shadowBlur = 6; oCtx.shadowColor = '#00ff9d44';
    oCtx.beginPath();
    for (let i = 0; i < numPoints; i++) {
      const px = paddingLeft + (i / numPoints) * graphW;
      const py = centerY - normalized[i] * (graphH / 2) * 0.92;
      i === 0 ? oCtx.moveTo(px, py) : oCtx.lineTo(px, py);
    }
    oCtx.stroke(); oCtx.shadowBlur = 0;

    // Envelope outline
    oCtx.lineWidth = 1; oCtx.strokeStyle = 'rgba(0,255,157,0.18)'; oCtx.setLineDash([3, 4]);
    for (const sign of [1, -1]) {
      oCtx.beginPath();
      for (let i = 0; i < numPoints; i++) {
        const t = (i / numPoints) * totalDuration;
        const env = getEnvelope(t);
        const px = paddingLeft + (i / numPoints) * graphW;
        const py = centerY - sign * env * (graphH / 2) * 0.92;
        i === 0 ? oCtx.moveTo(px, py) : oCtx.lineTo(px, py);
      }
      oCtx.stroke();
    }
    oCtx.setLineDash([]);

    // Attack marker
    const attackX = paddingLeft + (track.attack / totalDuration) * graphW;
    oCtx.strokeStyle = "rgba(85, 200, 255, 0.25)"; oCtx.lineWidth = 1; oCtx.setLineDash([2, 5]);
    oCtx.beginPath(); oCtx.moveTo(attackX, paddingTop); oCtx.lineTo(attackX, h - paddingBottom); oCtx.stroke();
    oCtx.setLineDash([]);

    // Labels
    oCtx.fillStyle = "#8a8a98"; oCtx.font = "10px monospace"; oCtx.textBaseline = "middle";
    oCtx.textAlign = "right";
    oCtx.fillText("+1.0", paddingLeft - 10, paddingTop);
    oCtx.fillText(" 0.0 V", paddingLeft - 10, centerY);
    oCtx.fillText("-1.0", paddingLeft - 10, h - paddingBottom);
    oCtx.fillStyle = "rgba(85, 200, 255, 0.5)"; oCtx.textAlign = "center";
    oCtx.fillText(`A: ${(track.attack * 1000).toFixed(1)}ms`, attackX, paddingTop - 10);
    oCtx.fillStyle = "#8a8a98"; oCtx.textAlign = "left";
    oCtx.fillText("0 ms", paddingLeft, h - paddingBottom + 14);
    oCtx.textAlign = "right";
    oCtx.fillText(`${(totalDuration * 1000).toFixed(1)} ms`, w - paddingRight, h - paddingBottom + 14);
  }, [tracks, activeTrackIndex]);

  useEffect(() => {
    return () => clearTimeout(timerIdRef.current);
  }, []);

  const currentInspectedTrack = tracks[activeTrackIndex];

  return (
    <div className="w-full max-w-7xl mx-auto bg-[#141419] border border-[#24242f] rounded-xl p-4 sm:p-6 shadow-2xl text-[#e1e1e6]">
      
      {/* High Accuracy Screen-Width Laboratory Oscilloscope Display */}
      <div className="w-full bg-[#07070a] border border-[#1e1e28] rounded-lg mb-5 p-1 shadow-inner">
        <div className="px-3 pt-2 text-[#8a8a98] font-mono text-[10px] uppercase tracking-wider flex justify-between items-center">
          <span>Track Waveform Synthesizer // {tracks[activeTrackIndex]?.name ?? "—"} · {tracks[activeTrackIndex]?.type?.toUpperCase() ?? ""}</span>
          <span className="text-[#00ff9d]">● Static Render</span>
        </div>
        <canvas ref={tkCanvasRef} className="w-full h-64 block bg-transparent" />
      </div>

      {/* Grid Summary Tracking Ribbon */}
      <div className="bg-[#111a11] border-2 border-[#243324] rounded p-2.5 mb-5 shadow-inner">
        <canvas ref={lcdCanvasRef} className="w-full h-12 block bg-transparent" />
      </div>

      {/* Global Hardware Controls */}
      <div className="flex flex-wrap justify-between items-center gap-4 border-b border-[#24242f] pb-4 mb-5">
        <h1 className="text-xl font-bold tracking-tight">Polymetric Next Engine</h1>
        <div className="flex flex-wrap items-center gap-4 bg-black/40 border border-[#24242f] px-4 py-2 rounded-md w-full sm:w-auto justify-between sm:justify-start">
          <button 
            onClick={toggleTransport} 
            className={`font-bold px-4 py-1.5 rounded transition ${isPlaying ? 'bg-red-500 text-white' : 'bg-[#00ff9d] text-black'}`}
          >
            {isPlaying ? "Stop" : "Start"}
          </button>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <label htmlFor="bpm" className="text-white">BPM:</label>
            <input 
              type="number" 
              id="bpm" 
              min="40" 
              max="240" 
              value={bpm} 
              onChange={(e) => {
                const val = parseInt(e.target.value) || 120;
                setBpm(val);
                bpmRef.current = val;
              }}
              className="bg-black border border-[#24242f] text-white p-1 rounded w-16 text-center focus:outline-none focus:border-[#00ff9d]"
            />
          </div>
          <button onClick={addNewTrack} className="bg-[#24242b] border border-[#24242f] hover:bg-[#32323d] text-[#e1e1e6] font-bold px-3 py-1.5 rounded text-sm transition">
            + New Track
          </button>
        </div>
      </div>

      {/* Channel Track Selector Row */}
      {tracks.length > 0 ? (
        <>
          <div className="flex justify-between items-center bg-black/20 border border-[#24242f] px-4 py-2.5 rounded-md mb-4">
            <button 
              onClick={() => setActiveTrackIndex((activeTrackIndex - 1 + tracks.length) % tracks.length)} 
              className="bg-[#24242b] border border-[#24242f] text-[#00ff9d] text-lg font-bold px-4 py-1 rounded hover:bg-[#2e2e3a] transition"
            >
              &#x25C0;
            </button>
            <div className="flex items-center gap-3">
              <span className="font-bold text-lg text-[#00ff9d]">{currentInspectedTrack?.name}</span>
              <span className="text-xs font-mono text-[#8a8a93]">{`[Track ${activeTrackIndex + 1} of ${tracks.length}]`}</span>
            </div>
            <button 
              onClick={() => setActiveTrackIndex((activeTrackIndex + 1) % tracks.length)} 
              className="bg-[#24242b] border border-[#24242f] text-[#00ff9d] text-lg font-bold px-4 py-1 rounded hover:bg-[#2e2e3a] transition"
            >
              &#x25B6;
            </button>
          </div>

          {/* Focused Deck Workspace Layout Grid */}
          <div className="bg-white/[0.01] border border-[#24242f] rounded-lg p-4 sm:p-5 grid grid-cols-1 md:grid-cols-[200px_1fr] gap-5">
            
            {/* Structural Left Deck Inspector Panel */}
            <div className="flex flex-col gap-3 md:border-r border-[#24242f] md:pr-5">
              <input 
                type="text" 
                value={currentInspectedTrack?.name || ""} 
                onChange={(e) => updateTrackParameter('name', e.target.value)}
                className="bg-transparent border-b-2 border-[#24242f] text-white font-bold text-lg py-1 w-full focus:outline-none focus:border-[#00ff9d]"
              />
              <div className="flex justify-between items-center mt-1">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] text-[#8a8a93] uppercase font-bold tracking-wider">Time Signature</span>
                  <input 
                    type="text"
                    value={currentInspectedTrack?.timeSig || "4/4"}
                    onChange={(e) => updateTrackParameter('timeSig', e.target.value)}
                    className="bg-[#1a1a24] text-[#00ff9d] border border-[#2d2d38] font-mono text-xs px-2 py-1 rounded w-16 text-center focus:outline-none focus:border-[#00ff9d]"
                  />
                </div>
                <div className="flex gap-1.5 self-end">
                  <button 
                    onClick={() => updateTrackParameter('active', !currentInspectedTrack.active)}
                    className="bg-[#1a1a24] border border-[#24242f] hover:bg-[#252533] text-xs font-bold px-2.5 py-1 text-[#b5b5bd] rounded transition"
                  >
                    {currentInspectedTrack?.active ? "Stop" : "Resume"}
                  </button>
                  <button 
                    onClick={() => {
                      const updated = [...tracks];
                      updated[activeTrackIndex].localStep = 0;
                      if (audioCtxRef.current) updated[activeTrackIndex].nextStepTime = audioCtxRef.current.currentTime;
                      setTracks(updated);
                      triggerVisualStepFlash(currentInspectedTrack.id, 0);
                    }}
                    className="bg-[#1a1a24] border border-[#24242f] hover:bg-[#252533] text-xs font-bold px-2.5 py-1 text-[#b5b5bd] rounded transition"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>

            {/* Step Grid Array Matrix & Synth Mod Controls Block */}
            <div className="flex flex-col gap-4">
              
              {/* Step Grid Matrix Node Array */}
              <div className="flex gap-1.5 flex-wrap bg-black/30 border border-[#24242f]/40 p-3 rounded-md">
                {currentInspectedTrack?.pattern.map((step, idx) => (
                  <div
                    key={idx}
                    onClick={() => toggleStepNode(idx)}
                    className={`step-node-${currentInspectedTrack.id} flex-1 min-w-[28px] max-w-[40px] h-10 rounded text-xs flex items-center justify-center cursor-pointer select-none font-semibold transition border border-transparent ${
                      step === 1 ? 'bg-[#00ff9d] text-black font-bold' : 'bg-[#1c1c24] text-[#62626a]'
                    }`}
                  >
                    {idx + 1}
                  </div>
                ))}
              </div>

              {/* Sound Architecture Matrix Configuration */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 bg-black/20 border border-[#1c1c24] p-4 rounded-md">

                {/* Generator Source — cycle */}
                {(() => {
                  const waveTypes = ["sine","triangle","square","sawtooth","noise"];
                  const waveLabels = {"sine":"Sine Wave","triangle":"Triangle","square":"Square","sawtooth":"Sawtooth","noise":"White Noise"};
                  const curIdx = waveTypes.indexOf(currentInspectedTrack?.type || "sine");
                  return (
                    <div className="flex flex-col gap-1 text-xs text-[#a0a0a5]">
                      <label className="font-medium">Generator Source:</label>
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateTrackParameter('type', waveTypes[(curIdx - 1 + waveTypes.length) % waveTypes.length])} className="flex-none w-7 h-[30px] bg-[#1a1a24] border border-[#2d2d3a] hover:border-[#00ff9d] text-[#00ff9d] font-bold rounded text-sm transition">−</button>
                        <select value={currentInspectedTrack?.type || "sine"} onChange={(e) => updateTrackParameter('type', e.target.value)} className="flex-1 bg-black border border-[#24242f] text-white p-1.5 rounded focus:outline-none text-center min-w-0">
                          {waveTypes.map(t => <option key={t} value={t}>{waveLabels[t]}</option>)}
                        </select>
                        <button onClick={() => updateTrackParameter('type', waveTypes[(curIdx + 1) % waveTypes.length])} className="flex-none w-7 h-[30px] bg-[#1a1a24] border border-[#2d2d3a] hover:border-[#00ff9d] text-[#00ff9d] font-bold rounded text-sm transition">+</button>
                      </div>
                    </div>
                  );
                })()}

                {/* Frequency Start */}
                <div className="flex flex-col gap-1 text-xs text-[#a0a0a5]">
                  <label className="font-medium">Freq Start (Hz):</label>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateTrackParameter('freq', Math.max(10, (currentInspectedTrack?.freq ?? 100) - 25))} className="flex-none w-7 h-[30px] bg-[#1a1a24] border border-[#2d2d3a] hover:border-[#00ff9d] text-[#00ff9d] font-bold rounded text-sm transition">−</button>
                    <input type="number" min="10" max="2500" step="25" value={currentInspectedTrack?.freq ?? 100} onChange={(e) => updateTrackParameter('freq', parseInt(e.target.value) || 0)} className="flex-1 bg-black border border-[#24242f] text-white p-1.5 rounded focus:outline-none text-center min-w-0" />
                    <button onClick={() => updateTrackParameter('freq', Math.min(2500, (currentInspectedTrack?.freq ?? 100) + 25))} className="flex-none w-7 h-[30px] bg-[#1a1a24] border border-[#2d2d3a] hover:border-[#00ff9d] text-[#00ff9d] font-bold rounded text-sm transition">+</button>
                  </div>
                </div>

                {/* Frequency End (sweep target) */}
                <div className="flex flex-col gap-1 text-xs text-[#a0a0a5]">
                  <label className="font-medium">Freq End (Hz):</label>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateTrackParameter('freqEnd', Math.max(1, (currentInspectedTrack?.freqEnd ?? 30) - 5))} className="flex-none w-7 h-[30px] bg-[#1a1a24] border border-[#2d2d3a] hover:border-[#00ff9d] text-[#00ff9d] font-bold rounded text-sm transition">−</button>
                    <input type="number" min="1" max="2500" step="5" value={currentInspectedTrack?.freqEnd ?? 30} onChange={(e) => updateTrackParameter('freqEnd', parseInt(e.target.value) || 1)} className="flex-1 bg-black border border-[#24242f] text-white p-1.5 rounded focus:outline-none text-center min-w-0" />
                    <button onClick={() => updateTrackParameter('freqEnd', Math.min(2500, (currentInspectedTrack?.freqEnd ?? 30) + 5))} className="flex-none w-7 h-[30px] bg-[#1a1a24] border border-[#2d2d3a] hover:border-[#00ff9d] text-[#00ff9d] font-bold rounded text-sm transition">+</button>
                  </div>
                </div>

                {/* Volume */}
                <div className="flex flex-col gap-1 text-xs text-[#a0a0a5]">
                  <label className="font-medium">Volume:</label>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateTrackParameter('volume', Math.max(0, parseFloat(((currentInspectedTrack?.volume ?? 0.7) - 0.05).toFixed(2))))} className="flex-none w-7 h-[30px] bg-[#1a1a24] border border-[#2d2d3a] hover:border-[#00ff9d] text-[#00ff9d] font-bold rounded text-sm transition">−</button>
                    <input type="number" min="0" max="1" step="0.05" value={currentInspectedTrack?.volume ?? 0.7} onChange={(e) => updateTrackParameter('volume', parseFloat(e.target.value) || 0)} className="flex-1 bg-black border border-[#24242f] text-white p-1.5 rounded focus:outline-none text-center min-w-0" />
                    <button onClick={() => updateTrackParameter('volume', Math.min(1, parseFloat(((currentInspectedTrack?.volume ?? 0.7) + 0.05).toFixed(2))))} className="flex-none w-7 h-[30px] bg-[#1a1a24] border border-[#2d2d3a] hover:border-[#00ff9d] text-[#00ff9d] font-bold rounded text-sm transition">+</button>
                  </div>
                </div>

                {/* Attack Time */}
                <div className="flex flex-col gap-1 text-xs text-[#a0a0a5]">
                  <label className="font-medium">Attack Time (s):</label>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateTrackParameter('attack', Math.max(0, parseFloat(((currentInspectedTrack?.attack ?? 0.01) - 0.01).toFixed(3))))} className="flex-none w-7 h-[30px] bg-[#1a1a24] border border-[#2d2d3a] hover:border-[#00ff9d] text-[#00ff9d] font-bold rounded text-sm transition">−</button>
                    <input type="number" min="0.00" max="1.00" step="0.01" value={currentInspectedTrack?.attack ?? 0.01} onChange={(e) => updateTrackParameter('attack', parseFloat(e.target.value) || 0)} className="flex-1 bg-black border border-[#24242f] text-white p-1.5 rounded focus:outline-none text-center min-w-0" />
                    <button onClick={() => updateTrackParameter('attack', Math.min(1, parseFloat(((currentInspectedTrack?.attack ?? 0.01) + 0.01).toFixed(3))))} className="flex-none w-7 h-[30px] bg-[#1a1a24] border border-[#2d2d3a] hover:border-[#00ff9d] text-[#00ff9d] font-bold rounded text-sm transition">+</button>
                  </div>
                </div>

                {/* Attack Shape — cycle */}
                {(() => {
                  const curves = ["linear","exponential","logarithmic"];
                  const curIdx = curves.indexOf(currentInspectedTrack?.attackCurve || "linear");
                  return (
                    <div className="flex flex-col gap-1 text-xs text-[#a0a0a5]">
                      <label className="font-medium">Attack Shape:</label>
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateTrackParameter('attackCurve', curves[(curIdx - 1 + curves.length) % curves.length])} className="flex-none w-7 h-[30px] bg-[#1a1a24] border border-[#2d2d3a] hover:border-[#00ff9d] text-[#00ff9d] font-bold rounded text-sm transition">−</button>
                        <select value={currentInspectedTrack?.attackCurve || "linear"} onChange={(e) => updateTrackParameter('attackCurve', e.target.value)} className="flex-1 bg-black border border-[#24242f] text-white p-1.5 rounded focus:outline-none text-center min-w-0">
                          <option value="linear">Linear</option><option value="exponential">Exponential</option><option value="logarithmic">Logarithmic</option>
                        </select>
                        <button onClick={() => updateTrackParameter('attackCurve', curves[(curIdx + 1) % curves.length])} className="flex-none w-7 h-[30px] bg-[#1a1a24] border border-[#2d2d3a] hover:border-[#00ff9d] text-[#00ff9d] font-bold rounded text-sm transition">+</button>
                      </div>
                    </div>
                  );
                })()}

                {/* Decay Time */}
                <div className="flex flex-col gap-1 text-xs text-[#a0a0a5]">
                  <label className="font-medium">Decay Time (s):</label>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateTrackParameter('decay', Math.max(0.01, parseFloat(((currentInspectedTrack?.decay ?? 0.1) - 0.02).toFixed(3))))} className="flex-none w-7 h-[30px] bg-[#1a1a24] border border-[#2d2d3a] hover:border-[#00ff9d] text-[#00ff9d] font-bold rounded text-sm transition">−</button>
                    <input type="number" min="0.01" max="2.00" step="0.02" value={currentInspectedTrack?.decay ?? 0.10} onChange={(e) => updateTrackParameter('decay', parseFloat(e.target.value) || 0.01)} className="flex-1 bg-black border border-[#24242f] text-white p-1.5 rounded focus:outline-none text-center min-w-0" />
                    <button onClick={() => updateTrackParameter('decay', Math.min(2, parseFloat(((currentInspectedTrack?.decay ?? 0.1) + 0.02).toFixed(3))))} className="flex-none w-7 h-[30px] bg-[#1a1a24] border border-[#2d2d3a] hover:border-[#00ff9d] text-[#00ff9d] font-bold rounded text-sm transition">+</button>
                  </div>
                </div>

                {/* Decay Shape — cycle */}
                {(() => {
                  const curves = ["linear","exponential","logarithmic"];
                  const curIdx = curves.indexOf(currentInspectedTrack?.decayCurve || "exponential");
                  return (
                    <div className="flex flex-col gap-1 text-xs text-[#a0a0a5]">
                      <label className="font-medium">Decay Shape:</label>
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateTrackParameter('decayCurve', curves[(curIdx - 1 + curves.length) % curves.length])} className="flex-none w-7 h-[30px] bg-[#1a1a24] border border-[#2d2d3a] hover:border-[#00ff9d] text-[#00ff9d] font-bold rounded text-sm transition">−</button>
                        <select value={currentInspectedTrack?.decayCurve || "exponential"} onChange={(e) => updateTrackParameter('decayCurve', e.target.value)} className="flex-1 bg-black border border-[#24242f] text-white p-1.5 rounded focus:outline-none text-center min-w-0">
                          <option value="linear">Linear</option><option value="exponential">Exponential</option><option value="logarithmic">Logarithmic</option>
                        </select>
                        <button onClick={() => updateTrackParameter('decayCurve', curves[(curIdx + 1) % curves.length])} className="flex-none w-7 h-[30px] bg-[#1a1a24] border border-[#2d2d3a] hover:border-[#00ff9d] text-[#00ff9d] font-bold rounded text-sm transition">+</button>
                      </div>
                    </div>
                  );
                })()}

                {/* Filter Type — cycle */}
                {(() => {
                  const fTypes = ["lowpass","highpass","bandpass","notch","peaking"];
                  const curIdx = fTypes.indexOf(currentInspectedTrack?.filterType || "lowpass");
                  return (
                    <div className="flex flex-col gap-1 text-xs text-[#a0a0a5]">
                      <label className="font-medium">Filter Type:</label>
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateTrackParameter('filterType', fTypes[(curIdx - 1 + fTypes.length) % fTypes.length])} className="flex-none w-7 h-[30px] bg-[#1a1a24] border border-[#2d2d3a] hover:border-[#00ff9d] text-[#00ff9d] font-bold rounded text-sm transition">−</button>
                        <select value={currentInspectedTrack?.filterType || "lowpass"} onChange={(e) => updateTrackParameter('filterType', e.target.value)} className="flex-1 bg-black border border-[#24242f] text-white p-1.5 rounded focus:outline-none text-center min-w-0">
                          <option value="lowpass">Low Pass</option><option value="highpass">High Pass</option><option value="bandpass">Band Pass</option><option value="notch">Notch</option><option value="peaking">Peaking</option>
                        </select>
                        <button onClick={() => updateTrackParameter('filterType', fTypes[(curIdx + 1) % fTypes.length])} className="flex-none w-7 h-[30px] bg-[#1a1a24] border border-[#2d2d3a] hover:border-[#00ff9d] text-[#00ff9d] font-bold rounded text-sm transition">+</button>
                      </div>
                    </div>
                  );
                })()}

                {/* Filter Cutoff */}
                <div className="flex flex-col gap-1 text-xs text-[#a0a0a5]">
                  <label className="font-medium">Filter Cutoff (Hz):</label>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateTrackParameter('cutoff', Math.max(50, (currentInspectedTrack?.cutoff ?? 1000) - 100))} className="flex-none w-7 h-[30px] bg-[#1a1a24] border border-[#2d2d3a] hover:border-[#00ff9d] text-[#00ff9d] font-bold rounded text-sm transition">−</button>
                    <input type="number" min="50" max="8000" step="100" value={currentInspectedTrack?.cutoff ?? 1000} onChange={(e) => updateTrackParameter('cutoff', parseInt(e.target.value) || 0)} className="flex-1 bg-black border border-[#24242f] text-white p-1.5 rounded focus:outline-none text-center min-w-0" />
                    <button onClick={() => updateTrackParameter('cutoff', Math.min(8000, (currentInspectedTrack?.cutoff ?? 1000) + 100))} className="flex-none w-7 h-[30px] bg-[#1a1a24] border border-[#2d2d3a] hover:border-[#00ff9d] text-[#00ff9d] font-bold rounded text-sm transition">+</button>
                  </div>
                </div>

                {/* Resonance */}
                <div className="flex flex-col gap-1 text-xs text-[#a0a0a5]">
                  <label className="font-medium">Resonance (Q):</label>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateTrackParameter('resonance', Math.max(0, parseFloat(((currentInspectedTrack?.resonance ?? 1) - 0.5).toFixed(2))))} className="flex-none w-7 h-[30px] bg-[#1a1a24] border border-[#2d2d3a] hover:border-[#00ff9d] text-[#00ff9d] font-bold rounded text-sm transition">−</button>
                    <input type="number" min="0.0" max="25.0" step="0.5" value={currentInspectedTrack?.resonance ?? 1.0} onChange={(e) => updateTrackParameter('resonance', parseFloat(e.target.value) || 0)} className="flex-1 bg-black border border-[#24242f] text-white p-1.5 rounded focus:outline-none text-center min-w-0" />
                    <button onClick={() => updateTrackParameter('resonance', Math.min(25, parseFloat(((currentInspectedTrack?.resonance ?? 1) + 0.5).toFixed(2))))} className="flex-none w-7 h-[30px] bg-[#1a1a24] border border-[#2d2d3a] hover:border-[#00ff9d] text-[#00ff9d] font-bold rounded text-sm transition">+</button>
                  </div>
                </div>

                {/* LFO Waveform — cycle */}
                {(() => {
                  const lfoWaves = ["sine","square","sawtooth","triangle"];
                  const curIdx = lfoWaves.indexOf(currentInspectedTrack?.lfoWave || "sine");
                  return (
                    <div className="flex flex-col gap-1 text-xs text-[#a0a0a5]">
                      <label className="font-medium">LFO Shape:</label>
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateTrackParameter('lfoWave', lfoWaves[(curIdx - 1 + lfoWaves.length) % lfoWaves.length])} className="flex-none w-7 h-[30px] bg-[#1a1a24] border border-[#2d2d3a] hover:border-[#00ff9d] text-[#00ff9d] font-bold rounded text-sm transition">−</button>
                        <select value={currentInspectedTrack?.lfoWave || "sine"} onChange={(e) => updateTrackParameter('lfoWave', e.target.value)} className="flex-1 bg-black border border-[#24242f] text-white p-1.5 rounded focus:outline-none text-center min-w-0">
                          <option value="sine">Sine</option><option value="square">Square</option><option value="sawtooth">Sawtooth</option><option value="triangle">Triangle</option>
                        </select>
                        <button onClick={() => updateTrackParameter('lfoWave', lfoWaves[(curIdx + 1) % lfoWaves.length])} className="flex-none w-7 h-[30px] bg-[#1a1a24] border border-[#2d2d3a] hover:border-[#00ff9d] text-[#00ff9d] font-bold rounded text-sm transition">+</button>
                      </div>
                    </div>
                  );
                })()}

                {/* LFO Speed */}
                <div className="flex flex-col gap-1 text-xs text-[#a0a0a5]">
                  <label className="font-medium">LFO Speed (Hz):</label>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateTrackParameter('lfoRate', Math.max(0, parseFloat(((currentInspectedTrack?.lfoRate ?? 0) - 1).toFixed(1))))} className="flex-none w-7 h-[30px] bg-[#1a1a24] border border-[#2d2d3a] hover:border-[#00ff9d] text-[#00ff9d] font-bold rounded text-sm transition">−</button>
                    <input type="number" min="0.0" max="30.0" step="1" value={currentInspectedTrack?.lfoRate ?? 0} onChange={(e) => updateTrackParameter('lfoRate', parseFloat(e.target.value) || 0)} className="flex-1 bg-black border border-[#24242f] text-white p-1.5 rounded focus:outline-none text-center min-w-0" />
                    <button onClick={() => updateTrackParameter('lfoRate', Math.min(30, parseFloat(((currentInspectedTrack?.lfoRate ?? 0) + 1).toFixed(1))))} className="flex-none w-7 h-[30px] bg-[#1a1a24] border border-[#2d2d3a] hover:border-[#00ff9d] text-[#00ff9d] font-bold rounded text-sm transition">+</button>
                  </div>
                </div>

                {/* LFO Depth */}
                <div className="flex flex-col gap-1 text-xs text-[#a0a0a5]">
                  <label className="font-medium">LFO Depth (Hz):</label>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateTrackParameter('lfoDepth', Math.max(0, (currentInspectedTrack?.lfoDepth ?? 0) - 100))} className="flex-none w-7 h-[30px] bg-[#1a1a24] border border-[#2d2d3a] hover:border-[#00ff9d] text-[#00ff9d] font-bold rounded text-sm transition">−</button>
                    <input type="number" min="0" max="4000" step="100" value={currentInspectedTrack?.lfoDepth ?? 0} onChange={(e) => updateTrackParameter('lfoDepth', parseInt(e.target.value) || 0)} className="flex-1 bg-black border border-[#24242f] text-white p-1.5 rounded focus:outline-none text-center min-w-0" />
                    <button onClick={() => updateTrackParameter('lfoDepth', Math.min(4000, (currentInspectedTrack?.lfoDepth ?? 0) + 100))} className="flex-none w-7 h-[30px] bg-[#1a1a24] border border-[#2d2d3a] hover:border-[#00ff9d] text-[#00ff9d] font-bold rounded text-sm transition">+</button>
                  </div>
                </div>

                {/* Distortion Drive */}
                <div className="flex flex-col gap-1 text-xs text-[#a0a0a5]">
                  <label className="font-medium">Drive (Distortion):</label>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateTrackParameter('drive', Math.max(0, parseFloat(((currentInspectedTrack?.drive ?? 0) - 0.05).toFixed(2))))} className="flex-none w-7 h-[30px] bg-[#1a1a24] border border-[#2d2d3a] hover:border-[#00ff9d] text-[#00ff9d] font-bold rounded text-sm transition">−</button>
                    <input type="number" min="0" max="1" step="0.05" value={currentInspectedTrack?.drive ?? 0} onChange={(e) => updateTrackParameter('drive', parseFloat(e.target.value) || 0)} className="flex-1 bg-black border border-[#24242f] text-white p-1.5 rounded focus:outline-none text-center min-w-0" />
                    <button onClick={() => updateTrackParameter('drive', Math.min(1, parseFloat(((currentInspectedTrack?.drive ?? 0) + 0.05).toFixed(2))))} className="flex-none w-7 h-[30px] bg-[#1a1a24] border border-[#2d2d3a] hover:border-[#00ff9d] text-[#00ff9d] font-bold rounded text-sm transition">+</button>
                  </div>
                </div>

              </div>

              <button 
                onClick={() => deleteTrack(activeTrackIndex)} 
                className="bg-red-500 hover:bg-red-600 text-white font-semibold px-4 py-1.5 rounded text-xs self-end transition"
              >
                Delete This Track
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-12 border border-dashed border-[#24242f] text-[#62626a] rounded-lg">
          All audio generation pipelines cleared. Hit "+ New Track" to restore matrix layers.
        </div>
      )}
    </div>
  );
}