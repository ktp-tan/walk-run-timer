let walkTime = 3 * 60; 
let runTime = 1 * 60; 
let endTime = 0; // Absolute timestamp for accurate counting
let timeRemaining = 0; 
let isWalkPhase = true; 
let timerInterval = null;
let isPaused = false;
let pausedTimeRemaining = 0; // Store remaining time when paused

let audioCtx = null;
let wakeLock = null;

// DOM Elements
const setupScreen = document.getElementById('setup-screen');
const timerScreen = document.getElementById('timer-screen');
const walkMinInput = document.getElementById('walk-min');
const walkSecInput = document.getElementById('walk-sec');
const runMinInput = document.getElementById('run-min');
const runSecInput = document.getElementById('run-sec');
const timeDisplay = document.getElementById('time-display');
const phaseBadge = document.getElementById('phase-badge');
const nextPhaseInfo = document.getElementById('next-phase-info');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const pauseBtn = document.getElementById('pause-btn');

// Input Handlers
function adjustTime(id, amount) {
    const input = document.getElementById(id);
    const max = id.includes('sec') ? 59 : 60;
    let val = parseInt(input.value || 0) + amount;
    
    if (val < 0) val = id.includes('sec') ? 59 : 0;
    if (val > max) val = id.includes('sec') ? 0 : max;
    
    input.value = val;
}

[walkMinInput, walkSecInput, runMinInput, runSecInput].forEach(input => {
    input.addEventListener('change', () => {
        let max = input.id.includes('sec') ? 59 : 60;
        let val = parseInt(input.value || 0);
        if (val < 0) val = 0;
        if (val > max) val = max;
        input.value = val;
    });
});

function formatTime(seconds) {
    if (seconds < 0) seconds = 0;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Sound generator (Soft Meditation Bell - 2 beats, slightly higher pitch)
function playSoftBell() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();

    function createPing(startTime) {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc.type = 'sine';
        // Higher pitch: 650Hz
        osc.frequency.setValueAtTime(650, startTime);

        gainNode.gain.setValueAtTime(0, startTime);
        // Fast attack, faster decay for distinct beats
        gainNode.gain.linearRampToValueAtTime(0.8, startTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 1.0);

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.start(startTime);
        osc.stop(startTime + 1.2);
    }

    const now = audioCtx.currentTime;
    createPing(now);         // First beat
    createPing(now + 0.4);   // Second beat
}

// Vibration
function triggerVibration() {
    if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
    }
}

function triggerAlerts() {
    playSoftBell();
    triggerVibration();
}

// Wake Lock API
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => {
                console.log('Screen Wake Lock released');
            });
            console.log('Screen Wake Lock acquired');
        }
    } catch (err) {
        console.error(`${err.name}, ${err.message}`);
    }
}

function releaseWakeLock() {
    if (wakeLock !== null) {
        wakeLock.release()
            .then(() => { wakeLock = null; });
    }
}

// Re-request wake lock when document becomes visible again
document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        requestWakeLock();
    }
});

// Timer Logic
function startTimer() {
    walkTime = (parseInt(walkMinInput.value) * 60) + parseInt(walkSecInput.value);
    runTime = (parseInt(runMinInput.value) * 60) + parseInt(runSecInput.value);
    
    if (walkTime === 0 && runTime === 0) return; // Prevent start if all zeros
    
    requestWakeLock();
    
    setupScreen.classList.remove('active');
    timerScreen.classList.add('active');
    
    isWalkPhase = true;
    isPaused = false;
    timeRemaining = walkTime;
    endTime = Date.now() + (timeRemaining * 1000);
    
    updateTimerDisplay();
    startInterval();
    
    // Unlock audio context
    playSoftBell(); 
}

function startInterval() {
    if (timerInterval) clearInterval(timerInterval);
    
    timerInterval = setInterval(() => {
        if (!isPaused) {
            // Calculate absolute difference to prevent drift if tab goes to background
            const now = Date.now();
            timeRemaining = Math.ceil((endTime - now) / 1000);
            
            if (timeRemaining <= 0) {
                switchPhase();
            } else {
                updateTimerDisplay();
            }
        }
    }, 100); // 100ms interval for more accurate UI updates
}

function switchPhase() {
    isWalkPhase = !isWalkPhase;
    timeRemaining = isWalkPhase ? walkTime : runTime;
    endTime = Date.now() + (timeRemaining * 1000); // Reset end time for new phase
    
    triggerAlerts();
    updateTimerDisplay();
}

function updateTimerDisplay() {
    timeDisplay.textContent = formatTime(timeRemaining);
    
    if (isWalkPhase) {
        phaseBadge.textContent = '🚶 เดิน (Walk)';
        nextPhaseInfo.textContent = `ต่อไป: วิ่ง ${formatTime(runTime)}`;
        document.body.className = 'phase-walk';
    } else {
        phaseBadge.textContent = '🏃 วิ่ง (Run)';
        nextPhaseInfo.textContent = `ต่อไป: เดิน ${formatTime(walkTime)}`;
        document.body.className = 'phase-run';
    }
}

function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    releaseWakeLock();
    
    document.body.className = '';
    timerScreen.classList.remove('active');
    setupScreen.classList.add('active');
}

function togglePause() {
    isPaused = !isPaused;
    if (isPaused) {
        pausedTimeRemaining = timeRemaining;
        pauseBtn.textContent = '▶️ ทำต่อ';
        pauseBtn.style.background = 'rgba(16, 185, 129, 0.2)';
        releaseWakeLock();
    } else {
        // Recalculate end time based on the remaining time
        endTime = Date.now() + (pausedTimeRemaining * 1000);
        pauseBtn.textContent = '⏸️ พัก';
        pauseBtn.style.background = 'rgba(255,255,255,0.1)';
        requestWakeLock();
    }
}

// Event Listeners
startBtn.addEventListener('click', startTimer);
stopBtn.addEventListener('click', stopTimer);
pauseBtn.addEventListener('click', togglePause);
