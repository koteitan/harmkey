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
            gainNode.gain.setValueAtTime(0.5, audioContext.currentTime); // Initial volume
            gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 1); // Fade out over 1 sec

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
                    // If we need an immediate stop (e.g. for re-triggering), cancel ramps and stop.
                    if (gainNode) {
                        gainNode.gain.cancelScheduledValues(audioContext.currentTime);
                        // Optionally, a very quick ramp down if not relying on the main playTone ramp.
                        // gainNode.gain.setValueAtTime(gainNode.gain.value, audioContext.currentTime);
                        // gainNode.gain.linearRampToValueAtTime(0.00001, audioContext.currentTime + 0.01);
                        // oscillator.stop(audioContext.currentTime + 0.02);
                        
                        // For now, just ensure it stops. The playTone ramp is usually what we hear.
                        // If playTone is called again, it creates a new oscillator.
                        // This explicit stop ensures the old one is gone.
                         gainNode.disconnect(); // Disconnect from destination
                         oscillator.disconnect(); // Disconnect from gainNode
                    }
                    oscillator.stop();
                } catch (e) {
                    // console.warn(`Error stopping sine oscillator for frequency ${frequency}:`, e);
                }
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
    const gridSize = 7; // Changed to 7x7 grid
    const totalCanvasHarmonics = gridSize * gridSize; // 49
    let cellSize; // Will be calculated based on canvas size
    let currentlyPlayingCell = { x: -1, y: -1, frequency: null }; // For mouse drag
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
                // Harmonic = (gridSize - 1 - canvas_row_index) * gridSize + canvas_col_index + 1
                // Example: Top-left (row=0, col=0) -> (9-0)*10 + 0 + 1 = 91
                // Bottom-left (row=9, col=0) -> (9-9)*10 + 0 + 1 = 1
                // Top-right (row=0, col=9) -> (9-0)*10 + 9 + 1 = 100
                // Bottom-right (row=9, col=9) -> (9-9)*10 + 9 + 1 = 10

                const harmonic = (gridSize - 1 - row) * gridSize + col + 1;
                
                ctx.fillStyle = (currentlyPlayingCell.x === col && currentlyPlayingCell.y === row) ? '#3e8e41' : '#4CAF50';
                ctx.fillRect(col * cellSize, row * cellSize, cellSize -1 , cellSize -1); // -1 for grid lines
                
                // No text on buttons as per new requirement
                // ctx.fillStyle = 'white';
                // ctx.font = `${cellSize * 0.2}px sans-serif`;
                // ctx.textAlign = 'center';
                // ctx.textBaseline = 'middle';
                // ctx.fillText(harmonic.toString(), col * cellSize + cellSize / 2, row * cellSize + cellSize / 2);
            }
        }
    }
    
    function getCellFromCoordinates(x, y) {
        const rect = canvas.getBoundingClientRect();
        const canvasX = x - rect.left;
        const canvasY = y - rect.top;

        if (canvasX < 0 || canvasX >= canvas.width || canvasY < 0 || canvasY >= canvas.height) {
            return null; // Outside canvas
        }

        const col = Math.floor(canvasX / cellSize);
        const row = Math.floor(canvasY / cellSize);
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

        const harmonic = (gridSize - 1 - row) * gridSize + col + 1;
        if (harmonic < 1 || harmonic > totalCanvasHarmonics) return; 

        const frequency = baseFrequency * harmonic;
        playTone(frequency, soundSourceSelect.value);
        
        currentlyPlayingCell = { x: col, y: row, frequency };
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


    // --- PC Keyboard Input ---
    let harmonicOffset = 0; // Initial offset
    const basePcHarmonics = {
        // Row 1 (ASDF...)
        'a': 1, 's': 2, 'd': 3, 'f': 4, 'g': 5, 'h': 6, 'j': 7, 'k': 8, 'l': 9, ';': 10,
        // Row 2 (ZXCV...)
        'z': 11, 'x': 12, 'c': 13, 'v': 14, 'b': 15, 'n': 16, 'm': 17, ',': 18, '.': 19 // Using 19 for '.', 20 for '/' if needed
        // Note: ';' ',' '.' might need careful handling based on keyboard layouts / event.key values.
    };

    const pressedKeys = new Set(); // To handle key repeats and polyphony

    function updateOffsetDisplay() {
        let offsetDisplay = document.getElementById('offset-display');
        if (!offsetDisplay) { // Create if not exists
            offsetDisplay = document.createElement('p');
            offsetDisplay.id = 'offset-display';
            const pTagHelp = document.querySelector('.container > p'); // Find the help text p tag
            if (pTagHelp && pTagHelp.parentNode) {
                 pTagHelp.parentNode.insertBefore(offsetDisplay, pTagHelp); // Insert before help text
            } else { // Fallback if help text p isn't found
                canvas.parentNode.insertBefore(offsetDisplay, canvas.nextSibling);
            }
        }
        offsetDisplay.textContent = `PC Key Harmonic Offset: +${harmonicOffset}`;
    }
    updateOffsetDisplay();

    document.addEventListener('keydown', (event) => {
        const key = event.key.toLowerCase();

        if (event.key === 'ArrowUp') {
            harmonicOffset += 10;
            // Max offset: highest base key is 19 (for '.').
            // We want basePcHarmonics['.'] + harmonicOffset <= totalCanvasHarmonics (49)
            // So, max harmonicOffset = totalCanvasHarmonics - basePcHarmonics['.'] = 49 - 19 = 30.
            // Let's make it a multiple of 10, so maxOffset = 30.
            const maxOffset = Math.floor((totalCanvasHarmonics - basePcHarmonics['.']) / 10) * 10; // e.g. 30
            if (harmonicOffset > maxOffset) harmonicOffset = maxOffset;
            updateOffsetDisplay();
            event.preventDefault();
            return;
        }
        if (event.key === 'ArrowDown') {
            harmonicOffset -= 10;
            if (harmonicOffset < 0) harmonicOffset = 0; // Min offset is 0
            updateOffsetDisplay();
            event.preventDefault();
            return;
        }

        if (basePcHarmonics[key] && !pressedKeys.has(key)) {
            const baseHarmonic = basePcHarmonics[key];
            const finalHarmonic = baseHarmonic + harmonicOffset; // Use offset
            
            const frequency = baseFrequency * finalHarmonic;

            // Ensure finalHarmonic is within a reasonable range and frequency is valid.
            if (finalHarmonic >= 1 && finalHarmonic <= totalCanvasHarmonics && frequency > 0 && frequency < audioContext.sampleRate / 2) {
                playTone(frequency, soundSourceSelect.value);
                pressedKeys.add(key);
                
                // Visual feedback for PC keys on canvas
                // Convert finalHarmonic (1-49) back to col, row for highlighting
                // Harmonic = (gridSize - 1 - row) * gridSize + col + 1
                // (Harmonic - 1) = (gridSize-1 - row) * gridSize + col
                // col = (Harmonic - 1) % gridSize
                // (gridSize-1 - row) = floor((Harmonic - 1) / gridSize)
                // row = (gridSize-1) - floor((Harmonic - 1) / gridSize)
                const tempHarmonic = finalHarmonic - 1; // 0 to totalCanvasHarmonics-1
                const pcCol = tempHarmonic % gridSize;
                const pcRow = (gridSize - 1) - Math.floor(tempHarmonic / gridSize);

                if (pcCol >= 0 && pcCol < gridSize && pcRow >=0 && pcRow < gridSize) {
                    // Temporarily highlight the cell, then redraw normal on keyup or timeout
                    // This is a simplified highlight; a more robust way would be to store active PC cells.
                    ctx.fillStyle = '#2a6a2c'; // Darker green for PC key press
                    ctx.fillRect(pcCol * cellSize, pcRow * cellSize, cellSize -1 , cellSize -1);
                    // No need to update currentlyPlayingCell for PC keys unless we want mouse to take over
                }
            }
        }
    });

    document.addEventListener('keyup', (event) => {
        const key = event.key.toLowerCase();
        if (basePcHarmonics[key]) { 
            const baseHarmonic = basePcHarmonics[key];
            const finalHarmonic = baseHarmonic + harmonicOffset;
            const frequency = baseFrequency * finalHarmonic;

            if (soundSourceSelect.value === 'piano') {
                stopTone(frequency, 'piano');
            }
            pressedKeys.delete(key);
            
            // Redraw grid to remove PC key highlight (if any)
            // This will clear any temporary highlight from keydown.
            // If a mouse-dragged cell is active, it will be redrawn correctly by drawGrid.
            drawGrid(); 
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
