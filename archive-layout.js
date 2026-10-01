// Pure layout calculation: the same seed, width and media always give the same result.
export function calculateArchiveLayout(items, viewportWidth, config, seed)
{
    let state = seed >>> 0;
    const random = () =>
    {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
    const between = (min, max) => min + random() * (max - min);
    const order = [...items];
    for (let i = order.length - 1; i > 0; i--)
    {
        const j = Math.floor(random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
    }
    const mobile = viewportWidth < 600;
    const compact = viewportWidth < 900;
    const restraint = mobile ? 0 : compact ? 0.35 : 1;
    const minCount = compact ? 1 : Math.max(2, Math.min(3, config.minItemsPerRow));
    const maxCount = mobile ? 1 : compact ? 2 : Math.max(minCount, Math.min(3, config.maxItemsPerRow));
    const inset = Math.min(12, viewportWidth * 0.03);
    const usable = Math.max(1, viewportWidth - inset * 2);
    const placements = [];
    let cursor = 0, rowTop = 0, bottom = 0, previousHeight = 0, rowIndex = 0;
    while (cursor < order.length)
    {
        const remaining = order.length - cursor;
        let count = Math.min(remaining, Math.floor(between(minCount, maxCount + 1)));
        // Avoid an isolated last desktop image: 4 becomes 2+2, 3 stays together.
        if (!compact && remaining > count && remaining - count === 1)
            count = count === 3 ? 2 : 3;
        count = Math.min(count, remaining);
        const row = order.slice(cursor, cursor + count);
        const weights = row.map(() => between(1 - config.widthVariation, 1 + config.widthVariation));
        const gaps = [], overlaps = [];
        for (let i = 0; i < count - 1; i++)
        {
            const overlap = random() < config.overlapProbability * restraint;
            gaps.push(overlap ? 0 : between(config.minGapPixels, config.maxGapPixels));
            overlaps.push(overlap ? random() * config.maxHorizontalOverlap * restraint * Math.min(weights[i], weights[i + 1]) : 0);
        }
        const span = usable * (count === 1 ? 1 : between(0.92, 1));
        // Solve row widths including negative gaps, so the row stays inside the viewport.
        const positiveGaps = gaps.reduce((a, b) => a + b, 0);
        const gapScale = Math.min(1, span * 0.15 / Math.max(1, positiveGaps));
        const unit = (span - positiveGaps * gapScale) /
            (weights.reduce((a, b) => a + b, 0) - overlaps.reduce((a, b) => a + b, 0));
        const widths = weights.map(weight => weight * unit);
        const heights = row.map((item, i) => widths[i] / item.ratio);
        const jitter = row.map(() => between(0, config.verticalJitter * restraint));
        const rowHeight = Math.max(...heights.map((h, i) => h + jitter[i]));
        if (rowIndex > 0)
        {
            const overlap = random() < config.overlapProbability * restraint;
            rowTop = bottom + (overlap
                ? -random() * config.maxVerticalOverlap * restraint * Math.min(previousHeight, rowHeight)
                : between(config.minRowSpacing, config.maxRowSpacing));
        }
        let x = inset + (usable - span) * random();
        row.forEach((item, i) =>
        {
            placements.push({ item, x, y: rowTop + jitter[i], width: widths[i], height: heights[i], row: rowIndex });
            x += widths[i] + (gaps[i] || 0) * gapScale - (overlaps[i] || 0) * unit;
        });
        bottom = Math.max(bottom, rowTop + rowHeight);
        previousHeight = rowHeight;
        cursor += count;
        rowIndex++;
    }
    return { placements, height: items.length ? bottom + 12 : 0 };
}
