"use client";

import React, { useState, useEffect, useRef } from "react";

export default function SequencerPage() {
  // --- REACT STATES (UI Layer Rendering Matrix) ---
  const [tracks, setTracks] = useState([
    { id: "1", name: "Bass Kick", type: "sine", freq: 85, attack: 0.02, decay: 0.25, volume: 0.7, cutoff: 350, resonance: 1.5, lfoRate: 0, lfoDepth: 0, steps: 4, stepLength: 1.0, pattern: [1, 0, 0, 0], localStep: 0, nextStepTime: 0.0, active: true, analyser: null },
    { id: "2", name: "Analog Snare", type: "noise", freq: 320, attack: 0.01, decay: 0.14, volume: 0.6, cutoff: 1200, resonance: 1.0, lfoRate: 8, lfoDepth: 300, steps: 3, stepLength: 1.0, pattern: [0, 0, 1], localStep: 0, nextStepTime: 0.0, active: true, analyser: null },
    { id: "3", name: "Synth Cymbal", type: "noise", freq: 1400, attack: 0.005, decay: 0.08, volume: 0.4, cutoff: 4000, resonance: 0.5, lfoRate: 15, lfoDepth: 800, steps: 5, stepLength: 0.5, pattern: [1, 1, 0, 1, 0], localStep: 0, nextStepTime: 0.0, active: true, analyser: null }
  ]);
  const [activeTrackIndex, setActiveTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(120);

  // --- ENGINE REFS (Persistent Audio Engine Memory Layers) ---
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

  const stepLengthOptions = [0.25, 0.5, 1.0, 2.0];
  const stepLengthLabels = { 0.25: "1/16 Note", 0.5: "1/8 Note", 1.0: "1/4 Note", 2.0: "1/2 Note" };
  
  const waveTypeOptions = ["sine", "triangle", "square", "sawtooth", "noise"];
  const waveTypeLabels = { sine: "Sine", triangle: "Triangle", square: "Square", sawtooth: "Sawtooth", noise: "White Noise" };

  // --- CORE SYSTEM AUDIO ENGINE ---
  const initAudioEngine = (currentTracks) => {
    let ctx = audioCtxRef.current;
    if (!ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioContextClass();
      audioCtxRef.current = ctx;

      const bufferSize = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      noiseBufferRef.current = buffer;
    }

    return currentTracks.map(track => {
      if (!track.analyser) {
        const ana = ctx.createAnalyser();
        ana.fftSize = 64;
        return { ...track, analyser: ana };
      }
      return track;
    });
  };

  const playSound = (track, time) => {
    const ctx = audioCtxRef.current;
    if (!ctx || !track.analyser) return;

    const voiceGain = ctx.createGain();
    const mainFilter = ctx.createBiquadFilter();

    mainFilter.connect(voiceGain);
    voiceGain.connect(track.analyser);
    track.analyser.connect(ctx.destination);

    const totalDuration = track.attack + track.decay;
    const targetGainVolume = (track.volume ?? 0.7) * 0.45;

    voiceGain.gain.setValueAtTime(0.0001, time);
    voiceGain.gain.linearRampToValueAtTime(targetGainVolume, time + track.attack);
    voiceGain.gain.exponentialRampToValueAtTime(0.0001, time + totalDuration);

    mainFilter.type = 'lowpass';
    mainFilter.frequency.setValueAtTime(track.cutoff, time);
    mainFilter.Q.setValueAtTime(track.resonance, time);

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

  // --- AUDIO CLOCK SYSTEM SCHEDULER ---
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
    if (isPlaying) {
      clearTimeout(timerIdRef.current);
      setIsPlaying(false);
      tracks.forEach(t => triggerVisualStepFlash(t.id, -1));
    } else {
      const initializedTracks = initAudioEngine(tracks);
      const ctx = audioCtxRef.current;
      
      if (ctx.state === 'suspended') ctx.resume();
      audioClockStartTimeRef.current = ctx.currentTime;
      
      const startTime = ctx.currentTime + 0.05;
      const resetTracks = initializedTracks.map(track => ({
        ...track,
        nextStepTime: startTime,
        localStep: 0
      }));

      tracksRef.current = resetTracks;
      setTracks(resetTracks);
      setIsPlaying(true);
      bpmRef.current = bpm;
      
      setTimeout(runScheduler, 0);
    }
  };

  const adjustNumericParameter = (field, minVal, maxVal, stepVal, direction) => {
    const updated = [...tracks];
    let currentVal = updated[activeTrackIndex][field] ?? 0;
    
    let newVal = currentVal + (stepVal * direction);
    
    const decimalPlaces = (stepVal.toString().split('.')[1] || '').length;
    newVal = parseFloat(newVal.toFixed(decimalPlaces));
    
    newVal = Math.max(minVal, Math.min(maxVal, newVal));
    updated[activeTrackIndex][field] = newVal;

    if (field === 'steps') {
      let pattern = [...updated[activeTrackIndex].pattern];
      while (pattern.length < newVal) pattern.push(0);
      if (pattern.length > newVal) pattern = pattern.slice(0, newVal);
      updated[activeTrackIndex].pattern = pattern;
    }

    setTracks(updated);
  };

  const cycleSelectParameter = (field, optionsArray, direction) => {
    const updated = [...tracks];
    const currentVal = updated[activeTrackIndex][field];
    const currentIndex = optionsArray.indexOf(currentVal);
    
    let nextIndex = currentIndex + direction;
    if (nextIndex >= optionsArray.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = optionsArray.length - 1;
    
    updated[activeTrackIndex][field] = optionsArray[nextIndex];
    setTracks(updated);
  };

  const addNewTrack = () => {
    const initializedTracks = initAudioEngine(tracks);
    const newId = Date.now().toString();
    let newAnalyser = null;

    if (audioCtxRef.current) {
      newAnalyser = audioCtxRef.current.createAnalyser();
      newAnalyser.fftSize = 64;
    }

    const nextTrackList = [
      ...initializedTracks,
      {
        id: newId, name: "Perc Gen", type: "triangle", freq: 180, attack: 0.01, decay: 0.12, volume: 0.7, cutoff: 1500, resonance: 1.0,
        lfoRate: 0, lfoDepth: 0, steps: 4, stepLength: 1.0, pattern: [0, 0, 0, 0], localStep: 0, nextStepTime: audioCtxRef.current ? audioCtxRef.current.currentTime : 0.0,
        active: true, analyser: newAnalyser
      }
    ];

    tracksRef.current = nextTrackList;
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

      // 1. Master Matrix Display
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

      // 2. Full-Width Oscilloscope Waveform Panel
      const currentTrack = tracksRef.current[activeTrackIndex];
      const staticCanvas = tkCanvasRef.current;
      if (currentTrack && staticCanvas) {
        const oCtx = staticCanvas.getContext('2d');
        if (staticCanvas.width !== staticCanvas.clientWidth) { 
          staticCanvas.width = staticCanvas.clientWidth; 
          staticCanvas.height = staticCanvas.clientHeight; 
        }
        oCtx.clearRect(0, 0, staticCanvas.width, staticCanvas.height);

        const W = staticCanvas.width;
        const H = staticCanvas.height;
        const A = currentTrack.attack;
        const D = currentTrack.decay;
        const totalT = A + D || 0.01;

        const padX = 30; // Increased padding for wide container aesthetics
        const usableW = W - (padX * 2);
        const peakX = padX + (A / totalT) * usableW;
        const endX = W - padX;

        // Engineering backdrop grid
        oCtx.strokeStyle = "rgba(255, 255, 255, 0.025)";
        oCtx.lineWidth = 1;
        
        // Horizontal grid segments
        for (let gi = 1; gi < 6; gi++) {
          let yLine = (H / 6) * gi;
          oCtx.beginPath(); oCtx.moveTo(0, yLine); oCtx.lineTo(W, yLine); oCtx.stroke();
        }
        // Vertical grid lines tracking timeline chunks across full screen width
        for (let vi = 1; vi < 12; vi++) {
          let xLine = (W / 12) * vi;
          oCtx.beginPath(); oCtx.moveTo(xLine, 0); oCtx.lineTo(xLine, H); oCtx.stroke();
        }

        // Structural envelope perimeter guidance lines
        oCtx.strokeStyle = 'rgba(0, 255, 157, 0.05)';
        oCtx.lineWidth = 1;
        oCtx.beginPath();
        oCtx.moveTo(padX, H - 20);
        oCtx.lineTo(peakX, 20);
        oCtx.lineTo(endX, H - 20);
        oCtx.stroke();

        // Trace reactive audio generation cycles inside envelope borders
        oCtx.lineWidth = 1.75;
        oCtx.strokeStyle = currentTrack.active ? '#00ff9d' : '#4a4a52';
        oCtx.beginPath();

        const truePhysicalCycles = currentTrack.freq * totalT;
        // With screen-wide resolution, we can render significantly more real cycles (up to 120) before needing compression thresholds
        const visualCycleDensity = Math.min(120, Math.max(4, truePhysicalCycles * 0.4));

        for (let x = padX; x <= endX; x++) {
          let envelopeScaler = 0;
          if (x < peakX) {
            envelopeScaler = (x - padX) / (peakX - padX || 1);
          } else {
            envelopeScaler = 1.0 - (x - peakX) / (endX - peakX || 1);
          }

          const phase = ((x - padX) / usableW) * Math.PI * 2 * visualCycleDensity;
          let waveShapeValue = 0;

          switch (currentTrack.type) {
            case 'sine': 
              waveShapeValue = Math.sin(phase); 
              break;
            case 'triangle': 
              waveShapeValue = (Math.abs((phase % (Math.PI * 2)) - Math.PI) / Math.PI) * 2 - 1; 
              break;
            case 'square': 
              waveShapeValue = Math.sin(phase) >= 0 ? 1 : -1; 
              break;
            case 'sawtooth': 
              waveShapeValue = ((phase % (Math.PI * 2)) / (Math.PI * 2)) * 2 - 1; 
              break;
            case 'noise': 
              waveShapeValue = Math.random() * 2 - 1; 
              break;
            default: 
              waveShapeValue = Math.sin(phase);
          }

          if (currentTrack.type !== 'noise' && currentTrack.freq > currentTrack.cutoff) {
            const lossCoefficient = Math.max(0.1, currentTrack.cutoff / currentTrack.freq);
            waveShapeValue *= lossCoefficient;
          }

          const midY = H / 2;
          const trackVolumeGainScaler = currentTrack.volume ?? 0.7;
          const maxAmplitudeHeight = ((H / 2) - 25) * trackVolumeGainScaler;
          const finalY = midY + (waveShapeValue * envelopeScaler * maxAmplitudeHeight);

          if (x === padX) oCtx.moveTo(x, finalY);
          else oCtx.lineTo(x, finalY);
        }
        oCtx.stroke();
      }
    };

    renderingContextLoop();
    return () => cancelAnimationFrame(animFrameId);
  }, [isPlaying, activeTrackIndex, tracks]);

  useEffect(() => {
    return () => clearTimeout(timerIdRef.current);
  }, []);

  const currentInspectedTrack = tracks[activeTrackIndex];

  const MobileStepperControl = ({ label, value, onDecrement, onIncrement, displaySuffix = "" }) => (
    <div className="flex flex-col gap-1 text-xs text-[#a0a0a5]">
      <label className="font-semibold px-0.5">{label}</label>
      <div className="flex items-center bg-black border border-[#24242f] rounded h-10 overflow-hidden">
        <button 
          onClick={onDecrement}
          className="bg-[#1c1c24] hover:bg-[#252533] active:bg-[#2e2e3a] text-[#00ff9d] text-lg font-bold px-4 h-full transition select-none"
        >
          -
        </button>
        <div className="text-white text-center font-mono font-medium text-xs w-full select-none">
          {value}{displaySuffix}
        </div>
        <button 
          onClick={onIncrement}
          className="bg-[#1c1c24] hover:bg-[#252533] active:bg-[#2e2e3a] text-[#00ff9d] text-lg font-bold px-4 h-full transition select-none"
        >
          +
        </button>
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-5xl bg-[#141419] border border-[#24242f] rounded-xl p-4 sm:p-6 shadow-2xl text-[#e1e1e6]">
      
      {/* Master Matrix Display Grid Status Sync */}
      <div className="bg-[#111a11] border-4 border-[#243324] rounded p-3 mb-5 shadow-inner">
        <div className="text-[#55ff55] font-mono text-xs uppercase tracking-widest opacity-80 mb-1.5">
          SYSTEM STATUS MATRIX // AUDIO CLOCK SYNCED MONITOR
        </div>
        <canvas ref={lcdCanvasRef} className="w-full h-20 block bg-transparent" />
      </div>

      {/* Global Control Headers */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-b-2 border-[#24242f] pb-4 mb-5">
        <h1 className="text-xl font-bold tracking-tight">Polymetric Next Engine</h1>
        <div className="flex flex-wrap items-center justify-center gap-3 bg-black/40 border border-[#24242f] p-2 rounded-md w-full sm:w-auto">
          <button 
            onClick={toggleTransport} 
            className={`font-bold px-5 py-2 rounded text-sm transition h-10 w-24 sm:w-auto ${isPlaying ? 'bg-red-500 text-white' : 'bg-[#00ff9d] text-black'}`}
          >
            {isPlaying ? "Stop" : "Start"}
          </button>
          
          <div className="flex items-center bg-black border border-[#24242f] rounded h-10 overflow-hidden w-32">
            <button 
              onClick={() => { const nextBpm = Math.max(40, bpm - 5); setBpm(nextBpm); bpmRef.current = nextBpm; }}
              className="bg-[#1c1c24] hover:bg-[#252533] text-[#00ff9d] font-bold px-2.5 h-full"
            >
              -
            </button>
            <div className="text-white text-center font-mono text-xs w-full">
              {bpm} <span className="text-[10px] text-neutral-500">BPM</span>
            </div>
            <button 
              onClick={() => { const nextBpm = Math.min(240, bpm + 5); setBpm(nextBpm); bpmRef.current = nextBpm; }}
              className="bg-[#1c1c24] hover:bg-[#252533] text-[#00ff9d] font-bold px-2.5 h-full"
            >
              +
            </button>
          </div>

          <button onClick={addNewTrack} className="bg-[#24242b] border border-[#24242f] hover:bg-[#32323d] text-[#e1e1e6] font-bold px-3 py-2 rounded text-sm transition h-10 w-full sm:w-auto">
            + New Track
          </button>
        </div>
      </div>

      {/* Track Selection Carousel Block */}
      {tracks.length > 0 ? (
        <>
          <div className="flex justify-between items-center bg-black/20 border border-[#24242f] px-2 py-2 rounded-md mb-4">
            <button 
              onClick={() => setActiveTrackIndex((activeTrackIndex - 1 + tracks.length) % tracks.length)} 
              className="bg-[#24242b] border border-[#24242f] text-[#00ff9d] text-lg font-bold px-4 py-1.5 rounded hover:bg-[#2e2e3a] transition"
            >
              &#x25C0;
            </button>
            <div className="flex items-center gap-3 text-center">
              <span className="font-bold text-base sm:text-lg text-[#00ff9d]">{currentInspectedTrack?.name}</span>
              <span className="text-xs font-mono text-[#8a8a93] hidden sm:inline">{`[Track ${activeTrackIndex + 1} of ${tracks.length}]`}</span>
            </div>
            <button 
              onClick={() => setActiveTrackIndex((activeTrackIndex + 1) % tracks.length)} 
              className="bg-[#24242b] border border-[#24242f] text-[#00ff9d] text-lg font-bold px-4 py-1.5 rounded hover:bg-[#2e2e3a] transition"
            >
              &#x25B6;
            </button>
          </div>

          {/* Focused Single Deck Workspace Interface Layout Matrix */}
          <div className="bg-white/[0.01] border border-[#24242f] rounded-lg p-4 sm:p-5 flex flex-col gap-5">
            
            {/* Top Control Settings Meta Line */}
            <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4 items-center border-b border-[#24242f]/60 pb-4">
              <input 
                type="text" 
                value={currentInspectedTrack?.name || ""} 
                onChange={(e) => {
                  const updated = [...tracks];
                  updated[activeTrackIndex].name = e.target.value;
                  setTracks(updated);
                }}
                className="bg-transparent border-b border-transparent text-white font-bold text-lg py-1 w-full focus:outline-none focus:border-[#00ff9d] hover:border-[#24242f]"
              />
              
              <div className="flex justify-between md:justify-end items-center gap-3">
                <span className="bg-[#1a1a24] text-[#00ff9d] border border-[#2d2d38] font-mono text-xs px-2.5 py-1.5 rounded">
                  {currentInspectedTrack ? `${currentInspectedTrack.steps}/${currentInspectedTrack.stepLength === 0.5 ? '8' : currentInspectedTrack.stepLength === 0.25 ? '16' : currentInspectedTrack.stepLength === 2.0 ? '2' : '4'}` : "4/4"}
                </span>
                <div className="flex gap-1.5">
                  <button 
                    onClick={() => adjustNumericParameter('active', false, true, true, 1)}
                    className="bg-[#1a1a24] border border-[#24242f] hover:bg-[#252533] text-xs font-bold px-3 py-1.5 text-[#b5b5bd] rounded transition"
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
                    className="bg-[#1a1a24] border border-[#24242f] hover:bg-[#252533] text-xs font-bold px-3 py-1.5 text-[#b5b5bd] rounded transition"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>

            {/* Rhythmic Step Trigger Container Nodes */}
            <div className="flex gap-1.5 flex-wrap bg-black/30 border border-[#24242f]/40 p-3 rounded-md">
              {currentInspectedTrack?.pattern.map((step, idx) => (
                <div
                  key={idx}
                  onClick={() => toggleStepNode(idx)}
                  className={`step-node-${currentInspectedTrack.id} flex-1 min-w-[40px] h-11 rounded text-xs flex items-center justify-center cursor-pointer select-none font-semibold transition border border-transparent ${
                    step === 1 ? 'bg-[#00ff9d] text-black font-bold' : 'bg-[#1c1c24] text-[#62626a]'
                  }`}
                >
                  {idx + 1}
                </div>
              ))}
            </div>

            {/* FULL WIDE HIGH-RESOLUTION OSCILLOSCOPE PANEL */}
            <div className="flex flex-col gap-1.5 w-full bg-black/40 border border-[#24242f] p-3 rounded-lg shadow-inner">
              <div className="text-[10px] text-[#8a8a93] uppercase font-bold tracking-wider px-1">
                High-Resolution Structural Oscilloscope View // Reactive Phase Trace
              </div>
              <canvas ref={tkCanvasRef} className="bg-[#050507] border border-[#1c1c24] rounded w-full h-40 block" />
            </div>

            {/* Sound Design Tactical Control Grid Array */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-black/20 border border-[#1c1c24] p-4 rounded-md mt-1">
              
              <MobileStepperControl 
                label="Track Volume Level"
                value={Math.round((currentInspectedTrack?.volume ?? 0.7) * 100)}
                displaySuffix="%"
                onDecrement={() => adjustNumericParameter('volume', 0.0, 1.0, 0.05, -1)}
                onIncrement={() => adjustNumericParameter('volume', 0.0, 1.0, 0.05, 1)}
              />

              <MobileStepperControl 
                label="Base Pitch Frequency"
                value={currentInspectedTrack?.freq || 100}
                displaySuffix=" Hz"
                onDecrement={() => adjustNumericParameter('freq', 30, 2500, 10, -1)}
                onIncrement={() => adjustNumericParameter('freq', 30, 2500, 10, 1)}
              />

              <MobileStepperControl 
                label="Envelope Attack Time"
                value={currentInspectedTrack?.attack ?? 0.01}
                displaySuffix=" s"
                onDecrement={() => adjustNumericParameter('attack', 0.00, 0.50, 0.01, -1)}
                onIncrement={() => adjustNumericParameter('attack', 0.00, 0.50, 0.01, 1)}
              />

              <MobileStepperControl 
                label="Envelope Decay Time"
                value={currentInspectedTrack?.decay ?? 0.10}
                displaySuffix=" s"
                onDecrement={() => adjustNumericParameter('decay', 0.01, 1.50, 0.01, -1)}
                onIncrement={() => adjustNumericParameter('decay', 0.01, 1.50, 0.01, 1)}
              />

              <MobileStepperControl 
                label="Generator Oscillator Source"
                value={waveTypeLabels[currentInspectedTrack?.type || "sine"]}
                onDecrement={() => cycleSelectParameter('type', waveTypeOptions, -1)}
                onIncrement={() => cycleSelectParameter('type', waveTypeOptions, 1)}
              />

              <MobileStepperControl 
                label="Divisions (Steps)"
                value={currentInspectedTrack?.steps || 4}
                onDecrement={() => adjustNumericParameter('steps', 1, 32, 1, -1)}
                onIncrement={() => adjustNumericParameter('steps', 1, 32, 1, 1)}
              />

              <MobileStepperControl 
                label="Step Duration Scaling"
                value={stepLengthLabels[currentInspectedTrack?.stepLength || 1.0]}
                onDecrement={() => cycleSelectParameter('stepLength', stepLengthOptions, -1)}
                onIncrement={() => cycleSelectParameter('stepLength', stepLengthOptions, 1)}
              />

              <MobileStepperControl 
                label="Filter Lowpass Cutoff"
                value={currentInspectedTrack?.cutoff || 1000}
                displaySuffix=" Hz"
                onDecrement={() => adjustNumericParameter('cutoff', 50, 8000, 50, -1)}
                onIncrement={() => adjustNumericParameter('cutoff', 50, 8000, 50, 1)}
              />

              <MobileStepperControl 
                label="Filter Resonance Intensity"
                value={currentInspectedTrack?.resonance ?? 1.0}
                displaySuffix=" Q"
                onDecrement={() => adjustNumericParameter('resonance', 0.0, 25.0, 0.5, -1)}
                onIncrement={() => adjustNumericParameter('resonance', 0.0, 25.0, 0.5, 1)}
              />

              <MobileStepperControl 
                label="LFO Rate Filter Speed"
                value={currentInspectedTrack?.lfoRate ?? 0}
                displaySuffix=" Hz"
                onDecrement={() => adjustNumericParameter('lfoRate', 0.0, 30.0, 0.5, -1)}
                onIncrement={() => adjustNumericParameter('lfoRate', 0.0, 30.0, 0.5, 1)}
              />

              <div className="sm:col-span-2">
                <MobileStepperControl 
                  label="LFO Filter Cutoff Depth"
                  value={currentInspectedTrack?.lfoDepth ?? 0}
                  displaySuffix=" Hz"
                  onDecrement={() => adjustNumericParameter('lfoDepth', 0, 4000, 20, -1)}
                  onIncrement={() => adjustNumericParameter('lfoDepth', 0, 4000, 20, 1)}
                />
              </div>
            </div>

            <button 
              onClick={() => deleteTrack(activeTrackIndex)} 
              className="bg-red-500/80 hover:bg-red-600 active:bg-red-700 text-white font-semibold px-4 py-2 rounded text-xs self-end transition w-full sm:w-auto"
            >
              Delete This Track
            </button>
          </div>
        </>
      ) : (
        <div className="text-center py-12 border border-dashed border-[#24242f] text-[#62626a] rounded-lg text-sm">
          All audio generation pipelines cleared. Hit "+ New Track" to restore matrix layers.
        </div>
      )}
    </div>
  );
}