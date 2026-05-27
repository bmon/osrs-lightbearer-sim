#!/usr/bin/env -S uv run python

import sys

import matplotlib
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.gridspec import GridSpec

matplotlib.use("Agg")

output_path = sys.argv[1] if len(sys.argv) > 1 else None

# OSRS spec timer: increments by 1 each game tick (0.6s).
# Normal threshold: 50 ticks (30s) per 10% restore.
# Lightbearer threshold: 25 ticks (15s) per 10% restore.
#
# Equip LB:  resets timer to 0 ONLY if current progress < 25 (below half).
#            Otherwise timer preserved, continues toward 50, then switches to 25.
# Unequip LB: ALWAYS resets timer to 0.
#
# Net gain = (LB restores earned) - (normal spec value over same period).
# Normal spec value for duration D starting at position P = (P + D) / 50 restores,
# using fractional accounting (partial progress has proportional value).

NORMAL_THRESHOLD = 50
LB_THRESHOLD = 25
MAX_DURATION = 150


def simulate_lb(equip_pos, duration):
    """Return number of 10% restores earned while wearing LB for `duration` ticks."""
    if equip_pos < LB_THRESHOLD:
        timer, threshold = 0, LB_THRESHOLD
    else:
        timer, threshold = equip_pos, NORMAL_THRESHOLD

    restores = 0
    for _ in range(duration):
        timer += 1
        if timer >= threshold:
            restores += 1
            timer = 0
            threshold = LB_THRESHOLD
    return restores


def compute_net_gain():
    """Compute net gain matrix: net_pct[p, d] = % spec gained over normal."""
    net_pct = np.zeros((NORMAL_THRESHOLD, MAX_DURATION))
    for p in range(NORMAL_THRESHOLD):
        for d in range(1, MAX_DURATION + 1):
            lb_restores = simulate_lb(p, d)
            normal_restores = (p + d) / NORMAL_THRESHOLD
            net_pct[p, d - 1] = (lb_restores - normal_restores) * 10
    return net_pct


# =============================================================================
# COMPUTE
# =============================================================================

net_pct = compute_net_gain()

# Average net gain per equip position at each duration, then cumulative
per_tick_sum = net_pct.mean(axis=0)
cumulative = np.cumsum(per_tick_sum)

# Find cumulative breakeven
breakeven_tick = int(np.argmax(cumulative > 0)) + 1
breakeven_sec = breakeven_tick * 0.6

print(f"Cumulative breakeven: {breakeven_tick} ticks ({breakeven_sec:.1f}s)")


# =============================================================================
# PLOT
# =============================================================================

fig = plt.figure(figsize=(14, 9))
gs = GridSpec(
    2,
    2,
    height_ratios=[3, 1.5],
    width_ratios=[20, 1],
    hspace=0.15,
    wspace=0.05,
)
ax_heat = fig.add_subplot(gs[0, 0])
ax_cbar = fig.add_subplot(gs[0, 1])
ax_cum = fig.add_subplot(gs[1, 0])
ax_cum_pad = fig.add_subplot(gs[1, 1])
ax_cum_pad.set_visible(False)

# -- Heatmap --
tick_labels_x = np.arange(25, MAX_DURATION + 1, 25)
tick_labels_y = np.arange(0, NORMAL_THRESHOLD + 1, 5)

im = ax_heat.imshow(
    net_pct,
    aspect="auto",
    cmap="RdBu",
    vmin=-12,
    vmax=12,
    interpolation="nearest",
    extent=[0.5, MAX_DURATION + 0.5, NORMAL_THRESHOLD - 0.5, -0.5],
)

ax_heat.axvline(
    x=breakeven_tick - 0.5,
    color="#00ff88",
    linewidth=1,
    label=f"Cumulative breakeven: {breakeven_tick} ticks ({breakeven_sec:.1f}s)",
)

ax_heat.set_xlim(0.5, MAX_DURATION + 0.5)
ax_heat.set_ylim(-0.5, NORMAL_THRESHOLD - 0.5)
ax_heat.set_xticks(tick_labels_x - 0.5)
ax_heat.set_xticklabels(
    [f"{t} ({t * 0.6:.0f}s)" for t in tick_labels_x], fontsize=9, ha="left"
)
ax_heat.set_yticks(tick_labels_y - 0.5)
ax_heat.set_yticklabels(
    [f"{t} ({t * 0.6:.0f}s)" for t in tick_labels_y], fontsize=9, va="bottom"
)

ax_heat.set_ylabel("Equip position in normal cycle (ticks / seconds)", fontsize=11)
ax_heat.set_title("Lightbearer: spec gain (%) when swapping rings", fontsize=13)
ax_heat.legend(
    loc="lower right",
    fontsize=10,
    facecolor="black",
    edgecolor="white",
    labelcolor="#00ff88",
    framealpha=0.85,
)

fig.colorbar(im, cax=ax_cbar, label="Net gain (% spec energy)")

# -- Cumulative sum --
durations = np.arange(1, MAX_DURATION + 1)

bar_colors = np.where(cumulative >= 0, "#4477aa", "#cc4444")
ax_cum.bar(durations, cumulative, color=bar_colors, width=1.0)

ax_cum.axhline(y=0, color="#888888", linewidth=0.8)
ax_cum.axvline(x=breakeven_tick - 0.5, color="#00ff88", linewidth=1)
ax_cum.set_xlim(0.5, MAX_DURATION + 0.5)

ax_cum.set_xticks(tick_labels_x - 0.5)
ax_cum.set_xticklabels(
    [f"{t} ({t * 0.6:.0f}s)" for t in tick_labels_x], fontsize=9, ha="left"
)

ax_cum.set_xlabel("Duration worn (ticks)", fontsize=11)
ax_cum.set_ylabel("Avg cumulative\nnet gain (%)", fontsize=10)
ax_cum.grid(axis="y", alpha=0.2)

if output_path:
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    print("Plot saved.")
