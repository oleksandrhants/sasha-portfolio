import { TITLE_DEFAULTS, createAnimatedTitle } from "./animated-title.js";
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js";

// ART / INTERACTION CONTROLS — distances are multiples of the fitted wide view.
const CONFIG = {
    ...TITLE_DEFAULTS,
    // BACKGROUND
    backgroundMode: "radial", // solid, radial, or linearVertical.
    backgroundSolidColor: "#e6e6e6", // Flat background color.
    backgroundRadialInnerColor: "#f2f2f2", // Color near the gradient center.
    backgroundRadialOuterColor: "#e6e6e6", // Color beyond the gradient radius.
    backgroundRadialCenterX: 50, // Percent across viewport; higher moves right.
    backgroundRadialCenterY: 35, // Percent down viewport; higher moves down.
    backgroundRadialRadius: 100, // Percent of farthest-corner radius; higher spreads the gradient.
    backgroundRadialSoftness: 100, // Transition width in percent of radius; lower gives a harder ring.
    backgroundLinearTopColor: "#f2f2f2", // Color at the top.
    backgroundLinearBottomColor: "#e6e6e6", // Color at the bottom.
    backgroundLinearTransition: 100, // Transition width in viewport percent; lower creates a stronger central division.
    // EDGE BLUR (opt-in)
    edgeBlurEnabled: false, // Enable the optical viewport-edge overlay.
    edgeBlurStart: 0.65, // Normalized closeness where blur starts; higher waits for closer zoom.
    edgeBlurMaxPixels: 6, // Maximum blur in CSS pixels; higher blurs more.
    edgeBlurInnerRadius: 40, // Sharp center radius, percent of center-to-corner; higher keeps more sharp.
    edgeBlurOuterRadius: 90, // Full-blur radius in the same units; higher broadens the transition.
    // COLOR KEY / HOLES (opt-in)
    colorKeyEnabled: false, // Enable sampled-color cutouts on selected appearances.
    colorKeyProbability: 0.30, // Fraction of appearances with holes; higher selects more planes.
    colorKeyThreshold: 0.12, // Linear RGB distance removed; higher removes a wider range of colors.
    colorKeySoftness: 0.04, // Color-distance transition width; higher softens hole boundaries.
    // CAMERA
    cameraStartDistance: 0.5, // Higher starts farther away; live edits ease to this distance.
    cameraClosestDistance: 0.125, // Higher prevents close zoom; lower allows closer inspection.
    cameraFarthestDistance: 1, // Higher allows zooming farther out.
    zoomSpeed: 0.001, // Wheel sensitivity; higher changes distance more per wheel pixel.
    zoomDamping: 8, // Zoom settling rate / second; higher settles faster, lower feels softer.
    // SPRING
    hoverDepthStrength: 0.0585, // Hover push in local units; higher pushes deeper.
    hoverRotationStrength: 0.05, // Hover tilt in radians; higher tilts more.
    springStiffness: 250, // Higher pulls toward the target faster and more sharply.
    springDamping: 17.75, // Higher removes bounce; lower allows more oscillation, independently of stiffness.
    // PLANES
    overallSpread: 1, // Multiplies all fixed slot offsets; higher spreads out, zero centers them.
    spreadX: 1, // Horizontal offset multiplier; higher spreads sideways.
    spreadY: 1, // Vertical offset multiplier; higher spreads vertically.
    spreadZ: 1, // Depth offset multiplier; higher separates planes in depth.
    planeSizeVariation: 1, // Size deviations from the pool mean; 1 preserves sizes, 0 makes them equal, higher exaggerates.
    // AUTO ROTATION
    autoRotationSpeedX: 0.06, // Radians / second vertically; higher turns faster, negative reverses.
    autoRotationSpeedY: 0.1, // Radians / second horizontally; higher turns faster, negative reverses.
    autoRotationResumeRate: 1.2, // Higher blends automatic rotation back in faster.
    autoRotationInertiaThreshold: 0.3, // Higher lets automatic rotation resume at stronger remaining inertia.
    // DRAG / INERTIA
    dragRotationSensitivity: 0.005, // Radians / pointer pixel; higher turns more for the same drag.
    inertiaStrength: 1, // Release velocity multiplier; higher throws harder, zero disables the throw.
    inertiaDamping: 4, // Velocity decay / second; higher stops sooner, lower spins longer.
    maxInertiaSpeed: 1.5, // Maximum release radians / second per axis; higher permits faster throws.
    dragThreshold: 5, // Pixels before a click becomes a drag; higher tolerates more click movement.
    releaseVelocityDecay: 8, // Higher forgets stale drag velocity faster when pausing before release.
    // GLITCH
    swapMinSeconds: 3, // Minimum wait between swaps; higher makes swaps less frequent.
    swapMaxSeconds: 15, // Maximum wait between swaps; higher allows longer pauses.
    glitchBlinkCount: 3, // Complete off/on blinks; higher adds more flickers.
    glitchBlinkDuration: 0.03, // Seconds per off/on step; higher makes blinking slower.
    glitchHiddenSeconds: 1 // Hidden pause after blinking; higher delays the replacement.
};


const CONFIG_STORAGE_KEY = "sashaPortfolioSceneConfig_v1";
// Capture source defaults before merging browser settings.
const DEFAULT_CONFIG = Object.freeze({ ...CONFIG });

// Numeric entries: key, label, minimum, maximum, step.
// Typed entries use "color", "boolean", "text", or "select" in place of the minimum.
const CONTROL_SECTIONS = {
    TITLE: [
        ["titleEnabled", "Enabled", "boolean"],
        ["titleText", "Text", "text", 120],
        ["titleFontSize", "Font Size (px)", 10, 120, 1],
        ["titleTop", "Top Offset (px)", 0, 1000, 1],
        ["titleLeft", "Left Offset (px)", 0, 1000, 1],
        ["titleOpacity", "Opacity", 0, 1, 0.01],
        ["titleColor", "Color", "color"],
        ["titleWarpEnabled", "Warp Enabled", "boolean"],
        ["titleWarpSpeed", "Warp Speed", 0, 3, 0.05],
        ["titleWarpStrength", "Warp Strength (px)", 0, 20, 0.5],
        ["titleWarpComplexity", "Warp Complexity", 0.25, 5, 0.05],
        ["titleWarpSmoothing", "Warp Smoothing", 0, 1, 0.05]
    ],
    BACKGROUND: [
        ["backgroundMode", "Mode", "select", [
            ["solid", "Solid"], ["radial", "Radial Gradient"], ["linearVertical", "Linear Vertical Gradient"]
        ]],
        ["backgroundSolidColor", "Solid Color", "color"],
        ["backgroundRadialInnerColor", "Inner Color", "color"],
        ["backgroundRadialOuterColor", "Outer Color", "color"],
        ["backgroundRadialCenterX", "Center X (%)", 0, 100, 1],
        ["backgroundRadialCenterY", "Center Y (%)", 0, 100, 1],
        ["backgroundRadialRadius", "Radius (%)", 1, 300, 1],
        ["backgroundRadialSoftness", "Transition Softness", 0, 100, 1],
        ["backgroundLinearTopColor", "Top Color", "color"],
        ["backgroundLinearBottomColor", "Bottom Color", "color"],
        ["backgroundLinearTransition", "Transition Strength", 0, 100, 1]
    ],
    "EDGE BLUR": [
        ["edgeBlurEnabled", "Enabled", "boolean"],
        ["edgeBlurStart", "Blur Start", 0, 1, 0.01],
        ["edgeBlurMaxPixels", "Max Blur (px)", 0, 30, 0.5],
        ["edgeBlurInnerRadius", "Inner Radius (%)", 0, 100, 1],
        ["edgeBlurOuterRadius", "Outer Radius (%)", 0, 100, 1]
    ],
    "COLOR KEY / HOLES": [
        ["colorKeyEnabled", "Enabled", "boolean"],
        ["colorKeyProbability", "Probability", 0, 1, 0.01],
        ["colorKeyThreshold", "Threshold", 0, 1.7321, 0.01],
        ["colorKeySoftness", "Softness", 0, 0.5, 0.005]
    ],
    CAMERA: [
        ["cameraStartDistance", "Start distance", 0.01, 5, 0.025],
        ["cameraClosestDistance", "Closest distance", 0.01, 5, 0.025],
        ["cameraFarthestDistance", "Farthest distance", 0.01, 5, 0.025],
        ["zoomSpeed", "Wheel sensitivity", 0, 0.01, 0.0001],
        ["zoomDamping", "Zoom settling rate", 0.1, 50, 0.1]
    ],
    SPRING: [
        ["hoverDepthStrength", "Hover depth", 0, 1, 0.001],
        ["hoverRotationStrength", "Hover tilt", 0, 1, 0.005],
        ["springStiffness", "Stiffness", 0, 2000, 10],
        ["springDamping", "Damping", 0, 150, 0.25]
    ],
    PLANES: [
        ["overallSpread", "Overall spread", 0, 20, 0.1],
        ["spreadX", "Horizontal spread", 0, 20, 0.1],
        ["spreadY", "Vertical spread", 0, 20, 0.1],
        ["spreadZ", "Depth spread", 0, 20, 0.1],
        ["planeSizeVariation", "Size variation", 0, 5, 0.05]
    ],
    "AUTO ROTATION": [
        ["autoRotationSpeedX", "Vertical speed (rad/s)", -2, 2, 0.01],
        ["autoRotationSpeedY", "Horizontal speed (rad/s)", -2, 2, 0.01],
        ["autoRotationResumeRate", "Resume rate", 0.1, 10, 0.1],
        ["autoRotationInertiaThreshold", "Resume speed threshold", 0.01, 3, 0.01]
    ],
    "DRAG / INERTIA": [
        ["dragRotationSensitivity", "Drag sensitivity", 0, 0.03, 0.001],
        ["inertiaStrength", "Throw strength", 0, 5, 0.1],
        ["inertiaDamping", "Inertia damping", 0, 20, 0.1],
        ["maxInertiaSpeed", "Max speed (rad/s)", 0, 10, 0.1],
        ["dragThreshold", "Drag threshold (px)", 1, 30, 1],
        ["releaseVelocityDecay", "Stale velocity decay", 0, 30, 0.1]
    ],
    GLITCH: [
        ["swapMinSeconds", "Minimum wait (s)", 0, 60, 0.1],
        ["swapMaxSeconds", "Maximum wait (s)", 0, 120, 0.1],
        ["glitchBlinkCount", "Blink count", 0, 20, 1],
        ["glitchBlinkDuration", "Blink step (s)", 0.005, 1, 0.005],
        ["glitchHiddenSeconds", "Hidden pause (s)", 0, 10, 0.1]
    ]
};

const EDITABLE_CONTROLS = Object.values(CONTROL_SECTIONS).flat();

function editableConfig()
{
    return Object.fromEntries(EDITABLE_CONTROLS.map(([key]) => [key, CONFIG[key]]));
}

function validControlValue(control, value)
{
    const [key, , type, max] = control;
    if (type === "boolean") return typeof value === "boolean";
    if (type === "text") return typeof value === "string" && value.length <= max;
    if (type === "color") return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
    if (type === "select") return max.some(([option]) => option === value);
    return typeof value === "number" && Number.isFinite(value) && value >= type && value <= max
        && (key !== "glitchBlinkCount" || Number.isInteger(value));
}

function mergeSavedConfig(saved)
{
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return;
    for (const control of EDITABLE_CONTROLS)
    {
        const [key] = control;
        if (!Object.hasOwn(saved, key)) continue;
        const value = saved[key];
        // Validate types as well as ranges; older numeric-only saves still merge safely.
        if (!validControlValue(control, value)) continue;
        CONFIG[key] = value;
    }
    // Repair conflicting bounds, including partially saved older configurations.
    CONFIG.cameraFarthestDistance = Math.max(CONFIG.cameraClosestDistance, CONFIG.cameraFarthestDistance);
    CONFIG.cameraStartDistance = Math.min(CONFIG.cameraFarthestDistance, Math.max(CONFIG.cameraClosestDistance, CONFIG.cameraStartDistance));
    CONFIG.swapMaxSeconds = Math.max(CONFIG.swapMinSeconds, CONFIG.swapMaxSeconds);
    CONFIG.edgeBlurOuterRadius = Math.max(CONFIG.edgeBlurInnerRadius, CONFIG.edgeBlurOuterRadius);
}

let configStorageStatus = "";
try
{
    const saved = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (saved !== null) mergeSavedConfig(JSON.parse(saved));
}
catch
{
    // Unavailable storage or malformed JSON must never prevent scene startup.
    configStorageStatus = "Saved settings unavailable; using defaults.";
}

// CSS effects sit outside Three.js: no extra render pass or image processing.
function updateBackground()
{
    const c = CONFIG;
    if (c.backgroundMode === "solid")
        document.body.style.background = c.backgroundSolidColor;
    else if (c.backgroundMode === "linearVertical")
    {
        const start = (100 - c.backgroundLinearTransition) / 2;
        document.body.style.background = `linear-gradient(to bottom, ${c.backgroundLinearTopColor} ${start}%, ${c.backgroundLinearBottomColor} ${100 - start}%)`;
    }
    else
    {
        const end = c.backgroundRadialRadius;
        const start = end * (1 - c.backgroundRadialSoftness / 100);
        document.body.style.background = `radial-gradient(ellipse farthest-corner at ${c.backgroundRadialCenterX}% ${c.backgroundRadialCenterY}%, ${c.backgroundRadialInnerColor} ${start}%, ${c.backgroundRadialOuterColor} ${end}%)`;
    }
}
updateBackground();

const animatedTitle = createAnimatedTitle(CONFIG);
const updateTitle = animatedTitle.update;
const updateTitleWarp = animatedTitle.tick;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    100
);
camera.position.z = 7;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const edgeBlurOverlay = document.createElement("div");
edgeBlurOverlay.className = "edge-blur-overlay";
edgeBlurOverlay.setAttribute("aria-hidden", "true");
document.body.appendChild(edgeBlurOverlay);
let lastBlurPixels = null;

function updateEdgeBlurMask()
{
    const mask = `radial-gradient(ellipse farthest-corner at center, transparent ${CONFIG.edgeBlurInnerRadius}%, black ${CONFIG.edgeBlurOuterRadius}%)`;
    edgeBlurOverlay.style.maskImage = mask;
    edgeBlurOverlay.style.webkitMaskImage = mask;
}

function edgeBlurPixels(distance)
{
    if (!CONFIG.edgeBlurEnabled) return 0;
    const range = CONFIG.cameraFarthestDistance - CONFIG.cameraClosestDistance;
    const close = range > 0 ? THREE.MathUtils.clamp((CONFIG.cameraFarthestDistance - distance) / range, 0, 1) : 1;
    // At Start = 1, only the closest endpoint enables blur (allow floating-point settling).
    const strength = CONFIG.edgeBlurStart === 1 ? (close >= 1 - 1e-6 ? 1 : 0)
        : THREE.MathUtils.clamp((close - CONFIG.edgeBlurStart) / (1 - CONFIG.edgeBlurStart), 0, 1);
    return CONFIG.edgeBlurMaxPixels * strength;
}

function updateEdgeBlur()
{
    // Quantize tiny easing changes to avoid redundant CSS writes.
    const pixels = Math.round(edgeBlurPixels(zoom) * 100) / 100;
    if (pixels === lastBlurPixels) return;
    lastBlurPixels = pixels;
    edgeBlurOverlay.hidden = pixels === 0;
    const filter = `blur(${pixels}px)`;
    edgeBlurOverlay.style.backdropFilter = filter;
    edgeBlurOverlay.style.webkitBackdropFilter = filter;
}
updateEdgeBlurMask();

const group = new THREE.Group();
group.scale.setScalar(1.8);
scene.add(group);

const textureLoader = new THREE.TextureLoader();
// Add images here; size is the longest side in scene units, not pixels.
const imagePool = [
    { file: "10.webp", size: 3.24 },
    { file: "G3D_2.webp", size: 2.4 },
    { file: "gr_1.webp", size: 2.9 },
    { file: "gr_233.webp", size: 2.65 },
    { file: "gr8_cc.webp", size: 3.1 },
    { file: "st2.webp", size: 2.5 },
    { file: "ZGrab02.webp", size: 2.8 }
];

// Four fixed composition slots. Angles are in radians.
const slots = [
    { rotation: [0.044, 0.044, -0.066], position: [-0.11, 0.044, 0.033] },
    { rotation: [-0.088, 0.78, 0.044], position: [0.088, -0.066, -0.044] },
    { rotation: [0.077, 1.58, -0.033], position: [-0.044, 0.088, -0.077] },
    { rotation: [-0.033, 2.48, 0.088], position: [0.066, 0.033, 0.088] }
];

const planes = [];
let bushRadius = 0;
let wideViewDistance = 7;
// Ratios of the original wide view: start at the previous closest view.
let zoom = CONFIG.cameraStartDistance;
let targetZoom = zoom;
const meanImageSize = imagePool.reduce((sum, image) => sum + image.size, 0) / imagePool.length;

function imageSize(image)
{
    return Math.max(0.1, meanImageSize + (image.size - meanImageSize) * CONFIG.planeSizeVariation);
}

function applyComposition()
{
    for (const [index, plane] of planes.entries())
    {
        const base = plane.userData.spring.basePosition;
        base.set(...slots[index].position);
        base.multiply(new THREE.Vector3(CONFIG.spreadX, CONFIG.spreadY, CONFIG.spreadZ));
        base.multiplyScalar(CONFIG.overallSpread);
        plane.position.copy(base).add(plane.userData.spring.position);
        plane.scale.setScalar(imageSize(plane.userData.image) / plane.userData.image.size);
    }
    // Keep the original camera fit during live composition edits so spread stays visible.
}

function fitCamera()
{
    const verticalAngle = THREE.MathUtils.degToRad(camera.fov / 2);
    const horizontalAngle = Math.atan(Math.tan(verticalAngle) * camera.aspect);
    const limitingAngle = Math.min(verticalAngle, horizontalAngle);

    // Back away only when needed to leave a margin at every rotation.
    wideViewDistance = Math.max(7, bushRadius * 1.1 / Math.sin(limitingAngle));
    camera.position.z = wideViewDistance * zoom;
}

// Read a single real source pixel only on assignment/activation, never each frame.
const keySampleCanvas = document.createElement("canvas");
keySampleCanvas.width = keySampleCanvas.height = 1;
const keySampleContext = keySampleCanvas.getContext("2d", { willReadFrequently: true });

function sampleImageColor(image)
{
    if (!keySampleContext) return null;
    const source = image.texture.image;
    const x = Math.floor(Math.random() * source.width);
    const y = Math.floor(Math.random() * source.height);
    try
    {
        keySampleContext.clearRect(0, 0, 1, 1);
        keySampleContext.drawImage(source, x, y, 1, 1, 0, 0, 1, 1);
        const [r, g, b] = keySampleContext.getImageData(0, 0, 1, 1).data;
        // Texture sampling is linearized by Three.js; match that working color space.
        return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
    }
    catch (error)
    {
        console.warn("Could not sample image color; this appearance stays opaque.", error);
        return null;
    }
}

function createImageMaterial()
{
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const uniforms = {
        keyActive: { value: false },
        keyColor: { value: new THREE.Color() },
        keyThreshold: { value: CONFIG.colorKeyThreshold },
        keySoftness: { value: CONFIG.colorKeySoftness }
    };
    material.userData.keyUniforms = uniforms;
    material.onBeforeCompile = (shader) =>
    {
        Object.assign(shader.uniforms, uniforms);
        shader.fragmentShader = `
            uniform bool keyActive;
            uniform vec3 keyColor;
            uniform float keyThreshold;
            uniform float keySoftness;
        ` + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `
            #include <map_fragment>
            if (keyActive) {
                float keyDistance = distance(diffuseColor.rgb, keyColor);
                float coverage = keySoftness > 0.0
                    ? smoothstep(keyThreshold, keyThreshold + keySoftness, keyDistance)
                    : step(keyThreshold, keyDistance);
                if (coverage < 0.001) discard;
                diffuseColor.a *= coverage;
            }
        `);
    };
    material.customProgramCacheKey = () => "sampled-color-holes-v1";
    return material;
}

function updatePlaneColorKey(plane)
{
    const appearance = plane.userData.colorKey;
    const selected = CONFIG.colorKeyEnabled && appearance.roll < CONFIG.colorKeyProbability;
    if (selected && !appearance.sampled)
    {
        appearance.color = sampleImageColor(plane.userData.image);
        appearance.sampled = true;
    }
    const active = selected && appearance.color !== null;
    const uniforms = plane.material.userData.keyUniforms;
    uniforms.keyActive.value = active;
    if (active) uniforms.keyColor.value.copy(appearance.color);
    uniforms.keyThreshold.value = CONFIG.colorKeyThreshold;
    uniforms.keySoftness.value = CONFIG.colorKeySoftness;
    // Alpha hashing preserves depth writes for intersecting planes and approximates
    // soft coverage with fine stippling, without transparent-object sorting.
    if (plane.material.alphaHash !== active)
    {
        plane.material.alphaHash = active;
        plane.material.needsUpdate = true;
    }
}

function assignImage(plane, image)
{
    const width = image.texture.image.width;
    const height = image.texture.image.height;
    const scale = image.size / Math.max(width, height);

    if (plane.geometry) plane.geometry.dispose();
    plane.geometry = new THREE.PlaneGeometry(width * scale, height * scale);
    plane.material.map = image.texture;
    plane.material.needsUpdate = true;
    plane.userData.image = image;
    plane.userData.colorKey = { roll: Math.random(), color: null, sampled: false };
    updatePlaneColorKey(plane);
    plane.scale.setScalar(imageSize(image) / image.size);
}

async function loadImages()
{
    // Cache the pool before swapping so reappearance never waits for a download.
    await Promise.all(imagePool.map(async (image) =>
    {
        const texture = await textureLoader.loadAsync(`assets/images/${image.file}`);
        texture.colorSpace = THREE.SRGBColorSpace;
        image.texture = texture;
    }));

    for (const [index, slot] of slots.entries())
    {
        const material = createImageMaterial();
        const plane = new THREE.Mesh(undefined, material);
        assignImage(plane, imagePool[index]);
        plane.rotation.set(...slot.rotation);
        plane.position.set(...slot.position);
        plane.userData.spring = {
            baseRotation: plane.rotation.clone(),
            basePosition: plane.position.clone(),
            rotation: new THREE.Vector3(),
            position: new THREE.Vector3(),
            targetRotation: new THREE.Vector3(),
            targetPosition: new THREE.Vector3(),
            rotationVelocity: new THREE.Vector3(),
            positionVelocity: new THREE.Vector3()
        };
        group.add(plane);
        planes.push(plane);
    }

    // Fit the entire pool once, so swaps never make the camera jump.
    const maxOffset = Math.max(...planes.map((plane) => plane.position.length()));
    for (const image of imagePool)
    {
        const { width, height } = image.texture.image;
        const scale = image.size / Math.max(width, height);
        const radius = Math.hypot(width * scale / 2, height * scale / 2);
        bushRadius = Math.max(bushRadius, (radius + maxOffset) * group.scale.x);
    }
    applyComposition();
    fitCamera();
}

loadImages().catch((error) => console.error("Could not load the image pool:", error));

function randomSwapDelay()
{
    return CONFIG.swapMinSeconds + Math.random() * (CONFIG.swapMaxSeconds - CONFIG.swapMinSeconds);
}

let swapDelay = randomSwapDelay();
let swap = null;

function updateImageSwap(delta)
{
    if (planes.length !== slots.length) return;

    if (!swap)
    {
        swapDelay -= delta;
        if (swapDelay > 0) return;

        const usedImages = planes.map((plane) => plane.userData.image);
        const candidates = imagePool.filter((image) => !usedImages.includes(image));
        if (candidates.length === 0)
        {
            swapDelay = randomSwapDelay();
            return;
        }
        swap = {
            plane: planes[Math.floor(Math.random() * planes.length)],
            image: candidates[Math.floor(Math.random() * candidates.length)],
            elapsed: 0
        };
    }

    swap.elapsed += delta;
    const blinkDuration = CONFIG.glitchBlinkDuration;
    const flickerDuration = blinkDuration * CONFIG.glitchBlinkCount * 2;
    if (swap.elapsed < flickerDuration)
    {
        // Three sharp blinks with 30 ms on/off steps, without opacity fades.
        swap.plane.visible = Math.floor(swap.elapsed / blinkDuration) % 2 === 1;
    } else if (swap.elapsed < flickerDuration + CONFIG.glitchHiddenSeconds)
    {
        swap.plane.visible = false;
    } else
    {
        assignImage(swap.plane, swap.image);
        swap.plane.visible = true;
        swap = null;
        swapDelay = randomSwapDelay();
    }
}

const canvas = renderer.domElement;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerInside = false;
const inverseGroupRotation = new THREE.Quaternion();

function trackHoverPointer(event)
{
    if (event.pointerType === "touch") return;
    const bounds = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    pointerInside = Math.abs(pointer.x) <= 1 && Math.abs(pointer.y) <= 1;
}

canvas.addEventListener("pointerenter", trackHoverPointer);
canvas.addEventListener("pointermove", trackHoverPointer);
canvas.addEventListener("pointerleave", () => { pointerInside = false; });
canvas.addEventListener("pointercancel", () => { pointerInside = false; });
window.addEventListener("blur", () => { pointerInside = false; });

function stepSpring(offset, velocity, target, delta)
{
    // Small simulation steps keep the spring stable even on slower frames.
    const steps = Math.max(1, Math.ceil(delta / (1 / 120)));
    const step = delta / steps;
    for (let i = 0; i < steps; i++)
    {
        for (const axis of ["x", "y", "z"])
        {
            const force = (target[axis] - offset[axis]) * CONFIG.springStiffness;
            velocity[axis] += (force - velocity[axis] * CONFIG.springDamping) * step;
            offset[axis] += velocity[axis] * step;
        }
    }
}

function updateHoverSprings(delta)
{
    for (const plane of planes)
    {
        plane.userData.spring.targetRotation.set(0, 0, 0);
        plane.userData.spring.targetPosition.set(0, 0, 0);
    }

    // Refresh matrices after camera zoom and group rotation, before raycasting.
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    if (pointerInside && activePointer === null)
    {
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(planes.filter((plane) => plane.visible), false)[0];
        if (hit)
        {
            const spring = hit.object.userData.spring;
            const x = (hit.uv.x - 0.5) * 2;
            const y = (hit.uv.y - 0.5) * 2;
            // Reverse the tilt on the back face so the touched edge still yields.
            const normal = new THREE.Vector3(0, 0, 1).transformDirection(hit.object.matrixWorld);
            const side = normal.dot(raycaster.ray.direction) < 0 ? 1 : -1;
            spring.targetRotation.set(-y * CONFIG.hoverRotationStrength * side, x * CONFIG.hoverRotationStrength * side, 0);

            // Push away from the camera, expressed in the rotating group's space.
            group.getWorldQuaternion(inverseGroupRotation).invert();
            spring.targetPosition.copy(raycaster.ray.direction)
                .applyQuaternion(inverseGroupRotation).multiplyScalar(CONFIG.hoverDepthStrength);
        }
    }

    for (const plane of planes)
    {
        const spring = plane.userData.spring;
        stepSpring(spring.rotation, spring.rotationVelocity, spring.targetRotation, delta);
        stepSpring(spring.position, spring.positionVelocity, spring.targetPosition, delta);
        plane.rotation.set(
            spring.baseRotation.x + spring.rotation.x,
            spring.baseRotation.y + spring.rotation.y,
            spring.baseRotation.z + spring.rotation.z
        );
        plane.position.copy(spring.basePosition).add(spring.position);
    }
}

canvas.addEventListener("wheel", (event) =>
{
    event.preventDefault();
    // Normalize wheel units for mice and trackpads, then clamp camera distance.
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
    targetZoom = THREE.MathUtils.clamp(
        targetZoom * Math.exp(event.deltaY * unit * CONFIG.zoomSpeed),
        CONFIG.cameraClosestDistance,
        CONFIG.cameraFarthestDistance
    );
}, { passive: false });
let activePointer = null;
let dragging = false;
let startX = 0;
let startY = 0;
let lastX = 0;
let lastY = 0;
let lastMoveTime = 0;
let velocityX = 0;
let velocityY = 0;
let autoRotation = 1;

function openArchive()
{
    window.location.href = "archive.html";
}

canvas.addEventListener("pointerdown", (event) =>
{
    if (activePointer !== null || event.button !== 0) return;

    activePointer = event.pointerId;
    dragging = false;
    startX = lastX = event.clientX;
    startY = lastY = event.clientY;
    lastMoveTime = performance.now();
    velocityX = velocityY = 0;
    autoRotation = 0;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("dragging");
});

canvas.addEventListener("pointermove", (event) =>
{
    if (event.pointerId !== activePointer) return;

    const distance = Math.hypot(event.clientX - startX, event.clientY - startY);
    if (!dragging && distance < CONFIG.dragThreshold) return;
    dragging = true;

    const now = performance.now();
    const seconds = Math.max((now - lastMoveTime) / 1000, 0.001);
    const rotationX = (event.clientY - lastY) * CONFIG.dragRotationSensitivity;
    const rotationY = (event.clientX - lastX) * CONFIG.dragRotationSensitivity;
    group.rotation.x += rotationX;
    group.rotation.y += rotationY;

    // Time-weight recent samples to reduce event-rate noise; clamp only on release.
    const blend = 1 - Math.exp(-seconds / 0.016);
    velocityX += (rotationX / seconds - velocityX) * blend;
    velocityY += (rotationY / seconds - velocityY) * blend;
    lastX = event.clientX;
    lastY = event.clientY;
    lastMoveTime = now;
});

function endPointer(event)
{
    if (event.pointerId !== activePointer) return;

    const distance = Math.hypot(event.clientX - startX, event.clientY - startY);
    const clicked = event.type === "pointerup" && !dragging && distance < CONFIG.dragThreshold;
    const idleSeconds = (performance.now() - lastMoveTime) / 1000;
    const releaseDecay = Math.exp(-idleSeconds * CONFIG.releaseVelocityDecay);
    velocityX = THREE.MathUtils.clamp(velocityX * releaseDecay * CONFIG.inertiaStrength, -CONFIG.maxInertiaSpeed, CONFIG.maxInertiaSpeed);
    velocityY = THREE.MathUtils.clamp(velocityY * releaseDecay * CONFIG.inertiaStrength, -CONFIG.maxInertiaSpeed, CONFIG.maxInertiaSpeed);
    if (event.type !== "pointerup") velocityX = velocityY = 0;

    activePointer = null;
    dragging = false;
    canvas.classList.remove("dragging");
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (clicked) openArchive();
}

canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener("lostpointercapture", endPointer);

let previousTime = 0;

function animate(time)
{
    // Use elapsed seconds so rotation speed is independent of frame rate.
    const delta = Math.min((time - previousTime) / 1000, 0.1);
    previousTime = time;

    if (activePointer === null)
    {
        const speed = Math.hypot(velocityX, velocityY);
        const autoTarget = Math.max(0, 1 - speed / CONFIG.autoRotationInertiaThreshold);
        autoRotation += (autoTarget - autoRotation) * (1 - Math.exp(-delta * CONFIG.autoRotationResumeRate));
        const decay = Math.exp(-delta * CONFIG.inertiaDamping);
        const travel = CONFIG.inertiaDamping > 0 ? (1 - decay) / CONFIG.inertiaDamping : delta;
        group.rotation.x += velocityX * travel + autoRotation * CONFIG.autoRotationSpeedX * delta;
        group.rotation.y += velocityY * travel + autoRotation * CONFIG.autoRotationSpeedY * delta;
        velocityX *= decay;
        velocityY *= decay;
    }

    zoom += (targetZoom - zoom) * (1 - Math.exp(-delta * CONFIG.zoomDamping));
    camera.position.z = wideViewDistance * zoom;
    updateEdgeBlur();
    updateTitleWarp(delta);
    updateImageSwap(delta);
    updateHoverSprings(delta);

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

window.addEventListener("resize", () =>
{
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    fitCamera();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Plain DOM controls; valid edits apply live and are saved automatically.
function createDebugPanel()
{
    const panel = document.createElement("aside");
    panel.className = "debug-panel";
    panel.hidden = true;
    panel.setAttribute("aria-label", "Scene controls");
    const heading = document.createElement("strong");
    heading.textContent = "Scene controls · H to hide";
    panel.appendChild(heading);
    const note = document.createElement("p");
    note.textContent = "Edits save automatically in this browser. Camera distances use fitted-view units (1 = wide view).";
    panel.appendChild(note);
    const inputs = new Map();
    const rows = new Map();
    const utilities = document.createElement("fieldset");
    const utilityLegend = document.createElement("legend");
    utilityLegend.textContent = "UTILITIES";
    utilities.appendChild(utilityLegend);
    const status = document.createElement("p");
    status.className = "debug-status";
    status.setAttribute("role", "status");
    status.textContent = configStorageStatus;
    function saveConfig()
    {
        try
        {
            localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(editableConfig()));
            status.textContent = "saved";
        }
        catch
        {
            status.textContent = "Could not save; live edits still apply.";
        }
    }
    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.textContent = "Reset to defaults";
    resetButton.addEventListener("click", () =>
    {
        Object.assign(CONFIG, DEFAULT_CONFIG);
        // Apply all settings through the same live-update path, without saving again.
        for (const [key] of EDITABLE_CONTROLS) applyControl(key);
        try
        {
            localStorage.removeItem(CONFIG_STORAGE_KEY);
            status.textContent = "Defaults restored; saved settings cleared.";
        }
        catch
        {
            status.textContent = "Defaults restored; could not clear browser storage.";
        }
    });
    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.textContent = "Copy config";
    copyButton.addEventListener("click", async () =>
    {
        const json = JSON.stringify(editableConfig(), null, 2);
        try
        {
            await navigator.clipboard.writeText(json);
            status.textContent = "Config copied.";
        }
        catch
        {
            // Also support local previews where the Clipboard API is unavailable.
            const text = document.createElement("textarea");
            text.value = json;
            text.className = "debug-copy-buffer";
            panel.appendChild(text);
            text.select();
            let copied = false;
            try { copied = document.execCommand("copy"); } catch { /* Report failure below. */ }
            text.remove();
            copyButton.focus();
            status.textContent = copied ? "Config copied." : "Could not copy; clipboard access is unavailable.";
        }
    });
    utilities.append(resetButton, copyButton, status);
    function refreshFields()
    {
        for (const [name, input] of inputs)
        {
            if (input.type === "checkbox") input.checked = CONFIG[name];
            else input.value = CONFIG[name];
        }
        for (const [name, row] of rows)
        {
            if (!name.startsWith("background") || name === "backgroundMode") continue;
            const prefix = { solid: "backgroundSolid", radial: "backgroundRadial", linearVertical: "backgroundLinear" }[CONFIG.backgroundMode];
            row.hidden = !name.startsWith(prefix);
        }
    }
    function applyControl(key)
    {
        if (key === "cameraClosestDistance")
            CONFIG.cameraFarthestDistance = Math.max(CONFIG.cameraClosestDistance, CONFIG.cameraFarthestDistance);
        if (key === "cameraFarthestDistance")
            CONFIG.cameraClosestDistance = Math.min(CONFIG.cameraClosestDistance, CONFIG.cameraFarthestDistance);
        if (key.startsWith("camera"))
        {
            const clamp = value => THREE.MathUtils.clamp(value, CONFIG.cameraClosestDistance, CONFIG.cameraFarthestDistance);
            CONFIG.cameraStartDistance = clamp(CONFIG.cameraStartDistance);
            targetZoom = clamp(key === "cameraStartDistance" ? CONFIG.cameraStartDistance : targetZoom);
            zoom = clamp(zoom);
            camera.position.z = wideViewDistance * zoom;
        }
        if (CONTROL_SECTIONS.PLANES.some(([name]) => name === key)) applyComposition();
        if (key === "swapMinSeconds" || key === "swapMaxSeconds")
        {
            if (key === "swapMinSeconds") CONFIG.swapMaxSeconds = Math.max(CONFIG.swapMinSeconds, CONFIG.swapMaxSeconds);
            else CONFIG.swapMinSeconds = Math.min(CONFIG.swapMinSeconds, CONFIG.swapMaxSeconds);
            swapDelay = randomSwapDelay();
        }
        if (key === "maxInertiaSpeed" && activePointer === null)
        {
            velocityX = THREE.MathUtils.clamp(velocityX, -CONFIG.maxInertiaSpeed, CONFIG.maxInertiaSpeed);
            velocityY = THREE.MathUtils.clamp(velocityY, -CONFIG.maxInertiaSpeed, CONFIG.maxInertiaSpeed);
        }
        if (key.startsWith("background")) updateBackground();
        if (key === "edgeBlurInnerRadius")
            CONFIG.edgeBlurOuterRadius = Math.max(CONFIG.edgeBlurInnerRadius, CONFIG.edgeBlurOuterRadius);
        if (key === "edgeBlurOuterRadius")
            CONFIG.edgeBlurInnerRadius = Math.min(CONFIG.edgeBlurInnerRadius, CONFIG.edgeBlurOuterRadius);
        if (key.startsWith("edgeBlur") || key.startsWith("camera"))
        {
            updateEdgeBlurMask();
            updateEdgeBlur();
        }
        if (key.startsWith("colorKey")) planes.forEach(updatePlaneColorKey);
        if (key.startsWith("title")) updateTitle();
        refreshFields();
    }
    for (const [title, controls] of Object.entries(CONTROL_SECTIONS))
    {
        const section = document.createElement("fieldset");
        const legend = document.createElement("legend");
        legend.textContent = title;
        section.appendChild(legend);
        for (const control of controls)
        {
            const [key, label, min, max, step] = control;
            const row = document.createElement("label");
            row.textContent = label;
            row.title = key;
            const input = document.createElement(min === "select" ? "select" : "input");
            if (min === "select")
            {
                for (const [value, title] of max)
                {
                    const option = document.createElement("option");
                    option.value = value;
                    option.textContent = title;
                    input.appendChild(option);
                }
            }
            else if (min === "boolean") input.type = "checkbox";
            else if (min === "color") input.type = "color";
            else if (min === "text")
            {
                input.type = "text";
                input.maxLength = max;
            }
            else
            {
                input.type = "number";
                input.min = min;
                input.max = max;
                input.step = step;
            }
            input.addEventListener("input", () =>
            {
                let value = input.type === "checkbox" ? input.checked
                    : input.type === "number" ? input.valueAsNumber : input.value;
                if (key === "glitchBlinkCount") value = Math.round(value);
                if (!validControlValue(control, value)) return;
                CONFIG[key] = value;
                applyControl(key);
                saveConfig();
            });
            input.addEventListener("change", refreshFields);
            rows.set(key, row);
            inputs.set(key, input);
            row.appendChild(input);
            section.appendChild(row);
        }
        panel.appendChild(section);
    }
    refreshFields();
    panel.appendChild(utilities);
    panel.addEventListener("pointerenter", () => { pointerInside = false; });
    document.body.appendChild(panel);
    window.addEventListener("keydown", (event) =>
    {
        if (event.key.toLowerCase() !== "h" || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.target.isContentEditable || event.target.matches("textarea, select, input[type=text]")) return;
        panel.hidden = !panel.hidden;
        if (panel.hidden && panel.contains(document.activeElement)) document.activeElement.blur();
    });
}

createDebugPanel();
