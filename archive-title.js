import { TITLE_DEFAULTS, createAnimatedTitle } from "./animated-title.js";

// Match the title settings last saved by the home Inspector, without loading Three.js.
const settings = { ...TITLE_DEFAULTS };
const limits = {
    titleFontSize: [10, 120], titleTop: [0, 1000], titleLeft: [0, 1000],
    titleOpacity: [0, 1], titleWarpSpeed: [0, 3], titleWarpStrength: [0, 20],
    titleWarpComplexity: [0.25, 5], titleWarpSmoothing: [0, 1]
};
try
{
    const saved = JSON.parse(localStorage.getItem("sashaPortfolioSceneConfig_v1"));
    if (saved && typeof saved === "object" && !Array.isArray(saved))
    {
        for (const [key, fallback] of Object.entries(TITLE_DEFAULTS))
        {
            const value = saved[key];
            if (typeof fallback === "boolean" && typeof value === "boolean") settings[key] = value;
            else if (key === "titleText" && typeof value === "string" && value.length <= 120) settings[key] = value;
            else if (key === "titleColor" && typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) settings[key] = value;
            else if (limits[key] && typeof value === "number" && Number.isFinite(value)
                && value >= limits[key][0] && value <= limits[key][1]) settings[key] = value;
        }
    }
}
catch { /* Use the shared defaults if storage is blocked or malformed. */ }

const title = createAnimatedTitle(settings, { href: "index.html" });
let previousTime;
function animateTitle(time)
{
    const delta = previousTime === undefined ? 0 : Math.min((time - previousTime) / 1000, 0.1);
    previousTime = time;
    title.tick(delta);
    requestAnimationFrame(animateTitle);
}
requestAnimationFrame(animateTitle);
