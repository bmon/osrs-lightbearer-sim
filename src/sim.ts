import * as d3 from "d3";

const NORMAL_THRESHOLD = 50;
const LB_THRESHOLD = 25;
const MAX_DURATION = 150;

function simulateLb(equipPos: number, duration: number): number {
  let timer: number, threshold: number;
  if (equipPos < LB_THRESHOLD) {
    timer = 0;
    threshold = LB_THRESHOLD;
  } else {
    timer = equipPos;
    threshold = NORMAL_THRESHOLD;
  }
  let restores = 0;
  for (let i = 0; i < duration; i++) {
    timer += 1;
    if (timer >= threshold) {
      restores++;
      timer = 0;
      threshold = LB_THRESHOLD;
    }
  }
  return restores;
}

function computeNetGain(): number[][] {
  const net: number[][] = [];
  for (let p = 0; p < NORMAL_THRESHOLD; p++) {
    net[p] = [];
    for (let d = 1; d <= MAX_DURATION; d++) {
      const lb = simulateLb(p, d);
      const normal = (p + d) / NORMAL_THRESHOLD;
      net[p][d - 1] = (lb - normal) * 10;
    }
  }
  return net;
}

const netPct = computeNetGain();
const perTickMean = d3
  .range(MAX_DURATION)
  .map((d) => d3.mean(netPct, (row) => row[d])!);
const fullCumulative = perTickMean.map(((s) => (v: number) => (s += v))(0));

// =============================================================================
// LAYOUT — two separate SVGs so slider div can sit between them
// =============================================================================

const ML = 110; // margin left
const MR = 130; // margin right (room for colorbar + label)
const MT = 40;  // margin top (heatmap only)
const heatH = 340;
const cumH = 160;
const svgW = 920;
const innerW = svgW - ML - MR;

const cellW = innerW / MAX_DURATION;
const cellH = heatH / NORMAL_THRESHOLD;

// =============================================================================
// SCALES
// =============================================================================

const xScale = d3
  .scaleLinear()
  .domain([0.5, MAX_DURATION + 0.5])
  .range([0, innerW]);

const yHeat = d3
  .scaleLinear()
  .domain([-0.5, NORMAL_THRESHOLD - 0.5])
  .range([0, heatH]);

// domain: [-12, 0, 12] → interpolateRdBu(0)=red, (0.5)=white, (1)=blue
const colorScale = d3.scaleDiverging(d3.interpolateRdBu).domain([-12, 0, 12]);

const yCum = d3
  .scaleLinear()
  .domain([d3.min(fullCumulative)! * 1.1, d3.max(fullCumulative)! * 1.1])
  .range([cumH, 0]);

// =============================================================================
// HEATMAP SVG
// =============================================================================

const heatSvg = d3
  .select("#heat-chart")
  .append("svg")
  .attr("width", svgW)
  .attr("height", MT + heatH);

const heatG = heatSvg.append("g").attr("transform", `translate(${ML},${MT})`);

// Colored cells (static)
for (let p = 0; p < NORMAL_THRESHOLD; p++) {
  for (let d = 0; d < MAX_DURATION; d++) {
    heatG
      .append("rect")
      .attr("x", xScale(d + 0.5))
      .attr("y", yHeat(p - 0.5))
      .attr("width", cellW)
      .attr("height", cellH)
      .attr("fill", colorScale(netPct[p][d]));
  }
}

// Grey overlays (on top of cells, resized on update)
const greyLeft = heatG
  .append("rect")
  .attr("y", 0)
  .attr("height", heatH)
  .attr("fill", "rgba(200,200,200,0.82)")
  .attr("display", "none");

const greyRight = heatG
  .append("rect")
  .attr("y", 0)
  .attr("height", heatH)
  .attr("fill", "rgba(200,200,200,0.82)")
  .attr("display", "none");

// Axes
const xTickVals = d3.range(25, MAX_DURATION + 1, 25);

heatG
  .append("g")
  .call(
    d3
      .axisTop(xScale)
      .tickValues(xTickVals.map((t) => t - 0.5))
      .tickFormat((_, i) => `${xTickVals[i]} (${(xTickVals[i] * 0.6).toFixed(0)}s)`)
  )
  .selectAll("text")
  .style("font-size", "9px");

heatG
  .append("g")
  .call(
    d3
      .axisLeft(yHeat)
      .tickValues(d3.range(0, NORMAL_THRESHOLD + 1, 5).map((t) => t - 0.5))
      .tickFormat((_, i) => {
        const t = i * 5;
        return `${t} (${(t * 0.6).toFixed(0)}s)`;
      })
  )
  .selectAll("text")
  .style("font-size", "9px");

heatG
  .append("text")
  .attr("x", -heatH / 2)
  .attr("y", -90)
  .attr("transform", "rotate(-90)")
  .attr("text-anchor", "middle")
  .style("font-size", "11px")
  .text("Equip position in normal cycle (ticks / seconds)");

heatG
  .append("text")
  .attr("x", innerW / 2)
  .attr("y", -28)
  .attr("text-anchor", "middle")
  .style("font-size", "13px")
  .style("font-weight", "600")
  .text("Lightbearer: spec gain (%) when swapping rings");

// Breakeven line + label (dynamic)
const heatBreakeven = heatG
  .append("line")
  .attr("y1", 0)
  .attr("y2", heatH)
  .attr("stroke", "#00aa55")
  .attr("stroke-width", 1.5);

const breakevenLabel = heatG
  .append("text")
  .attr("y", heatH - 8)
  .style("font-size", "10px")
  .style("fill", "#00aa55");

// =============================================================================
// COLORBAR
// =============================================================================

const cbW = 14;
const cbX = ML + innerW + 10;
const cbSteps = 100;
const cbStepH = heatH / cbSteps;
const cbStepScale = d3.scaleLinear().domain([0, cbSteps - 1]).range([0, heatH]);
// colorbar top to bottom: +12 (blue) → 0 (white) → -12 (red)
const cbValScale = d3.scaleLinear().domain([0, cbSteps - 1]).range([12, -12]);

for (let i = 0; i < cbSteps; i++) {
  heatSvg
    .append("rect")
    .attr("x", cbX)
    .attr("y", MT + cbStepScale(i))
    .attr("width", cbW)
    .attr("height", cbStepH + 1)
    .attr("fill", colorScale(cbValScale(i)));
}

const cbAxisScale = d3.scaleLinear().domain([12, -12]).range([0, heatH]);
heatSvg
  .append("g")
  .attr("transform", `translate(${cbX + cbW},${MT})`)
  .call(d3.axisRight(cbAxisScale).ticks(5).tickFormat((d) => `${d}%`))
  .selectAll("text")
  .style("font-size", "9px");

const cbLabelX = cbX + cbW + 42;
heatSvg
  .append("text")
  .attr("x", cbLabelX)
  .attr("y", MT + heatH / 2)
  .attr("transform", `rotate(90,${cbLabelX},${MT + heatH / 2})`)
  .attr("text-anchor", "middle")
  .style("font-size", "10px")
  .text("Net gain (% spec energy)");

// =============================================================================
// CUMULATIVE SVG
// =============================================================================

const cumMT = 12; // small top margin within cumSvg
const cumSvgH = cumMT + cumH + 56;

const cumSvg = d3
  .select("#cum-chart")
  .append("svg")
  .attr("width", svgW)
  .attr("height", cumSvgH);

const cumG = cumSvg.append("g").attr("transform", `translate(${ML},${cumMT})`);

// Bars via data join (updated on each call to update())
const cumBars = cumG
  .selectAll<SVGRectElement, number>("rect.bar")
  .data(d3.range(MAX_DURATION))
  .join("rect")
  .attr("class", "bar")
  .attr("x", (_, i) => xScale(i + 0.5))
  .attr("width", cellW);

// Zero line
cumG
  .append("line")
  .attr("x1", 0)
  .attr("x2", innerW)
  .attr("y1", yCum(0))
  .attr("y2", yCum(0))
  .attr("stroke", "#888")
  .attr("stroke-width", 0.8);

// Grid lines
yCum.ticks(4).forEach((t) => {
  cumG
    .append("line")
    .attr("x1", 0)
    .attr("x2", innerW)
    .attr("y1", yCum(t))
    .attr("y2", yCum(t))
    .attr("stroke", "#ccc")
    .attr("stroke-width", 0.5)
    .attr("stroke-dasharray", "2,2");
});

// Breakeven line (dynamic)
const cumBreakeven = cumG
  .append("line")
  .attr("y1", 0)
  .attr("y2", cumH)
  .attr("stroke", "#00aa55")
  .attr("stroke-width", 1.5);

// Axes
cumG
  .append("g")
  .attr("transform", `translate(0,${cumH})`)
  .call(
    d3
      .axisBottom(xScale)
      .tickValues(xTickVals.map((t) => t - 0.5))
      .tickFormat((_, i) => `${xTickVals[i]} (${(xTickVals[i] * 0.6).toFixed(0)}s)`)
  )
  .selectAll("text")
  .style("font-size", "9px");

cumG
  .append("g")
  .call(d3.axisLeft(yCum).ticks(4).tickFormat((d) => `${+d}%`))
  .selectAll("text")
  .style("font-size", "9px");

cumG
  .append("text")
  .attr("x", -cumH / 2)
  .attr("y", -90)
  .attr("transform", "rotate(-90)")
  .attr("text-anchor", "middle")
  .style("font-size", "10px")
  .text("Avg cumulative net gain (%)");

cumG
  .append("text")
  .attr("x", innerW / 2)
  .attr("y", cumH + 46)
  .attr("text-anchor", "middle")
  .style("font-size", "11px")
  .text("Duration worn (ticks)");

// =============================================================================
// UPDATE
// =============================================================================

function filteredCumulative(minTick: number, maxTick: number): number[] {
  let sum = 0;
  return perTickMean.map((v, i) => {
    const tick = i + 1;
    if (tick >= minTick && tick <= maxTick) {
      sum += v;
      return sum;
    }
    return 0;
  });
}

function update(minTick: number, maxTick: number): void {
  // Grey overlays on heatmap
  const leftW = xScale(minTick - 0.5); // xScale(0.5) == 0
  if (minTick > 1) {
    greyLeft.attr("x", 0).attr("width", leftW).attr("display", null);
  } else {
    greyLeft.attr("display", "none");
  }

  const rightX = xScale(maxTick + 0.5);
  if (maxTick < MAX_DURATION) {
    greyRight
      .attr("x", rightX)
      .attr("width", innerW - rightX)
      .attr("display", null);
  } else {
    greyRight.attr("display", "none");
  }

  // Filtered cumulative
  const filtCum = filteredCumulative(minTick, maxTick);

  // Update bars
  cumBars
    .attr("y", (_, i) => Math.min(yCum(0), yCum(filtCum[i])))
    .attr("height", (_, i) => Math.abs(yCum(filtCum[i]) - yCum(0)))
    .attr("fill", (_, i) => {
      const tick = i + 1;
      if (tick < minTick || tick > maxTick) return "#cccccc";
      return filtCum[i] >= 0 ? "#4477aa" : "#cc4444";
    });

  // Breakeven: first in-range tick where cumulative turns positive
  let bTick: number | null = null;
  for (let i = minTick - 1; i < maxTick; i++) {
    if (filtCum[i] > 0) {
      bTick = i + 1;
      break;
    }
  }

  if (bTick !== null) {
    const bx = xScale(bTick - 0.5);
    const sec = (bTick * 0.6).toFixed(1);
    heatBreakeven.attr("x1", bx).attr("x2", bx).attr("display", null);
    cumBreakeven.attr("x1", bx).attr("x2", bx).attr("display", null);
    breakevenLabel
      .attr("x", bx + 4)
      .text(`Breakeven: ${bTick} ticks (${sec}s)`)
      .attr("display", null);
  } else {
    heatBreakeven.attr("display", "none");
    cumBreakeven.attr("display", "none");
    breakevenLabel.attr("display", "none");
  }
}

// =============================================================================
// SLIDERS
// =============================================================================

const minSlider = document.getElementById("min-slider") as HTMLInputElement;
const maxSlider = document.getElementById("max-slider") as HTMLInputElement;
const minLabel = document.getElementById("min-label")!;
const maxLabel = document.getElementById("max-label")!;

function labelText(ticks: number): string {
  return `${ticks} (${(ticks * 0.6).toFixed(1)}s)`;
}

minSlider.addEventListener("input", () => {
  let min = parseInt(minSlider.value);
  const max = parseInt(maxSlider.value);
  if (min > max) {
    min = max;
    minSlider.value = String(min);
  }
  minLabel.textContent = labelText(min);
  update(min, max);
});

maxSlider.addEventListener("input", () => {
  const min = parseInt(minSlider.value);
  let max = parseInt(maxSlider.value);
  if (max < min) {
    max = min;
    maxSlider.value = String(max);
  }
  maxLabel.textContent = labelText(max);
  update(min, max);
});

// Initial render
update(1, MAX_DURATION);
