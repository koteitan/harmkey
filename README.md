# Harmonic Canvas

A simple web-based application to explore and play harmonics of a base frequency (440Hz - A4) using different sound sources.

## Features

-   **Interactive Canvas**: A 7x7 grid on an HTML canvas allows users to play harmonics from 1 to 49.
    -   Click and drag on the canvas to trigger different harmonic sounds.
    -   Cells are arranged with the 1st harmonic at the bottom-left, increasing to the 49th at the top-right.
-   **Sound Sources**:
    -   **Sine Wave**: A pure sine wave tone that fades out over 1 second.
    -   **Piano**: Uses a fetched A4 piano sample, with pitch adjusted via playback rate. The piano sound has an envelope for attack, sustain, and release.
-   **PC Keyboard Control**:
    -   Play specific harmonics using your computer keyboard:
        -   `a, s, d, f, g, h, j, k, l, ;` map to base harmonics 1-10.
        -   `z, x, c, v, b, n, m, ,, .` map to base harmonics 11-19.
    -   **Harmonic Offset**: Use the **ArrowUp** and **ArrowDown** keys to add/subtract an offset of 10 to the base harmonic played by PC keys. The current offset is displayed on the page.
        -   The offset allows playing harmonics up to the 49th via the PC keyboard.
-   **Polyphony**: PC keyboard input supports playing multiple notes simultaneously. Canvas input is monophonic (dragging to a new cell stops the previous one).

## Files

-   `index.html`: The main HTML structure, including the canvas and controls.
-   `style.css`: Styles for the page layout and elements.
-   `main.js`: Core application logic, including:
    -   AudioContext setup.
    -   Sine wave generation.
    -   Canvas drawing and interaction (mouse/touch).
    -   PC keyboard input handling and harmonic offset logic.
    -   Integration with `piano.js`.
-   `piano.js`: Handles loading and playing the piano sample with pitch adjustment.

## How to Use

1.  Clone or download the project files.
2.  Open `index.html` in a modern web browser.
3.  An internet connection is required for the piano sound, as the sample is fetched from an external URL.
4.  Use the dropdown to select between "Sine Wave" and "Piano" sound sources.
5.  Interact with the canvas by clicking and dragging, or use the PC keyboard as described above.

## Credits

-   **Product by**: [koteitan](https://twitter.com/koteitan)
-   **Programmed by**: Cline + Gemini 1.5 Pro
-   **Source code**: [koteitan/harmkey on GitHub](https://github.com/koteitan/harmkey)
