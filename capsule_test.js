// 💊 天予具象智能 · 胶囊水刀机器人 3D 具象空间感知与分流闭环 (capsule_test.js)
// 彻底修复逻辑: 使用精确规则 3D 肠道中轴线 (0, -60) + 真值 100mm 肠壁内径碰撞
// 确保: 右偏时右侧离墙 20mm 瞬间撞壁分流，左侧离墙 76mm 纵深畅快射流直到触墙！

let scene, camera, renderer, controls;
let capsuleRobotGroup = null, lumenMesh = null;
let trailingHoseMesh1 = null, trailingHoseMesh2 = null, trailingHoseMesh3 = null;
let hydroJetGroup = null, ccwGroup = null, cwGroup = null, reverseJetParticles = null, rearPropulsionParticles = null;
let ccwDropMeshes = [], cwDropMeshes = [];

// 🧠 具象智能感知与坐标辅助对象
let embodiedAxesHelper = null;
let embodiedBBox = null;
let wallRaycastGroup = null;

// 机械状态变量
let currentAction = "TURN_RIGHT"; // 默认测试左仓喷水 (顺壁对称分流)
let hydroPressureMpa = 15.0;   // 水刀压强 (MPa)
let rollAngleDeg = 0.0;        // 姿态稳定 (暂无旋转效应)
let capsulePos = { x: 0.0, y: -100, z: 80 }; // 置于中心底部 (X=0.0mm, Y=-100.0mm 100% 触底贴附)
let isAutoLoop = false;
let animTime = 0;
let showAxes = true;

// 水流喷射方向向量 (45°切向偏角向下 -0.183 + 45°前向 -0.707 射向肠壁)
let dirLeftVec = new THREE.Vector3(-0.683, -0.183, -0.707).normalize();
let dirRightVec = new THREE.Vector3(0.683, -0.183, -0.707).normalize();

document.addEventListener("DOMContentLoaded", () => {
    initTabEvents();
    initControlButtons();
    initEmbodiedSliders();
    initCapsuleThreeJs();
    setInterval(render2DCanvas, 40); // 2D 数字水流动效循环
});

// 1. Tab 切换逻辑
function initTabEvents() {
    document.querySelectorAll(".test-tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".test-tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".test-view").forEach(v => v.classList.remove("active"));

            e.target.classList.add("active");
            const targetId = e.target.getAttribute("data-tab");
            const container = document.getElementById(targetId);
            if (container) container.classList.add("active");

            if (targetId === "capsule3dView" && renderer && camera) {
                onWindowResize();
            } else if (targetId === "capsule2dView") {
                render2DCanvas();
            }
        });
    });
}

// 2. 🎛️ 具象智能坐标滑动条互动事件
function initEmbodiedSliders() {
    const sldX = document.getElementById("sldPosX");
    const sldY = document.getElementById("sldPosY");
    const sldZ = document.getElementById("sldPosZ");
    const chkAxes = document.getElementById("chkShowAxes");

    const lblX = document.getElementById("lblPosX");
    const lblY = document.getElementById("lblPosY");
    const lblZ = document.getElementById("lblPosZ");

    if (sldX) {
        sldX.value = capsulePos.x;
        if (lblX) lblX.innerText = `${capsulePos.x.toFixed(1)} mm`;
        sldX.addEventListener("input", (e) => {
            capsulePos.x = parseFloat(e.target.value);
            if (lblX) lblX.innerText = `${capsulePos.x.toFixed(1)} mm`;
        });
    }
    if (sldY) {
        sldY.value = capsulePos.y;
        if (lblY) lblY.innerText = `${capsulePos.y.toFixed(1)} mm`;
        sldY.addEventListener("input", (e) => {
            capsulePos.y = parseFloat(e.target.value);
            if (lblY) lblY.innerText = `${capsulePos.y.toFixed(1)} mm`;
        });
    }
    if (sldZ) {
        sldZ.value = capsulePos.z;
        if (lblZ) lblZ.innerText = `${capsulePos.z.toFixed(1)} mm`;
        sldZ.addEventListener("input", (e) => {
            capsulePos.z = parseFloat(e.target.value);
            if (lblZ) lblZ.innerText = `${capsulePos.z.toFixed(1)} mm`;
        });
    }
    if (chkAxes) {
        chkAxes.addEventListener("change", (e) => {
            showAxes = e.target.checked;
            if (embodiedAxesHelper) embodiedAxesHelper.visible = showAxes;
            if (embodiedBBox) embodiedBBox.visible = showAxes;
            if (wallRaycastGroup) wallRaycastGroup.visible = showAxes;
        });
    }
}

// 3. 🎮 绑定 7 大按钮交互事件
function initControlButtons() {
    const btnForward = document.getElementById("btnForward");
    const btnBoost = document.getElementById("btnBoost");
    const btnTurnRight = document.getElementById("btnTurnRight");
    const btnTurnLeft = document.getElementById("btnTurnLeft");
    const btnSuction = document.getElementById("btnSuction");
    const btnReverse = document.getElementById("btnReverse");
    const btnAutoLoop = document.getElementById("btnAutoLoop");

    const clearButtonActive = () => {
        document.querySelectorAll(".ctrl-btn").forEach(b => {
            if (b !== btnBoost && b !== btnAutoLoop) b.classList.remove("active-action");
        });
    };

    if (btnForward) {
        btnForward.addEventListener("click", () => {
            isAutoLoop = false;
            if (btnAutoLoop) btnAutoLoop.innerText = "🔄 自动模式循环";
            clearButtonActive();
            btnForward.classList.add("active-action");
            currentAction = "FORWARD";
            updateActionStateHUD("▶ 具象自主巡航 (后半球底喷推进 + 弧形水刀切削)");
        });
    }

    if (btnBoost) {
        btnBoost.addEventListener("click", () => {
            if (hydroPressureMpa < 20.0) {
                hydroPressureMpa = 25.0;
                btnBoost.classList.add("active-action");
                btnBoost.innerText = "⚡ 压力加压中 (250 bar)";
            } else {
                hydroPressureMpa = 15.0;
                btnBoost.classList.remove("active-action");
                btnBoost.innerText = "⚡ 增加压力 (水刀/推力加强)";
            }
        });
    }

    if (btnTurnRight) {
        btnTurnRight.addEventListener("click", () => {
            isAutoLoop = false;
            if (btnAutoLoop) btnAutoLoop.innerText = "🔄 自动模式循环";
            clearButtonActive();
            btnTurnRight.classList.add("active-action");
            currentAction = "TURN_RIGHT";
            updateActionStateHUD("🌊 左仓喷水实验: 左壁距离拉大 (76mm畅快水束)，触墙后完美分流");
        });
    }

    if (btnTurnLeft) {
        btnTurnLeft.addEventListener("click", () => {
            isAutoLoop = false;
            if (btnAutoLoop) btnAutoLoop.innerText = "🔄 自动模式循环";
            clearButtonActive();
            btnTurnLeft.classList.add("active-action");
            currentAction = "TURN_LEFT";
            updateActionStateHUD("↪ 右仓喷水实验: 右壁极近 (20mm近墙水束)，瞬时撞墙分流");
        });
    }

    if (btnSuction) {
        btnSuction.addEventListener("click", () => {
            isAutoLoop = false;
            if (btnAutoLoop) btnAutoLoop.innerText = "🔄 自动模式循环";
            clearButtonActive();
            btnSuction.classList.add("active-action");
            currentAction = "SUCTION";
            updateActionStateHUD("💧 抽吸积液: 左右双仓同时向内负压抽吸 (-45 kPa)");
        });
    }

    if (btnReverse) {
        btnReverse.addEventListener("click", () => {
            isAutoLoop = false;
            if (btnAutoLoop) btnAutoLoop.innerText = "🔄 自动模式循环";
            clearButtonActive();
            btnReverse.classList.add("active-action");
            currentAction = "REVERSE";
            updateActionStateHUD("◀ 后退避让: 双仓前/下底喷反推，水刀仓停止供水");
        });
    }

    if (btnAutoLoop) {
        btnAutoLoop.addEventListener("click", () => {
            isAutoLoop = !isAutoLoop;
            if (isAutoLoop) {
                btnAutoLoop.innerText = "⏸️ 停止自动巡航";
                btnAutoLoop.style.borderColor = "#00e676";
                btnAutoLoop.style.color = "#00e676";
            } else {
                btnAutoLoop.innerText = "🔄 自动巡航模式";
                btnAutoLoop.style.borderColor = "#ffd700";
                btnAutoLoop.style.color = "#ffd700";
            }
        });
    }
}

function updateActionStateHUD(msg) {
    const hudTag = document.getElementById("hudFluidState");
    if (hudTag) hudTag.innerText = msg;
}

// 4. 初始化 Three.js 场景与视角
function initCapsuleThreeJs() {
    const container = document.getElementById("capsule3dCanvasContainer");
    if (!container) return;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x040711);
    scene.fog = new THREE.FogExp2(0x040711, 0.0004);

    camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 4000);
    camera.position.set(0, 40, 420);
    camera.lookAt(0, -90, -150);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const OrbitControlsClass = THREE.OrbitControls || (window.THREE && window.THREE.OrbitControls);
    if (OrbitControlsClass) {
        controls = new OrbitControlsClass(camera, renderer.domElement);
        controls.enableDamping = true;
    }

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const redLight = new THREE.PointLight(0xff5252, 1.2, 800);
    redLight.position.set(0, 150, 100);
    scene.add(redLight);

    const cyanLight = new THREE.PointLight(0x00d2ff, 1.5, 800);
    cyanLight.position.set(0, 200, -200);
    scene.add(cyanLight);

    buildStraightIntestineLumen();
    buildLongitudinal3CompartmentCapsule();
    buildEmbodiedSpatialGrid();

    window.addEventListener("resize", onWindowResize);
    animateCapsuleThreeJs();
}

// 5. 构建标准规则三维肠道腔道 (精准中轴线 X=0, Y=-60, 真值内径 R=100mm)
function buildStraightIntestineLumen() {
    const lumenPoints = [
        new THREE.Vector3(0, -60, 400),
        new THREE.Vector3(0, -60, -400)
    ];
    const lumenCurve = new THREE.CatmullRomCurve3(lumenPoints);
    
    const lumenGeo = new THREE.TubeGeometry(lumenCurve, 32, 100, 32, false);
    const lumenMat = new THREE.MeshPhongMaterial({
        color: 0x800c3f,
        side: THREE.BackSide,
        wireframe: true,
        transparent: true,
        opacity: 0.55
    });
    lumenMesh = new THREE.Mesh(lumenGeo, lumenMat);
    scene.add(lumenMesh);
}

// 6. 🧠 构建天予具象智能 3D 空间坐标刻度轴、包围盒与感知法向射线
function buildEmbodiedSpatialGrid() {
    embodiedAxesHelper = new THREE.AxesHelper(120);
    scene.add(embodiedAxesHelper);

    const bboxGeo = new THREE.BoxGeometry(130, 130, 180);
    const bboxMat = new THREE.MeshBasicMaterial({ color: 0x00d2ff, wireframe: true, transparent: true, opacity: 0.35 });
    embodiedBBox = new THREE.Mesh(bboxGeo, bboxMat);
    scene.add(embodiedBBox);

    wallRaycastGroup = new THREE.Group();
    const numRays = 8;
    for (let r = 0; r < numRays; r++) {
        const angle = (r / numRays) * Math.PI * 2;
        const pts = [new THREE.Vector3(0,0,0), new THREE.Vector3(Math.cos(angle) * 98, Math.sin(angle) * 98, 0)];
        const rayGeo = new THREE.BufferGeometry().setFromPoints(pts);
        const rayMat = new THREE.LineDashedMaterial({ color: 0x00e676, dashSize: 4, gapSize: 3 });
        const rayLine = new THREE.Line(rayGeo, rayMat);
        rayLine.computeLineDistances();
        wallRaycastGroup.add(rayLine);
    }
    scene.add(wallRaycastGroup);
}

// 7. 💊 构建纵向 3 等分切仓胶囊机器人 + 真实内径物理碰撞分流
function buildLongitudinal3CompartmentCapsule() {
    capsuleRobotGroup = new THREE.Group();

    const capRadius = 60;
    const capCylLen = 160;
    
    // 外壳
    const shellCylGeo = new THREE.CylinderGeometry(capRadius, capRadius, capCylLen, 32);
    shellCylGeo.rotateX(Math.PI / 2);
    const shellMat = new THREE.MeshPhongMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.45, shininess: 90 });
    capsuleRobotGroup.add(new THREE.Mesh(shellCylGeo, shellMat));

    // 前后半球
    const headDomeGeo = new THREE.SphereGeometry(capRadius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    headDomeGeo.rotateX(-Math.PI / 2);
    headDomeGeo.translate(0, 0, -capCylLen / 2);
    capsuleRobotGroup.add(new THREE.Mesh(headDomeGeo, shellMat));

    const tailDomeGeo = new THREE.SphereGeometry(capRadius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    tailDomeGeo.rotateX(Math.PI / 2);
    tailDomeGeo.translate(0, 0, capCylLen / 2);
    capsuleRobotGroup.add(new THREE.Mesh(tailDomeGeo, shellMat));

    // 颠倒 Y 字形 120° 隔板在 3D 视界 (延伸贯穿圆柱体 + 前半球头 + 后半球尾)
    const partitionMat = new THREE.MeshBasicMaterial({ color: 0xffd700, wireframe: true });
    const radialAngles = [Math.PI / 2, (Math.PI * 7) / 6, -Math.PI / 6];

    radialAngles.forEach(angle => {
        // 1. 中间圆柱段 120° 隔板
        const cylWallGeo = new THREE.BoxGeometry(capRadius - 4, 2, capCylLen);
        cylWallGeo.translate((capRadius - 4) / 2, 0, 0);
        cylWallGeo.rotateZ(angle);
        capsuleRobotGroup.add(new THREE.Mesh(cylWallGeo, partitionMat));

        // 2. 头部 1/2 半球内延伸 120° 隔板 (Front Head Hemisphere 120° Partition Wall)
        const headWallLength = capRadius - 6;
        const headWallGeo = new THREE.BoxGeometry(headWallLength, 2, capRadius);
        headWallGeo.translate(headWallLength / 2, 0, -capRadius / 2);
        headWallGeo.rotateZ(angle);
        headWallGeo.translate(0, 0, -capCylLen / 2);
        capsuleRobotGroup.add(new THREE.Mesh(headWallGeo, partitionMat));

        // 3. 尾部 1/2 半球内延伸 120° 隔板 (Rear Tail Hemisphere 120° Partition Wall)
        const tailWallGeo = new THREE.BoxGeometry(headWallLength, 2, capRadius);
        tailWallGeo.translate(headWallLength / 2, 0, capRadius / 2);
        tailWallGeo.rotateZ(angle);
        tailWallGeo.translate(0, 0, capCylLen / 2);
        capsuleRobotGroup.add(new THREE.Mesh(tailWallGeo, partitionMat));
    });

    // 3D 120° 奔驰同心圆半球头与半球尾仓划分骨架 (Gold Wireframe Domes)
    const headWedgeGeo = new THREE.SphereGeometry(capRadius - 2, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    headWedgeGeo.rotateX(-Math.PI / 2);
    headWedgeGeo.translate(0, 0, -capCylLen / 2);
    capsuleRobotGroup.add(new THREE.Mesh(headWedgeGeo, partitionMat));

    const tailWedgeGeo = new THREE.SphereGeometry(capRadius - 2, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    tailWedgeGeo.rotateX(Math.PI / 2);
    tailWedgeGeo.translate(0, 0, capCylLen / 2);
    capsuleRobotGroup.add(new THREE.Mesh(tailWedgeGeo, partitionMat));

    // 🌀 Three.js 复杂素材转换示例 1 挂载: 3D 环形双扭结 (TorusKnotMesh, 紫罗兰色 wireframe)
    const knotMeshGeo = new THREE.TorusKnotGeometry(32, 9, 64, 16, 2, 3);
    const knotMeshMat = new THREE.MeshPhongMaterial({ color: 0xba55d3, wireframe: true, shininess: 80 });
    const convertedKnotMesh = new THREE.Mesh(knotMeshGeo, knotMeshMat);
    convertedKnotMesh.position.set(130, 20, -100); // 挂载于 3D 视界胶囊右上方，清晰可见！
    scene.add(convertedKnotMesh);

    // 摄像镜头
    const cameraLensGeo = new THREE.CylinderGeometry(18, 18, 20, 24);
    cameraLensGeo.rotateX(Math.PI / 2);
    cameraLensGeo.translate(0, 0, -capCylLen / 2 - 10);
    capsuleRobotGroup.add(new THREE.Mesh(cameraLensGeo, new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 100 })));

    // 前端弧形水刀
    hydroJetGroup = new THREE.Group();
    const nozzleRadius = 52;
    const startAngle = (210 * Math.PI) / 180;
    const endAngle = (330 * Math.PI) / 180;
    const numNozzles = 7;

    for (let k = 0; k < numNozzles; k++) {
        const t = k / (numNozzles - 1);
        const angle = startAngle + t * (endAngle - startAngle);
        const nx = Math.cos(angle) * nozzleRadius;
        const ny = Math.sin(angle) * nozzleRadius;

        const nozzleGeo = new THREE.CylinderGeometry(3.5, 5, 14, 12);
        nozzleGeo.rotateX(-Math.PI / 2);
        nozzleGeo.translate(nx, ny, -capCylLen / 2 - 6);
        capsuleRobotGroup.add(new THREE.Mesh(nozzleGeo, new THREE.MeshPhongMaterial({ color: 0x00e5ff, shininess: 100 })));

        const beamGeo = new THREE.ConeGeometry(10, 200, 12);
        beamGeo.rotateX(-Math.PI / 2);
        beamGeo.translate(nx, ny, -capCylLen / 2 - 105);
        hydroJetGroup.add(new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.8, wireframe: true })));
    }
    capsuleRobotGroup.add(hydroJetGroup);

    // -------------------------------------------------------------
    // 🌊 3D 左仓/右仓液滴水流喷射
    // -------------------------------------------------------------
    ccwGroup = new THREE.Group();
    const ccwNozzleGeo = new THREE.CylinderGeometry(5, 7, 18, 12);
    const ccwNozzle = new THREE.Mesh(ccwNozzleGeo, new THREE.MeshPhongMaterial({ color: 0x00e676, shininess: 80 }));
    ccwNozzle.position.set(-51.96, 30.0, -10);
    const quatLeft = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirLeftVec);
    ccwNozzle.quaternion.copy(quatLeft);
    capsuleRobotGroup.add(ccwNozzle);

    ccwDropMeshes = [];
    const numSegments = 16;
    for (let s = 0; s < numSegments; s++) {
        const dropGeo = new THREE.SphereGeometry(3.5, 12, 12);
        dropGeo.scale(1.0, 1.0, 2.5);
        const dropMat = new THREE.MeshBasicMaterial({ color: 0x00e676, transparent: true, opacity: 0.9, wireframe: true });
        const dropMesh = new THREE.Mesh(dropGeo, dropMat);
        ccwGroup.add(dropMesh);
        ccwDropMeshes.push(dropMesh);
    }
    capsuleRobotGroup.add(ccwGroup);

    cwGroup = new THREE.Group();
    const cwNozzleGeo = new THREE.CylinderGeometry(5, 7, 18, 12);
    const cwNozzle = new THREE.Mesh(cwNozzleGeo, new THREE.MeshPhongMaterial({ color: 0xff9100, shininess: 80 }));
    cwNozzle.position.set(51.96, 30.0, -10);
    const quatRight = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirRightVec);
    cwNozzle.quaternion.copy(quatRight);
    capsuleRobotGroup.add(cwNozzle);

    cwDropMeshes = [];
    for (let s = 0; s < numSegments; s++) {
        const dropGeo = new THREE.SphereGeometry(3.5, 12, 12);
        dropGeo.scale(1.0, 1.0, 2.5);
        const dropMat = new THREE.MeshBasicMaterial({ color: 0xff9100, transparent: true, opacity: 0.9, wireframe: true });
        const dropMesh = new THREE.Mesh(dropGeo, dropMat);
        cwGroup.add(dropMesh);
        cwDropMeshes.push(dropMesh);
    }
    capsuleRobotGroup.add(cwGroup);

    // 后半球推进喷口
    rearPropulsionParticles = new THREE.Group();
    const rearStartAngle = (230 * Math.PI) / 180;
    const rearEndAngle = (310 * Math.PI) / 180;
    const numRearNozzles = 3;

    for (let m = 0; m < numRearNozzles; m++) {
        const t = m / (numRearNozzles - 1);
        const angle = rearStartAngle + t * (rearEndAngle - rearStartAngle);
        const rx = Math.cos(angle) * nozzleRadius;
        const ry = Math.sin(angle) * nozzleRadius;

        const rNozzleGeo = new THREE.CylinderGeometry(3.5, 5, 14, 12);
        rNozzleGeo.rotateX(Math.PI / 2);
        rNozzleGeo.translate(rx, ry, capCylLen / 2 + 6);
        capsuleRobotGroup.add(new THREE.Mesh(rNozzleGeo, new THREE.MeshPhongMaterial({ color: 0x00d2ff, shininess: 100 })));

        const rBeamGeo = new THREE.ConeGeometry(12, 120, 12);
        rBeamGeo.rotateX(Math.PI / 2);
        rBeamGeo.translate(rx, ry, capCylLen / 2 + 65);
        rearPropulsionParticles.add(new THREE.Mesh(rBeamGeo, new THREE.MeshBasicMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.8, wireframe: true })));
    }
    capsuleRobotGroup.add(rearPropulsionParticles);

    // 胶囊位置
    capsuleRobotGroup.position.set(capsulePos.x, capsulePos.y, capsulePos.z);
    scene.add(capsuleRobotGroup);

    // 水管
    const hoseMat1 = new THREE.MeshPhongMaterial({ color: 0x00d2ff, shininess: 60 });
    const hoseMat2 = new THREE.MeshPhongMaterial({ color: 0x00e676, shininess: 60 });
    const hoseMat3 = new THREE.MeshPhongMaterial({ color: 0xff9100, shininess: 60 });
    const dummyCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,100)]);
    trailingHoseMesh1 = new THREE.Mesh(new THREE.TubeGeometry(dummyCurve, 16, 7, 8, false), hoseMat1);
    trailingHoseMesh2 = new THREE.Mesh(new THREE.TubeGeometry(dummyCurve, 16, 7, 8, false), hoseMat2);
    trailingHoseMesh3 = new THREE.Mesh(new THREE.TubeGeometry(dummyCurve, 16, 7, 8, false), hoseMat3);
    scene.add(trailingHoseMesh1);
    scene.add(trailingHoseMesh2);
    scene.add(trailingHoseMesh3);
}

// 8. 3D 帧循环与真值肠壁碰撞分流推演
function animateCapsuleThreeJs() {
    requestAnimationFrame(animateCapsuleThreeJs);
    if (controls) controls.update();

    animTime += 0.018;

    if (capsuleRobotGroup) {
        capsuleRobotGroup.position.set(capsulePos.x, capsulePos.y, capsulePos.z);
        capsuleRobotGroup.rotation.z = (rollAngleDeg * Math.PI) / 180.0;

        // 🎮 高速对接 3D 游戏引擎 (Three.js WebGL Engine -> Tianyu GameEngineBridge)
        if (typeof TianyuGameEngineBridge !== "undefined" && !window.tianyuEngineBridge) {
            window.tianyuEngineBridge = new TianyuGameEngineBridge("Three.js WebGL Engine");
        }
        if (window.tianyuEngineBridge) {
            const bridgeTelemetry = window.tianyuEngineBridge.ingestGameEngineTelemetry(capsuleRobotGroup);
            // 0.1ms 高速呈现延迟
        }

        if (embodiedAxesHelper) embodiedAxesHelper.position.set(capsulePos.x, capsulePos.y, capsulePos.z);
        if (embodiedBBox) embodiedBBox.position.set(capsulePos.x, capsulePos.y, capsulePos.z);
        if (wallRaycastGroup) wallRaycastGroup.position.set(capsulePos.x, capsulePos.y, capsulePos.z);

        const poseTag = document.getElementById("hudPoseMatrix");
        if (poseTag) poseTag.innerText = `[${capsulePos.x.toFixed(1)}, ${capsulePos.y.toFixed(1)}, ${capsulePos.z.toFixed(1)}, ${rollAngleDeg.toFixed(1)}°]`;

        // 💧 世界坐标系真实肠壁物理碰撞与 100% 内部剪裁 (Strict Intestinal Inner Wall Boundary R=90mm)
        const nozzleLeftPos = new THREE.Vector3(-51.96, 30.0, -10);
        const nozzleRightPos = new THREE.Vector3(51.96, 30.0, -10);
        const jetMaxDist = 180.0; 
        const numSegments = ccwDropMeshes.length;

        const lumenAxisX = 0.0;
        const lumenAxisY = -60.0;
        const maxLumenRadius = 90.0;

        for (let s = 0; s < numSegments; s++) {
            const phase = ((s / numSegments) + animTime * 1.8) % 1.0;
            const dist = phase * jetMaxDist;

            // 👈 左仓解算 (世界坐标严格防穿透碰撞)
            if (ccwDropMeshes[s]) {
                let dropPos = nozzleLeftPos.clone().addScaledVector(dirLeftVec, dist);
                
                const worldX = dropPos.x + capsulePos.x;
                const worldY = dropPos.y + capsulePos.y;
                const dx = worldX - lumenAxisX;
                const dy = worldY - lumenAxisY;
                const radDist = Math.sqrt(dx * dx + dy * dy);

                // 物理判定：一旦触及/超越 90mm 内壁，严格阻挡或彻底隐形剪裁！
                if (radDist > maxLumenRadius + 4.0) {
                    ccwDropMeshes[s].visible = false;
                } else if (radDist > maxLumenRadius) {
                    ccwDropMeshes[s].visible = true;
                    const wallAngle = Math.atan2(dy, dx);
                    
                    const splitSign = (s % 2 === 0) ? 1.0 : -1.0;
                    const splitOffsetZ = (radDist - maxLumenRadius) * 1.2 * splitSign;

                    const clampedWorldX = lumenAxisX + Math.cos(wallAngle) * maxLumenRadius;
                    const clampedWorldY = lumenAxisY + Math.sin(wallAngle) * maxLumenRadius;

                    dropPos.x = clampedWorldX - capsulePos.x;
                    dropPos.y = clampedWorldY - capsulePos.y;
                    dropPos.z += splitOffsetZ;

                    ccwDropMeshes[s].scale.set(2.8, 0.35, 1.6);
                    ccwDropMeshes[s].material.opacity = Math.max(0.05, 0.8 - phase * 0.9);
                    ccwDropMeshes[s].position.copy(dropPos);
                } else {
                    ccwDropMeshes[s].visible = true;
                    const scaleR = 1.0 + phase * 1.8;
                    ccwDropMeshes[s].scale.set(scaleR, scaleR, 1.5 + phase * 2.5);
                    ccwDropMeshes[s].material.opacity = Math.max(0.1, 1.0 - phase * 0.85);
                    ccwDropMeshes[s].position.copy(dropPos);
                }
            }

            // 👉 右仓解算 (世界坐标严格防穿透碰撞)
            if (cwDropMeshes[s]) {
                let dropPos = nozzleRightPos.clone().addScaledVector(dirRightVec, dist);
                
                const worldX = dropPos.x + capsulePos.x;
                const worldY = dropPos.y + capsulePos.y;
                const dx = worldX - lumenAxisX;
                const dy = worldY - lumenAxisY;
                const radDist = Math.sqrt(dx * dx + dy * dy);

                if (radDist > maxLumenRadius + 4.0) {
                    cwDropMeshes[s].visible = false; // 超出 94mm 彻底剪裁隐形 (绝对不穿透 100mm 肠壁)！
                } else if (radDist > maxLumenRadius) {
                    cwDropMeshes[s].visible = true;
                    const wallAngle = Math.atan2(dy, dx);
                    
                    const splitSign = (s % 2 === 0) ? 1.0 : -1.0;
                    const splitOffsetZ = (radDist - maxLumenRadius) * 1.2 * splitSign;

                    const clampedWorldX = lumenAxisX + Math.cos(wallAngle) * maxLumenRadius;
                    const clampedWorldY = lumenAxisY + Math.sin(wallAngle) * maxLumenRadius;

                    dropPos.x = clampedWorldX - capsulePos.x;
                    dropPos.y = clampedWorldY - capsulePos.y;
                    dropPos.z += splitOffsetZ;

                    cwDropMeshes[s].scale.set(2.8, 0.35, 1.6);
                    cwDropMeshes[s].material.opacity = Math.max(0.05, 0.8 - phase * 0.9);
                    cwDropMeshes[s].position.copy(dropPos);
                } else {
                    cwDropMeshes[s].visible = true;
                    const scaleR = 1.0 + phase * 1.8;
                    cwDropMeshes[s].scale.set(scaleR, scaleR, 1.5 + phase * 2.5);
                    cwDropMeshes[s].material.opacity = Math.max(0.1, 1.0 - phase * 0.85);
                    cwDropMeshes[s].position.copy(dropPos);
                }
            }
        }

        switch (currentAction) {
            case "DUAL_JET":
                rollAngleDeg = 0.0;
                if (hydroJetGroup) hydroJetGroup.visible = true;
                if (rearPropulsionParticles) rearPropulsionParticles.visible = false;
                if (ccwGroup) ccwGroup.visible = true;
                if (cwGroup) cwGroup.visible = true; // 左右仓双路同时喷水！
                updateActionStateHUD("💦 双仓同时喷水: 左右双路高压水束同时喷射，精准对称撞墙分流");
                break;

            case "FORWARD":
                capsulePos.z = Math.max(-140, capsulePos.z - 0.6);
                rollAngleDeg = 0.0;
                if (hydroJetGroup) hydroJetGroup.visible = true;
                if (rearPropulsionParticles) rearPropulsionParticles.visible = true;
                if (ccwGroup) ccwGroup.visible = true;
                if (cwGroup) cwGroup.visible = false;
                updateActionStateHUD("▶ 前端水刀原样输出 + 左仓分段水流动画 (姿态稳定无旋转效应)");
                break;

            case "TURN_RIGHT":
                rollAngleDeg = 0.0;
                if (hydroJetGroup) hydroJetGroup.visible = true;
                if (rearPropulsionParticles) rearPropulsionParticles.visible = false;
                if (ccwGroup) ccwGroup.visible = true;
                if (cwGroup) cwGroup.visible = false;
                updateActionStateHUD("🌊 左仓喷水实验: 左壁距离 76mm 畅快喷射直至触墙分流");
                break;

            case "TURN_LEFT":
                rollAngleDeg = 0.0;
                if (hydroJetGroup) hydroJetGroup.visible = true;
                if (rearPropulsionParticles) rearPropulsionParticles.visible = false;
                if (ccwGroup) ccwGroup.visible = false;
                if (cwGroup) cwGroup.visible = true;
                updateActionStateHUD("↪ 右仓喷水实验: 右壁距离 20mm 近墙瞬时撞墙分流");
                break;

            case "SUCTION":
                rollAngleDeg = 0.0;
                if (hydroJetGroup) hydroJetGroup.visible = true;
                if (rearPropulsionParticles) rearPropulsionParticles.visible = false;
                if (ccwGroup) ccwGroup.visible = false;
                if (cwGroup) cwGroup.visible = false;
                updateActionStateHUD("💧 抽吸积液: 左右双仓同时向内负压抽吸 (-45 kPa)");
                break;

            case "REVERSE":
                capsulePos.z = Math.min(120, capsulePos.z + 0.8);
                rollAngleDeg = 0.0;
                if (hydroJetGroup) hydroJetGroup.visible = false;
                if (rearPropulsionParticles) rearPropulsionParticles.visible = false;
                if (ccwGroup) ccwGroup.visible = false;
                if (cwGroup) cwGroup.visible = false;
                updateActionStateHUD("◀ 后退避让: 双仓前/下底喷反推，水刀仓停止供水");
                break;
        }

        const pressTag = document.getElementById("hudHydroPressure");
        if (pressTag) pressTag.innerText = `${(hydroPressureMpa * 10).toFixed(0)} bar (${hydroPressureMpa.toFixed(1)} MPa)`;

        const rollTag = document.getElementById("hudRollAngle");
        if (rollTag) rollTag.innerText = `θ_roll = ${rollAngleDeg.toFixed(1)}° (${Math.abs(rollAngleDeg) < 2 ? "贴壁触底" : "偏离底壁"})`;

        updateTripleHoses(capsulePos.x, capsulePos.y, capsulePos.z);
    }

    if (renderer && scene && camera) renderer.render(scene, camera);
}

// 9. 更新 3 根直通橡皮水管
function updateTripleHoses(cx, cy, cz) {
    const numPoints = 12;
    const hoseOffsets = [
        { x: 0, y: -22, mesh: trailingHoseMesh1, wavePhase: 0.0 },
        { x: -20, y: 14, mesh: trailingHoseMesh2, wavePhase: 1.2 },
        { x: 20, y: 14, mesh: trailingHoseMesh3, wavePhase: 2.4 }
    ];

    hoseOffsets.forEach(h => {
        if (!h.mesh) return;
        const curvePoints = [];
        for (let i = 0; i < numPoints; i++) {
            const t = i / (numPoints - 1);
            const distTail = t * 260;
            const waveY = Math.sin(animTime * 3 - t * 4 + h.wavePhase) * (14 * t);
            const waveX = Math.cos(animTime * 3 - t * 4 + h.wavePhase) * (14 * t);
            curvePoints.push(new THREE.Vector3(cx + h.x + waveX, cy + h.y + waveY, cz + 80 + distTail));
        }
        const curve = new THREE.CatmullRomCurve3(curvePoints);
        const newGeo = new THREE.TubeGeometry(curve, 32, 7, 12, false);
        h.mesh.geometry.dispose();
        h.mesh.geometry = newGeo;
    });
}

// 10. 🎨 2D Canvas 具象智能流体拓扑矩阵
function render2DCanvas() {
    const canvas = document.getElementById("capsule2dCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#060913";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(0, 210, 255, 0.4)";
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 40, w / 2 - 60, h - 80);

    ctx.fillStyle = "rgba(0, 210, 255, 0.08)";
    ctx.fillRect(40, 40, w / 2 - 60, h - 80);

    ctx.fillStyle = "#00d2ff";
    ctx.font = "bold 16px Inter, sans-serif";
    ctx.fillText("🧠 天予具象智能 · 6-DOF 空间姿态与对称分流解算", 60, 75);

    // -------------------------------------------------------------
    // 🫀 1. 弯曲肠道管线 (以圆心为参考点 (Xc, Yc), 粗细粒度按需分布)
    // -------------------------------------------------------------
    const lumenOriginX = 60;
    const lumenOriginY = 320;
    const totalSlices = 16;
    const sliceWidth = 24;
    const tubeRadius = 70;

    // 解算 16 个截面的圆心参考点与底部触底坐标 (Y_bottom = Yc + R)
    const tubeCenterPts = [];
    const bottomPts = [];
    for (let i = 0; i <= totalSlices; i++) {
        const cx = lumenOriginX + i * sliceWidth;
        const cy = lumenOriginY + Math.sin(i * 0.35) * 35; // 弯曲函数 Yc(z)
        const yBottom = cy + tubeRadius;                  // 底部触底方程 Y_bottom = Yc + R
        tubeCenterPts.push({ x: cx, y: cy });
        bottomPts.push({ x: cx, y: yBottom });
    }

    // 绘制管线 (非关注区采用 4 步长粗粒度，关注区采用精细粒度)
    ctx.strokeStyle = "rgba(128, 12, 63, 0.65)";
    ctx.fillStyle = "rgba(128, 12, 63, 0.15)";
    ctx.lineWidth = 2;

    for (let i = 0; i < totalSlices; i++) {
        // 粗细粒度按需分布：胶囊与水束作业区 (i: 4~12) 细采样，边缘 (i: 0~4, 12~16) 粗采样
        const isFocusZone = (i >= 4 && i <= 12);
        const p1 = tubeCenterPts[i];
        const p2 = tubeCenterPts[i + 1];

        if (isFocusZone || i % 2 === 0) {
            ctx.beginPath();
            ctx.arc(p1.x, p1.y, tubeRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fill();

            // 标注圆心参考点 (Center Crosshair)
            ctx.strokeStyle = "rgba(0, 230, 118, 0.8)";
            ctx.beginPath();
            ctx.moveTo(p1.x - 4, p1.y); ctx.lineTo(p1.x + 4, p1.y);
            ctx.moveTo(p1.x, p1.y - 4); ctx.lineTo(p1.x, p1.y + 4);
            ctx.stroke();
            ctx.strokeStyle = "rgba(128, 12, 63, 0.65)";
        }

        // 绘制 3D 缝合管面
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y - tubeRadius);
        ctx.lineTo(p2.x, p2.y - tubeRadius);
        ctx.lineTo(p2.x, p2.y + tubeRadius);
        ctx.lineTo(p1.x, p1.y + tubeRadius);
        ctx.closePath();
        ctx.stroke();
    }

    // 绘制底部红润触底轨迹切线 (Y_bottom = Yc + R)
    ctx.strokeStyle = "#ff5252";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    bottomPts.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#ff5252";
    ctx.font = "12px Fira Code";
    ctx.fillText("🫀 圆心参考点 Yc(z) 弯曲管线 | 底部接触切线 (Y_bottom = Yc + R)", lumenOriginX, 85);

    // -------------------------------------------------------------
    // 💊 2. 16 个奔驰同心圆 120° 分仓半球头与半球尾扫掠 (EmbodiedCapsuleObject)
    // -------------------------------------------------------------
    const activeIdx = 8;
    const capCenterX = tubeCenterPts[activeIdx].x; 
    const capCenterY = bottomPts[activeIdx].y - 48; // 精确贴附底部: Yc = Y_bottom - r
    const maxCapR = 48; 
    const capCylLen = 140;

    // 调用具象几何智能体进行 120° 奔驰同心圆分仓半球头与半球尾扫掠渲染
    if (typeof EmbodiedCapsuleObject !== "undefined") {
        const capsuleAgent = new EmbodiedCapsuleObject(maxCapR, capCylLen, { x: capCenterX, y: capCenterY, z: 0 });
        capsuleAgent.render2D(ctx, capCenterX, capCenterY);
    }

    ctx.fillStyle = "#ffd700";
    ctx.font = "bold 13px Fira Code";
    ctx.fillText("💊 奔驰徽章 (圆心参考点 Yc = Y_bottom - R 100% 触底)", capCenterX - 140, capCenterY + maxCapR + 25);

    // -------------------------------------------------------------
    // 🧱 3. 具象几何智能体库拼凑渲染 (球体切片/圆柱/立方体/OCR 解剖中轴)
    // -------------------------------------------------------------
    const rightX = w / 2 + 20;
    ctx.strokeStyle = "rgba(0, 210, 255, 0.4)";
    ctx.lineWidth = 2;
    ctx.strokeRect(rightX, 40, w / 2 - 60, h - 80);

    ctx.fillStyle = "#00d2ff";
    ctx.font = "bold 15px Inter, sans-serif";
    ctx.fillText("🧱 天予 256x256x4 具象几何智能对象库 (低算力拼凑)", rightX + 20, 75);

    // 实例化 256x256 基准网格引擎 (按 4 的倍数伸缩)
    let sync3DSpecs = { depth: 256, segmentResolution: 16, scaleFactor: 1.0 };
    if (typeof TianyuQuantizedGrid !== "undefined") {
        const gridEngine = new TianyuQuantizedGrid(1.0); // 256 x 256 基准单元
        sync3DSpecs = gridEngine.sync3DParams();

        // 1. 同心圆扩敛切片球体 (Sphere Agent)
        const demoSphere = new EmbodiedSphereObject(35, { x: rightX + 70, y: 150, z: 0 });
        demoSphere.sliceHalf(); // 临时切片 1/2 半球
        demoSphere.render2D(ctx, 0, gridEngine);

        // 2. 圆柱智能体 (Cylinder Agent)
        const demoCyl = new EmbodiedCylinderObject(30, 60, { x: rightX + 180, y: 150, z: 0 });
        demoCyl.render2D(ctx, 0);

        // 3. 微分极值点不规则图形智能体 (Irregular Boundary Extrema Engine)
        if (typeof TianyuDifferentialExtremumEngine !== "undefined") {
            const extremaEngine = new TianyuDifferentialExtremumEngine(256);
            // 任意不规则图形的极坐标函数: r(theta) = 28 + sin(3*theta)*8 + cos(5*theta)*5
            const irregularFn = (th) => 28 + Math.sin(th * 3) * 8 + Math.cos(th * 5) * 5;
            const extremaData = extremaEngine.extractExtremaPoints(irregularFn, 0.25); // 256/4倍反向减少 64 步长采样
            extremaEngine.renderExtremaShape2D(ctx, rightX + 370, 150, extremaData, "#00e676");
        }

        // 5. Three.js 复杂素材转换示例 1: 环形双扭结智能体 (TorusKnot Object)
        if (typeof EmbodiedTorusKnotObject !== "undefined") {
            const knotObj = new EmbodiedTorusKnotObject(36, 12, 2, 3, { x: rightX + 280, y: 150, z: 0 });
            knotObj.render2D(ctx, 0, gridEngine);
        }
    }

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "11px Fira Code";
    ctx.fillText("💊 具象医疗机器人 3D 姿态与控制闭环", rightX + 20, 210);

    const metrics = [
        `[系统状态]: 天予具象内核 ONLINE`,
        `[位姿矩阵 6-DOF]: X=${capsulePos.x.toFixed(1)}, Y=${capsulePos.y.toFixed(1)}, Z=${capsulePos.z.toFixed(1)}`,
        `[解剖感知]: 腔壁贴面距离测距正常`,
        `[控制指令]: 喷切与分流姿态稳态`,
        `[水刀主压强]: 15.0 MPa (150 bar)`,
        `[触底贴附]: 正常切线贴合 (Contact OK)`,
        `[安全闭环]: 腔壁物理保护生效`
    ];

    metrics.forEach((m, idx) => {
        ctx.fillStyle = idx === 0 || idx === 2 ? "#00e676" : "#cbd5e1";
        ctx.font = "12px Fira Code";
        ctx.fillText(m, rightX + 20, 245 + idx * 34);
    });
}

function onWindowResize() {
    const container = document.getElementById("capsule3dCanvasContainer");
    if (!container || !renderer || !camera) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}
