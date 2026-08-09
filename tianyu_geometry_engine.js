// ⚡ 天予具象智能 Pop-Stack 轨迹栈与 3T 几何解算引擎 (tianyu_geometry_engine.js)

class TianyuPopStackEngine {
    constructor() {
        this.trajectoryStack = []; // 稀疏轨迹栈 Stack
    }

    // 1. Push-Stack 编码阶段：X/Y 非空切片剥离与极值压栈
    pushExtremaStack(x, y, z_t, theta, r, g, b) {
        this.trajectoryStack.push({ x, y, z_t, theta, r, g, b });
    }

    // 2. 将轨迹栈序列化为 512 字节 3T 传输码流
    encodeToBuffer512() {
        const buf = new Uint8Array(512);
        buf[0] = 0x54; // 魔数 0x54 ('T')
        buf[1] = 0x93; // 混淆盐 1
        buf[2] = 0x3A; // 混淆盐 2
        buf[3] = Math.min(this.trajectoryStack.length, 64); // 极值点数量 Count (最大 64 点)
        buf[4] = 0x7E; // 包尾

        const count = buf[3];
        for (let i = 0; i < count && (i * 8 + 12) < 512; i++) {
            const pt = this.trajectoryStack[i];
            buf[i * 8 + 5] = (Math.round(pt.x) + 128) & 0xFF;
            buf[i * 8 + 6] = (Math.round(pt.y) + 128) & 0xFF;
            buf[i * 8 + 7] = pt.r || 0;
            buf[i * 8 + 8] = pt.g || 230;
            buf[i * 8 + 9] = pt.b || 118;
            buf[i * 8 + 10] = (Math.round(pt.z_t || 0) + 128) & 0xFF;
            buf[i * 8 + 11] = Math.round((pt.theta || 0) * 10) & 0xFF;
        }
        return buf;
    }

    // 3. Pop-Stack 解码阶段：从 512 字节物理码流中弹出极值点
    popExtremaStack(buf) {
        if (!buf || buf[0] !== 0x54) {
            throw new Error("Invalid Tianyu 3T stream header");
        }
        const count = buf[3];
        const poppedStack = [];
        for (let i = 0; i < count && (i * 8 + 12) < buf.length; i++) {
            const x = buf[i * 8 + 5] - 128;
            const y = buf[i * 8 + 6] - 128;
            const r = buf[i * 8 + 7];
            const g = buf[i * 8 + 8];
            const b = buf[i * 8 + 9];
            const z_t = buf[i * 8 + 10] - 128;
            const theta = buf[i * 8 + 11] / 10;
            poppedStack.push({ x, y, z_t, theta, r, g, b });
        }
        return poppedStack;
    }
}

window.TianyuPopStackEngine = TianyuPopStackEngine;

class TianyuQuantizedGrid {
    constructor(scaleFactor = 1) {
        this.baseUnit = 256;
        this.scaleFactor = Math.max(0.25, scaleFactor);
        this.width = this.baseUnit * this.scaleFactor;
        this.height = this.baseUnit * this.scaleFactor;
        this.gridResolution = 256;
    }
}
