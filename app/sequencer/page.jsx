"use client";

import React, { useState, useEffect, useRef } from "react";

export default function SequencerPage() {
  // --- REACT STATES (UI & Parameter Display Layers) ---
  const [tracks, setTracks] = useState([
    { id: "1", name: "Bass Kick", type: "sine", freq: 85, timeSig: "4/4", attack: 0.005, attackCurve: "linear", decay: 0.18, decayCurve: "exponential", cutoff: 350, resonance: 1.5, lfoRate: 0, lfoDepth: 0, steps: 4, stepLength: 1.0, pattern: [1, 0, 0, 0], localStep: 0, nextStepTime: 0.0, active: true, analyser: null },
    { id: "2", name: "Analog Snare", type: "noise", freq: 320, timeSig: "3/4", attack: 0.01, attackCurve: "linear", decay: 0.14, decayCurve: "exponential", cutoff: 1200, resonance: 1.0, lfoRate: 8, lfoDepth: 300, steps: 3, stepLength: 1.0, pattern: [0, 0, 1], localStep: 0, nextStepTime: 0.0, active: true, analyser: null },
    { id: "3", name: "Synth Cymbal", type: "noise", freq: 1400, timeSig: "5/8", attack: 0.002, attackCurve: "linear", decay: 0.05, decayCurve: "linear", cutoff: 4000, resonance: 0.5, lfoRate: 15, lfoDepth: 800, steps: 5, stepLength: 0.5, pattern: [1, 1, 0, 1, 0], localStep: 0, nextStepTime: 0.0, active: true, analyser: null }
  ]);
  const [activeTrackIndex, setActiveTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(120);

  // --- ENGINE REFS (Persistent Audio Sandbox Memory) ---
  const audioCtxRef = useRef(null);
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

  // --- CORE AUDIO HARDWARE ENGINE ---
  const initAudioEngine = () => {
    if (!audioCtxRef.current) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContextClass();
      audioCtxRef.current = ctx;

      const bufferSize = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      noiseBufferRef.current = buffer;
    }

    const updatedTracks = tracks.map(track => {
      if (!track.analyser && audioCtxRef.current) {
        const ana = audioCtxRef.current.createAnalyser();
        ana.fftSize = 64;
        return { ...track, analyser: ana };
      }
      return track;
    });
    
    if (updatedTracks.some((t, i) => t.analyser !== tracks[i].analyser)) {
      setTracks(updatedTracks);
    }
  };

  // Helper calculation to handle custom envelope response curves
  const applyEnvelopeCurve = (param, targetValue, startTime, duration, type) => {
    const minVal = 0.0001; // Avoid exact 0 for exponential functions
    if (type === "exponential") {
      param.exponentialRampToValueAtTime(Math.max(minVal, targetValue), startTime + duration);
    } else if (type === "logarithmic") {
      // Logarithmic simulation using multiple scheduling nodes
      const segments = 10;
      for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        // Log curve equation mapping
        const logT = Math.log10(1 + 9 * t);
        const intermediateVal = minVal + (targetValue - minVal) * logT;
        param.linearRampToValueAtTime(intermediateVal, startTime + (duration * t));
      }
    } else {
      // Fallback Default: Linear
      param.linearRampToValueAtTime(targetValue, startTime + duration);
    }
  };

  const playSound = (track, time) => {
    const ctx = audioCtxRef.current;
    if (!ctx || !track.analyser) return;

    const voiceGain = ctx.createGain();
    const mainFilter = ctx.createBiquadFilter();

    mainFilter.connect(voiceGain);
    voiceGain.connect(track.analyser);
    track.analyser.connect(ctx.destination);

    const peakVolume = 0.35;
    voiceGain.gain.setValueAtTime(0.0001, time);
    
    // 1. Run Dynamic Attack Envelope
    applyEnvelopeCurve(voiceGain.gain, peakVolume, time, track.attack, track.attackCurve);
    
    // 2. Run Dynamic Decay Envelope
    const totalDuration = track.attack + track.decay;
    voiceGain.gain.setValueAtTime(peakVolume, time + track.attack);
    applyEnvelopeCurve(voiceGain.gain, 0.0001, time + track.attack, track.decay, track.decayCurve);

    mainFilter.type = 'lowpass';
    mainFilter.frequency.setValueAtTime(track.cutoff, time);
    mainFilter.Q.setValueAtTime(track.resonance, time);

    // Filter LFO Modulation Path
    if (track.lfoRate > 0 && track.lfoDepth > 0) {
      const lfoOsc = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      
      lfoOsc.type = 'sine';
      lfoOsc.frequency.setValueAtTime(track.lfoRate, time);
      lfoGain.gain.setValueAtTime(track.lfoDepth, time);
      
      lfoOsc.connect(lfoGain);
      lfoGain.connect(mainFilter.frequency);
      
      lfoOsc.start(time);
      lfoOsc.stop(time + totalDuration + 0.05);
    }

    // Audio Voicing Node Router
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
      
      if (track.type === 'sine' || track.name.toLowerCase().includes('kick')) {
        osc.frequency.setValueAtTime(track.freq, time);
        osc.frequency.exponentialRampToValueAtTime(0.01, time + totalDuration);
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

  // --- TRANSPORT HANDLERS ---
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
    let newAnalyser = null;

    if (audioCtxRef.current) {
      newAnalyser = audioCtxRef.current.createAnalyser();
      newAnalyser.fftSize = 64;
    }

    const nextTrackList = [
      ...tracks,
      {
        id: newId, name: "Perc Gen", type: "triangle", freq: 180, timeSig: "4/4", attack: 0.01, attackCurve: "linear", decay: 0.12, decayCurve: "exponential", cutoff: 1500, resonance: 1.0,
        lfoRate: 0, lfoDepth: 0, steps: 4, stepLength: 1.0, pattern: [0, 0, 0, 0], localStep: 0, nextStepTime: audioCtxRef.current ? audioCtxRef.current.currentTime : 0.0,
        active: true, analyser: newAnalyser
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

  // --- PARAMETER HYDRATION CONTROLLERS (Supports Click & Manual Value Entry) ---
  const updateTrackParameter = (field, value) => {
    const updated = [...tracks];
    
    if (field === 'timeSig') {
      updated[activeTrackIndex].timeSig = value;
      // Parse out fractional parts (e.g. "7/8" -> steps: 7, base length denominator: 8)
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

  // --- ANIMATION VISUALIZATION LOOPS ---
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

      const currentTrack = tracksRef.current[activeTrackIndex];
      const oscCanvas = tkCanvasRef.current;
      if (currentTrack && oscCanvas) {
        const oCtx = oscCanvas.getContext('2d');
        if (oscCanvas.width !== oscCanvas.clientWidth) { oscCanvas.width = oscCanvas.clientWidth; oscCanvas.height = oscCanvas.clientHeight; }
        oCtx.clearRect(0, 0, oscCanvas.width, oscCanvas.height);

        if (currentTrack.analyser) {
          const bins = currentTrack.analyser.frequencyBinCount;
          const dataArray = new Uint8Array(bins);
          currentTrack.analyser.getByteTimeDomainData(dataArray);

          oCtx.lineWidth = 2;
          oCtx.strokeStyle = currentTrack.active ? '#00ff9d' : '#4a4a52';
          oCtx.beginPath();

          const sliceWidth = oscCanvas.width / bins;
          let x = 0;
          for (let i = 0; i < bins; i++) {
            const v = dataArray[i] / 128.0;
            const y = (v * oscCanvas.height) / 2;
            if (i === 0) oCtx.moveTo(x, y);
            else oCtx.lineTo(x, y);
            x += sliceWidth;
          }
          oCtx.lineTo(oscCanvas.width, oscCanvas.height / 2);
          oCtx.stroke();
        }
      }
    };

    renderingContextLoop();
    return () => cancelAnimationFrame(animFrameId);
  }, [isPlaying, activeTrackIndex]);

  useEffect(() => {
    return () => clearTimeout(timerIdRef.current);
  }, []);

  const currentInspectedTrack = tracks[activeTrackIndex];

  return (
    <div className="w-full max-w-5xl bg-[#141419] border border-[#24242f] rounded-xl p-6 shadow-2xl text-[#e1e1e6]">
      
      {/* Audio Canvas Status Monitor Monitor */}
      <div className="bg-[#111a11] border-4 border-[#243324] rounded p-3 mb-5 shadow-inner">
        <div className="text-[#55ff55] font-mono text-xs uppercase tracking-widest opacity-80 mb-1.5">
          SYSTEM STATUS MATRIX // AUDIO CLOCK SYNCED MONITOR
        </div>
        <canvas ref={lcdCanvasRef} className="w-full h-20 block bg-transparent" />
      </div>

      {/* Global Control Headers */}
      <div className="flex justify-between items-center border-b-2 border-[#24242f] pb-4 mb-5">
        <h1 className="text-xl font-bold tracking-tight">Polymetric Next Engine</h1>
        <div className="flex items-center gap-4 bg-black/40 border border-[#24242f] px-4 py-2 rounded-md">
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
          <div className="bg-white/[0.01] border border-[#24242f] rounded-lg p-5 grid grid-cols-1 md:grid-cols-[240px_1fr] gap-5">
            
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

              <div className="flex flex-col gap-1 mt-4">
                <div className="text-[11px] text-[#8a8a93] uppercase font-semibold tracking-wider">Voice Output Wave</div>
                <canvas ref={tkCanvasRef} className="bg-[#050507] border border-[#1c1c24] rounded w-full h-14 block" />
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

              {/* Sound Architecture Matrix Configuration (Direct Numeric Inputs) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 bg-black/20 border border-[#1c1c24] p-4 rounded-md">
                
                <div className="flex flex-col gap-1 text-xs text-[#a0a0a5]">
                  <label className="font-medium">Generator Source:</label>
                  <select 
                    value={currentInspectedTrack?.type || "sine"}
                    onChange={(e) => updateTrackParameter('type', e.target.value)}
                    className="bg-black border border-[#24242f] text-white p-1.5 rounded focus:outline-none w-full"
                  >
                    <option value="sine">Sine Wave</option>
                    <option value="triangle">Triangle</option>
                    <option value="square">Square</option>
                    <option value="sawtooth">Sawtooth</option>
                    <option value="noise">White Noise</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1 text-xs text-[#a0a0a5]">
                  <label className="font-medium">Frequency (Hz):</label>
                  <input 
                    type="number" min="30" max="2500" step="10"
                    value={currentInspectedTrack?.freq ?? 100}
                    onChange={(e) => updateTrackParameter('freq', parseInt(e.target.value) || 0)}
                    className="bg-black border border-[#24242f] text-white p-1.5 rounded focus:outline-none w-full text-center"
                  />
                </div>

                <div className="flex flex-col gap-1 text-xs text-[#a0a0a5]">
                  <label className="font-medium">Attack Time (s):</label>
                  <input 
                    type="number" min="0.00" max="1.00" step="0.01"
                    value={currentInspectedTrack?.attack ?? 0.01}
                    onChange={(e) => updateTrackParameter('attack', parseFloat(e.target.value) || 0)}
                    className="bg-black border border-[#24242f] text-white p-1.5 rounded focus:outline-none w-full text-center"
                  />
                </div>

                <div className="flex flex-col gap-1 text-xs text-[#a0a0a5]">
                  <label className="font-medium">Attack Shape:</label>
                  <select 
                    value={currentInspectedTrack?.attackCurve || "linear"}
                    onChange={(e) => updateTrackParameter('attackCurve', e.target.value)}
                    className="bg-black border border-[#24242f] text-white p-1.5 rounded focus:outline-none w-full"
                  >
                    <option value="linear">Linear</option>
                    <option value="exponential">Exponential</option>
                    <option value="logarithmic">Logarithmic</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1 text-xs text-[#a0a0a5]">
                  <label className="font-medium">Decay Time (s):</label>
                  <input 
                    type="number" min="0.01" max="2.00" step="0.01"
                    value={currentInspectedTrack?.decay ?? 0.10}
                    onChange={(e) => updateTrackParameter('decay', parseFloat(e.target.value) || 0.01)}
                    className="bg-black border border-[#24242f] text-white p-1.5 rounded focus:outline-none w-full text-center"
                  />
                </div>

                <div className="flex flex-col gap-1 text-xs text-[#a0a0a5]">
                  <label className="font-medium">Decay Shape:</label>
                  <select 
                    value={currentInspectedTrack?.decayCurve || "exponential"}
                    onChange={(e) => updateTrackParameter('decayCurve', e.target.value)}
                    className="bg-black border border-[#24242f] text-white p-1.5 rounded focus:outline-none w-full"
                  >
                    <option value="linear">Linear</option>
                    <option value="exponential">Exponential</option>
                    <option value="logarithmic">Logarithmic</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1 text-xs text-[#a0a0a5]">
                  <label className="font-medium">Filter Cutoff (Hz):</label>
                  <input 
                    type="number" min="50" max="8000" step="50"
                    value={currentInspectedTrack?.cutoff ?? 1000}
                    onChange={(e) => updateTrackParameter('cutoff', parseInt(e.target.value) || 0)}
                    className="bg-black border border-[#24242f] text-white p-1.5 rounded focus:outline-none w-full text-center"
                  />
                </div>

                <div className="flex flex-col gap-1 text-xs text-[#a0a0a5]">
                  <label className="font-medium">Resonance (Q):</label>
                  <input 
                    type="number" min="0.0" max="25.0" step="0.5"
                    value={currentInspectedTrack?.resonance ?? 1.0}
                    onChange={(e) => updateTrackParameter('resonance', parseFloat(e.target.value) || 0)}
                    className="bg-black border border-[#24242f] text-white p-1.5 rounded focus:outline-none w-full text-center"
                  />
                </div>

                <div className="flex flex-col gap-1 text-xs text-[#a0a0a5]">
                  <label className="font-medium">LFO Speed (Hz):</label>
                  <input 
                    type="number" min="0.0" max="30.0" step="0.5"
                    value={currentInspectedTrack?.lfoRate ?? 0}
                    onChange={(e) => updateTrackParameter('lfoRate', parseFloat(e.target.value) || 0)}
                    className="bg-black border border-[#24242f] text-white p-1.5 rounded focus:outline-none w-full text-center"
                  />
                </div>

                <div className="flex flex-col gap-1 text-xs text-[#a0a0a5]">
                  <label className="font-medium">LFO Depth (Hz):</label>
                  <input 
                    type="number" min="0" max="4000" step="20"
                    value={currentInspectedTrack?.lfoDepth ?? 0}
                    onChange={(e) => updateTrackParameter('lfoDepth', parseInt(e.target.value) || 0)}
                    className="bg-black border border-[#24242f] text-white p-1.5 rounded focus:outline-none w-full text-center"
                  />
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