import * as d3 from "d3";

const NORMAL_THRESHOLD = 50;
const LB_THRESHOLD = 25;
const MAX_DURATION = 150;

function simulateLb(equipPos: number, duration: number): number {
  let timer: number, threshold: number;
  if (equipPos < LB_THRESHOLD) {
    timer = 0; threshold = LB_THRESHOLD;
  } else {
    timer = equipPos; threshold = NORMAL_THRESHOLD;
  }
  let restores = 0;
  for (let i = 0; i < duration; i++) {
    timer++;
    if (timer >= threshold) { restores++; timer = 0; threshold = LB_THRESHOLD; }
  }
  return restores;
}

function computeNetGain(): number[][] {
  const net: number[][] = [];
  for (let p = 0; p < NORMAL_THRESHOLD; p++) {
    net[p] = [];
    for (let d = 1; d <= MAX_DURATION; d++) {
      net[p][d - 1] = (simulateLb(p, d) - (p + d) / NORMAL_THRESHOLD) * 10;
    }
  }
  return net;
}

const netPct = computeNetGain();
const perTickMean = d3.range(MAX_DURATION).map(d => d3.mean(netPct, row => row[d])!);
const fullCumulative = perTickMean.map(((s) => (v: number) => (s += v))(0));

// =============================================================================
// LAYOUT — fixed pixel dimensions, integer cell size
// =============================================================================

const CELL   = 7;
const innerW = CELL * MAX_DURATION;       // 1050
const heatH  = CELL * NORMAL_THRESHOLD;  // 350

const ML   = 110;   // left  (y-axis tick labels)
const MR   = 130;   // right (colorbar)
const MT   = 40;    // top   (x-axis)
const GAP  = 40;    // between heatmap and cumulative chart
const cumH = 160;
const BOT  = 60;    // below cumulative (x-axis label)

const svgW   = ML + innerW + MR;           // 1290
const totalH = MT + heatH + GAP + cumH + BOT;  // 650

const cbX      = ML + innerW + 10;
const cbW      = 14;
const cbSteps  = 100;
const cbStepH  = heatH / cbSteps;
const cbStepScale = d3.scaleLinear().domain([0, cbSteps]).range([0, heatH]);
const cbLabelX = cbX + cbW + 36;

// =============================================================================
// FIRST SVG (spec % gain)
// =============================================================================

const svg = d3.select("#chart").append("svg")
  .attr("width",  svgW)
  .attr("height", totalH)
  .attr("overflow", "visible");

const heatG = svg.append("g").attr("transform", `translate(${ML},${MT})`);
const cumG  = svg.append("g").attr("transform", `translate(${ML},${MT + heatH + GAP})`);

// =============================================================================
// SCALES
// =============================================================================

const xScale = d3.scaleLinear()
  .domain([0.5, MAX_DURATION + 0.5])
  .range([0, innerW]);

const yHeat = d3.scaleLinear()
  .domain([-0.5, NORMAL_THRESHOLD - 0.5])
  .range([heatH, 0]);  // 0 at bottom

const colorScale = d3.scaleDiverging(d3.interpolateRdBu).domain([-12, 0, 12]);

const yCum = d3.scaleLinear()
  .domain([d3.min(fullCumulative)! * 1.1, d3.max(fullCumulative)! * 1.1])
  .range([cumH, 0]);

// =============================================================================
// SHARED CELL DATA + TOOLTIP
// =============================================================================

type Cell = { p: number; d: number };
const cellData: Cell[] = [];
for (let p = 0; p < NORMAL_THRESHOLD; p++) {
  for (let d = 0; d < MAX_DURATION; d++) {
    cellData.push({ p, d });
  }
}

const tooltip = d3.select("body").append("div")
  .style("position", "absolute")
  .style("pointer-events", "none")
  .style("background", "#fff")
  .style("border", "1px solid #bbb")
  .style("border-radius", "4px")
  .style("padding", "7px 10px")
  .style("font-size", "11px")
  .style("line-height", "1.6")
  .style("box-shadow", "0 2px 8px rgba(0,0,0,0.15)")
  .style("display", "none")
  .style("z-index", "100");

// =============================================================================
// HEATMAP CELLS
// =============================================================================

const heatCells1 = heatG.selectAll<SVGRectElement, Cell>("rect.cell1")
  .data(cellData)
  .join("rect").attr("class", "cell1")
  .attr("x",      ({d}) => d * CELL)
  .attr("y",      ({p}) => (NORMAL_THRESHOLD - 1 - p) * CELL)
  .attr("width",  CELL)
  .attr("height", CELL)
  .attr("fill",   ({p, d}) => colorScale(netPct[p][d]));

heatCells1
  .on("mouseover", (event: MouseEvent, {p, d}) => {
    tooltip.style("display", "block").html(
      `<strong>Equip pos:</strong> ${p} ticks (${(p * 0.6).toFixed(1)}s)<br>` +
      `<strong>Duration:</strong> ${d + 1} ticks (${((d + 1) * 0.6).toFixed(1)}s)<br>` +
      `<strong>Net spec gain:</strong> ${netPct[p][d].toFixed(1)}%`
    );
  })
  .on("mousemove", (event: MouseEvent) => {
    tooltip.style("left", (event.pageX + 14) + "px").style("top", (event.pageY - 14) + "px");
  })
  .on("mouseleave", () => tooltip.style("display", "none"));

// Grey left overlay (resized on update)
const greyLeft = heatG.append("rect")
  .attr("y", 0).attr("height", heatH)
  .attr("fill", "rgba(200,200,200,0.82)")
  .attr("display", "none");

// =============================================================================
// HEATMAP AXES
// =============================================================================

const xTickVals = d3.range(25, MAX_DURATION + 1, 25);

heatG.append("g")
  .call(d3.axisTop(xScale)
    .tickValues(xTickVals.map(t => t - 0.5))
    .tickFormat((_, i) => `${xTickVals[i]} (${(xTickVals[i] * 0.6).toFixed(0)}s)`))
  .selectAll("text").style("font-size", "9px");

heatG.append("g")
  .call(d3.axisLeft(yHeat)
    .tickValues(d3.range(0, NORMAL_THRESHOLD + 1, 5).map(t => t - 0.5))
    .tickFormat((_, i) => { const t = i * 5; return `${t} (${(t * 0.6).toFixed(0)}s)`; }))
  .selectAll("text").style("font-size", "9px");

heatG.append("text")
  .attr("transform", "rotate(-90)")
  .attr("x", -heatH / 2).attr("y", -90)
  .attr("text-anchor", "middle").style("font-size", "11px")
  .text("Equip position in normal cycle (ticks / seconds)");

heatG.append("text")
  .attr("x", innerW / 2).attr("y", -22)
  .attr("text-anchor", "middle").style("font-size", "13px").style("font-weight", "600")
  .text("Lightbearer: spec gain (%) when swapping rings");

const heatBreakeven = heatG.append("line")
  .attr("y1", 0).attr("y2", heatH)
  .attr("stroke", "#00aa55").attr("stroke-width", 1.5);

const breakevenLabel = heatG.append("text")
  .attr("y", heatH - 8).style("font-size", "10px").style("fill", "#00aa55");

// =============================================================================
// COLORBAR (first chart)
// =============================================================================

const cbValScale = d3.scaleLinear().domain([0, cbSteps - 1]).range([12, -12]);

for (let i = 0; i < cbSteps; i++) {
  svg.append("rect")
    .attr("x", cbX).attr("y", MT + cbStepScale(i))
    .attr("width", cbW).attr("height", cbStepH)
    .attr("fill", colorScale(cbValScale(i)));
}

const cbAxisScale = d3.scaleLinear().domain([12, -12]).range([0, heatH]);
svg.append("g")
  .attr("transform", `translate(${cbX + cbW},${MT})`)
  .call(d3.axisRight(cbAxisScale).tickValues([-12, -6, 0, 6, 12]).tickFormat(d => `${d}%`))
  .selectAll("text").style("font-size", "9px");

svg.append("text")
  .attr("transform", `rotate(90,${cbLabelX},${MT + heatH / 2})`)
  .attr("x", cbLabelX).attr("y", MT + heatH / 2)
  .attr("text-anchor", "middle").style("font-size", "10px")
  .text("Net gain (% spec energy)");

// =============================================================================
// CUMULATIVE CHART (first)
// =============================================================================

const cumBars = cumG.selectAll<SVGRectElement, number>("rect.bar")
  .data(d3.range(MAX_DURATION))
  .join("rect").attr("class", "bar")
  .attr("x",     (_, i) => xScale(i + 0.5))
  .attr("width", CELL);

cumBars
  .on("mouseover", (_event: MouseEvent, i) => {
    const cumVal = fullCumulative[i];
    tooltip.style("display", "block").html(
      `<strong>Duration:</strong> ${i + 1} ticks (${((i + 1) * 0.6).toFixed(1)}s)<br>` +
      `<strong>Avg cumulative spec gain:</strong> ${cumVal.toFixed(2)}%`
    );
  })
  .on("mousemove", (event: MouseEvent) => {
    tooltip.style("left", (event.pageX + 14) + "px").style("top", (event.pageY - 14) + "px");
  })
  .on("mouseleave", () => tooltip.style("display", "none"));

cumG.append("line")
  .attr("x1", 0).attr("x2", innerW)
  .attr("y1", yCum(0)).attr("y2", yCum(0))
  .attr("stroke", "#888").attr("stroke-width", 0.8);

yCum.ticks(4).forEach(t => {
  cumG.append("line")
    .attr("x1", 0).attr("x2", innerW)
    .attr("y1", yCum(t)).attr("y2", yCum(t))
    .attr("stroke", "#ccc").attr("stroke-width", 0.5)
    .attr("stroke-dasharray", "3,3");
});

const cumBreakeven = cumG.append("line")
  .attr("y1", 0).attr("y2", cumH)
  .attr("stroke", "#00aa55").attr("stroke-width", 1.5);

cumG.append("g")
  .attr("transform", `translate(0,${cumH})`)
  .call(d3.axisBottom(xScale)
    .tickValues(xTickVals.map(t => t - 0.5))
    .tickFormat((_, i) => `${xTickVals[i]} (${(xTickVals[i] * 0.6).toFixed(0)}s)`))
  .selectAll("text").style("font-size", "9px");

cumG.append("g")
  .call(d3.axisLeft(yCum).ticks(4).tickFormat(d => `${+d}%`))
  .selectAll("text").style("font-size", "9px");

cumG.append("text")
  .attr("transform", "rotate(-90)")
  .attr("x", -cumH / 2).attr("y", -90)
  .attr("text-anchor", "middle").style("font-size", "10px")
  .text("Avg cumulative net gain (%)");

cumG.append("text")
  .attr("x", innerW / 2).attr("y", cumH + 46)
  .attr("text-anchor", "middle").style("font-size", "11px")
  .text("Duration worn (ticks)");

// =============================================================================
// SECOND SVG (damage gain)
// =============================================================================

const svg2 = d3.select("#chart").append("svg")
  .attr("width",  svgW)
  .attr("height", totalH)
  .attr("overflow", "visible")
  .style("display", "block")
  .style("margin-top", "48px");

const heatG2 = svg2.append("g").attr("transform", `translate(${ML},${MT})`);
const cumG2  = svg2.append("g").attr("transform", `translate(${ML},${MT + heatH + GAP})`);

// Placeholder shown when weapon stats are not filled
const dpsPlaceholder = heatG2.append("text")
  .attr("x", innerW / 2).attr("y", heatH / 2)
  .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
  .style("font-size", "14px").style("fill", "#999")
  .text("Enter weapon stats above to see damage chart");

// Heatmap cells
const heatCells2 = heatG2.selectAll<SVGRectElement, Cell>("rect.cell2")
  .data(cellData)
  .join("rect").attr("class", "cell2")
  .attr("x",      ({d}) => d * CELL)
  .attr("y",      ({p}) => (NORMAL_THRESHOLD - 1 - p) * CELL)
  .attr("width",  CELL)
  .attr("height", CELL)
  .attr("fill",   "#e8e8e8");

heatCells2
  .on("mouseover", (event: MouseEvent, {p, d}) => {
    const { mhAvgHit, mhAvgHitLb, mhSpeed, specAvgHit, specSpeed, specCost } = getInputs();
    const mhDiff = mhAvgHit - mhAvgHitLb;
    let extra = "";
    if (specCost > 0 && specSpeed > 0 && mhSpeed > 0 && mhDiff > 0) {
      const dmgPerSpec = specAvgHit - mhAvgHit * (specSpeed / mhSpeed);
      const specDmg   = netPct[p][d] / specCost * dmgPerSpec;
      const lbSwings  = specDmg / mhDiff;
      extra =
        `<br><strong>Spec gain (dmg):</strong> ${specDmg.toFixed(1)}` +
        `<br><strong>LB-swing equiv:</strong> ${lbSwings.toFixed(2)}`;
    }
    tooltip.style("display", "block").html(
      `<strong>Equip pos:</strong> ${p} ticks (${(p * 0.6).toFixed(1)}s)<br>` +
      `<strong>Duration:</strong> ${d + 1} ticks (${((d + 1) * 0.6).toFixed(1)}s)<br>` +
      `<strong>Net spec gain:</strong> ${netPct[p][d].toFixed(1)}%` +
      extra
    );
  })
  .on("mousemove", (event: MouseEvent) => {
    tooltip.style("left", (event.pageX + 14) + "px").style("top", (event.pageY - 14) + "px");
  })
  .on("mouseleave", () => tooltip.style("display", "none"));

const greyLeft2 = heatG2.append("rect")
  .attr("y", 0).attr("height", heatH)
  .attr("fill", "rgba(200,200,200,0.82)")
  .attr("display", "none");

// Axes (reuse same scale objects — coordinate space is identical)
heatG2.append("g")
  .call(d3.axisTop(xScale)
    .tickValues(xTickVals.map(t => t - 0.5))
    .tickFormat((_, i) => `${xTickVals[i]} (${(xTickVals[i] * 0.6).toFixed(0)}s)`))
  .selectAll("text").style("font-size", "9px");

heatG2.append("g")
  .call(d3.axisLeft(yHeat)
    .tickValues(d3.range(0, NORMAL_THRESHOLD + 1, 5).map(t => t - 0.5))
    .tickFormat((_, i) => { const t = i * 5; return `${t} (${(t * 0.6).toFixed(0)}s)`; }))
  .selectAll("text").style("font-size", "9px");

heatG2.append("text")
  .attr("transform", "rotate(-90)")
  .attr("x", -heatH / 2).attr("y", -90)
  .attr("text-anchor", "middle").style("font-size", "11px")
  .text("Equip position in normal cycle (ticks / seconds)");

heatG2.append("text")
  .attr("x", innerW / 2).attr("y", -22)
  .attr("text-anchor", "middle").style("font-size", "13px").style("font-weight", "600")
  .text("Lightbearer: net gain vs DPS ring (LB-swing equivalents)");

const heatBreakeven2 = heatG2.append("line")
  .attr("y1", 0).attr("y2", heatH)
  .attr("stroke", "#00aa55").attr("stroke-width", 1.5)
  .attr("display", "none");

const breakevenLabel2 = heatG2.append("text")
  .attr("y", heatH - 8).style("font-size", "10px").style("fill", "#00aa55")
  .attr("display", "none");

// Colorbar (second chart — fills updated dynamically)
for (let i = 0; i < cbSteps; i++) {
  svg2.append("rect")
    .attr("class", "cb2")
    .attr("x", cbX).attr("y", MT + cbStepScale(i))
    .attr("width", cbW).attr("height", cbStepH)
    .attr("fill", "#e8e8e8");
}
const cbRects2 = svg2.selectAll<SVGRectElement, number>("rect.cb2")
  .data(d3.range(cbSteps));

const cbAxisG2 = svg2.append("g")
  .attr("transform", `translate(${cbX + cbW},${MT})`);

svg2.append("text")
  .attr("transform", `rotate(90,${cbLabelX},${MT + heatH / 2})`)
  .attr("x", cbLabelX).attr("y", MT + heatH / 2)
  .attr("text-anchor", "middle").style("font-size", "10px")
  .text("LB-swing equivalents");

// Cumulative chart (second)
let yCum2 = d3.scaleLinear().domain([-1, 1]).range([cumH, 0]);

const cumBars2 = cumG2.selectAll<SVGRectElement, number>("rect.bar2")
  .data(d3.range(MAX_DURATION))
  .join("rect").attr("class", "bar2")
  .attr("x",     (_, i) => xScale(i + 0.5))
  .attr("width", CELL);

cumBars2
  .on("mouseover", (_event: MouseEvent, i) => {
    const { mhAvgHit, mhAvgHitLb, mhSpeed, specAvgHit, specSpeed, specCost } = getInputs();
    const mhDiff = mhAvgHit - mhAvgHitLb;
    let extra = "";
    if (specCost > 0 && specSpeed > 0 && mhSpeed > 0 && mhDiff > 0) {
      const dmgPerSpec = specAvgHit - mhAvgHit * (specSpeed / mhSpeed);
      const lbSwings = perTickMean[i] * dmgPerSpec / (specCost * mhDiff);
      extra = `<br><strong>LB-swing equiv:</strong> ${lbSwings.toFixed(2)}`;
    }
    tooltip.style("display", "block").html(
      `<strong>Duration:</strong> ${i + 1} ticks (${((i + 1) * 0.6).toFixed(1)}s)<br>` +
      `<strong>Avg net spec gain:</strong> ${perTickMean[i].toFixed(2)}%` +
      extra
    );
  })
  .on("mousemove", (event: MouseEvent) => {
    tooltip.style("left", (event.pageX + 14) + "px").style("top", (event.pageY - 14) + "px");
  })
  .on("mouseleave", () => tooltip.style("display", "none"));

const cumBaseline2 = cumG2.append("line")
  .attr("x1", 0).attr("x2", innerW)
  .attr("stroke", "#888").attr("stroke-width", 0.8);

const cumGridG2 = cumG2.append("g");

const cumBreakeven2 = cumG2.append("line")
  .attr("y1", 0).attr("y2", cumH)
  .attr("stroke", "#00aa55").attr("stroke-width", 1.5)
  .attr("display", "none");

cumG2.append("g")
  .attr("transform", `translate(0,${cumH})`)
  .call(d3.axisBottom(xScale)
    .tickValues(xTickVals.map(t => t - 0.5))
    .tickFormat((_, i) => `${xTickVals[i]} (${(xTickVals[i] * 0.6).toFixed(0)}s)`))
  .selectAll("text").style("font-size", "9px");

const cumYAxisG2 = cumG2.append("g");

cumG2.append("text")
  .attr("transform", "rotate(-90)")
  .attr("x", -cumH / 2).attr("y", -90)
  .attr("text-anchor", "middle").style("font-size", "10px")
  .text("Avg net gain at duration (LB-swing eq.)");

cumG2.append("text")
  .attr("x", innerW / 2).attr("y", cumH + 46)
  .attr("text-anchor", "middle").style("font-size", "11px")
  .text("Duration worn (ticks)");

// =============================================================================
// INPUT READING
// =============================================================================

function getInputs() {
  const v = (id: string) => {
    const n = parseFloat((document.getElementById(id) as HTMLInputElement).value);
    return isNaN(n) ? 0 : n;
  };
  return {
    mhAvgHit:   v("mh-avg-hit"),
    mhAvgHitLb: v("mh-avg-hit-lb"),
    mhSpeed:    v("mh-speed"),
    specAvgHit: v("spec-avg-hit"),
    specSpeed:  v("spec-speed"),
    specCost:   v("spec-cost"),
  };
}

// =============================================================================
// UPDATE — first chart (unchanged logic)
// =============================================================================

function filteredCumulative(minTick: number): number[] {
  let sum = 0;
  return perTickMean.map((v, i) => {
    if (i + 1 >= minTick) { sum += v; return sum; }
    return 0;
  });
}

function update(minTick: number): void {
  if (minTick > 1) {
    greyLeft.attr("x", 0).attr("width", (minTick - 1) * CELL).attr("display", null);
  } else {
    greyLeft.attr("display", "none");
  }

  const filtCum = filteredCumulative(minTick);

  cumBars
    .attr("y",      (_, i) => Math.min(yCum(0), yCum(filtCum[i])))
    .attr("height", (_, i) => Math.abs(yCum(filtCum[i]) - yCum(0)))
    .attr("fill",   (_, i) => {
      if (i + 1 < minTick) return "#cccccc";
      return filtCum[i] >= 0 ? "#4477aa" : "#cc4444";
    });

  let bTick: number | null = null;
  for (let i = minTick - 1; i < MAX_DURATION; i++) {
    if (filtCum[i] > 0) { bTick = i + 1; break; }
  }

  if (bTick !== null) {
    const bx  = (bTick - 1) * CELL;
    const sec = (bTick * 0.6).toFixed(1);
    heatBreakeven.attr("x1", bx).attr("x2", bx).attr("display", null);
    cumBreakeven.attr("x1",  bx).attr("x2", bx).attr("display", null);
    breakevenLabel.attr("x", bx + 4)
      .text(`Breakeven: ${bTick} ticks (${sec}s)`)
      .attr("display", null);
  } else {
    heatBreakeven.attr("display", "none");
    cumBreakeven.attr("display",  "none");
    breakevenLabel.attr("display", "none");
  }
}

// =============================================================================
// UPDATE — second chart (damage)
// =============================================================================

function updateDps(minTick: number): void {
  const { mhAvgHit, mhAvgHitLb, mhSpeed, specAvgHit, specSpeed, specCost } = getInputs();

  const mhDiff = mhAvgHit - mhAvgHitLb;

  const hide = () => {
    heatCells2.attr("fill", "#e8e8e8");
    dpsPlaceholder.attr("display", null);
    greyLeft2.attr("display", "none");
    heatBreakeven2.attr("display", "none");
    cumBreakeven2.attr("display", "none");
    breakevenLabel2.attr("display", "none");
    cumBars2.attr("y", yCum2(0)).attr("height", 0).attr("fill", "#cccccc");
  };

  if (specCost <= 0 || specSpeed <= 0 || mhSpeed <= 0 || mhDiff <= 0) {
    hide(); return;
  }

  dpsPlaceholder.attr("display", "none");

  // Net damage per spec use vs foregone mainhand hits during spec cast
  const dmgPerSpec = specAvgHit - mhAvgHit * (specSpeed / mhSpeed);
  // value(p, d) = how many LB-swing-cost units of advantage the spec gain represents:
  //   (netPct[p][d] / specCost) * dmgPerSpec / mhDiff
  //   = netPct[p][d] * specScale
  const specScale = dmgPerSpec / (specCost * mhDiff);

  // Color domain from actual data range
  let minVal = Infinity, maxVal = -Infinity;
  for (let p = 0; p < NORMAL_THRESHOLD; p++) {
    for (let d = 0; d < MAX_DURATION; d++) {
      const v = netPct[p][d] * specScale;
      if (v < minVal) minVal = v;
      if (v > maxVal) maxVal = v;
    }
  }
  const maxAbsVal = Math.max(Math.abs(minVal), Math.abs(maxVal), 0.001);
  const dpsColorScale = d3.scaleDiverging(d3.interpolateRdBu).domain([-maxAbsVal, 0, maxAbsVal]);

  heatCells2.attr("fill", ({p, d}) => dpsColorScale(netPct[p][d] * specScale));

  // Colorbar
  const cbValScaleLb = d3.scaleLinear().domain([0, cbSteps - 1]).range([maxAbsVal, -maxAbsVal]);
  cbRects2.attr("fill", i => dpsColorScale(cbValScaleLb(i)));
  const cbAxisScaleLb = d3.scaleLinear().domain([maxAbsVal, -maxAbsVal]).range([0, heatH]);
  const cbHalf = maxAbsVal / 2;
  cbAxisG2
    .call(d3.axisRight(cbAxisScaleLb)
      .tickValues([-maxAbsVal, -cbHalf, 0, cbHalf, maxAbsVal])
      .tickFormat(d => `${(+d).toFixed(1)}`))
    .selectAll("text").style("font-size", "9px");

  // Per-tick mean: position-averaged spec gain in LB-swing-equivalent units
  const perTickMeanLb = perTickMean.map(v => v * specScale);

  // Per-tick values (non-cumulative) — zero out ticks before minTick
  const filtValsLb = perTickMeanLb.map((v, i) => (i + 1 >= minTick ? v : 0));

  // Y-axis domain from the per-tick range (not a running sum)
  const domainExtent = Math.max(
    Math.abs(d3.min(perTickMeanLb)!),
    Math.abs(d3.max(perTickMeanLb)!)
  ) * 1.1 || 1;
  yCum2 = d3.scaleLinear().domain([-domainExtent, domainExtent]).range([cumH, 0]);

  cumYAxisG2
    .call(d3.axisLeft(yCum2).ticks(4).tickFormat(d => `${(+d).toFixed(1)}`))
    .selectAll("text").style("font-size", "9px");

  cumBaseline2.attr("y1", yCum2(0)).attr("y2", yCum2(0));

  cumGridG2.selectAll("*").remove();
  yCum2.ticks(4).forEach(t => {
    cumGridG2.append("line")
      .attr("x1", 0).attr("x2", innerW)
      .attr("y1", yCum2(t)).attr("y2", yCum2(t))
      .attr("stroke", "#ccc").attr("stroke-width", 0.5)
      .attr("stroke-dasharray", "3,3");
  });

  cumBars2
    .attr("y",      (_, i) => Math.min(yCum2(0), yCum2(filtValsLb[i])))
    .attr("height", (_, i) => Math.abs(yCum2(filtValsLb[i]) - yCum2(0)))
    .attr("fill",   (_, i) => {
      if (i + 1 < minTick) return "#cccccc";
      return filtValsLb[i] >= 0 ? "#4477aa" : "#cc4444";
    });

  if (minTick > 1) {
    greyLeft2.attr("x", 0).attr("width", (minTick - 1) * CELL).attr("display", null);
  } else {
    greyLeft2.attr("display", "none");
  }

  let bTick2: number | null = null;
  for (let i = minTick - 1; i < MAX_DURATION; i++) {
    if (filtValsLb[i] > 0) { bTick2 = i + 1; break; }
  }
  if (bTick2 !== null) {
    const bx2 = (bTick2 - 1) * CELL;
    const sec2 = (bTick2 * 0.6).toFixed(1);
    heatBreakeven2.attr("x1", bx2).attr("x2", bx2).attr("display", null);
    cumBreakeven2.attr("x1",  bx2).attr("x2", bx2).attr("display", null);
    breakevenLabel2.attr("x", bx2 + 4)
      .text(`Breakeven: ${bTick2} ticks (${sec2}s)`)
      .attr("display", null);
  } else {
    heatBreakeven2.attr("display", "none");
    cumBreakeven2.attr("display",  "none");
    breakevenLabel2.attr("display", "none");
  }
}

// =============================================================================
// UPDATE — text summary
// =============================================================================

function updateText(minTick: number): void {
  const { mhAvgHit, mhAvgHitLb, mhSpeed, specAvgHit, specSpeed, specCost } = getInputs();
  const el = document.getElementById("result-text")!;

  const specDpt   = specSpeed > 0 ? specAvgHit / specSpeed : null;
  const mhDptDps  = mhSpeed  > 0 ? mhAvgHit   / mhSpeed   : null;
  const mhDptLb   = mhSpeed  > 0 ? mhAvgHitLb / mhSpeed   : null;
  const mhLossDpt = (mhDptDps !== null && mhDptLb !== null) ? mhDptDps - mhDptLb : null;

  const dmgPerSpec = (specSpeed > 0 && mhSpeed > 0)
    ? specAvgHit - mhAvgHit * (specSpeed / mhSpeed)
    : null;

  const mhDiff = mhAvgHit - mhAvgHitLb;
  let netSwings: number | null = null;
  if (specCost > 0 && dmgPerSpec !== null && mhDiff > 0 && mhSpeed > 0) {
    const specScale = dmgPerSpec / (specCost * mhDiff);
    netSwings = perTickMean[minTick - 1] * specScale;
  }

  const f1 = (v: number | null) => (v !== null && isFinite(v)) ? v.toFixed(1) : "—";
  const f2 = (v: number | null) => (v !== null && isFinite(v)) ? v.toFixed(2) : "—";

  el.innerHTML =
    `At <strong>${f1(specDpt)}</strong> damage/tick the special attack will deal ` +
    `<strong>${f1(dmgPerSpec)}</strong> increased damage over the mainhand swing ` +
    `(<strong>${f1(mhDptDps)}</strong> damage/tick with DPS ring). ` +
    `With LB equipped your mainhand averages <strong>${f1(mhDptLb)}</strong> damage/tick — ` +
    `a cost of <strong>${f1(mhLossDpt)}</strong> damage/tick vs the DPS ring. ` +
    `If you have the lightbearer equipped for a minimum of <strong>${minTick}</strong> ticks, ` +
    `you gain <strong>${f2(netSwings)}</strong> LB-swing equivalents of spec advantage on average — ` +
    `i.e. you could swing the mainhand with LB equipped that many more times before the spec gain is fully consumed by the ring DPS loss.`;
}

// =============================================================================
// COMBINED UPDATE + EVENT LISTENERS
// =============================================================================

function updateAll(minTick: number): void {
  update(minTick);
  updateDps(minTick);
  updateText(minTick);
}

const minSlider = document.getElementById("min-slider") as HTMLInputElement;
const minLabel  = document.getElementById("min-label")!;

// Short URL param keys to keep shared links compact
const PARAM_MAP: Record<string, string> = {
  "min-slider":    "mt",
  "mh-speed":      "ms",
  "mh-avg-hit":    "mh",
  "mh-avg-hit-lb": "ml",
  "spec-speed":    "ss",
  "spec-avg-hit":  "sh",
  "spec-cost":     "sc",
};

function saveToUrl(): void {
  const params = new URLSearchParams();
  for (const [id, key] of Object.entries(PARAM_MAP)) {
    const val = (document.getElementById(id) as HTMLInputElement).value;
    if (val !== "") params.set(key, val);
  }
  history.replaceState(null, "", "?" + params.toString());
}

function restoreFromUrl(): void {
  const params = new URLSearchParams(location.search);
  for (const [id, key] of Object.entries(PARAM_MAP)) {
    const val = params.get(key);
    if (val !== null) {
      (document.getElementById(id) as HTMLInputElement).value = val;
    }
  }
}

restoreFromUrl();

const initialMin = parseInt(minSlider.value);
minLabel.textContent = `${initialMin} (${(initialMin * 0.6).toFixed(1)}s)`;

minSlider.addEventListener("input", () => {
  const min = parseInt(minSlider.value);
  minLabel.textContent = `${min} (${(min * 0.6).toFixed(1)}s)`;
  saveToUrl();
  updateAll(min);
});

["mh-avg-hit", "mh-avg-hit-lb", "mh-speed", "spec-avg-hit", "spec-speed", "spec-cost"].forEach(id => {
  document.getElementById(id)!.addEventListener("input", () => {
    saveToUrl();
    updateAll(parseInt(minSlider.value));
  });
});

updateAll(initialMin);
