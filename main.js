document.addEventListener('DOMContentLoaded', () => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const soundSourceSelect = document.getElementById('sound-source');
    const canvas = document.getElementById('harmonic-canvas'); // Get canvas element
    const ctx = canvas.getContext('2d');

    // Initialize Piano
    if (typeof Piano !== 'undefined' && Piano.init) {
        Piano.init(audioContext);
    } else {
        console.error("Piano object not found. Ensure piano.js is loaded before main.js");
    }

    const baseFrequency = 440; // A4
    // const numButtons = 100; // For a 10x10 grid - No longer directly used for button count
    // const harmonics = Array.from({ length: numButtons }, (_, i) => i + 1); // Harmonics 1 to 100 - Not needed for canvas like this
    const activeOscillators = {}; // For polyphony and stopping notes

    // --- Sound Generation ---
    function playTone(frequency, type = 'sine') {
        if (!audioContext) return;

        // If a sound for this frequency is already active, stop it first to allow re-triggering.
        if (activeOscillators[frequency]) {
            // Infer type from stored data if possible, default to 'sine' if only oscillator exists
            const existingSound = activeOscillators[frequency];
            const existingType = existingSound.type || (existingSound.oscillator ? 'sine' : 'piano');
            stopTone(frequency, existingType); 
            // stopTone will delete activeOscillators[frequency], allowing new sound creation.
        }

        let oscillatorNode; // Renamed to avoid conflict with oscillator in scope
        if (type === 'sine') {
            oscillatorNode = audioContext.createOscillator();
            oscillatorNode.type = 'sine';
            oscillatorNode.frequency.setValueAtTime(frequency, audioContext.currentTime);

            const gainNode = audioContext.createGain();
            gainNode.gain.setValueAtTime(0.25, audioContext.currentTime); // Initial volume (approx -6dB from 0.5, Hold this volume)
            // gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 1); // Removed: Fade out over 1 sec

            oscillatorNode.connect(gainNode);
            gainNode.connect(audioContext.destination);
            oscillatorNode.start();
            // Store with type for easier management in stopTone
            activeOscillators[frequency] = { oscillator: oscillatorNode, gainNode, type: 'sine' };

            oscillatorNode.onended = () => {
                // Check if this specific oscillator is still the one in activeOscillators
                // to prevent issues if it was already stopped and replaced by a new one.
                if (activeOscillators[frequency] && activeOscillators[frequency].oscillator === oscillatorNode) {
                    stopTone(frequency, 'sine');
                }
            };
        } else if (type === 'piano') {
            if (Piano && Piano.play) {
                const pianoSound = Piano.play(frequency);
                if (pianoSound) {
                    activeOscillators[frequency] = { pianoSound, type: 'piano' };
                }
            } else {
                console.warn('Piano playback function not available. Falling back to sine wave.');
                playTone(frequency, 'sine'); // Fallback
            }
            return; 
        }
    }

    function stopTone(frequency, type) { // Added type parameter
        const soundData = activeOscillators[frequency];
        if (!soundData) return;

        if (type === 'sine' || (soundData.oscillator && !type && soundData.type === 'sine')) {
            const { oscillator, gainNode } = soundData;
            if (oscillator) {
                // Detach onended to prevent it from calling stopTone again after we've handled it.
                oscillator.onended = null; 
                try {
                    const now = audioContext.currentTime;
                    // Cancel any scheduled gain changes
                    gainNode.gain.cancelScheduledValues(now);
                    // Set current gain value to start ramp from current level
                    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
                    // Exponential ramp to (almost) zero over 0.5 seconds
                    gainNode.gain.exponentialRampToValueAtTime(0.00001, now + 0.5);
                    
                    // Stop the oscillator after the ramp is complete
                    oscillator.stop(now + 0.51); // Stop slightly after ramp finishes
                    
                    // Do not disconnect immediately, let the ramp play out.
                    // The oscillator's onended event (if still attached and source not replaced) 
                    // or garbage collection will handle cleanup.
                    // Or, more explicitly, we can manage disconnection in a timeout or onended,
                    // but for now, removing immediate disconnects.
                } catch (e) {
                    // console.warn(`Error during sine wave stop ramp for frequency ${frequency}:`, e);
                    // Fallback to immediate stop if ramping fails
                    try { oscillator.stop(); } catch (e2) {}
                    if (gainNode) try { gainNode.disconnect(); } catch (e2) {} // Attempt cleanup
                    try { oscillator.disconnect(); } catch (e2) {}
                }
            } else if (oscillator) { // If only oscillator exists (no gainNode)
                try { oscillator.stop(); } catch (e) {}
            }
        } else if (type === 'piano' || (soundData.pianoSound && !type && soundData.type === 'piano')) {
            if (Piano && Piano.stop) {
                Piano.stop(frequency); // Piano object handles its own stopping logic
            }
        } else {
            console.warn(`stopTone called for frequency ${frequency} with unhandled type: ${type}. Sound data:`, soundData);
        }
        
        delete activeOscillators[frequency]; // Clean up the reference
    }

    // --- Canvas Setup and Drawing ---
    const gridSize = 7; // 7x7 grid
    const totalCanvasCells = gridSize * gridSize; // 49
    let cellSize; // Will be calculated based on canvas size
    let currentlyPlayingCell = { x: -1, y: -1, frequency: null, displayValue: null }; // For mouse drag, added displayValue
    let isMouseDown = false;

    function drawGrid() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        cellSize = canvas.width / gridSize; // Assuming square canvas

        for (let row = 0; row < gridSize; row++) { // y-coordinate on canvas
            for (let col = 0; col < gridSize; col++) { // x-coordinate on canvas
                // Harmonic calculation: bottom-left (1) to top-right (100)
                // Canvas y=0 is top. Grid row 0 is top.
                // Grid row (0 to 9) maps to canvas y.
                // Grid col (0 to 9) maps to canvas x.
                // Linear cell index (0 to 48), from bottom-left to top-right
                const linearIndex = (gridSize - 1 - row) * gridSize + col; // 0 for bottom-left, 48 for top-right
                
                const referenceCellLinearIndex = 21; // Changed: Cell that was "1/8" (index 21) is now "1x"
                
                let frequencyValue;
                let displayValue; // Text to display on the cell

                if (linearIndex === referenceCellLinearIndex) {
                    frequencyValue = baseFrequency; // 1x
                    displayValue = "1x";
                } else if (linearIndex > referenceCellLinearIndex) {
                    // Positive harmonics: 2x, 3x, ...
                    const harmonicMultiple = linearIndex - referenceCellLinearIndex + 1;
                    frequencyValue = baseFrequency * harmonicMultiple;
                    displayValue = `${harmonicMultiple}x`;
                } else { // linearIndex < referenceCellLinearIndex
                    // Subharmonics: 1/2, 1/3, ...
                    // The cell "just before" reference (index 27) is 1/2. Cell 0 is 1/(28+1) = 1/29? No, 1/(referenceCellLinearIndex - linearIndex + 1)
                    // linearIndex 27 -> divisor = 28 - 27 + 1 = 2. So 1/2.
                    // linearIndex 0 -> divisor = 28 - 0 + 1 = 29. So 1/29.
                    const subharmonicDivisor = (referenceCellLinearIndex - linearIndex) + 1;
                    frequencyValue = baseFrequency / subharmonicDivisor;
                    displayValue = `1/${subharmonicDivisor}`;
                }
                
                const isMouseActive = (currentlyPlayingCell.x === col && currentlyPlayingCell.y === row);
                const isPcKeyActive = activePcKeyLinearIndices.has(linearIndex);

                if (isMouseActive || isPcKeyActive) {
                    ctx.fillStyle = '#3e8e41'; // Active color for both mouse/touch and PC key
                } else {
                    ctx.fillStyle = '#4CAF50'; // Default color
                }
                ctx.fillRect(col * cellSize, row * cellSize, cellSize -1 , cellSize -1);
                
                // Display the harmonic/subharmonic value (top part of cell)
                const harmonicFontSize = Math.max(8, Math.floor(cellSize * 0.25));
                ctx.fillStyle = 'white';
                ctx.font = `${harmonicFontSize}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(displayValue, col * cellSize + cellSize / 2, row * cellSize + cellSize * 0.35); // Positioned higher

                // Display the physical PC key character if this cell matches its CURRENT sound (after shift)
                let pcCharToDisplayOnCell = ''; // Declare only once
                const currentCellHarmonic = getHarmonicForCell(linearIndex); // Get harmonic for the current cell being drawn

                for (const pk of pcKeys) { // Iterate over defined pcKeys
                    const keyInfo = getHarmonicInfoForPcKey(pk, pcKeyShiftOffset); // Use the correct function name
                    if (keyInfo && keyInfo.harmonic !== null) { // Check if keyInfo and its harmonic property are valid
                        const harmonicOfPcKey = keyInfo.harmonic; // Get the harmonic value
                        const tolerance = 0.0001;
                        // Check if the PC key's current harmonic value matches the harmonic value of the cell being drawn
                        if (Math.abs(harmonicOfPcKey - currentCellHarmonic) < tolerance) {
                            pcCharToDisplayOnCell = pk; // Assign to the single declared variable
                            break; // Found the PC key that maps to this cell's sound
                        }
                    }
                }

                if (pcCharToDisplayOnCell) {
                    const pcKeyFontSize = Math.max(8, Math.floor(cellSize * 0.3));
                    // ctx.fillStyle = '#dddddd'; // Slightly different color for PC key char if needed
                    ctx.font = `bold ${pcKeyFontSize}px sans-serif`; // Make it bold
                    ctx.fillText(pcCharToDisplayOnCell, col * cellSize + cellSize / 2, row * cellSize + cellSize * 0.75); // Positioned lower
                }
            }
        }
    }
    
    function getCellFromCoordinates(x, y) {
        const rect = canvas.getBoundingClientRect();
        const canvasX = x - rect.left;
        const canvasY = y - rect.top;

        // Check against the actual display dimensions from getBoundingClientRect
        if (canvasX < 0 || canvasX >= rect.width || canvasY < 0 || canvasY >= rect.height) {
            return null; // Outside canvas
        }

        // Calculate cell dimensions based on the actual display size
        const cellWidth = rect.width / gridSize;
        const cellHeight = rect.height / gridSize;

        const col = Math.floor(canvasX / cellWidth);
        const row = Math.floor(canvasY / cellHeight); // Use cellHeight for row calculation
        return { col, row };
    }

    function playNoteForCell(col, row) {
        if (col === currentlyPlayingCell.x && row === currentlyPlayingCell.y) {
            return; // Already playing this cell
        }

        // Stop previously playing note if dragging to a new cell
        if (currentlyPlayingCell.frequency !== null) {
            stopTone(currentlyPlayingCell.frequency, soundSourceSelect.value);
        }

        // Calculate frequency based on new scheme
        const linearIndex = (gridSize - 1 - row) * gridSize + col;
        const referenceCellLinearIndex = 21; // Changed: Cell that was "1/8" (index 21) is now "1x"
        let frequency;
        let displayValue;

        if (linearIndex === referenceCellLinearIndex) {
            frequency = baseFrequency;
            displayValue = "1x";
        } else if (linearIndex > referenceCellLinearIndex) {
            const harmonicMultiple = linearIndex - referenceCellLinearIndex + 1;
            frequency = baseFrequency * harmonicMultiple;
            displayValue = `${harmonicMultiple}x`;
        } else {
            const subharmonicDivisor = (referenceCellLinearIndex - linearIndex) + 1;
            frequency = baseFrequency / subharmonicDivisor;
            displayValue = `1/${subharmonicDivisor}`;
        }
        
        if (frequency <= 0 || frequency > audioContext.sampleRate / 2) {
             console.warn("Frequency out of range:", frequency); return;
        }

        playTone(frequency, soundSourceSelect.value);
        
        currentlyPlayingCell = { x: col, y: row, frequency, displayValue };
        drawGrid(); // Redraw to show active cell
    }

    canvas.addEventListener('mousedown', (event) => {
        isMouseDown = true;
        const cell = getCellFromCoordinates(event.clientX, event.clientY);
        if (cell) {
            playNoteForCell(cell.col, cell.row);
        }
    });

    canvas.addEventListener('mousemove', (event) => {
        if (!isMouseDown) return;
        const cell = getCellFromCoordinates(event.clientX, event.clientY);
        if (cell) {
            playNoteForCell(cell.col, cell.row);
        } else { // Mouse dragged outside canvas
            if (currentlyPlayingCell.frequency !== null) {
                stopTone(currentlyPlayingCell.frequency, soundSourceSelect.value);
                currentlyPlayingCell = { x: -1, y: -1, frequency: null };
                drawGrid(); // Redraw to remove active cell highlight
            }
        }
    });

    canvas.addEventListener('mouseup', () => {
        isMouseDown = false;
        if (currentlyPlayingCell.frequency !== null) {
            stopTone(currentlyPlayingCell.frequency, soundSourceSelect.value);
            currentlyPlayingCell = { x: -1, y: -1, frequency: null };
            drawGrid(); // Redraw to remove active cell highlight
        }
    });
    
    canvas.addEventListener('mouseleave', () => { // If mouse leaves canvas while pressed
        if (isMouseDown) {
            isMouseDown = false; // Treat as mouseup
            if (currentlyPlayingCell.frequency !== null) {
                stopTone(currentlyPlayingCell.frequency, soundSourceSelect.value);
                currentlyPlayingCell = { x: -1, y: -1, frequency: null };
                drawGrid();
            }
        }
    });

    // Touch events for mobile (simplified version)
    canvas.addEventListener('touchstart', (event) => {
        event.preventDefault();
        isMouseDown = true; // Reuse mouse down flag
        const touch = event.touches[0];
        const cell = getCellFromCoordinates(touch.clientX, touch.clientY);
        if (cell) {
            playNoteForCell(cell.col, cell.row);
        }
    });

    canvas.addEventListener('touchmove', (event) => {
        event.preventDefault();
        if (!isMouseDown) return;
        const touch = event.touches[0];
        const cell = getCellFromCoordinates(touch.clientX, touch.clientY);
        if (cell) {
            playNoteForCell(cell.col, cell.row);
        } else {
            if (currentlyPlayingCell.frequency !== null) {
                stopTone(currentlyPlayingCell.frequency, soundSourceSelect.value);
                currentlyPlayingCell = { x: -1, y: -1, frequency: null };
                drawGrid();
            }
        }
    });

    canvas.addEventListener('touchend', (event) => {
        event.preventDefault();
        isMouseDown = false;
        if (currentlyPlayingCell.frequency !== null) {
            stopTone(currentlyPlayingCell.frequency, soundSourceSelect.value);
            currentlyPlayingCell = { x: -1, y: -1, frequency: null };
            drawGrid();
        }
    });


    // Initial draw
    // Ensure canvas dimensions are set before first draw if they depend on CSS
    // For fixed size canvas, this is fine. If responsive, might need resize observer.
    window.addEventListener('load', () => { // Ensure canvas is ready
        cellSize = canvas.width / gridSize; // Calculate cell size after canvas is potentially sized by CSS
        drawGrid();
    });
    // Fallback if load event already fired or for quicker setup
    if (document.readyState === 'complete') {
         cellSize = canvas.width / gridSize;
         drawGrid();
    }


    // --- PC Keyboard Input & Display Mapping ---

    let pcKeyShiftOffset = 0; // 0 = default, 1 = shifted up, -1 = shifted down, etc.
    const pressedKeys = new Set();

    // 화면 셀의 linearIndex (0-48) からハーモニック値を取得する関数
    function getHarmonicForCell(linearIndex) {
        const referenceCellLinearIndex = 21; // 1x の音に対応するセルのインデックス
        if (linearIndex === referenceCellLinearIndex) {
            return 1; // 1x
        } else if (linearIndex > referenceCellLinearIndex) {
            const multiple = (linearIndex - referenceCellLinearIndex + 1);
            return multiple; // 倍音
        } else { // linearIndex < referenceCellLinearIndex
            const divisor = (referenceCellLinearIndex - linearIndex) + 1;
            if (divisor === 0) return 1; // Should not happen
            return 1 / divisor; // サブハーモニック
        }
    }

    // 使用するPCキーの配列 (下段左から上段右へ)
    const pcKeys = [
        'z', 'x', 'c', 'v', 'm', ',', '.',  // 7 keys
        'a', 's', 'd', 'f', 'j', 'k', 'l',  // 7 keys
        'q', 'w', 'e', 'r', 'u', 'i', 'o'   // 7 keys
    ]; // Total 21 keys

    // シフト0の時の、各PCキーが対応する画面セルの initial linearIndex
    const defaultPcKeyInitialCellIndex = {};
    const zInitialCellIndex = 14; // 'z'キーは linearIndex 14 から始まる
    pcKeys.forEach((key, index) => {
        defaultPcKeyInitialCellIndex[key] = zInitialCellIndex + index;
    });

    // This function calculates the HARMONIC VALUE and corresponding CELL INDEX 
    // for a pressed PC key based on the current shift
    function getHarmonicInfoForPcKey(physicalKey, shift) {
        if (defaultPcKeyInitialCellIndex[physicalKey] === undefined) {
            return null; 
        }

        const baseCellIndex = defaultPcKeyInitialCellIndex[physicalKey];
        let shiftedCellIndex = baseCellIndex + (shift * 7);

        shiftedCellIndex = Math.max(0, Math.min(48, shiftedCellIndex)); // Clamp to 0-48

        return {
            cellIndex: shiftedCellIndex,
            harmonic: getHarmonicForCell(shiftedCellIndex)
        };
    }

    const activePcKeyLinearIndices = new Set(); // To store linearIndices of active PC keys

    function updatePcKeyShiftIndicator() {
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        let offsetIndicator = document.getElementById('pc-key-shift-indicator');
        let helpTextElement = document.getElementById('pc-key-help-text');

        if (isTouchDevice) {
            if (offsetIndicator) offsetIndicator.remove();
            if (helpTextElement) helpTextElement.remove();
        } else {
            if (!offsetIndicator) {
                offsetIndicator = document.createElement('p');
                offsetIndicator.id = 'pc-key-shift-indicator';
                const container = canvas.parentNode;
                container.insertBefore(offsetIndicator, canvas.nextSibling);
            }
            offsetIndicator.textContent = `PC Key Sound Shift Offset: ${pcKeyShiftOffset}`;

            if (!helpTextElement) {
                helpTextElement = document.createElement('p');
                helpTextElement.id = 'pc-key-help-text';
                if (offsetIndicator.parentNode) {
                     offsetIndicator.parentNode.insertBefore(helpTextElement, offsetIndicator);
                }
            }
            helpTextElement.textContent = 'カーソルキー（↑↓）でキーボードの音程割り当てを変更できます。';
            helpTextElement.style.display = '';
            offsetIndicator.style.display = '';
        }
        drawGrid();
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        updatePcKeyShiftIndicator();
    } else {
        window.addEventListener('DOMContentLoaded', updatePcKeyShiftIndicator);
    }
    window.addEventListener('resize', updatePcKeyShiftIndicator);

    document.addEventListener('keydown', (event) => {
        const key = event.key.toLowerCase();

        if (event.key === 'ArrowUp') {
            pcKeyShiftOffset++;
            if (pcKeyShiftOffset > 3) pcKeyShiftOffset = 3;
            updatePcKeyShiftIndicator();
            event.preventDefault();
            return;
        }
        if (event.key === 'ArrowDown') {
            pcKeyShiftOffset--;
            if (pcKeyShiftOffset < -3) pcKeyShiftOffset = -3;
            updatePcKeyShiftIndicator();
            event.preventDefault();
            return;
        }

        // Check if the key is one of the mapped PC keys
        if (defaultPcKeyInitialCellIndex[key] !== undefined && !pressedKeys.has(key)) {
            const keyHarmonicInfo = getHarmonicInfoForPcKey(key, pcKeyShiftOffset);
            
            if (keyHarmonicInfo === null || keyHarmonicInfo.harmonic === null) return; 

            const harmonicValue = keyHarmonicInfo.harmonic;
            let frequency;
            if (harmonicValue >= 1) {
                frequency = baseFrequency * harmonicValue;
            } else { 
                frequency = baseFrequency * harmonicValue;
            }

            if (frequency > 0 && frequency < audioContext.sampleRate / 2) {
                playTone(frequency, soundSourceSelect.value);
                pressedKeys.add(key);
                activePcKeyLinearIndices.add(keyHarmonicInfo.cellIndex);
                drawGrid(); // Redraw to show active PC key cell
            }
        }
    });

    document.addEventListener('keyup', (event) => {
        const key = event.key.toLowerCase();
        if (defaultPcKeyInitialCellIndex[key] !== undefined) {
            const keyHarmonicInfo = getHarmonicInfoForPcKey(key, pcKeyShiftOffset);

            // We still need to get harmonicValue to stop the correct sound,
            // even if keyHarmonicInfo or its harmonic is null (e.g. if key was unmapped during a shift change while held)
            // However, for stopping, we primarily need the frequency that was played.
            // The current approach of recalculating harmonic value on keyup is generally okay.
            
            let harmonicValueToStop;
            if (keyHarmonicInfo && keyHarmonicInfo.harmonic !== null) {
                harmonicValueToStop = keyHarmonicInfo.harmonic;
                activePcKeyLinearIndices.delete(keyHarmonicInfo.cellIndex);
            } else {
                // Fallback: try to get the harmonic value based on the key's default mapping if current shift is problematic
                // This part is tricky if the mapping changed significantly while key was held.
                // For simplicity, we'll assume the sound to stop corresponds to the key's *current* shifted value.
                // If a key becomes unmapped, its sound might not stop correctly with this simple approach.
                // A more robust solution would store the *actual playing frequency* with the pressedKey.
                // For now, we proceed with recalculating.
                const fallbackInfo = getHarmonicInfoForPcKey(key, pcKeyShiftOffset); // Recalculate for stopping
                if (fallbackInfo && fallbackInfo.harmonic !== null) {
                    harmonicValueToStop = fallbackInfo.harmonic;
                    // activePcKeyLinearIndices.delete(fallbackInfo.cellIndex); // Already handled or not added if null
                }
            }

            if (harmonicValueToStop === undefined) return;


            let frequency;
            if (harmonicValueToStop >= 1) {
                frequency = baseFrequency * harmonicValueToStop; // Use harmonicValueToStop
            } else {
                frequency = baseFrequency * harmonicValueToStop; // Use harmonicValueToStop
            }

            if (soundSourceSelect.value === 'piano' && frequency > 0) {
                Piano.stop(frequency); 
            } else if (soundSourceSelect.value === 'sine' && frequency > 0) {
                stopTone(frequency, 'sine'); // Call stopTone for sine wave
            }
            // Note: If other sound sources are added in the future, their stop logic would go here.

            pressedKeys.delete(key);
            drawGrid(); // Redraw to remove PC key highlight
        }
    });

    // --- Sound Source Selection ---
    soundSourceSelect.addEventListener('change', () => {
        // Future: May need to stop all current sounds or handle transition
        console.log(`Sound source changed to: ${soundSourceSelect.value}`);
    });

    // Ensure AudioContext is resumed on user interaction (browsers require this)
    function resumeAudioContext() {
        if (audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
                console.log('AudioContext resumed successfully');
            }).catch(e => console.error('Error resuming AudioContext:', e));
        }
    }
    // Add event listeners for user interaction to resume AudioContext
    ['click', 'keydown', 'touchstart'].forEach(eventName => {
        document.body.addEventListener(eventName, resumeAudioContext, { once: true });
    });

});
