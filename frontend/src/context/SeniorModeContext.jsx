import { createContext, useContext, useState, useEffect } from 'react';

const SeniorModeContext = createContext();

export function SeniorModeProvider({ children }) {
  const [seniorMode, setSeniorMode] = useState(() => {
    const saved = localStorage.getItem('seniorMode');
    return saved === 'true';
  });

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

  // Web Speech API Voice Readout helper
  const speakText = (text) => {
    if ('speechSynthesis' in window) {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.85; // Speak slightly slower for seniors
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } else {
      console.warn('Speech synthesis not supported in this browser.');
    }
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
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
