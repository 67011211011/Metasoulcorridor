const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

canvas.width = 1024;
canvas.height = 576;
const cx = canvas.width / 2;
const cy = canvas.height / 2;

// ขนาดการแสดงผลคุมด้วย CSS ใน index.html (ขยายตามหน้าต่าง / เต็มจอได้)
canvas.style.imageRendering = "auto";
ctx.imageSmoothingEnabled = true;

let currentRoom = 1;
let currentRoomType = "normal"; 
let totalCoins = 0; 
let message = "";
let messageTimer = 0;
let gameStartTime = Date.now(); 

const doorFrame = { x: cx - 110, y: 150, w: 220, h: 300 };
const doorInner = { x: cx - 95, y: 165, w: 190, h: 285 };
const wardrobeHitbox = { x: 30, y: 130, w: 180, h: 420 }; 
const windowRect = { x: canvas.width - 240, y: 140, w: 140, h: 220 }; 
const exitWardrobeBtn = { x: canvas.width - 220, y: canvas.height - 75, w: 180, h: 50 };

let activeItems = [];
let roomDecorations = [];
let flashlightBattery = 100;
let mousePos = { x: cx, y: cy };

let lightFlicker = 1; 
let roomLight = "normal";   // normal | dark | bright (สุ่มทุกห้อง)

let isOpeningDoor = false; 
let doorOpenProgress = 0; 
let fadeAlpha = 0; 
let isFadingIn = true; 

let isWalking = false;
let walkProgress = 0;
let walkBob = 0;

let isHiding = false;             
let isTransitioningHide = false;
let hideAnimProgress = 0; 
let hideAnimDirection = 1; 

// ผีหลัก
let ghostState = "none"; 
let ghostTimer = 0;
let ghostAlpha = 0;
let jumpscareScale = 1;

// ผีหน้าต่าง (Endoskeleton Ghost)
let windowGhostState = "none"; 
let windowGhostAlpha = 0.4;
let windowJumpscareScale = 1;
let windowGhostRiseProgress = 0; 
let windowGhostEyeGlow = 0; 
let windowGhostShineProgress = 0; 
let windowGhostTimer = 0; 

// ผีข้างตู้เสื้อผ้า
let wardrobeGhostState = "none"; 
let wardrobeGhostTimer = 0;
let wardrobeGhostAlpha = 0;
let wardrobeJumpscareScale = 1;
let wardrobeGhostPeekProgress = 0;

let isGameOver = false;

canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mousePos.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mousePos.y = (e.clientY - rect.top) * (canvas.height / rect.height);
});

function getFormattedRoom(num) {
    return num.toString().padStart(4, '0');
}

canvas.addEventListener("click", (e) => {
    if (isGameOver || isTransitioningHide) return resetGameIfOver();
    if (isOpeningDoor || isWalking) return; 

    const rect = canvas.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const clickY = (e.clientY - rect.top) * (canvas.height / rect.height);

    if (isHiding) {
        const gapX = canvas.width - 280;
        const gapW = 160;
        
        if (currentRoomType === "normal" && wardrobeGhostState === "peeking") {
            if (clickX >= gapX && clickX <= gapX + gapW && clickY >= 100 && clickY <= 500) {
                wardrobeGhostState = "none";
                showMessage("รอดไป... วิญญาณถอยกลับเข้าไปในความมืดแล้ว");
                return;
            }
        }

        if (clickX >= exitWardrobeBtn.x && clickX <= exitWardrobeBtn.x + exitWardrobeBtn.w &&
            clickY >= exitWardrobeBtn.y && clickY <= exitWardrobeBtn.y + exitWardrobeBtn.h) {
            if (wardrobeGhostState === "peeking") {
                return;
            } else {
                toggleHide();
            }
        }
        return;
    }

    if ((ghostState === "active" || ghostState === "warning") && !isHiding) {
        const floatY = Math.sin(Date.now() * 0.002) * 8;
        const gX = cx; const gY = 240 + floatY;
        const ghostW = 160; const ghostH = 280;
        if (clickX >= gX - ghostW/2 && clickX <= gX + ghostW/2 &&
            clickY >= gY - ghostH/2 && clickY <= gY + ghostH/2) {
            ghostState = "jumpscare";
            jumpscareScale = 2;
            showMessage("😱 คุณไปสัมผัสโดนวิญญาณร้ายเข้า!");
            return;
        }
    }

    for (let i = activeItems.length - 1; i >= 0; i--) {
        let item = activeItems[i];
        const clickDist = item.radius * 2.5; 
        const floatY = Math.sin((Date.now() * 0.003) + item.offset) * 12;
        
        const dx = clickX - item.x;
        const dy = clickY - (item.y + floatY);
        if (Math.sqrt(dx * dx + dy * dy) <= clickDist) {
            if (item.type === "coin") {
                totalCoins += item.value;
                showMessage(`👻 ดูดซับวิญญาณได้ +${item.value} Soul Coins!`);
            } else if (item.type === "battery") {
                flashlightBattery = Math.min(100, flashlightBattery + 40);
                showMessage("🔋 ได้ถ่านไฟฉาย! พลังงานเพิ่มขึ้น");
            }
            activeItems.splice(i, 1);
            return;
        }
    }

    if (clickX >= doorInner.x && clickX <= doorInner.x + doorInner.w &&
        clickY >= doorInner.y && clickY <= doorInner.y + doorInner.h) {
        startOpenDoor();
    }

    if (clickX >= wardrobeHitbox.x && clickX <= wardrobeHitbox.x + wardrobeHitbox.w &&
        clickY >= wardrobeHitbox.y && clickY <= wardrobeHitbox.y + wardrobeHitbox.h) {
        toggleHide();
    }
});

function resetGameIfOver() {
    if (isGameOver) resetGame();
}

window.addEventListener("keydown", (e) => {
    if (isGameOver) return resetGame();
    if ((e.key === " " || e.key === "w" || e.key === "W") && !isOpeningDoor && !isWalking && !isHiding && !isTransitioningHide) startOpenDoor();
    if (e.key === "s" || e.key === "S" || e.key === "ArrowDown") {
        if (isHiding && wardrobeGhostState === "peeking") {
            return;
        } else {
            toggleHide();
        }
    }
});

function toggleHide() {
    if (isOpeningDoor || isWalking || isTransitioningHide) return;
    
    isTransitioningHide = true;
    if (!isHiding) {
        hideAnimDirection = 1;
        hideAnimProgress = 0;
        showMessage("กำลังแทรกตัวเข้าไปในตู้เสื้อผ้า...");
    } else {
        hideAnimDirection = -1;
        hideAnimProgress = 1;
        showMessage("กำลังผลักประตูออกจากตู้...");
    }
}

function startOpenDoor() {
    if (isHiding || isTransitioningHide) return;

    if (windowGhostState === "peeking") {
        windowGhostState = "jumpscare";
        windowGhostEyeGlow = 1;
        windowJumpscareScale = 1;
        return;
    }

    if (ghostState === "active" || ghostState === "warning") {
        showMessage("😱 มีเงาร่างปริศนาขวางประตูอยู่!");
        return;
    }
    
    isOpeningDoor = true;
    doorOpenProgress = 0;
}

function showMessage(txt) {
    message = txt;
    messageTimer = 140;
}

function resetGame() {
    currentRoom = 1;
    currentRoomType = "normal";
    totalCoins = 0;
    gameStartTime = Date.now();
    activeItems = [];
    roomDecorations = [];
    flashlightBattery = 100;
    isHiding = false;
    isTransitioningHide = false;
    hideAnimProgress = 0;
    
    ghostState = "none";
    ghostTimer = 0;
    
    windowGhostState = "none";
    windowGhostAlpha = 0.4;
    windowGhostRiseProgress = 0;
    windowGhostEyeGlow = 0;
    windowGhostShineProgress = 0;
    windowGhostTimer = 0;
    
    wardrobeGhostState = "none";
    wardrobeGhostTimer = 0;
    wardrobeGhostAlpha = 0;
    wardrobeJumpscareScale = 1;
    wardrobeGhostPeekProgress = 0;

    isGameOver = false;
    isOpeningDoor = false;
    isWalking = false;
    doorOpenProgress = 0;
    walkProgress = 0;
    fadeAlpha = 0;
    
    spawnRoomItems();
    showMessage("เริ่มใหม่อีกครั้ง... ระวังตัวให้ดี");
}

function spawnRoomItems() {
    activeItems = [];
    roomDecorations = [];

    currentRoomType = "normal";
    if (currentRoom > 1) { const rr = Math.random(); if (rr < 0.10) currentRoomType = "green"; else if (rr < 0.40) currentRoomType = "red"; }

    if (Math.random() < 0.60) {
        activeItems.push({ type: "coin", x: cx + (Math.random() - 0.5) * 420, y: canvas.height - 80 + (Math.random() - 0.5) * 20, radius: 18, value: Math.floor(Math.random() * 10) + 5, offset: Math.random() * Math.PI * 2 });
    }
    if (Math.random() < 0.35) {
        activeItems.push({ type: "battery", x: cx + (Math.random() - 0.5) * 420, y: canvas.height - 75 + (Math.random() - 0.5) * 20, radius: 14, offset: Math.random() * Math.PI * 2 });
    }

    const numDecor = Math.floor(Math.random() * 5) + 3; 
    const decorTypes = ["paper", "stain", "box", "wood"];
    for (let i = 0; i < numDecor; i++) {
        roomDecorations.push({
            type: decorTypes[Math.floor(Math.random() * decorTypes.length)],
            x: 150 + Math.random() * (canvas.width - 300),
            y: 460 + Math.random() * 100,
            size: 10 + Math.random() * 25,
            rot: Math.random() * Math.PI * 2,
            alpha: 0.3 + Math.random() * 0.4
        });
    }

    // สุ่มความสว่างของห้อง: มืด 30% / สว่าง 30% / ปกติ 40% (ห้องแรกและห้องสีเขียวเป็นปกติ)
    roomLight = "normal";
    if (currentRoom > 1 && currentRoomType !== "green") {
        const lr = Math.random();
        if (lr < 0.30) roomLight = "dark"; else if (lr < 0.60) roomLight = "bright";
    }
    if (currentRoomType === "red") {
        showMessage("🩸 คุณก้าวเข้าสู่ห้องสีเลือด... บรรยากาศชวนขนลุก!");
    } else if (roomLight === "dark") {
        showMessage("🌑 ห้องนี้มืดสนิท... ใช้ไฟฉายส่องทางให้ดี");
    } else if (roomLight === "bright") {
        showMessage("💡 ห้องนี้ไฟเปิดอยู่ สว่างและแบตไฟฉายไม่ลด");
    }
}

function triggerGhostSpawn() {
    if (currentRoom > 1 && Math.random() < Math.min(0.5, 0.15 + currentRoom * 0.02)) {
        ghostState = "warning";
        ghostTimer = 80; 
    } else {
        ghostState = "none";
    }
    
    if (currentRoom > 1 && Math.random() < Math.min(0.55, 0.2 + currentRoom * 0.02)) {
        windowGhostState = "peeking";
        windowGhostAlpha = 0.4;
        windowGhostRiseProgress = 0; 
        windowGhostEyeGlow = 0; 
        windowGhostShineProgress = 0;
        windowGhostTimer = 0;
    } else {
        windowGhostState = "none";
    }

    wardrobeGhostState = "none";
}

function updateGameLogic() {
    if (isGameOver) return;

    lightFlicker = (roomLight === "bright" ? 2.5 : roomLight === "dark" ? 0.8 : 1.7) + Math.sin(Date.now() * 0.003) * 0.12; 
    if (ghostState !== "none" || windowGhostState === "peeking" || wardrobeGhostState === "peeking") {
        lightFlicker = Math.random() < 0.25 ? 0.3 : 1.0; 
    }

    // กลไกผีหน้าต่าง: ส่องไฟฉาย 1 วินาทีเพื่อขับไล่
    if (windowGhostState === "peeking") {
        if (windowGhostRiseProgress < 1) {
            windowGhostRiseProgress += 0.008; 
        } else {
            const ghostCenterX = windowRect.x + windowRect.w / 2;
            const ghostCenterY = windowRect.y + windowRect.h / 2;
            const distToLight = Math.hypot(mousePos.x - ghostCenterX, mousePos.y - ghostCenterY);

            if (distToLight < 110 && flashlightBattery > 0 && !isHiding) {
                windowGhostShineProgress += 0.017; 
                windowGhostEyeGlow = Math.min(1, windowGhostEyeGlow + 0.1); 
                windowGhostTimer = Math.max(0, windowGhostTimer - 1); 
                
                if (windowGhostShineProgress >= 1) {
                    windowGhostState = "fading";
                    windowGhostShineProgress = 0;
                    showMessage("🔦 คุณใช้ไฟฉายส่องขับไล่วิญญาณตรงหน้าต่างสำเร็จ!");
                }
            } else {
                windowGhostEyeGlow = Math.max(0, windowGhostEyeGlow - 0.08); 
                windowGhostTimer++; 
                if (windowGhostTimer >= 200) { 
                    windowGhostEyeGlow = 1; 
                    windowGhostState = "jumpscare";
                    windowJumpscareScale = 1;
                }
            }
        }
    }

    if (windowGhostState === "jumpscare") {
        windowJumpscareScale += 0.5;
        if (windowJumpscareScale > 7) isGameOver = true;
        return; 
    }
    
    if (windowGhostState === "fading") {
        windowGhostAlpha -= 0.04; 
        if (windowGhostAlpha <= 0) {
            windowGhostAlpha = 0;
            windowGhostState = "none";
            windowGhostEyeGlow = 0;
        }
    }

    if (isHiding && !isTransitioningHide && currentRoomType === "normal") {
        if (wardrobeGhostState === "none" && Math.random() < 0.0015) { 
            wardrobeGhostState = "peeking";
            wardrobeGhostTimer = 220; 
            wardrobeGhostAlpha = 0;
            wardrobeGhostPeekProgress = 0;
        }

        if (wardrobeGhostState === "peeking") {
            if (wardrobeGhostAlpha < 0.9) wardrobeGhostAlpha += 0.02;
            if (wardrobeGhostPeekProgress < 1) wardrobeGhostPeekProgress += 0.008;

            wardrobeGhostTimer--;
            if (wardrobeGhostTimer <= 0) {
                wardrobeGhostState = "jumpscare";
                wardrobeJumpscareScale = 1;
            }
        } else if (wardrobeGhostState === "jumpscare") {
            wardrobeJumpscareScale += 0.45;
            if (wardrobeJumpscareScale > 7) isGameOver = true;
        }
    } else {
        if (!isHiding || currentRoomType === "red") wardrobeGhostState = "none";
    }

    if (isTransitioningHide) {
        hideAnimProgress += 0.05 * hideAnimDirection;
        if (hideAnimDirection === 1 && hideAnimProgress >= 1) {
            hideAnimProgress = 1; isTransitioningHide = false; isHiding = true;
        } else if (hideAnimDirection === -1 && hideAnimProgress <= 0) {
            hideAnimProgress = 0; isTransitioningHide = false; isHiding = false;
        }
    }

    if (flashlightBattery > 0 && !isHiding && !isTransitioningHide && roomLight !== "bright") {
        flashlightBattery -= 0.0139;   // 100% ใช้ได้ราว 120 วินาที (60 อัพเดต/วินาที)
        if (flashlightBattery <= 0) {
            flashlightBattery = 0; showMessage("🔦 แบตเตอรี่หมด! ห้องตกอยู่ในความมืดมิด...");
        }
    }

    if (ghostState === "warning") {
        ghostTimer--;
        if (ghostTimer <= 0) { ghostState = "active"; ghostTimer = 220; ghostAlpha = 0; }
    } else if (ghostState === "active") {
        if (ghostAlpha < 1) ghostAlpha += 0.05;
        ghostTimer--;
        if (isHiding) {
            if (ghostTimer <= 50) ghostAlpha -= 0.03;
            if (ghostTimer <= 0) { ghostState = "none"; showMessage("ร่างปริศนาสลายหายไป..."); }
        } else {
            if (ghostTimer <= 0) { ghostState = "jumpscare"; jumpscareScale = 1; }
        }
    } else if (ghostState === "jumpscare") {
        jumpscareScale += 0.35;
        if (jumpscareScale > 6) isGameOver = true;
    }

    if (isOpeningDoor) {
        if (doorOpenProgress < 1) doorOpenProgress += 0.08; 
        else { isOpeningDoor = false; isWalking = true; walkProgress = 0; }
    } else if (isWalking) {
        walkProgress += 0.025; 
        walkBob = Math.sin(walkProgress * Math.PI * 6) * 20; 
        if (walkProgress > 0.4) fadeAlpha += 0.05; 

        if (fadeAlpha >= 1) {
            currentRoom++; isWalking = false; walkProgress = 0; doorOpenProgress = 0;
            isFadingIn = true; spawnRoomItems(); triggerGhostSpawn();
        }
    }

    if (isFadingIn && !isWalking) {
        fadeAlpha -= 0.05;
        if (fadeAlpha <= 0) { fadeAlpha = 0; isFadingIn = false; }
    }
}

function drawCeilingLight() {
    ctx.save();
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.ellipse(cx, 0, 70, 25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 3;
    ctx.stroke();

    let lightColor = (currentRoomType === "red") ? "255, 80, 80" : (currentRoomType === "green" ? "150, 255, 160" : "255, 255, 210");

    if (lightFlicker > 0.1) {
        let glow = ctx.createRadialGradient(cx, 15, 10, cx, 80, 450);
        glow.addColorStop(0, `rgba(${lightColor}, ${lightFlicker * 0.45})`);
        glow.addColorStop(1, `rgba(${lightColor}, 0)`);
        
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, 15, 450, 0, Math.PI);
        ctx.fill();
        
        ctx.fillStyle = `rgba(${lightColor}, ${lightFlicker})`;
        ctx.beginPath();
        ctx.ellipse(cx, 12, 18, 6, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawWardrobe(x, y, w, h) {
    ctx.save();
    const isRed = (currentRoomType === "red");

    let sideR1 = isRed ? Math.floor(45 * lightFlicker) : Math.floor(25 * lightFlicker);
    let sideG1 = isRed ? Math.floor(8 * lightFlicker) : Math.floor(12 * lightFlicker);
    let sideB1 = isRed ? Math.floor(8 * lightFlicker) : Math.floor(8 * lightFlicker);

    let sideR2 = isRed ? Math.floor(75 * lightFlicker) : Math.floor(45 * lightFlicker);
    let sideG2 = isRed ? Math.floor(15 * lightFlicker) : Math.floor(22 * lightFlicker);
    let sideB2 = isRed ? Math.floor(15 * lightFlicker) : Math.floor(14 * lightFlicker);

    let sideGrad = ctx.createLinearGradient(x, y, x + w * 0.6, y);
    sideGrad.addColorStop(0, `rgb(${sideR1}, ${sideG1}, ${sideB1})`);
    sideGrad.addColorStop(1, `rgb(${sideR2}, ${sideG2}, ${sideB2})`);
    
    ctx.fillStyle = sideGrad; ctx.fillRect(x, y + 20, w * 0.65, h - 20);
    ctx.strokeStyle = isRed ? "#200202" : "#0d0604"; ctx.lineWidth = 3; ctx.strokeRect(x, y + 20, w * 0.65, h - 20);

    let frontGrad = ctx.createLinearGradient(x + w * 0.65, y, x + w, y);
    frontGrad.addColorStop(0, `rgb(${isRed ? Math.floor(95 * lightFlicker) : Math.floor(55 * lightFlicker)}, ${isRed ? Math.floor(20 * lightFlicker) : Math.floor(28 * lightFlicker)}, ${isRed ? Math.floor(20 * lightFlicker) : Math.floor(18 * lightFlicker)})`);
    frontGrad.addColorStop(1, `rgb(${isRed ? Math.floor(50 * lightFlicker) : Math.floor(30 * lightFlicker)}, ${isRed ? Math.floor(10 * lightFlicker) : Math.floor(15 * lightFlicker)}, ${isRed ? Math.floor(10 * lightFlicker) : Math.floor(10 * lightFlicker)})`);
    
    ctx.fillStyle = frontGrad; ctx.beginPath();
    ctx.moveTo(x + w * 0.65, y + 20); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - 25); ctx.lineTo(x + w * 0.65, y + h); ctx.closePath(); ctx.fill(); ctx.stroke();

    ctx.fillStyle = `rgb(${isRed ? Math.floor(60 * lightFlicker) : Math.floor(35 * lightFlicker)}, ${isRed ? Math.floor(12 * lightFlicker) : Math.floor(18 * lightFlicker)}, ${isRed ? Math.floor(12 * lightFlicker) : Math.floor(12 * lightFlicker)})`;
    ctx.beginPath(); ctx.moveTo(x, y + 20); ctx.lineTo(x + w * 0.35, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w * 0.65, y + 20); ctx.closePath(); ctx.fill(); ctx.stroke();

    ctx.strokeStyle = isRed ? "#330505" : "#1a0d08"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + w * 0.82, y + 10); ctx.lineTo(x + w * 0.82, y + h - 12); ctx.stroke();
    ctx.fillStyle = isRed ? "#8c7038" : "#b59b52"; ctx.fillRect(x + w * 0.78, y + h * 0.48, 4, 30);
    ctx.restore();
}

function drawWindow() {
    ctx.save();
    const wx = windowRect.x, wy = windowRect.y, ww = windowRect.w, wh = windowRect.h;
    
    const leftTopY = wy + 20;
    const leftBotY = wy + wh - 20;
    const rightTopY = wy - 15;
    const rightBotY = wy + wh + 15;
    
    ctx.fillStyle = `rgb(${Math.floor(15 * lightFlicker)}, ${Math.floor(10 * lightFlicker)}, ${Math.floor(8 * lightFlicker)})`;
    ctx.beginPath();
    ctx.moveTo(wx - 10, leftTopY - 10);
    ctx.lineTo(wx + ww + 10, rightTopY - 10);
    ctx.lineTo(wx + ww + 10, rightBotY + 10);
    ctx.lineTo(wx - 10, leftBotY + 10);
    ctx.closePath();
    ctx.fill();
    
    ctx.fillStyle = "#010102"; 
    ctx.beginPath();
    ctx.moveTo(wx, leftTopY);
    ctx.lineTo(wx + ww, rightTopY);
    ctx.lineTo(wx + ww, rightBotY);
    ctx.lineTo(wx, leftBotY);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = `rgb(${Math.floor(10 * lightFlicker)}, ${Math.floor(5 * lightFlicker)}, ${Math.floor(5 * lightFlicker)})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    const midTopY = (leftTopY + rightTopY) / 2;
    const midBotY = (leftBotY + rightBotY) / 2;
    ctx.moveTo(wx + ww / 2, midTopY); 
    ctx.lineTo(wx + ww / 2, midBotY);
    ctx.stroke();

    ctx.restore();
}

function draw3DEnvironment() {
    const isRedRoom = (currentRoomType === "red");

    let ceilGrad = ctx.createLinearGradient(cx, 0, cx, 150);
    if (isRedRoom) {
        ceilGrad.addColorStop(0, `rgba(45, 10, 10, ${lightFlicker})`);
        ceilGrad.addColorStop(1, `rgba(20, 5, 5, ${lightFlicker})`);
    } else {
        ceilGrad.addColorStop(0, `rgba(40, 50, 40, ${lightFlicker * 1.2})`); 
        ceilGrad.addColorStop(1, `rgba(15, 15, 20, ${lightFlicker * 1.2})`); 
    }
    ctx.fillStyle = ceilGrad; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(canvas.width, 0); ctx.lineTo(doorFrame.x + doorFrame.w, doorFrame.y); ctx.lineTo(doorFrame.x, doorFrame.y); ctx.fill();

    let floorGrad = ctx.createLinearGradient(cx, 450, cx, canvas.height);
    if (isRedRoom) {
        floorGrad.addColorStop(0, `rgb(${Math.floor(80 * lightFlicker)}, ${Math.floor(10 * lightFlicker)}, ${Math.floor(15 * lightFlicker)})`);
        floorGrad.addColorStop(1, `rgb(${Math.floor(140 * lightFlicker)}, ${Math.floor(20 * lightFlicker)}, ${Math.floor(25 * lightFlicker)})`);
    } else {
        floorGrad.addColorStop(0, `rgb(${Math.floor(70 * lightFlicker)}, ${Math.floor(25 * lightFlicker)}, ${Math.floor(35 * lightFlicker)})`);
        floorGrad.addColorStop(1, `rgb(${Math.floor(130 * lightFlicker)}, ${Math.floor(40 * lightFlicker)}, ${Math.floor(55 * lightFlicker)})`);
    }
    ctx.fillStyle = floorGrad; ctx.beginPath(); ctx.moveTo(0, canvas.height); ctx.lineTo(canvas.width, canvas.height); ctx.lineTo(doorFrame.x + doorFrame.w, doorFrame.y + doorFrame.h); ctx.lineTo(doorFrame.x, doorFrame.y + doorFrame.h); ctx.fill();

    let wallColorDark = isRedRoom 
        ? `rgb(${Math.floor(40 * lightFlicker)}, ${Math.floor(8 * lightFlicker)}, ${Math.floor(8 * lightFlicker)})`
        : `rgb(${Math.floor(25 * lightFlicker)}, ${Math.floor(40 * lightFlicker)}, ${Math.floor(35 * lightFlicker)})`;
    let wallColorLight = isRedRoom 
        ? `rgb(${Math.floor(90 * lightFlicker)}, ${Math.floor(20 * lightFlicker)}, ${Math.floor(20 * lightFlicker)})`
        : `rgb(${Math.floor(50 * lightFlicker)}, ${Math.floor(75 * lightFlicker)}, ${Math.floor(65 * lightFlicker)})`;
    
    let wallGrad = ctx.createLinearGradient(0, cy, doorFrame.x, cy);
    wallGrad.addColorStop(0, wallColorLight); wallGrad.addColorStop(1, wallColorDark);
    ctx.fillStyle = wallGrad; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(doorFrame.x, doorFrame.y); ctx.lineTo(doorFrame.x, doorFrame.y + doorFrame.h); ctx.lineTo(0, canvas.height); ctx.fill();

    let rWallGrad = ctx.createLinearGradient(canvas.width, cy, doorFrame.x + doorFrame.w, cy);
    rWallGrad.addColorStop(0, wallColorLight); rWallGrad.addColorStop(1, wallColorDark);
    ctx.fillStyle = rWallGrad; ctx.beginPath(); ctx.moveTo(canvas.width, 0); ctx.lineTo(doorFrame.x + doorFrame.w, doorFrame.y); ctx.lineTo(doorFrame.x + doorFrame.w, doorFrame.y + doorFrame.h); ctx.lineTo(canvas.width, canvas.height); ctx.fill();
}

function drawDecorations() {
    roomDecorations.forEach(d => {
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.rot);
        ctx.globalAlpha = d.alpha * (lightFlicker > 0.5 ? 1 : 0.6); 

        if (d.type === "paper") {
            ctx.fillStyle = "#cccccc"; ctx.fillRect(-d.size/2, -d.size/3, d.size, d.size/1.5);
            ctx.strokeStyle = "#888"; ctx.strokeRect(-d.size/2, -d.size/3, d.size, d.size/1.5);
        } else if (d.type === "stain") {
            ctx.fillStyle = "#1a0505"; 
            ctx.beginPath(); ctx.ellipse(0, 0, d.size, d.size/2, 0, 0, Math.PI * 2); ctx.fill();
        } else if (d.type === "box") {
            ctx.fillStyle = "#4a3b2c"; ctx.fillRect(-d.size/2, -d.size/2, d.size, d.size);
            ctx.fillStyle = "#33261c"; ctx.fillRect(-d.size/2 + 2, -d.size/2 + 2, d.size - 4, d.size - 4);
        } else if (d.type === "wood") {
            ctx.fillStyle = "#3b2818"; ctx.fillRect(-d.size, -3, d.size * 2, 6);
        }
        ctx.restore();
    });
}

function drawHotelDoor(p) {
    const x0 = doorInner.x, y0 = doorInner.y, w = doorInner.w, h = doorInner.h;
    ctx.fillStyle = "#030202"; ctx.fillRect(x0, y0, w, h);

    const rx = x0 + w * Math.cos(p * 1.35) * (1 - p * 0.2);
    const topY = y0 + (35 * p);
    const botY = (y0 + h) - (20 * p);
    
    if (rx > x0 + 2) {
        let doorGrad = ctx.createLinearGradient(x0, y0, rx, y0);
        doorGrad.addColorStop(0, `rgb(${Math.floor(40 * lightFlicker)}, ${Math.floor(20 * lightFlicker)}, ${Math.floor(10 * lightFlicker)})`);
        doorGrad.addColorStop(1, `rgb(${Math.floor(80 * lightFlicker)}, ${Math.floor(45 * lightFlicker)}, ${Math.floor(25 * lightFlicker)})`);
        ctx.fillStyle = doorGrad; ctx.beginPath();
        ctx.moveTo(x0, y0); ctx.lineTo(rx, topY); ctx.lineTo(rx, botY); ctx.lineTo(x0, y0 + h); ctx.fill(); 
    }
}

function drawFloorItems() {
    if (isHiding) return;
    const time = Date.now() * 0.003;
    activeItems.forEach(item => {
        const floatY = Math.sin(time + item.offset) * 12;
        ctx.save(); ctx.translate(item.x, item.y);
        
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        const shadowScale = 1 + (floatY * 0.02);
        ctx.beginPath(); ctx.ellipse(0, 15, item.radius * shadowScale, 6 * shadowScale, 0, 0, Math.PI * 2); ctx.fill();
        
        ctx.translate(0, floatY);
        if (item.type === "coin") {
            ctx.shadowColor = "#32cd32";
            ctx.shadowBlur = 10;
            ctx.beginPath(); ctx.arc(0, 0, item.radius, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(50, 255, 130, 0.85)"; ctx.fill(); 
            ctx.strokeStyle = "#005500"; ctx.lineWidth = 2; ctx.stroke();
            
            ctx.beginPath(); ctx.arc(0, 0, item.radius * 0.6, 0, Math.PI * 2); 
            ctx.lineWidth = 1; ctx.stroke();
            
            if (Math.sin(time * 3 + item.offset) > 0) { 
                ctx.fillStyle = "rgba(200, 255, 200, 0.8)"; 
                ctx.beginPath(); ctx.arc(-item.radius*0.2, -item.radius*0.2, item.radius*0.3, 0, Math.PI*2); ctx.fill(); 
            }
            ctx.shadowBlur = 0;
        } else if (item.type === "battery") {
            ctx.fillStyle = "#222"; ctx.fillRect(-8, -12, 16, 24); ctx.fillStyle = "#ffcc00"; ctx.fillRect(-8, 2, 16, 10); ctx.fillStyle = "#ddd"; ctx.fillRect(-4, -16, 8, 4);
        }
        ctx.restore();
    });
}

function drawPlayerHands() {
    if (isHiding || isTransitioningHide) return;
    
    ctx.save();
    const time = Date.now();
    let bobY = isWalking ? Math.sin(walkProgress * Math.PI * 6) * 12 : Math.sin(time * 0.002) * 4;
    let bobX = isWalking ? Math.cos(walkProgress * Math.PI * 3) * 8 : 0;

    const skinBase = `rgb(${Math.floor(190 * lightFlicker)}, ${Math.floor(125 * lightFlicker)}, ${Math.floor(95 * lightFlicker)})`;
    const skinShadow = `rgb(${Math.floor(100 * lightFlicker)}, ${Math.floor(55 * lightFlicker)}, ${Math.floor(40 * lightFlicker)})`;
    const skinHighlight = `rgb(${Math.floor(215 * lightFlicker)}, ${Math.floor(150 * lightFlicker)}, ${Math.floor(120 * lightFlicker)})`;

    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
    ctx.shadowBlur = 8;

    ctx.save();
    ctx.translate(bobX, bobY);
    
    let gradL = ctx.createLinearGradient(0, canvas.height, 220, canvas.height - 40);
    gradL.addColorStop(0, skinShadow); gradL.addColorStop(0.6, skinBase); gradL.addColorStop(1, skinHighlight);

    ctx.fillStyle = gradL; ctx.strokeStyle = `rgb(${Math.floor(50 * lightFlicker)}, ${Math.floor(25 * lightFlicker)}, ${Math.floor(15 * lightFlicker)})`; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-30, canvas.height + 40); ctx.lineTo(80, canvas.height - 35);
    ctx.quadraticCurveTo(140, canvas.height - 50, 190, canvas.height - 35); 
    ctx.quadraticCurveTo(215, canvas.height - 25, 205, canvas.height - 15); 
    ctx.quadraticCurveTo(220, canvas.height - 5, 200, canvas.height + 5);    
    ctx.quadraticCurveTo(205, canvas.height + 15, 185, canvas.height + 20);  
    ctx.quadraticCurveTo(190, canvas.height + 28, 165, canvas.height + 30);  
    ctx.quadraticCurveTo(110, canvas.height + 30, -30, canvas.height + 90);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    ctx.restore();

    ctx.save();
    ctx.translate(-bobX, bobY);
    
    let gradR = ctx.createLinearGradient(canvas.width, canvas.height, canvas.width - 220, canvas.height - 40);
    gradR.addColorStop(0, skinShadow); gradR.addColorStop(0.6, skinBase); gradR.addColorStop(1, skinHighlight);

    ctx.fillStyle = gradR; ctx.strokeStyle = `rgb(${Math.floor(50 * lightFlicker)}, ${Math.floor(25 * lightFlicker)}, ${Math.floor(15 * lightFlicker)})`; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(canvas.width + 30, canvas.height + 40); ctx.lineTo(canvas.width - 80, canvas.height - 35);
    ctx.quadraticCurveTo(canvas.width - 140, canvas.height - 50, canvas.width - 190, canvas.height - 35); 
    ctx.quadraticCurveTo(canvas.width - 215, canvas.height - 25, canvas.width - 205, canvas.height - 15); 
    ctx.quadraticCurveTo(canvas.width - 220, canvas.height - 5, canvas.width - 200, canvas.height + 5);    
    ctx.quadraticCurveTo(canvas.width - 205, canvas.height + 15, canvas.width - 185, canvas.height + 20);  
    ctx.quadraticCurveTo(canvas.width - 190, canvas.height + 28, canvas.width - 165, canvas.height + 30);  
    ctx.quadraticCurveTo(canvas.width - 110, canvas.height + 30, canvas.width + 30, canvas.height + 90);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    ctx.restore();
    ctx.restore();
}

function drawFlashlightOverlay() {
    if (isHiding) return;
    
    ctx.save();
    // ถ้าแบตเตอรี่หมด ให้ห้องมืดสนิท
    if (flashlightBattery <= 0) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        return;
    }

    let flashCanvas = document.createElement("canvas");
    flashCanvas.width = canvas.width; flashCanvas.height = canvas.height;
    let fCtx = flashCanvas.getContext("2d");

    const batteryAlpha = flashlightBattery < 20 ? 0.6 : 0.35;
    fCtx.fillStyle = `rgba(0, 0, 0, ${batteryAlpha})`; fCtx.fillRect(0, 0, canvas.width, canvas.height);

    const radius = 240 + (Math.sin(Date.now()*0.01) * 2);
    let spotGrad = fCtx.createRadialGradient(mousePos.x, mousePos.y, 20, mousePos.x, mousePos.y, radius);
    if (flashlightBattery < 15 && Math.random() < 0.2) spotGrad.addColorStop(0, "rgba(180, 180, 140, 0.5)");
    else { spotGrad.addColorStop(0, "rgba(255, 255, 230, 0.95)"); spotGrad.addColorStop(0.5, "rgba(255, 240, 180, 0.4)"); }
    spotGrad.addColorStop(1, "rgba(0, 0, 0, 0)");

    fCtx.globalCompositeOperation = "destination-out";
    fCtx.fillStyle = spotGrad; fCtx.beginPath(); fCtx.arc(mousePos.x, mousePos.y, radius, 0, Math.PI * 2); fCtx.fill();

    ctx.drawImage(flashCanvas, 0, 0); 
    ctx.restore();
}

function drawUI() {
    ctx.save();

    ctx.fillStyle = "rgba(10, 5, 2, 0.85)"; 
    ctx.fillRect(20, 15, 140, 42); 
    ctx.strokeStyle = "#8c6b43"; ctx.lineWidth = 1.5; ctx.strokeRect(20, 15, 140, 42);
    
    let batteryColor = flashlightBattery > 50 ? "#4caf50" : (flashlightBattery > 20 ? "#ff9800" : "#f44336");
    ctx.fillStyle = batteryColor; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "left";
    ctx.fillText(`🔋 แบต: ${Math.ceil(flashlightBattery)}%`, 32, 41);

    ctx.fillStyle = "rgba(10, 5, 2, 0.85)"; 
    ctx.fillRect(canvas.width - 230, 15, 210, 95); 
    ctx.strokeStyle = "#8c6b43"; ctx.lineWidth = 1.5; ctx.strokeRect(canvas.width - 230, 15, 210, 95);

    ctx.font = "bold 15px 'Courier New', monospace, sans-serif";
    ctx.fillStyle = "#ff3333"; ctx.fillText(`🚪 ROOM:  ${getFormattedRoom(currentRoom)}`, canvas.width - 215, 40);
    ctx.fillStyle = "#ffff00"; ctx.fillText(`🪙 COINS: ${totalCoins}`, canvas.width - 215, 65);

    let elapsedSeconds = Math.floor((Date.now() - gameStartTime) / 1000);
    let m = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
    let s = String(elapsedSeconds % 60).padStart(2, '0');
    ctx.fillStyle = "#ffffff"; ctx.fillText(`⏱️ TIME:  ${m}:${s}`, canvas.width - 215, 90);

    ctx.restore();
}

function drawHidingSideView() {
    ctx.fillStyle = "#050302"; ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#120905"; ctx.fillRect(0, 0, 350, canvas.height); ctx.fillRect(0, 0, canvas.width, 70); ctx.fillRect(0, canvas.height - 70, canvas.width, 70); 
    ctx.fillStyle = "#22110a"; ctx.fillRect(50, 65, canvas.width, 12); 

    const clothesColors = ["#1a1018", "#0f151a", "#1c140d", "#111812"];
    for (let i = 0; i < 6; i++) {
        ctx.fillStyle = clothesColors[i % clothesColors.length]; ctx.beginPath();
        ctx.moveTo(80 + (i * 45), 77); ctx.lineTo(130 + (i * 45), 180); ctx.lineTo(120 + (i * 45), 450); ctx.lineTo(60 + (i * 45), 450); ctx.lineTo(65 + (i * 45), 180);
        ctx.closePath(); ctx.fill();
    }

    const gapX = canvas.width - 280; 
    const gapW = 160;

    ctx.save();
    ctx.beginPath(); ctx.rect(gapX, 40, gapW, canvas.height - 80); ctx.clip();
    draw3DEnvironment();
    drawDecorations(); 
    
    if (wardrobeGhostState === "peeking") {
        const startX = gapX + gapW + 70;
        const targetX = gapX + gapW / 2;
        const currentX = startX - (startX - targetX) * wardrobeGhostPeekProgress;
        
        drawWardrobeGhost(currentX, canvas.height / 2 + 10, 0.85, wardrobeGhostAlpha, 0);
    }

    ctx.restore();

    ctx.fillStyle = "#1d0e07"; 
    ctx.fillRect(gapX + gapW, 0, canvas.width - (gapX + gapW), canvas.height); 
    ctx.strokeStyle = "#080402"; ctx.lineWidth = 6; ctx.strokeRect(gapX + gapW, 0, canvas.width - (gapX + gapW), canvas.height);

    ctx.save();
    ctx.fillStyle = "rgba(20, 10, 5, 0.85)"; ctx.fillRect(exitWardrobeBtn.x, exitWardrobeBtn.y, exitWardrobeBtn.w, exitWardrobeBtn.h);
    ctx.strokeStyle = (wardrobeGhostState === "peeking") ? "#880000" : "#d4af37"; 
    ctx.lineWidth = 2; ctx.strokeRect(exitWardrobeBtn.x, exitWardrobeBtn.y, exitWardrobeBtn.w, exitWardrobeBtn.h);
    
    ctx.fillStyle = (wardrobeGhostState === "peeking") ? "#883333" : "#ffd700"; 
    ctx.font = "bold 15px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("🚪 ออกจากตู้เสื้อผ้า", exitWardrobeBtn.x + exitWardrobeBtn.w/2, exitWardrobeBtn.y + 30);
    ctx.restore();
}

function drawScene() {
    ctx.save();
    if (ghostState === "jumpscare" || windowGhostState === "jumpscare" || wardrobeGhostState === "jumpscare") {
        ctx.translate((Math.random() - 0.5) * 35, (Math.random() - 0.5) * 35);
    }

    if (isHiding && !isTransitioningHide) {
        drawHidingSideView();
        if (wardrobeGhostState === "jumpscare") {
            const gapX = canvas.width - 280; 
            const gapW = 160;
            drawWardrobeGhost(gapX + gapW / 2, canvas.height / 2 + 40, wardrobeJumpscareScale, 1, 0);
        }
    } else {
        ctx.save();
        if (isTransitioningHide) {
            const zoom = 1 + (hideAnimProgress * 1.2);
            const targetX = wardrobeHitbox.x + wardrobeHitbox.w / 2;
            const targetY = wardrobeHitbox.y + wardrobeHitbox.h / 2;
            ctx.translate(cx, cy); ctx.scale(zoom, zoom); ctx.translate(-cx - (targetX - cx) * hideAnimProgress * 0.6, -cy - (targetY - cy) * hideAnimProgress * 0.6);
        } else if (isWalking) {
            const scale = 1 + (walkProgress * 3.5); ctx.translate(cx, cy); ctx.scale(scale, scale); ctx.translate(-cx, -cy + walkBob); 
        }

        draw3DEnvironment();
        drawCeilingLight(); 
        drawDecorations(); 
        
        drawWindow();

        if ((windowGhostState === "peeking" || windowGhostState === "fading") && !isHiding) {
            ctx.save();
            ctx.beginPath();
            
            const wx = windowRect.x, wy = windowRect.y, ww = windowRect.w, wh = windowRect.h;
            ctx.moveTo(wx, wy + 20);
            ctx.lineTo(wx + ww, wy - 15);
            ctx.lineTo(wx + ww, wy + wh + 15);
            ctx.lineTo(wx, wy + wh - 20);
            ctx.closePath();
            ctx.clip(); 

            drawWindowGhost(windowRect.x + windowRect.w / 2, windowRect.y + windowRect.h / 2 + 15, 0.5, windowGhostAlpha, windowGhostRiseProgress);
            ctx.restore();
        }

        drawWardrobe(wardrobeHitbox.x, wardrobeHitbox.y, wardrobeHitbox.w, wardrobeHitbox.h);
        drawFloorItems(); 
        drawHotelDoor(isWalking ? 1 : doorOpenProgress);

        if (ghostState === "active" || ghostState === "jumpscare" || ghostState === "warning") {
            const floatY = Math.sin(Date.now() * 0.002) * 8; 
            const scale = (ghostState === "jumpscare") ? jumpscareScale : 1;
            const alpha = ghostState === "warning" ? 0.2 : ghostAlpha;
            drawOrganicGhost(cx, 250 + floatY, scale, alpha);
        }

        ctx.restore();
        
        if (windowGhostState === "jumpscare") {
            drawWindowGhost(cx, cy + 30, windowJumpscareScale, 1, 1);
        }

        drawFlashlightOverlay();
        drawPlayerHands(); 
    }

    drawUI();

    let gradient = ctx.createRadialGradient(cx, cy, 250, cx, cy, cx + 100);
    gradient.addColorStop(0, "rgba(0,0,0,0)"); gradient.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (isTransitioningHide) {
        let tAlpha = Math.sin(hideAnimProgress * Math.PI);
        ctx.fillStyle = `rgba(5, 2, 1, ${tAlpha * 0.85})`; ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (messageTimer > 0) {
        messageTimer--; ctx.fillStyle = "rgba(10, 15, 10, 0.9)"; ctx.fillRect(cx - 270, canvas.height - 90, 540, 45);
        ctx.fillStyle = "#55ff77"; ctx.font = "17px sans-serif"; ctx.textAlign = "center"; ctx.fillText(message, cx, canvas.height - 62);
    }

    if (fadeAlpha > 0) { ctx.fillStyle = `rgba(0, 0, 0, ${fadeAlpha})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }

    if (isGameOver) { ctx.fillStyle = "rgba(14, 0, 0, 0.92)"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    
    ctx.restore(); 
}

/* ================= UPGRADE LAYER: เสียง / แฟลชไล่ผี / ตาในความมืด / บรรยากาศ ================= */
let flashCooldown = 0, flashFx = 0, shakeBoost = 0, dangerLevel = 0, heartTimer = 0, whisperTimer = 500;
const dust = Array.from({ length: 45 }, () => ({ x: Math.random() * 1024, y: Math.random() * 576, r: Math.random() * 1.8 + 0.5, vx: (Math.random() - 0.5) * 0.3, vy: Math.random() * 0.25 + 0.05 }));
const lurkers = [];
const whispers = ["🕯️ ได้ยินเสียงกระซิบข้างหู...", "👁️ มีบางอย่างกำลังจ้องมองคุณ", "เสียงฝีเท้า... ที่ไม่ใช่ของคุณ", "อย่าหันหลังกลับไปมอง...", "ในตู้เสื้อผ้ามีเสียงเคาะเบาๆ"];

// ---------- เสียง (WebAudio สร้างเอง ไม่ต้องใช้ไฟล์) ----------
let AC = null, master = null, droneGain = null;
// ระดับเสียงที่ผู้เล่นปรับ (0-1) เก็บในเครื่อง  100% = master 0.5
let userVolume = 0.7, audioMuted = false;
try { const v = parseFloat(localStorage.getItem("metasoul_volume")); if (!isNaN(v)) userVolume = Math.max(0, Math.min(1, v)); audioMuted = localStorage.getItem("metasoul_muted") === "1"; } catch (e) {}
function masterTarget() { return audioMuted ? 0 : userVolume * 0.5; }
function applyVolume() { if (master) master.gain.value = masterTarget(); try { localStorage.setItem("metasoul_volume", String(userVolume)); localStorage.setItem("metasoul_muted", audioMuted ? "1" : "0"); } catch (e) {} }
function setVolume(v) { userVolume = Math.max(0, Math.min(1, Math.round(v * 100) / 100)); if (userVolume > 0) audioMuted = false; applyVolume(); if (AC && !audioMuted) tone(660, 0.08, "sine", 0.18); }
function toggleMute() { audioMuted = !audioMuted; applyVolume(); }
function initAudio() {
    if (AC) { if (AC.state === "suspended") AC.resume(); return; }
    try {
        AC = new (window.AudioContext || window.webkitAudioContext)();
        master = AC.createGain(); master.gain.value = masterTarget(); master.connect(AC.destination);
        droneGain = AC.createGain(); droneGain.gain.value = 0.035; droneGain.connect(master);
        [55, 55.7, 82.4].forEach(f => {
            const o = AC.createOscillator(); o.type = "sawtooth"; o.frequency.value = f;
            const lp = AC.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 160;
            o.connect(lp); lp.connect(droneGain); o.start();
        });
    } catch (e) { AC = null; }
}
function tone(f, d, type = "sine", v = 0.2, slide = 0) {
    if (!AC) return;
    const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g); g.connect(master); o.start(); o.stop(t + d);
}
function noise(d, v = 0.3, freq = 1000) {
    if (!AC) return;
    const n = Math.floor(AC.sampleRate * d), b = AC.createBuffer(1, n, AC.sampleRate), a = b.getChannelData(0);
    for (let i = 0; i < n; i++) a[i] = Math.random() * 2 - 1;
    const s = AC.createBufferSource(); s.buffer = b;
    const f = AC.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq;
    const g = AC.createGain(); g.gain.setValueAtTime(v, AC.currentTime); g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + d);
    s.connect(f); f.connect(g); g.connect(master); s.start();
}
const sfx = {
    heart() { tone(60, 0.18, "sine", 0.5, -25); setTimeout(() => tone(55, 0.18, "sine", 0.4, -25), 170); },
    coin() { tone(880, 0.12, "triangle", 0.15); setTimeout(() => tone(1320, 0.2, "triangle", 0.15), 80); },
    creak() { tone(180, 0.7, "sawtooth", 0.07, -80); noise(0.6, 0.08, 400); },
    scare() { noise(0.9, 0.6, 2500); tone(900, 0.8, "sawtooth", 0.35, -600); tone(120, 0.9, "square", 0.3, -60); },
    flash() { noise(0.25, 0.25, 4000); tone(1500, 0.3, "sine", 0.15, -1000); },
    whisper() { noise(1.2, 0.05, 3000); }
};
window.addEventListener("pointerdown", initAudio);
window.addEventListener("keydown", initAudio);

// ---------- แฟลชไล่ผี (กด F หรือคลิกขวา) ----------
function useFlash() {
    if (isGameOver || isHiding || isTransitioningHide || isOpeningDoor || isWalking) return;
    if (greenGhost.state === "waiting") { showMessage("ยังไม่เห็นอะไร... รอให้มันปรากฏก่อน"); return; }
    if (flashCooldown > 0) { showMessage("⏳ แฟลชยังชาร์จไม่เสร็จ..."); return; }
    if (flashlightBattery < 5 && greenGhost.state !== "approach") { showMessage("🔋 แบตเตอรี่ไม่พอใช้แฟลช!"); return; }
    flashlightBattery = Math.max(0, flashlightBattery - 5); flashCooldown = 360; flashFx = 18; sfx.flash();
    if (greenGhost.state === "approach") { banishGreenGhost(); return; }
    let hit = false;
    if (ghostState === "warning" || ghostState === "active") { ghostState = "none"; hit = true; }
    if (windowGhostState === "peeking") { windowGhostState = "fading"; hit = true; }
    lurkers.length = 0;
    if (hit) { totalCoins += 10; showMessage("⚡ แฟลชสว่างวาบ! ผีถูกขับไล่ +10 Soul Coins"); }
    else showMessage("⚡ แฟลชสว่างวาบ... ไม่พบอะไร");
}
window.addEventListener("keydown", e => { if (e.key === "f" || e.key === "F") useFlash(); });
canvas.addEventListener("contextmenu", e => { e.preventDefault(); useFlash(); });

// ---------- ต่อยอด update ----------
let _p = { g: "none", w: "none", r: "none", coins: 0, room: 1, door: false };
const _update = updateGameLogic;
updateGameLogic = function () {
    _update();
    if (!isGameOver) {
        if ((ghostState === "jumpscare" && _p.g !== "jumpscare") || (windowGhostState === "jumpscare" && _p.w !== "jumpscare") || (wardrobeGhostState === "jumpscare" && _p.r !== "jumpscare")) { sfx.scare(); shakeBoost = 30; }
        if ((ghostState === "warning" && _p.g !== "warning") || (windowGhostState === "peeking" && _p.w !== "peeking") || (wardrobeGhostState === "peeking" && _p.r !== "peeking")) sfx.whisper();
        if (isOpeningDoor && !_p.door) sfx.creak();
        if (totalCoins > _p.coins) sfx.coin();
        if (currentRoom !== _p.room) {
            lurkers.length = 0;
            if (currentRoom % 5 === 0) { totalCoins += 25; sfx.coin(); showMessage(`🏆 ผ่านห้อง ${getFormattedRoom(currentRoom)}! โบนัส +25 Soul Coins`); }
        }

        let d = 0;
        if (ghostState === "warning") d = 0.5;
        if (ghostState === "active") d = 0.85;
        if (windowGhostState === "peeking") d = Math.max(d, 0.5 + Math.min(0.5, windowGhostTimer / 400));
        if (wardrobeGhostState === "peeking") d = 1;
        if (flashlightBattery <= 0) d = Math.max(d, 0.5);
        dangerLevel += (Math.min(1, d) - dangerLevel) * 0.08;
        if (droneGain) droneGain.gain.value = 0.03 + dangerLevel * 0.08;
        if (--heartTimer <= 0 && dangerLevel > 0.15) { sfx.heart(); heartTimer = Math.floor(70 - dangerLevel * 45); }

        if (flashCooldown > 0) flashCooldown--;
        if (flashFx > 0) flashFx--;
        if (shakeBoost > 0) { shakeBoost--; canvas.style.transform = `translate(${(Math.random() - 0.5) * shakeBoost * 0.6}px, ${(Math.random() - 0.5) * shakeBoost * 0.6}px)`; }
        else canvas.style.transform = "";

        if (--whisperTimer <= 0) {
            whisperTimer = 500 + Math.random() * 700;
            if (messageTimer <= 0 && !isHiding && currentRoom > 1) { showMessage(whispers[Math.floor(Math.random() * whispers.length)]); sfx.whisper(); }
        }
        if (!isHiding && !isWalking && currentRoomType !== "green" && roomLight !== "bright" && lurkers.length < (currentRoomType === "red" ? 5 : 2) && Math.random() < (roomLight === "dark" ? 0.018 : 0.012))
            lurkers.push({ x: 70 + Math.random() * 880, y: 140 + Math.random() * 320, life: 160 + Math.random() * 160, t: 0 });
        for (let i = lurkers.length - 1; i >= 0; i--) {
            const l = lurkers[i]; l.t++;
            if (Math.hypot(mousePos.x - l.x, mousePos.y - l.y) < 80 && flashlightBattery > 0) { lurkers.splice(i, 1); totalCoins += 2; sfx.coin(); showMessage("🔦 ส่องไฟไล่ดวงตาปริศนา +2 Soul Coins"); }
            else if (l.t > l.life) lurkers.splice(i, 1);
        }
        dust.forEach(p => { p.x += p.vx; p.y += p.vy; if (p.y > 576) p.y = 0; if (p.x < 0) p.x = 1024; if (p.x > 1024) p.x = 0; });
    }
    _p = { g: ghostState, w: windowGhostState, r: wardrobeGhostState, coins: totalCoins, room: currentRoom, door: isOpeningDoor };
};

// ---------- ต่อยอด draw ----------
const _draw = drawScene;
drawScene = function () {
    _draw();
    if (isGameOver) return;
    ctx.save();
    if (!isHiding) {
        ctx.fillStyle = "rgba(255,240,200,0.35)";
        dust.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); });
        lurkers.forEach(l => {
            const a = Math.sin(l.t / l.life * Math.PI), blink = (l.t % 90 < 6) ? 0.1 : 1;
            const dx = Math.max(-3, Math.min(3, (mousePos.x - l.x) * 0.01));
            ctx.globalAlpha = a * blink; ctx.fillStyle = "#ff2020"; ctx.shadowColor = "#f00"; ctx.shadowBlur = 14;
            [-9, 9].forEach(o => { ctx.beginPath(); ctx.ellipse(l.x + o + dx, l.y, 4, 2.5, 0, 0, 7); ctx.fill(); });
        });
    }
    ctx.restore();

    if (dangerLevel > 0.02) {
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.004 * (1 + dangerLevel * 3));
        const g = ctx.createRadialGradient(cx, cy, 200, cx, cy, 620);
        g.addColorStop(0, "rgba(120,0,0,0)"); g.addColorStop(1, `rgba(170,0,0,${dangerLevel * (0.3 + 0.35 * pulse)})`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 576);
    }
    if (dangerLevel > 0.4) {
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        for (let i = 0; i < 60 * dangerLevel; i++) ctx.fillRect(Math.random() * 1024, Math.random() * 576, 2 + Math.random() * 30, 1);
    }
    if (flashFx > 0) { ctx.fillStyle = `rgba(255,255,255,${flashFx / 18 * 0.85})`; ctx.fillRect(0, 0, 1024, 576); }

    // HUD แฟลช
    ctx.save();
    ctx.fillStyle = "rgba(10,5,2,0.85)"; ctx.fillRect(20, 63, 140, 30);
    ctx.strokeStyle = "#8c6b43"; ctx.lineWidth = 1.5; ctx.strokeRect(20, 63, 140, 30);
    const ready = flashCooldown <= 0;
    ctx.fillStyle = ready ? "#7fdbff" : "#335566"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "left";
    ctx.fillText(ready ? "⚡ แฟลช [F] พร้อม" : "⚡ ชาร์จแฟลช...", 30, 82);
    if (!ready) { ctx.fillStyle = "#7fdbff"; ctx.fillRect(22, 90, 136 * (1 - flashCooldown / 360), 2); }
    ctx.restore();
};

/* ================= ห้องสีเขียว + ผีเน่า (ไล่ได้ด้วยแฟลชเท่านั้น) ================= */
const greenGhost = { state: "none", t: 0, p: 0, step: 90, blackout: 0, fade: 1, s: 1, fx: 0, fy: 0, sc: 0.3 };
function resetGreenGhost() { Object.assign(greenGhost, { state: "none", t: 0, p: 0, step: 90, blackout: 0, fade: 1, s: 1 }); }
function banishGreenGhost() {
    const bonus = 20 + Math.floor(greenGhost.p * 30);
    greenGhost.state = "banished"; greenGhost.fade = 1; totalCoins += bonus; shakeBoost = 14;
    showMessage(`⚡ แฟลชขับไล่ผีเน่าสำเร็จ! +${bonus} Soul Coins`);
}

// พื้นผิวเชื้อรา/คราบน้ำ สร้างครั้งเดียว
const moldCanvas = (() => {
    const c = document.createElement("canvas"); c.width = 1024; c.height = 576;
    const x = c.getContext("2d"); let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 1500; i++) {
        x.fillStyle = rnd() < 0.55 ? `rgba(6,18,6,${0.12 + rnd() * 0.25})` : `rgba(130,160,80,${0.05 + rnd() * 0.12})`;
        x.beginPath(); x.arc(rnd() * 1024, rnd() * 576, rnd() * 3 + 0.6, 0, 7); x.fill();
    }
    for (let i = 0; i < 30; i++) {
        const px = rnd() * 1024, py = rnd() * 280, len = 40 + rnd() * 170;
        x.fillStyle = `rgba(4,12,4,${0.15 + rnd() * 0.2})`; x.fillRect(px, py, 2 + rnd() * 3, len);
    }
    return c;
})();

function drawGreenEnvironment() {
    const f = lightFlicker;
    const c = (r, g, b) => `rgb(${Math.min(255, r * f) | 0},${Math.min(255, g * f) | 0},${Math.min(255, b * f) | 0})`;
    const dfX = doorFrame.x, dfR = doorFrame.x + doorFrame.w, dfT = doorFrame.y, dfB = doorFrame.y + doorFrame.h;

    let cg = ctx.createLinearGradient(cx, 0, cx, dfT); cg.addColorStop(0, c(20, 34, 20)); cg.addColorStop(1, c(8, 14, 10));
    ctx.fillStyle = cg; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(1024, 0); ctx.lineTo(dfR, dfT); ctx.lineTo(dfX, dfT); ctx.fill();

    const wallL = () => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(dfX, dfT); ctx.lineTo(dfX, dfB); ctx.lineTo(0, 576); ctx.closePath(); };
    const wallR = () => { ctx.beginPath(); ctx.moveTo(1024, 0); ctx.lineTo(dfR, dfT); ctx.lineTo(dfR, dfB); ctx.lineTo(1024, 576); ctx.closePath(); };
    let lg = ctx.createLinearGradient(0, cy, dfX, cy); lg.addColorStop(0, c(52, 84, 54)); lg.addColorStop(1, c(14, 26, 18));
    ctx.fillStyle = lg; wallL(); ctx.fill();
    let rg = ctx.createLinearGradient(1024, cy, dfR, cy); rg.addColorStop(0, c(52, 84, 54)); rg.addColorStop(1, c(14, 26, 18));
    ctx.fillStyle = rg; wallR(); ctx.fill();
    ctx.save(); wallL(); ctx.clip(); ctx.drawImage(moldCanvas, 0, 0); ctx.restore();
    ctx.save(); wallR(); ctx.clip(); ctx.drawImage(moldCanvas, 0, 0); ctx.restore();

    // พื้นกระเบื้องหมากรุก
    const N = 9, M = 8, yT = dfB, yB = 576;
    const rowY = i => yT + (yB - yT) * Math.pow(i / N, 1.7);
    ctx.fillStyle = c(10, 16, 10); ctx.beginPath(); ctx.moveTo(0, 576); ctx.lineTo(1024, 576); ctx.lineTo(dfR, yT); ctx.lineTo(dfX, yT); ctx.fill();
    for (let i = 0; i < N; i++) {
        const y0 = rowY(i), y1 = rowY(i + 1), t0 = (y0 - yT) / (yB - yT), t1 = (y1 - yT) / (yB - yT);
        const l0 = dfX - dfX * t0, r0 = dfR + (1024 - dfR) * t0, l1 = dfX - dfX * t1, r1 = dfR + (1024 - dfR) * t1;
        for (let j = 0; j < M; j++) {
            ctx.fillStyle = ((i + j) % 2) ? c(74, 90, 70) : c(12, 18, 13);
            ctx.beginPath();
            ctx.moveTo(l0 + (r0 - l0) * j / M, y0); ctx.lineTo(l0 + (r0 - l0) * (j + 1) / M, y0);
            ctx.lineTo(l1 + (r1 - l1) * (j + 1) / M, y1); ctx.lineTo(l1 + (r1 - l1) * j / M, y1); ctx.fill();
        }
    }
    ctx.save(); ctx.beginPath(); ctx.moveTo(0, 576); ctx.lineTo(1024, 576); ctx.lineTo(dfR, yT); ctx.lineTo(dfX, yT); ctx.clip();
    let gl = ctx.createRadialGradient(cx, 545, 0, cx, 545, 300); gl.addColorStop(0, "rgba(160,255,175,0.16)"); gl.addColorStop(1, "rgba(160,255,175,0)");
    ctx.fillStyle = gl; ctx.fillRect(0, 400, 1024, 176); ctx.restore();

    // แถบหมากรุกเชิงผนัง
    const K = 10;
    [-1, 1].forEach(side => {
        for (let k = 0; k < K; k++) {
            const u0 = 1 - Math.pow(1 - k / K, 1.6), u1 = 1 - Math.pow(1 - (k + 1) / K, 1.6);
            const X = u => side < 0 ? u * dfX : 1024 - u * dfX;
            const yE = u => 576 - u * (576 - dfB), h = u => 46 * (1 - 0.72 * u);
            ctx.fillStyle = (k % 2) ? c(70, 86, 66) : c(9, 15, 10);
            ctx.beginPath(); ctx.moveTo(X(u0), yE(u0)); ctx.lineTo(X(u1), yE(u1)); ctx.lineTo(X(u1), yE(u1) - h(u1)); ctx.lineTo(X(u0), yE(u0) - h(u0)); ctx.fill();
        }
    });
}

// ผีหมีเน่า ดีไซน์ต้นฉบับ (ตัวผู้ล่าในห้องเขียว)
function drawGreenGhostInRoom() {
    const g = greenGhost;
    if (currentRoomType !== "green" || isHiding) return;
    if (g.state !== "approach" && g.state !== "banished") return;
    if (g.state === "approach" && Math.random() < 0.05) return;
    const sc = 0.28 + 1.15 * Math.pow(g.p, 1.4), fy = 450 + 150 * Math.pow(g.p, 1.2), fx = cx + Math.sin(Date.now() * 0.002) * 10 * g.p;
    g.fx = fx; g.fy = fy; g.sc = sc;
    const a = g.state === "banished" ? Math.max(0, g.fade) : 0.96;
    ctx.save(); ctx.globalAlpha = a * 0.5; ctx.fillStyle = "#000"; ctx.beginPath(); ctx.ellipse(fx, fy, 55 * sc, 12 * sc, 0, 0, 7); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(0, fy * 2); ctx.scale(1, -1); drawRotBear(fx, fy, sc, { alpha: a * 0.13, aura: false, mouth: 0.3 + 0.5 * g.p }); ctx.restore();
    drawRotBear(fx, fy, sc, { alpha: a, mouth: 0.12 + 0.55 * g.p, glow: 1, jit: g.state === "banished" ? 6 : 0.4 + g.p });
}

function updateGreenGhost() {
    const g = greenGhost;
    if (isGameOver || g.state === "none") return;
    if (g.state === "waiting") {
        lightFlicker = Math.random() < 0.18 ? 0.35 : 1.3;
        if (--g.t <= 0) {
            g.state = "approach"; g.p = 0; g.step = 90; flashCooldown = Math.min(flashCooldown, 60); sfx.creak();
            showMessage("👁️ มีบางอย่างยืนอยู่ปลายห้อง... กด F ยิงแฟลชเดี๋ยวนี้!");
        }
    } else if (g.state === "approach") {
        g.p += 0.0009;
        if (--g.step <= 0) { g.p += 0.05 + Math.random() * 0.04; g.step = 110 - g.p * 50 + Math.random() * 40; g.blackout = 7; tone(80, 0.25, "square", 0.3, -45); noise(0.18, 0.25, 250); }
        if (g.blackout > 0) { g.blackout--; lightFlicker = 0.2; } else lightFlicker = Math.random() < 0.12 ? 0.45 : 1.15;
        dangerLevel = Math.max(dangerLevel, 0.35 + 0.65 * Math.min(1, g.p));
        if (g.p >= 1) { g.state = "jumpscare"; g.s = 1.6; sfx.scare(); shakeBoost = 40; }
    } else if (g.state === "jumpscare") {
        g.s += 0.5; dangerLevel = 1; lightFlicker = Math.random() < 0.5 ? 0.3 : 1.2;
        if (g.s > 9) { isGameOver = true; shakeBoost = 0; canvas.style.transform = ""; }
    } else if (g.state === "banished") {
        g.fade -= 0.045;
        if (g.fade <= 0) { g.state = "none"; showMessage("💚 ห้องเงียบลงแล้ว... เปิดประตูไปต่อได้"); }
    }
}

// ---------- เชื่อมเข้ากับเกมเดิม ----------
const _env = draw3DEnvironment;
draw3DEnvironment = function () { if (currentRoomType === "green") drawGreenEnvironment(); else _env(); };

const _fo = drawFlashlightOverlay;
function drawBrightRoomLight() {
    ctx.save();
    ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = "rgb(30,27,20)"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "source-over";
    const vg = ctx.createRadialGradient(cx, cy, 260, cx, cy, 640); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
}
function drawDarkRoomExtra() {
    if (flashlightBattery <= 0) return;
    ctx.save();
    const g = ctx.createRadialGradient(mousePos.x, mousePos.y, 40, mousePos.x, mousePos.y, 270);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.55, "rgba(0,0,0,0.4)"); g.addColorStop(1, "rgba(0,0,0,0.8)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
}
drawFlashlightOverlay = function () {
    drawGreenGhostInRoom();
    const special = currentRoomType !== "green";
    if (special && roomLight === "bright") { if (!isHiding) drawBrightRoomLight(); return; }
    _fo();
    if (special && roomLight === "dark" && !isHiding) drawDarkRoomExtra();
};

const _tgs = triggerGhostSpawn;
triggerGhostSpawn = function () {
    _tgs();
    if (currentRoomType === "green") {
        ghostState = "none"; windowGhostState = "none"; wardrobeGhostState = "none";
        resetGreenGhost(); greenGhost.state = "waiting"; greenGhost.t = 100 + Math.random() * 100;
        showMessage("💚 ห้องสีเขียว... มีบางอย่างซ่อนอยู่ ไล่ได้ด้วยแฟลช [F] เท่านั้น");
    } else resetGreenGhost();
};

const _sod = startOpenDoor;
startOpenDoor = function () {
    if (greenGhost.state === "waiting" || greenGhost.state === "approach") { showMessage("🔒 ประตูไม่ขยับ... มีบางอย่างอยู่ในห้อง ใช้แฟลช [F]!"); return; }
    _sod();
};
const _th = toggleHide;
toggleHide = function () {
    if (!isHiding && (greenGhost.state === "waiting" || greenGhost.state === "approach")) { showMessage("🚫 ตู้เสื้อผ้าช่วยไม่ได้กับตัวนี้ ใช้แฟลช [F]!"); return; }
    _th();
};
const _rg = resetGame;
resetGame = function () { _rg(); resetGreenGhost(); };

const _upd2 = updateGameLogic;
updateGameLogic = function () { _upd2(); updateGreenGhost(); };

const _ds3 = drawScene;
drawScene = function () {
    _ds3();
    if (isGameOver) return;
    const g = greenGhost;
    if (currentRoomType === "green" && !isHiding) {
        ctx.save(); ctx.fillStyle = "rgba(0,70,25,0.10)"; ctx.fillRect(0, 0, 1024, 576); ctx.restore();
    }
    if (g.state === "jumpscare") {
        ctx.save();
        ctx.fillStyle = Math.random() < 0.5 ? "rgba(0,25,5,0.85)" : "rgba(0,0,0,0.9)"; ctx.fillRect(0, 0, 1024, 576);
        drawRotBear(cx + (Math.random() - 0.5) * 20, cy + 250 * g.s * 0.92, g.s, { alpha: 1, mouth: 1, glow: 1, jit: 4 });
        ctx.restore();
    }
};

/* ================= ผีดีไซน์ใหม่: มีมิติ น่ากลัว ขยับเป็นธรรมชาติ ================= */
const _wob = (t, s) => (Math.sin(t + s) + 0.5 * Math.sin(t * 2.17 + s * 1.7) + 0.25 * Math.sin(t * 4.1 + s * 2.9)) / 1.75;
const _tw = (t, s) => Math.pow(Math.max(0, Math.sin(t * 0.7 + s) * Math.sin(t * 1.9 + s * 2 + 1)), 6);
const _clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function _limb(pts, w, col, ol) {
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.strokeStyle = ol; ctx.lineWidth = w + 5; ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
}

/* ---------- เบบี๋เน่าสีเขียว (ผีห้องเขียว) ---------- */
function drawRotBear(x, y, s, o) {
    o = o || {};
    const alpha = o.alpha === undefined ? 1 : o.alpha, mouth = o.mouth === undefined ? 0.3 : o.mouth;
    const jit = o.jit === undefined ? 1 : o.jit, aura = o.aura !== false;
    const T = Date.now() * 0.001, W = (sp, sd) => _wob(T * sp, sd);
    const OL = "#030503", SK = "#8fa583", SKL = "#bcd1aa", SKD = "#46593f", SKDD = "#273725";
    ctx.save();
    const rj = jit > 1.5 ? jit : 0;
    ctx.translate(x + (rj ? (Math.random() - 0.5) * rj * s : 0), y + (rj ? (Math.random() - 0.5) * rj * s : 0));
    ctx.scale(s, s); ctx.globalAlpha = alpha; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.rotate(W(0.5, 3) * 0.01);

    if (aura) {
        const ag = ctx.createRadialGradient(0, -160, 20, 0, -160, 230);
        ag.addColorStop(0, "rgba(110,220,80,0.20)"); ag.addColorStop(1, "rgba(110,220,80,0)");
        ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(0, -160, 230, 0, 7); ctx.fill();
    }
    const blot = (bx, by, rx, ry, col) => { const g = ctx.createRadialGradient(bx, by, 0, bx, by, Math.max(rx, ry)); g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(bx, by, rx, ry, 0, 0, 7); ctx.fill(); };

    // ขาอ้วนสั้น + เท้าเปล่า
    [-1, 1].forEach(sd => {
        const lx = sd * 30, g = ctx.createLinearGradient(lx - 26, 0, lx + 26, 0);
        g.addColorStop(0, SKD); g.addColorStop(0.42, SK); g.addColorStop(1, SKDD);
        ctx.fillStyle = g; ctx.strokeStyle = OL; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(lx - 25, -108); ctx.quadraticCurveTo(lx - 32, -60, lx - 23, -16); ctx.lineTo(lx + 23, -16); ctx.quadraticCurveTo(lx + 32, -60, lx + 25, -108); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "rgba(10,25,10,0.5)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lx - 16, -62); ctx.quadraticCurveTo(lx, -56, lx + 16, -62); ctx.stroke();
        blot(lx - sd * 6, -78, 11, 8, "rgba(100,40,28,0.45)"); blot(lx + sd * 8, -35, 9, 6, "rgba(30,60,30,0.5)");
        ctx.fillStyle = SK; ctx.strokeStyle = OL; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.ellipse(lx + sd * 3, -10, 28, 11, 0, 0, 7); ctx.fill(); ctx.stroke();
        for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(lx + sd * 3 - 17 + k * 8.5, -1.5, 4.6 - (k === (sd < 0 ? 4 : 0) ? 0.6 : 0), 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#1a2216"; ctx.beginPath(); ctx.arc(lx + sd * 3 - 17 + k * 8.5, -2.6, 1.3, 0, 7); ctx.fill(); ctx.fillStyle = SK; }
    });

    // ลำตัวพุงป่อง (หายใจ)
    const br = Math.sin(T * 1.6);
    ctx.save(); ctx.translate(0, -110); ctx.scale(1 + 0.008 * br, 1 + 0.014 * br); ctx.translate(0, 110);
    const torso = () => { ctx.beginPath(); ctx.moveTo(-46, -214); ctx.quadraticCurveTo(-76, -176, -68, -140); ctx.quadraticCurveTo(-64, -122, -56, -108); ctx.lineTo(56, -108); ctx.quadraticCurveTo(64, -122, 68, -140); ctx.quadraticCurveTo(76, -176, 46, -214); ctx.quadraticCurveTo(0, -224, -46, -214); ctx.closePath(); };
    const tg = ctx.createRadialGradient(-16, -180, 8, 0, -160, 100); tg.addColorStop(0, SKL); tg.addColorStop(0.5, SK); tg.addColorStop(1, SKD);
    ctx.fillStyle = tg; ctx.strokeStyle = OL; ctx.lineWidth = 3; torso(); ctx.fill(); ctx.stroke();
    ctx.save(); torso(); ctx.clip();
    blot(-38, -176, 18, 12, "rgba(110,42,30,0.4)"); blot(40, -150, 16, 14, "rgba(30,60,32,0.5)"); blot(-30, -128, 14, 10, "rgba(30,60,32,0.45)"); blot(34, -194, 12, 9, "rgba(110,42,30,0.35)");
    ctx.strokeStyle = "rgba(15,35,15,0.35)"; ctx.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, -214, 62 + i * 10, Math.PI * 0.18, Math.PI * 0.82); ctx.stroke(); }
    ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.beginPath(); ctx.ellipse(-16, -150, 26, 38, 0.1, 0, 7); ctx.fill();
    ctx.restore();
    // รอยผ่าตรงกลางอกเย็บด้วยด้าย
    const sc = i => Math.sin(i * 1.7) * 1.4;
    ctx.strokeStyle = "#2b0c0b"; ctx.lineWidth = 5.5; ctx.beginPath(); ctx.moveTo(0, -208); for (let i = 1; i <= 9; i++) ctx.lineTo(sc(i), -208 + i * 9); ctx.stroke();
    ctx.strokeStyle = "#7a2320"; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.strokeStyle = "rgba(180,210,160,0.35)"; ctx.lineWidth = 1.2; [-4, 4].forEach(o2 => { ctx.beginPath(); ctx.moveTo(o2, -208); for (let i = 1; i <= 9; i++) ctx.lineTo(sc(i) + o2, -208 + i * 9); ctx.stroke(); });
    ctx.strokeStyle = "#0b0d08"; ctx.lineWidth = 1.8;
    for (let i = 0; i < 9; i++) { const yy = -204 + i * 9, tw = (i % 2 ? 1 : -1) * 1.5; ctx.beginPath(); ctx.moveTo(-8 + tw, yy - 3); ctx.lineTo(8 - tw, yy + 3); ctx.stroke(); }
    ctx.fillStyle = "#1c0d0a"; ctx.beginPath(); ctx.ellipse(10, -136, 4.5, 3.2, 0, 0, 7); ctx.fill();
    ctx.restore();

    // กางเกงในเปื้อนๆ
    const ug = ctx.createLinearGradient(-60, 0, 60, 0); ug.addColorStop(0, "#3d453a"); ug.addColorStop(0.45, "#68705f"); ug.addColorStop(1, "#262d24");
    ctx.fillStyle = ug; ctx.strokeStyle = OL; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-64, -138); ctx.lineTo(64, -138); ctx.quadraticCurveTo(66, -108, 52, -96); ctx.lineTo(24, -98); ctx.lineTo(0, -108); ctx.lineTo(-24, -98); ctx.lineTo(-52, -96); ctx.quadraticCurveTo(-66, -108, -64, -138); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#2e352b"; ctx.fillRect(-64, -146, 128, 11); ctx.strokeRect(-64, -146, 128, 11);
    blot(-20, -118, 14, 8, "rgba(60,40,20,0.5)"); blot(28, -122, 10, 7, "rgba(20,30,20,0.5)");
    ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-30, -134); ctx.quadraticCurveTo(-22, -118, -34, -104); ctx.moveTo(32, -134); ctx.quadraticCurveTo(24, -118, 36, -104); ctx.stroke();

    // แขนอวบห้อยข้างลำตัว + มือเล็บดำ
    const a1 = W(1.0, 7), a2 = W(0.9, 3);
    [[-1, a1], [1, a2]].forEach(([sd, aw]) => {
        const sh = [sd * 58, -200], el = [sd * (86 + aw * 2), -160 + aw * 2], hd = [sd * (86 + aw * 3), -108 + aw * 3];
        _limb([sh, el], 27, SK, OL); _limb([el, hd], 22, SKD, OL);
        ctx.strokeStyle = "rgba(200,230,180,0.18)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sh[0] - sd * 6, sh[1] + 6); ctx.lineTo(el[0] - sd * 6, el[1]); ctx.stroke();
        blot(el[0], el[1] + 14, 8, 10, "rgba(100,40,28,0.45)");
        ctx.save(); ctx.translate(hd[0], hd[1]); ctx.rotate(sd * 0.06 + aw * 0.04);
        ctx.fillStyle = SK; ctx.strokeStyle = OL; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(0, 4, 12, 11, 0, 0, 7); ctx.fill(); ctx.stroke();
        for (let k = 0; k < 4; k++) {
            const fx = -9 + k * 6, curl = 3 + Math.sin(T * 1.4 + k + sd) * 2.5, len = 14 + (k === 1 || k === 2 ? 4 : 0);
            ctx.beginPath(); ctx.moveTo(fx, 10); ctx.quadraticCurveTo(fx + sd * curl, 10 + len * 0.6, fx - sd * 1.5, 10 + len); ctx.strokeStyle = OL; ctx.lineWidth = 7.5; ctx.stroke(); ctx.strokeStyle = SK; ctx.lineWidth = 4.8; ctx.stroke();
            ctx.fillStyle = "#12170e"; ctx.beginPath(); ctx.ellipse(fx - sd * 1.5, 10 + len + 1, 2.4, 3.2, 0, 0, 7); ctx.fill();
        }
        ctx.restore();
    });

    // คอ + หัวกลมโล้น
    ctx.fillStyle = SKD; ctx.fillRect(-21, -232, 42, 26);
    ctx.save(); ctx.translate(0, -212);
    ctx.rotate(W(0.6, 2) * 0.045 + _tw(T, 1.3) * 0.1 * Math.sin(T * 38) + W(0.33, 6) * 0.03);
    ctx.translate(0, 212);
    [-1, 1].forEach(sd => {
        ctx.fillStyle = SK; ctx.strokeStyle = OL; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(sd * 53, -246, 12, 16, sd * 0.2, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = SKD; ctx.beginPath(); ctx.ellipse(sd * 53, -246, 6, 10, sd * 0.2, 0, 7); ctx.fill();
    });
    const hg = ctx.createRadialGradient(-14, -274, 8, 0, -250, 70); hg.addColorStop(0, SKL); hg.addColorStop(0.55, SK); hg.addColorStop(1, "#3a4c35");
    ctx.fillStyle = hg; ctx.strokeStyle = OL; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, -250, 55, 52, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.ellipse(0, -250, 55, 52, 0, 0, 7); ctx.clip();
    blot(-30, -286, 18, 11, "rgba(110,42,30,0.45)"); blot(30, -268, 14, 10, "rgba(30,60,32,0.5)"); blot(-40, -226, 14, 12, "rgba(110,42,30,0.35)"); blot(42, -222, 12, 10, "rgba(110,42,30,0.35)");
    ctx.strokeStyle = "rgba(25,55,30,0.55)"; ctx.lineWidth = 1.4;
    [[-48, -262, -40, -274, -26, -290], [-40, -274, -50, -280, -54, -290], [46, -258, 38, -272, 24, -292], [38, -272, 48, -278, 52, -284], [-34, -232, -26, -222, -30, -208]].forEach(v => { ctx.beginPath(); ctx.moveTo(v[0], v[1]); ctx.quadraticCurveTo(v[2], v[3], v[4], v[5]); ctx.stroke(); });
    ctx.fillStyle = "rgba(255,255,255,0.16)"; ctx.beginPath(); ctx.ellipse(-16, -288, 14, 6, -0.3, 0, 7); ctx.fill();
    [-1, 1].forEach(sd => blot(sd * 36, -226, 17, 14, "rgba(255,255,255,0.07)"));
    ctx.restore();
    ctx.strokeStyle = "#1a2214"; ctx.lineWidth = 1.2;
    for (let i = 0; i < 5; i++) { const hx = -14 + i * 7, sw = Math.sin(T * 1.1 + i) * 2; ctx.beginPath(); ctx.moveTo(hx, -301); ctx.quadraticCurveTo(hx + sw + 4, -312, hx + sw * 2 + (i - 2) * 3, -320 - (i % 2) * 4); ctx.stroke(); }
    // คิ้วขมวด + ตาดำกลมโต
    ctx.strokeStyle = "#16200f"; ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.moveTo(-42, -276); ctx.quadraticCurveTo(-26, -272, -9, -264); ctx.moveTo(42, -276); ctx.quadraticCurveTo(26, -272, 9, -264); ctx.stroke();
    const per = (T + 0.8) % 4.4, bl = per < 0.14 ? Math.sin(per / 0.14 * Math.PI) : 0, lid = 0.16 + bl * 0.84;
    const gx = _clamp((mousePos.x - cx) * 0.01, -3.5, 3.5), gy = _clamp((mousePos.y - cy) * 0.007, -2.5, 2.5);
    [-1, 1].forEach(sd => {
        const ex = sd * 21, ey = -252;
        blot(ex, ey + 2, 26, 24, "rgba(10,28,12,0.7)");
        ctx.save(); ctx.beginPath(); ctx.ellipse(ex, ey, 17, 17.5, 0, 0, 7); ctx.clip();
        const sg = ctx.createRadialGradient(ex - 3, ey - 3, 2, ex, ey, 18); sg.addColorStop(0, "#c9d6b6"); sg.addColorStop(1, "#7f9272");
        ctx.fillStyle = sg; ctx.fillRect(ex - 18, ey - 18, 36, 36);
        ctx.strokeStyle = "rgba(120,40,30,0.5)"; ctx.lineWidth = 0.8; for (let v = 0; v < 5; v++) { const va = v * 1.3 + sd; ctx.beginPath(); ctx.moveTo(ex + Math.cos(va) * 18, ey + Math.sin(va) * 18); ctx.lineTo(ex + Math.cos(va) * 11 + gx, ey + Math.sin(va) * 11 + gy); ctx.stroke(); }
        ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(ex + gx, ey + gy, 12.5, 0, 7); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.beginPath(); ctx.arc(ex + gx - 4, ey + gy - 5, 2.6, 0, 7); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.beginPath(); ctx.arc(ex + gx + 4, ey + gy + 5, 1.5, 0, 7); ctx.fill();
        ctx.fillStyle = SK; ctx.fillRect(ex - 18, ey - 18, 36, 36 * lid);
        ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(ex - 18, ey - 18 + 36 * lid, 36, 2.2);
        ctx.restore();
        ctx.strokeStyle = "rgba(20,40,20,0.65)"; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(ex, ey + 1, 19, Math.PI * 0.18, Math.PI * 0.82); ctx.stroke();
    });
    // จมูกกลม
    const ng = ctx.createRadialGradient(-2, -238, 1, 0, -234, 10); ng.addColorStop(0, "#a2ba90"); ng.addColorStop(1, "#46593f");
    ctx.fillStyle = ng; ctx.strokeStyle = OL; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, -234, 9, 7, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#0a0f08"; ctx.beginPath(); ctx.ellipse(-3.2, -232, 1.7, 2.4, 0, 0, 7); ctx.ellipse(3.2, -232, 1.7, 2.4, 0, 0, 7); ctx.fill();
    // ปากเย็บ ฟันเหยินๆ
    const mh = 5 + 32 * mouth + Math.sin(T * 2.2) * 1.2, mt = -219, hw = 23 + 9 * mouth;
    const mp = () => { ctx.beginPath(); ctx.moveTo(-hw, mt); ctx.quadraticCurveTo(0, mt - 3, hw, mt); ctx.quadraticCurveTo(0, mt + 2 * mh, -hw, mt); ctx.closePath(); };
    ctx.save(); mp(); const mg = ctx.createLinearGradient(0, mt, 0, mt + mh); mg.addColorStop(0, "#030403"); mg.addColorStop(1, "#1a0a0a"); ctx.fillStyle = mg; ctx.fill(); ctx.clip();
    ctx.fillStyle = "#3a1511"; ctx.fillRect(-hw, mt - 2, hw * 2, 4.5); ctx.fillRect(-hw, mt + mh * 0.9, hw * 2, 4);
    ctx.fillStyle = "#4b1c18"; ctx.beginPath(); ctx.ellipse(0, mt + mh * 0.92, hw * 0.45, mh * 0.3, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 0.8;
    for (let i = 0; i < 8; i++) {
        const tx = -hw + (i + 0.5) * (2 * hw / 8), u = (tx + hw) / (2 * hw), ty = mt - 6 * u * (1 - u) * 2 + 2, by2 = mt + 4 * mh * u * (1 - u), tl = 7 + ((i * 5) % 4) * 2.6;
        ctx.fillStyle = i % 3 === 1 ? "#a9a982" : "#cfd1a8";
        ctx.beginPath(); ctx.moveTo(tx - 3.4, ty - 2); ctx.lineTo(tx + 3.4, ty - 2); ctx.lineTo(tx + ((i % 2) ? 1.2 : -1.2), ty + tl); ctx.closePath(); ctx.fill(); ctx.stroke();
        if (i % 2 === 0 && mh > 12) { ctx.beginPath(); ctx.moveTo(tx - 3, by2 + 1); ctx.lineTo(tx + 3, by2 + 1); ctx.lineTo(tx, by2 - 5 - (i % 3) * 2.5); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    }
    ctx.restore();
    ctx.strokeStyle = "#3f5236"; ctx.lineWidth = 5; mp(); ctx.stroke(); ctx.strokeStyle = OL; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = "#0a0d07"; ctx.lineWidth = 2.1;
    for (let i = 0; i < 7; i++) {
        const sx = -hw + 4 + i * ((2 * hw - 8) / 6), u = (sx + hw) / (2 * hw), by2 = mt + 4 * mh * u * (1 - u), ty2 = mt - 6 * u * (1 - u) * 1.5;
        const tw = (i % 2 ? 1.6 : -1.6);
        ctx.beginPath(); ctx.moveTo(sx + tw, ty2 - 8); ctx.lineTo(sx - tw * 0.4, by2 + 9); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx - 3, ty2 - 5); ctx.lineTo(sx + 3, ty2 - 9); ctx.moveTo(sx - 3, by2 + 7); ctx.lineTo(sx + 3, by2 + 11); ctx.stroke();
    }
    const dl = 7 + (1 + Math.sin(T * 1.5)) * 6;
    ctx.strokeStyle = "rgba(190,230,170,0.55)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-9, mt + mh * 0.92 + 4); ctx.lineTo(-9, mt + mh * 0.92 + 4 + dl); ctx.stroke();
    ctx.fillStyle = "rgba(190,230,170,0.6)"; ctx.beginPath(); ctx.arc(-9, mt + mh * 0.92 + 5.5 + dl, 2.4, 0, 7); ctx.fill();
    blot(0, -196, 30, 9, "rgba(0,0,0,0.22)");
    ctx.restore();   // หัว
    ctx.restore();   // ลำตัว
}

/* ---------- ผีเงาหน้าประตู: ร่างผอมสูง ใบหน้ายืด ยิ้มฉีก ---------- */
function drawOrganicGhost(x, y, scale, alpha) {
    const T = Date.now() * 0.001, js = (ghostState === "jumpscare"), W = (sp, sd) => _wob(T * sp, sd);
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.globalAlpha = alpha;
    if (js) ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    const ag = ctx.createRadialGradient(0, -20, 10, 0, -20, 175); ag.addColorStop(0, "rgba(8,22,18,0.7)"); ag.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(0, -20, 175, 0, 7); ctx.fill();
    ctx.rotate(W(0.5, 1) * 0.025);
    const breath = Math.sin(T * 1.4) * 2;
    // ผมยาวด้านหลัง
    ctx.lineCap = "round";
    for (let i = 0; i < 14; i++) {
        const sx = -27 + i * 4.2, sy = -138 + Math.abs(sx) * 0.5, sw = Math.sin(T * 1.1 + i * 0.8) * 7 * (0.5 + i % 3 * 0.25);
        ctx.strokeStyle = i % 4 === 0 ? "#10151a" : "#030405"; ctx.lineWidth = 2.2 + (i % 3);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.bezierCurveTo(sx * 1.7 + sw, sy + 50, sx * 1.9 - sw, 10, sx * 1.8 + sw * 1.4, 70 + (i % 5) * 14); ctx.stroke();
    }
    // ชุดคลุมขาดวิ่น
    const rg = ctx.createLinearGradient(-62, 0, 62, 0);
    rg.addColorStop(0, "#0a0f12"); rg.addColorStop(0.3, "#1d2a30"); rg.addColorStop(0.55, "#090c0e"); rg.addColorStop(1, "#050709");
    ctx.fillStyle = rg; ctx.beginPath(); ctx.moveTo(-31, -66 + breath * 0.5);
    ctx.bezierCurveTo(-54, -40, -48 + W(1.1, 2) * 4, 40, -62, 122);
    for (let i = 0; i <= 8; i++) ctx.lineTo(-62 + i * 15.5, 128 + Math.sin(T * 2 + i * 1.3) * 6 + (i % 2 ? 16 : 0));
    ctx.bezierCurveTo(48 + W(1.3, 5) * 4, 40, 54, -40, 31, -66 + breath * 0.5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(120,160,170,0.14)"; ctx.lineWidth = 1.6;
    for (let i = 0; i < 6; i++) { const fx = -36 + i * 14; ctx.beginPath(); ctx.moveTo(fx * 0.7, -55); ctx.quadraticCurveTo(fx * 1.1 + Math.sin(T * 1.2 + i) * 4, 30, fx * 1.35, 118); ctx.stroke(); }
    ctx.strokeStyle = "rgba(150,200,215,0.22)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-31, -64); ctx.bezierCurveTo(-52, -40, -47, 40, -60, 118); ctx.stroke();
    // แขนยาว นิ้วยาว
    const reach = js ? 1 : 0, SKIN = "#9aa297";
    [-1, 1].forEach(sd => {
        const sh = [sd * 31, -58], el = [sd * (58 + reach * 12), 4 - reach * 36 + W(0.8, sd) * 3], hd = [sd * (50 + reach * 14 + W(1.1, sd + 2) * 3), 90 - reach * 150 + breath];
        _limb([sh, el, hd], 6.5, SKIN, "#0a0d0e");
        ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(hd[0], hd[1], 6, 0, 7); ctx.fill();
        ctx.strokeStyle = "#a9b0a5"; ctx.lineWidth = 2.6;
        for (let i = 0; i < 5; i++) {
            const a = (reach ? -Math.PI / 2 : Math.PI / 2) + (i - 2) * 0.24, b = 0.3 + 0.35 * Math.sin(T * 1.3 + i * 0.9 + sd);
            const p1 = [hd[0] + Math.cos(a) * 17, hd[1] + Math.sin(a) * 17], p2 = [p1[0] + Math.cos(a + b * sd) * 15, p1[1] + Math.sin(a + b * sd) * 15];
            ctx.beginPath(); ctx.moveTo(hd[0], hd[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
        }
    });
    // หัวยืด
    const lookX = _clamp((mousePos.x - x) * 0.0007, -0.07, 0.07);
    ctx.save(); ctx.translate(0, -66);
    ctx.rotate(W(0.6, 4) * 0.07 + lookX + _tw(T, 2) * 0.16 * Math.sin(T * 30) + (js ? W(30, 1) * 0.05 : 0));
    ctx.translate(0, 66);
    ctx.fillStyle = "#6b7369"; ctx.fillRect(-8, -82, 16, 22);
    const hg = ctx.createLinearGradient(-30, -152, 30, -62); hg.addColorStop(0, "#c4cac0"); hg.addColorStop(0.5, "#8b9388"); hg.addColorStop(1, "#464e49");
    ctx.fillStyle = hg; ctx.strokeStyle = "#0b0e0d"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, -106, 31, 46, 0, 0, 7); ctx.fill(); ctx.stroke();
    [-1, 1].forEach(sd => {
        const cg = ctx.createRadialGradient(sd * 21, -84, 2, sd * 21, -84, 20); cg.addColorStop(0, "rgba(10,16,14,0.55)"); cg.addColorStop(1, "rgba(10,16,14,0)");
        ctx.fillStyle = cg; ctx.beginPath(); ctx.ellipse(sd * 21, -84, 13, 21, 0, 0, 7); ctx.fill();
    });
    const bsg = ctx.createRadialGradient(0, -128, 2, 0, -128, 30); bsg.addColorStop(0, "rgba(0,0,0,0.4)"); bsg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bsg; ctx.beginPath(); ctx.ellipse(0, -126, 30, 10, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(25,45,40,0.55)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-6, -148); ctx.lineTo(-10, -136); ctx.lineTo(-4, -128); ctx.moveTo(12, -146); ctx.lineTo(9, -134); ctx.lineTo(14, -127); ctx.moveTo(-22, -90); ctx.lineTo(-17, -78); ctx.stroke();
    ctx.strokeStyle = "rgba(70,60,120,0.3)"; ctx.beginPath(); ctx.moveTo(-26, -118); ctx.quadraticCurveTo(-22, -108, -26, -98); ctx.moveTo(26, -118); ctx.quadraticCurveTo(22, -108, 26, -98); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.beginPath(); ctx.ellipse(-12, -140, 9, 5, -0.4, 0, 7); ctx.fill();
    const sw = js ? 1.3 : 1, px = _clamp((mousePos.x - x) * 0.012, -4, 4), py = _clamp((mousePos.y - y) * 0.01, -5, 5);
    [-1, 1].forEach(sd => {
        const ex = sd * 13, ey = -112, sg = ctx.createRadialGradient(ex, ey, 4, ex, ey, 25 * sw);
        sg.addColorStop(0, "rgba(0,0,0,0.95)"); sg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(ex, ey, 24 * sw, 29 * sw, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "#000"; ctx.beginPath(); ctx.ellipse(ex, ey, 10.5 * sw, 15 * sw, sd * 0.15, 0, 7); ctx.fill();
        ctx.save(); ctx.shadowColor = "#ff3b30"; ctx.shadowBlur = 9; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ex + px, ey + py, js ? 1.6 : 2.2 + Math.sin(T * 3 + sd) * 0.5, 0, 7); ctx.fill(); ctx.restore();
    });
    ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.beginPath(); ctx.ellipse(-3, -92, 1.6, 4.2, 0.2, 0, 7); ctx.ellipse(3, -92, 1.6, 4.2, -0.2, 0, 7); ctx.fill();
    // ปากฉีกกว้าง
    const m = js ? 1 : _clamp(0.12 + 0.1 * Math.sin(T * 0.9) + _tw(T, 5) * 0.5, 0, 1), mh = 4 + 36 * m, mt = -80, hw = 25 + 4 * m;
    const chin = -62 + mh * 0.75;
    ctx.fillStyle = "#6f776d"; ctx.beginPath(); ctx.moveTo(-26, mt - 6); ctx.quadraticCurveTo(-22, chin + 4, 0, chin + 8); ctx.quadraticCurveTo(22, chin + 4, 26, mt - 6); ctx.fill();
    ctx.save();
    const mp = () => { ctx.beginPath(); ctx.moveTo(-hw, mt); ctx.quadraticCurveTo(0, mt + 8, hw, mt); ctx.quadraticCurveTo(0, mt + 2 * mh, -hw, mt); ctx.closePath(); };
    mp(); const mg = ctx.createLinearGradient(0, mt, 0, mt + mh); mg.addColorStop(0, "#050102"); mg.addColorStop(1, "#1d0508"); ctx.fillStyle = mg; ctx.fill(); ctx.clip();
    ctx.fillStyle = "#d9d7c5"; ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 0.6;
    for (let i = 0; i < 14; i++) {
        const tx = -hw + (i + 0.5) * (2 * hw / 14), u = (tx + hw) / (2 * hw), ty = mt + 16 * u * (1 - u), by2 = mt + 4 * mh * u * (1 - u);
        ctx.beginPath(); ctx.moveTo(tx - 1.8, ty); ctx.lineTo(tx + 1.8, ty); ctx.lineTo(tx, ty + 6 + (i % 3) * 2.5); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(tx - 1.8, by2); ctx.lineTo(tx + 1.8, by2); ctx.lineTo(tx, by2 - 5 - (i % 2) * 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    mp(); ctx.strokeStyle = "#050606"; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = "rgba(8,12,10,0.8)"; ctx.lineWidth = 1.6;
    [-1, 1].forEach(sd => { ctx.beginPath(); ctx.moveTo(sd * hw, mt); ctx.lineTo(sd * (hw + 12), mt - 11); ctx.stroke(); for (let k = 1; k < 4; k++) { const sx2 = sd * (hw + k * 3), sy2 = mt - k * 2.9; ctx.beginPath(); ctx.moveTo(sx2, sy2 - 2.5); ctx.lineTo(sx2, sy2 + 2.5); ctx.stroke(); } });
    ctx.restore();
    // ผมหน้า
    ctx.strokeStyle = "#040506"; ctx.lineWidth = 1.8;
    [-1, 1].forEach(sd => { const s2 = Math.sin(T * 1.3 + sd) * 4; ctx.beginPath(); ctx.moveTo(sd * 27, -128); ctx.bezierCurveTo(sd * 36 + s2, -100, sd * 20 - s2, -70, sd * 30 + s2, -40); ctx.stroke(); });
    ctx.restore();
    ctx.restore();
}

/* ---------- ผีหน้าต่าง: หุ่นยนต์โครงกระดูกโลหะ ---------- */
function drawWindowGhost(x, y, scale, alpha = 1, riseProgress = 1) {
    const T = Date.now() * 0.001, W = (sp, sd) => _wob(T * sp, sd);
    const glow = windowGhostEyeGlow, js = (windowGhostState === "jumpscare");
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.globalAlpha = alpha;
    ctx.translate(0, (1 - _clamp(riseProgress, 0, 1)) * 110);
    const snap = _tw(T, 3);
    ctx.translate(W(1.6, 1) * 1.5 + snap * 5 * Math.sin(T * 60), W(1.9, 2) * 1.5);
    if (glow > 0) {
        const au = ctx.createRadialGradient(0, -20, 10, 0, -20, 170); au.addColorStop(0, `rgba(255,40,10,${glow * 0.6})`); au.addColorStop(1, "rgba(255,0,0,0)");
        ctx.fillStyle = au; ctx.fillRect(-170, -190, 340, 340);
    }
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    // สายไฟห้อยลงมา
    const cols = ["#3a3d46", "#7a1a14", "#1b3d70", "#3a3d46", "#5a4a14", "#3a3d46", "#7a1a14"];
    [-45, -30, -15, 0, 15, 30, 45].forEach((wx, i) => {
        const sw2 = Math.sin(T * 1.5 + i) * 7;
        ctx.beginPath(); ctx.moveTo(wx, 50); ctx.bezierCurveTo(wx + sw2, 82, wx - sw2, 112, wx + sw2 * 0.5, 134 + (i % 3) * 15);
        ctx.strokeStyle = "#08090b"; ctx.lineWidth = 6; ctx.stroke(); ctx.strokeStyle = cols[i]; ctx.lineWidth = 2.2; ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,0.14)"; ctx.lineWidth = 0.8; ctx.stroke();
    });
    ctx.save(); ctx.translate(0, 40); ctx.rotate(W(0.7, 3) * 0.05 + snap * 0.08 * Math.sin(T * 0.3 + 1)); ctx.translate(0, -40);
    // คอเป็นข้อปล้อง
    for (let k = 0; k < 5; k++) {
        const ny = 26 + k * 13, nw = 30 - k * 2, ng = ctx.createLinearGradient(-nw, 0, nw, 0);
        ng.addColorStop(0, "#15171c"); ng.addColorStop(0.35, "#5a5e68"); ng.addColorStop(1, "#0c0d10");
        ctx.fillStyle = ng; ctx.strokeStyle = "#050607"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, ny, nw, 7, 0, 0, 7); ctx.fill(); ctx.stroke();
    }
    ctx.strokeStyle = "#7c828d"; ctx.lineWidth = 2.5; [-15, 15].forEach(px => { ctx.beginPath(); ctx.moveTo(px, 24); ctx.lineTo(px, 78); ctx.stroke(); });
    // หูโลหะ
    [-1, 1].forEach(sd => {
        const eg = ctx.createRadialGradient(sd * 60, -98, 2, sd * 62, -94, 24); eg.addColorStop(0, "#646a76"); eg.addColorStop(1, "#0f1114");
        ctx.fillStyle = eg; ctx.strokeStyle = "#050607"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sd * 62, -94, 21, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#020203"; ctx.beginPath(); ctx.arc(sd * 62, -94, 11, 0, 7); ctx.fill();
        ctx.strokeStyle = "#5a5f6a"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sd * 62, -94, 7, T + sd, T + sd + 4); ctx.stroke();
    });
    // กะโหลก
    const shell = () => { ctx.beginPath(); ctx.moveTo(-66, -58); ctx.lineTo(-56, -102); ctx.quadraticCurveTo(-48, -116, -26, -116); ctx.lineTo(26, -116); ctx.quadraticCurveTo(48, -116, 56, -102); ctx.lineTo(66, -58); ctx.lineTo(62, 18); ctx.lineTo(-62, 18); ctx.closePath(); };
    const hg = ctx.createLinearGradient(-66, 0, 66, 0); hg.addColorStop(0, "#5b606b"); hg.addColorStop(0.3, "#3b3f47"); hg.addColorStop(0.7, "#1a1c21"); hg.addColorStop(1, "#0a0b0e");
    ctx.fillStyle = hg; ctx.strokeStyle = "#050507"; ctx.lineWidth = 3.5; shell(); ctx.fill(); ctx.stroke();
    ctx.save(); shell(); ctx.clip();
    const vg = ctx.createLinearGradient(0, -116, 0, 18); vg.addColorStop(0, "rgba(255,255,255,0.16)"); vg.addColorStop(0.25, "rgba(255,255,255,0)"); vg.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = vg; ctx.fillRect(-70, -120, 140, 140);
    ctx.fillStyle = "rgba(255,255,255,0.14)"; ctx.beginPath(); ctx.ellipse(-36, -88, 14, 26, 0.5, 0, 7); ctx.fill();
    const rust = ctx.createLinearGradient(0, -110, 0, 0); rust.addColorStop(0, "rgba(110,50,20,0.5)"); rust.addColorStop(1, "rgba(110,50,20,0)");
    ctx.fillStyle = rust; [[-50, 22], [38, 16], [8, 12]].forEach(r => ctx.fillRect(r[0], -112, r[1] * 0.4, 70 + r[1] * 2));
    ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(0, -116); ctx.lineTo(0, -62); ctx.moveTo(-60, -66); ctx.lineTo(60, -66); ctx.stroke();
    ctx.strokeStyle = "rgba(200,205,215,0.18)"; ctx.lineWidth = 1; for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.moveTo(-50 + i * 17, -108 + (i % 3) * 9); ctx.lineTo(-40 + i * 17, -88 + (i % 2) * 14); ctx.stroke(); }
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(-26, -110, 52, 3); ctx.fillRect(-22, -104, 44, 2);
    ctx.restore();
    [[-58, -98], [58, -98], [-58, -64], [58, -64]].forEach(r => { ctx.fillStyle = "#23262d"; ctx.beginPath(); ctx.arc(r[0], r[1], 3.6, 0, 7); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.beginPath(); ctx.arc(r[0] - 1, r[1] - 1, 1.2, 0, 7); ctx.fill(); });
    // ขนผุๆ
    ctx.strokeStyle = "#1c2314"; ctx.lineWidth = 2.5;
    for (let i = 0; i < 9; i++) { const fx = -52 + i * 13 + (i % 2) * 4, fy = -110 + Math.abs(fx) * 0.12; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.quadraticCurveTo(fx + Math.sin(T * 1.3 + i) * 3, fy - 8, fx + (i % 2 ? 4 : -4) + Math.sin(T * 1.7 + i) * 3, fy - 15 - (i % 3) * 4); ctx.stroke(); }
    // จมูก/ปากกระบอก
    const mg2 = ctx.createLinearGradient(-42, 0, 42, 0); mg2.addColorStop(0, "#40444d"); mg2.addColorStop(0.5, "#23262c"); mg2.addColorStop(1, "#0d0e11");
    ctx.fillStyle = mg2; ctx.strokeStyle = "#050507"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-34, -12); ctx.lineTo(34, -12); ctx.lineTo(44, 24); ctx.lineTo(-44, 24); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#020203"; ctx.beginPath(); ctx.moveTo(-9, -8); ctx.lineTo(9, -8); ctx.lineTo(0, 4); ctx.closePath(); ctx.fill();
    // ปาก
    const jaw = js ? 1 : _clamp(0.12 + 0.1 * Math.sin(T * 1.1) + snap * 0.5, 0, 1), jh = 8 + 40 * jaw, mt = 20;
    ctx.fillStyle = "#010102"; ctx.beginPath(); ctx.moveTo(-50, mt); ctx.lineTo(50, mt); ctx.lineTo(42, mt + jh); ctx.lineTo(-42, mt + jh); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#d3d3d8"; ctx.strokeStyle = "#1a1a1f"; ctx.lineWidth = 1;
    ctx.beginPath(); for (let i = 0; i < 10; i++) { const tx = -45 + i * 9; ctx.moveTo(tx, mt); ctx.lineTo(tx + 4.5, mt + 17 + (i % 2) * 5); ctx.lineTo(tx + 9, mt); } ctx.fill(); ctx.stroke();
    ctx.beginPath(); for (let i = 0; i < 9; i++) { const tx = -38 + i * 8.5; ctx.moveTo(tx, mt + jh); ctx.lineTo(tx + 4.25, mt + jh - 14 - (i % 2) * 5); ctx.lineTo(tx + 8.5, mt + jh); } ctx.fill(); ctx.stroke();
    const jg = ctx.createLinearGradient(-50, 0, 50, 0); jg.addColorStop(0, "#3a3d46"); jg.addColorStop(0.5, "#1b1d23"); jg.addColorStop(1, "#0a0b0e");
    ctx.fillStyle = jg; ctx.strokeStyle = "#050507"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-50, mt + jh - 2); ctx.lineTo(50, mt + jh - 2); ctx.lineTo(40, mt + jh + 20); ctx.lineTo(-40, mt + jh + 20); ctx.closePath(); ctx.fill(); ctx.stroke();
    [-1, 1].forEach(sd => { ctx.fillStyle = "#565b66"; ctx.beginPath(); ctx.arc(sd * 52, mt + 4, 7, 0, 7); ctx.fill(); ctx.stroke(); ctx.strokeStyle = "#0a0b0e"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sd * 52, mt + 6); ctx.quadraticCurveTo(sd * 62, mt + jh * 0.5, sd * 46, mt + jh); ctx.stroke(); });
    // ตาเลนส์ + เปลือกตากล
    const blink = (T % 6.1) < 0.1 ? 1 : 0, lid = glow > 0.05 ? 0.04 : _clamp(0.36 + 0.1 * Math.sin(T * 0.8) + blink, 0, 1);
    [-1, 1].forEach(sd => {
        const ex = sd * 35, ey = -32;
        const rg = ctx.createRadialGradient(ex, ey, 18, ex, ey, 36); rg.addColorStop(0, "#050303"); rg.addColorStop(1, "#4a2a1c");
        ctx.fillStyle = rg; ctx.strokeStyle = "#050202"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(ex, ey, 36, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#050303"; ctx.beginPath(); ctx.arc(ex, ey, 28, 0, 7); ctx.fill();
        ctx.save(); ctx.beginPath(); ctx.arc(ex, ey, 27, 0, 7); ctx.clip();
        if (glow > 0) {
            const lg = ctx.createRadialGradient(ex, ey, 2, ex, ey, 27);
            lg.addColorStop(0, `rgba(255,255,255,${glow})`); lg.addColorStop(0.3, `rgba(255,51,0,${glow})`); lg.addColorStop(0.8, `rgba(204,0,0,${glow})`); lg.addColorStop(1, `rgba(68,0,0,${glow})`);
            ctx.fillStyle = lg; ctx.fillRect(ex - 28, ey - 28, 56, 56);
            ctx.strokeStyle = `rgba(255,235,59,${glow})`; ctx.lineWidth = 2.2; ctx.beginPath();
            for (let a = 0; a < Math.PI * 6; a += 0.15) { const r = a * 1.3, an = a + T * 10 * sd; const sx = ex + Math.cos(an) * r, sy = ey + Math.sin(an) * r; if (a === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy); }
            ctx.stroke();
        } else {
            const idle = 0.3 + 0.25 * Math.sin(T * 2.3 + sd);
            const ig = ctx.createRadialGradient(ex, ey, 0, ex, ey, 12); ig.addColorStop(0, `rgba(255,60,30,${idle})`); ig.addColorStop(1, "rgba(120,10,0,0)");
            ctx.fillStyle = ig; ctx.fillRect(ex - 14, ey - 14, 28, 28);
        }
        ctx.fillStyle = "rgba(255,255,255,0.28)"; ctx.beginPath(); ctx.ellipse(ex - 9, ey - 10, 6, 4, -0.6, 0, 7); ctx.fill();
        const lh = lid * 54, lgd = ctx.createLinearGradient(0, ey - 27, 0, ey - 27 + lh);
        lgd.addColorStop(0, "#40444d"); lgd.addColorStop(1, "#16181d"); ctx.fillStyle = lgd; ctx.fillRect(ex - 28, ey - 28, 56, lh + 1);
        ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(ex - 28, ey - 27 + lh, 56, 3);
        ctx.restore();
    });
    ctx.restore();
    ctx.restore();
}

/* ---------- ผีข้างตู้เสื้อผ้า: ใบหน้าซีดแตกร้าว ผมยาว น้ำตาดำ ---------- */
function drawWardrobeGhost(x, y, scale, alpha, baseRotation = 0) {
    const T = Date.now() * 0.001, W = (sp, sd) => _wob(T * sp, sd), js = (wardrobeGhostState === "jumpscare");
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.globalAlpha = alpha;
    ctx.rotate(baseRotation + W(0.45, 2) * 0.06 + _tw(T, 4) * 0.1 * Math.sin(T * 25));
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    const hm = ctx.createRadialGradient(0, 0, 30, 0, 10, 150); hm.addColorStop(0, "#0b0b0c"); hm.addColorStop(1, "#000");
    ctx.fillStyle = hm; ctx.beginPath(); ctx.ellipse(0, 12, 92, 142, 0, 0, 7); ctx.fill();
    for (let i = 0; i < 34; i++) {
        const a = Math.PI * (0.88 + 1.24 * i / 33), k = ((i * 37) % 11) / 11, sx = Math.cos(a) * 50, sy = -5 + Math.sin(a) * 76;
        const sw = Math.sin(T * 1.3 + i * 0.7) * 6 * (0.5 + k), ex = Math.cos(a) * (95 + k * 40) + sw, ey = 110 + (i % 5) * 14;
        ctx.strokeStyle = i % 5 === 0 ? "#18181d" : "#030303"; ctx.lineWidth = 2.2 + (i % 3) * 1.1;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.bezierCurveTo(sx * 1.5 + sw, sy + 30, ex * 0.9 - sw, ey * 0.5, ex, ey); ctx.stroke();
    }
    const fg = ctx.createLinearGradient(-50, -80, 40, 90); fg.addColorStop(0, "#e3d5c1"); fg.addColorStop(0.5, "#b4a08a"); fg.addColorStop(1, "#665548");
    ctx.fillStyle = fg; ctx.strokeStyle = "#1a0f0a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, -5, 52, 78, 0, 0, 7); ctx.fill(); ctx.stroke();
    [-1, 1].forEach(sd => {
        const tg = ctx.createRadialGradient(sd * 48, -20, 4, sd * 48, -20, 44); tg.addColorStop(0, "rgba(10,5,4,0.6)"); tg.addColorStop(1, "rgba(10,5,4,0)");
        ctx.fillStyle = tg; ctx.beginPath(); ctx.arc(sd * 48, -20, 44, 0, 7); ctx.fill();
        const cg = ctx.createRadialGradient(sd * 30, 26, 3, sd * 30, 26, 26); cg.addColorStop(0, "rgba(45,25,20,0.5)"); cg.addColorStop(1, "rgba(45,25,20,0)");
        ctx.fillStyle = cg; ctx.beginPath(); ctx.ellipse(sd * 30, 26, 20, 30, 0, 0, 7); ctx.fill();
    });
    ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.beginPath(); ctx.ellipse(-14, -58, 17, 9, -0.2, 0, 7); ctx.fill();
    const bg = ctx.createRadialGradient(0, -46, 2, 0, -46, 36); bg.addColorStop(0, "rgba(0,0,0,0.38)"); bg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(0, -44, 40, 12, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(45,22,16,0.6)"; ctx.lineWidth = 1.3;
    [[-30, -62, -22, -48, -28, -38], [10, -70, 16, -56, 8, -46], [34, 2, 26, 14, 30, 26], [-36, 10, -28, 22, -34, 34], [0, 70, 3, 58, -2, 48]].forEach(c => { ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(c[2], c[3]); ctx.lineTo(c[4], c[5]); ctx.stroke(); });
    ctx.strokeStyle = "rgba(75,60,120,0.38)"; ctx.lineWidth = 1.2;
    [-1, 1].forEach(sd => { ctx.beginPath(); ctx.moveTo(sd * 46, -50); ctx.quadraticCurveTo(sd * 38, -36, sd * 44, -20); ctx.moveTo(sd * 44, -20); ctx.lineTo(sd * 36, -8); ctx.stroke(); });
    // ตา
    const k0 = Math.floor(T * 0.9), fr = T * 0.9 - k0, e = _clamp(fr / 0.18, 0, 1), se = e * e * (3 - 2 * e);
    const tg2 = k => [((k * 53) % 7 - 3) * 1.5, ((k * 29) % 5 - 2) * 1.1 + 1.5];
    const pa = tg2(k0 - 1), pb = tg2(k0), gx = pa[0] + (pb[0] - pa[0]) * se, gy = pa[1] + (pb[1] - pa[1]) * se;
    const per = (T + 1.3) % 5.2, bl = per < 0.16 ? Math.sin(per / 0.16 * Math.PI) : 0;
    [[-22, -24, 15, 11, -0.15], [22, -20, 17, 13, 0.1]].forEach((E, ei) => {
        const [ex, ey, rx, ry, rot] = E;
        const sk = ctx.createRadialGradient(ex, ey, 4, ex, ey, rx + 9); sk.addColorStop(0, "rgba(25,6,6,0.85)"); sk.addColorStop(1, "rgba(25,6,6,0)");
        ctx.fillStyle = sk; ctx.beginPath(); ctx.ellipse(ex, ey, rx + 8, ry + 8, rot, 0, 7); ctx.fill();
        const sc2 = ctx.createRadialGradient(ex - 3, ey - 3, 2, ex, ey, rx); sc2.addColorStop(0, "#efe8d4"); sc2.addColorStop(1, "#a89984");
        ctx.fillStyle = sc2; ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry, rot, 0, 7); ctx.fill();
        ctx.save(); ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry, rot, 0, 7); ctx.clip();
        ctx.strokeStyle = "rgba(170,20,20,0.55)"; ctx.lineWidth = 0.8;
        for (let v = 0; v < 6; v++) { const va = v * 1.05 + ei; ctx.beginPath(); ctx.moveTo(ex + Math.cos(va) * rx, ey + Math.sin(va) * ry); ctx.lineTo(ex + Math.cos(va) * rx * 0.4 + gx * 0.5, ey + Math.sin(va) * ry * 0.4 + gy * 0.5); ctx.stroke(); }
        const px2 = ex + gx * (rx / 14), py2 = ey + gy * (ry / 12);
        ctx.fillStyle = "#3a0a0a"; ctx.beginPath(); ctx.arc(px2, py2, 5.5, 0, 7); ctx.fill();
        ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(px2, py2, js ? 1.8 : 2.8, 0, 7); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.beginPath(); ctx.arc(px2 - 1.5, py2 - 1.5, 1, 0, 7); ctx.fill();
        ctx.fillStyle = "#b9a58f"; ctx.fillRect(ex - rx - 2, ey - ry - 2, rx * 2 + 4, ry * 2 * (0.2 + bl * 0.8) + 2);
        ctx.restore();
        const tl = 52 + Math.sin(T * 0.8 + ei * 2) * 8;
        ctx.strokeStyle = "rgba(6,0,0,0.88)"; ctx.lineWidth = 3.4;
        ctx.beginPath(); ctx.moveTo(ex + (ei ? 4 : -4), ey + ry); ctx.bezierCurveTo(ex + (ei ? 8 : -8), ey + ry + tl * 0.4, ex + (ei ? 2 : -2), ey + ry + tl * 0.7, ex + (ei ? 6 : -6), ey + ry + tl); ctx.stroke();
        ctx.fillStyle = "rgba(6,0,0,0.9)"; ctx.beginPath(); ctx.arc(ex + (ei ? 6 : -6), ey + ry + tl + 2.5, 3, 0, 7); ctx.fill();
    });
    ctx.fillStyle = "rgba(25,10,8,0.7)"; ctx.beginPath(); ctx.ellipse(-3, 8, 1.8, 5, 0.2, 0, 7); ctx.ellipse(3, 8, 1.8, 5, -0.2, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(60,30,24,0.4)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(1, 6); ctx.stroke();
    // ปากอ้ากว้าง
    const m = js ? 1 : _clamp(0.25 + 0.15 * Math.sin(T * 1.1) + _tw(T, 7) * 0.5, 0, 1), mw = 36 + 6 * m, mh = 6 + 52 * m, mt = 48;
    ctx.fillStyle = "#8d7a66"; ctx.beginPath(); ctx.moveTo(-mw * 0.8, mt - 4); ctx.quadraticCurveTo(-mw * 0.7, mt + mh + 18, 0, mt + mh + 24); ctx.quadraticCurveTo(mw * 0.7, mt + mh + 18, mw * 0.8, mt - 4); ctx.fill();
    ctx.save();
    const mp = () => { ctx.beginPath(); ctx.moveTo(-mw, mt); ctx.quadraticCurveTo(0, mt + 6, mw, mt); ctx.quadraticCurveTo(0, mt + 2 * mh, -mw, mt); ctx.closePath(); };
    mp(); const mgd = ctx.createLinearGradient(0, mt, 0, mt + mh); mgd.addColorStop(0, "#080101"); mgd.addColorStop(1, "#2a0505"); ctx.fillStyle = mgd; ctx.fill(); ctx.clip();
    ctx.fillStyle = "#44090a"; ctx.beginPath(); ctx.ellipse(0, mt + mh * 0.95, mw * 0.5, mh * 0.3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#cfc4a6"; ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 0.8;
    for (let i = 0; i < 11; i++) {
        const tx = -mw + (i + 0.5) * (2 * mw / 11), u = (tx + mw) / (2 * mw), ty = mt + 12 * u * (1 - u), by2 = mt + 4 * mh * u * (1 - u), tl = 8 + ((i * 7) % 5) * 3;
        ctx.beginPath(); ctx.moveTo(tx - 3, ty); ctx.lineTo(tx + 3, ty); ctx.lineTo(tx + ((i % 2) ? 1 : -1), ty + tl); ctx.closePath(); ctx.fill(); ctx.stroke();
        if (mh > 14) { ctx.beginPath(); ctx.moveTo(tx - 3, by2); ctx.lineTo(tx + 3, by2); ctx.lineTo(tx, by2 - 6 - ((i * 3) % 4) * 3); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    }
    ctx.restore();
    mp(); ctx.strokeStyle = "#1a0505"; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.strokeStyle = "rgba(30,8,6,0.85)"; ctx.lineWidth = 1.8;
    [-1, 1].forEach(sd => { ctx.beginPath(); ctx.moveTo(sd * mw, mt); ctx.lineTo(sd * (mw + 15), mt - 14); ctx.stroke(); for (let k = 1; k < 5; k++) { const sx2 = sd * (mw + k * 3), sy2 = mt - k * 2.9; ctx.beginPath(); ctx.moveTo(sx2, sy2 - 3); ctx.lineTo(sx2, sy2 + 3); ctx.stroke(); } });
    ctx.strokeStyle = "rgba(20,0,0,0.7)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-12, mt - 1); ctx.lineTo(-11, mt - 7); ctx.moveTo(14, mt - 1); ctx.lineTo(13, mt - 6); ctx.stroke();
    ctx.strokeStyle = "#020202"; ctx.lineWidth = 2.6;
    for (let i = 0; i < 8; i++) { const sx3 = -44 + i * 12.5, s3 = Math.sin(T * 1.2 + i) * 5; if (Math.abs(sx3) < 24) continue; ctx.beginPath(); ctx.moveTo(sx3 * 0.8, -50 + Math.abs(sx3) * 0.25); ctx.bezierCurveTo(sx3 * 1.1 + s3, -10, sx3 * 0.9 - s3, 40, sx3 * 1.2 + s3, 85); ctx.stroke(); }
    ctx.restore();
}


/* ---------- หน้าเริ่มเกม: เกมจะไม่เดินจนกว่าจะกดเริ่มเล่น ---------- */
let gameRunning = false;
const _updGate = updateGameLogic;
updateGameLogic = function () { if (!gameRunning) return; _updGate(); };

spawnRoomItems();

// อัพเดตเกมที่ 60 ครั้ง/วินาทีคงที่ ไม่ว่าจอจะรีเฟรชกี่ Hz (แบตเตอรี่/เวลาผีจะเท่ากันทุกเครื่อง)
let _lastT = performance.now(), _acc = 0;
function gameLoop(now) {
    if (typeof now !== "number") now = performance.now();
    _acc += Math.min(100, now - _lastT); _lastT = now;
    while (_acc >= 1000 / 60) { updateGameLogic(); _acc -= 1000 / 60; }
    drawScene();
    requestAnimationFrame(gameLoop);
}
gameLoop();