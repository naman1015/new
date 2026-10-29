import { createContext, useContext, useState, useEffect, useRef } from 'react';
import api from '../api/axios';

const SeniorModeContext = createContext();

export function SeniorModeProvider({ children }) {
  const [seniorMode, setSeniorMode] = useState(() => {
    const saved = localStorage.getItem('seniorMode');
    return saved === 'true';
  });
  const audioRef = useRef(null);

  useEffect(() => {
    if (seniorMode) {
      document.body.classList.add('senior-mode');
      localStorage.setItem('seniorMode', 'true');
    } else {
      document.body.classList.remove('senior-mode');
      localStorage.setItem('seniorMode', 'false');
    }
  }, [seniorMode]);

  const toggleSeniorMode = () => setSeniorMode(prev => !prev);

  const stopSpeaking = () => {
    try {
      if (window.AndroidTTS && typeof window.AndroidTTS.stop === 'function') {
        window.AndroidTTS.stop();
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }
    } catch {
      // ignore
    }
  };

  const playAudioFallback = (cleanText) => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      const baseUrl = api.defaults.baseURL || '/api';
      const ttsUrl = `${baseUrl.replace(/\/+$/, '')}/tts?text=${encodeURIComponent(cleanText)}`;
      const audio = new Audio(ttsUrl);
      audio.playbackRate = 0.92;
      audioRef.current = audio;
      audio.play().catch((err) => {
        console.warn('Audio TTS playback error:', err);
      });
    } catch (err) {
      console.warn('Fallback TTS error:', err);
    }
  };

  // Voice Readout helper (works on Web, Android WebView APK, and mobile browsers)
  const speakText = (text) => {
    if (!text) return;
    const cleanText = String(text)
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleanText) return;

    stopSpeaking();

    // 1. If native Android TTS bridge is available and initialized, use it
    try {
      if (
        window.AndroidTTS &&
        typeof window.AndroidTTS.speak === 'function' &&
        (!window.AndroidTTS.isReady || window.AndroidTTS.isReady())
      ) {
        window.AndroidTTS.speak(cleanText);
        return;
      }
    } catch {
      // fall through
    }

    // 2. Inside Android WebView (; wv) or when Web Speech API is missing/voiceless, use /api/tts MP3 stream
    const isAndroidWebView = /;\s*wv\)|Android/i.test(navigator.userAgent || '');
    if (isAndroidWebView || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      playAudioFallback(cleanText);
      return;
    }

    // 3. Desktop/Web Speech Synthesis with automatic fallback if browser fails to start speaking
    try {
      let started = false;
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 0.85;
      utterance.pitch = 1.0;
      utterance.onstart = () => {
        started = true;
      };
      utterance.onerror = () => {
        if (!started) {
          playAudioFallback(cleanText);
        }
      };
      window.speechSynthesis.speak(utterance);

      setTimeout(() => {
        if (!started && !window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
          playAudioFallback(cleanText);
        }
      }, 450);
    } catch {
      playAudioFallback(cleanText);
    }
  };

  return (
    <SeniorModeContext.Provider value={{ seniorMode, toggleSeniorMode, speakText, stopSpeaking }}>
      {children}
    </SeniorModeContext.Provider>
  );
}

export function useSeniorMode() {
  return useContext(SeniorModeContext);
}
