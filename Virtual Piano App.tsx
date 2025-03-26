import React, { useState, useEffect } from 'react';

const VirtualPiano = () => {
  const [activeKeys, setActiveKeys] = useState(new Set());
  const [volume, setVolume] = useState(0.5);

  // Piano key mapping (keyboard key to note)
  const keyMap = {
    'a': { note: 'C', key: 'A', type: 'white' },
    'w': { note: 'C#', key: 'W', type: 'black' },
    's': { note: 'D', key: 'S', type: 'white' },
    'e': { note: 'D#', key: 'E', type: 'black' },
    'd': { note: 'E', key: 'D', type: 'white' },
    'f': { note: 'F', key: 'F', type: 'white' },
    't': { note: 'F#', key: 'T', type: 'black' },
    'g': { note: 'G', key: 'G', type: 'white' },
    'y': { note: 'G#', key: 'Y', type: 'black' },
    'h': { note: 'A', key: 'H', type: 'white' },
    'u': { note: 'A#', key: 'U', type: 'black' },
    'j': { note: 'B', key: 'J', type: 'white' },
    'k': { note: 'C2', key: 'K', type: 'white' },
  };

  // Audio context setup
  const playNote = (note) => {
    const audio = new Audio(`https://assets.codepen.io/1075148/${note}.mp3`);
    audio.volume = volume;
    audio.play().catch(error => console.error('Error playing audio:', error));
  };

  const handleKeyDown = (event) => {
    const key = event.key.toLowerCase();
    if (keyMap[key] && !activeKeys.has(key)) {
      setActiveKeys(new Set([...activeKeys, key]));
      playNote(keyMap[key].note);
    }
  };

  const handleKeyUp = (event) => {
    const key = event.key.toLowerCase();
    if (keyMap[key]) {
      const newActiveKeys = new Set(activeKeys);
      newActiveKeys.delete(key);
      setActiveKeys(newActiveKeys);
    }
  };

  const handleMouseDown = (key) => {
    setActiveKeys(new Set([...activeKeys, key]));
    playNote(keyMap[key].note);
  };

  const handleMouseUp = (key) => {
    const newActiveKeys = new Set(activeKeys);
    newActiveKeys.delete(key);
    setActiveKeys(newActiveKeys);
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [activeKeys, volume]);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">
            Virtual Piano
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Use your keyboard or click the keys to play
          </p>
        </div>

        {/* Volume Control */}
        <div className="flex items-center justify-center mb-8 gap-4">
          <span className="text-gray-700 dark:text-gray-300">Volume</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-32 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
        </div>

        {/* Piano Keys */}
        <div className="relative flex justify-center">
          <div className="relative inline-flex">
            {Object.entries(keyMap).map(([key, { note, type, key: keyLabel }]) => (
              <div
                key={key}
                onMouseDown={() => handleMouseDown(key)}
                onMouseUp={() => handleMouseUp(key)}
                onMouseLeave={() => handleMouseUp(key)}
                className={`
                  ${type === 'white' 
                    ? 'relative w-16 h-48 bg-white dark:bg-gray-100 border border-gray-300 dark:border-gray-600 rounded-b-lg' 
                    : 'absolute w-10 h-32 bg-gray-800 dark:bg-gray-900 rounded-b-lg z-10'
                  }
                  ${activeKeys.has(key) 
                    ? type === 'white' 
                      ? 'bg-yellow-100 dark:bg-yellow-900' 
                      : 'bg-gray-700 dark:bg-gray-800'
                    : ''
                  }
                  transition-colors duration-75 cursor-pointer
                  hover:bg-gray-100 dark:hover:bg-gray-700
                `}
                style={{
                  marginLeft: type === 'black' ? '-1.25rem' : '0',
                  marginRight: type === 'black' ? '-1.25rem' : '0',
                }}
              >
                {/* Key Labels */}
                <div className={`
                  absolute bottom-4 left-1/2 transform -translate-x-1/2
                  flex flex-col items-center
                  ${type === 'white' 
                    ? 'text-gray-600 dark:text-gray-800' 
                    : 'text-white dark:text-gray-300'
                  }
                `}>
                  <span className="text-xs font-semibold">{note}</span>
                  <span className="text-xs mt-1 opacity-60">{keyLabel}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-8 text-center text-sm text-gray-600 dark:text-gray-400">
          <p>Press the corresponding keys on your keyboard or click the piano keys to play</p>
          <p className="mt-2">White keys: A, S, D, F, G, H, J, K</p>
          <p>Black keys: W, E, T, Y, U</p>
        </div>
      </div>
    </div>
  );
};

export default VirtualPiano;