import torch
import numpy as np
import matplotlib.pyplot as plt
from matplotlib import cm
import PySimpleGUI as sg
import sounddevice as sd
import threading
import time
import os
from collections import deque
try:
    import dream_metrics
    DREAM_METRICS_AVAILABLE = True
except ImportError:
    DREAM_METRICS_AVAILABLE = False
try:
    from ethical_governor import EthicalGovernor
    from moral_neural_governor_train import MoralNeuralGovernor
    ETHICAL_GOV_AVAILABLE = True
    MORAL_GOV_AVAILABLE = True
except ImportError:
    ETHICAL_GOV_AVAILABLE = False
    MORAL_GOV_AVAILABLE = False
import csv
from datetime import datetime
import torch.nn as nn

# ========================= CONFIG =========================
N = 64
L = 2 * torch.pi
dt_base = 0.01
nu = 0.1
device = torch.device('cpu')

# NeuralGovernor (physics dt)
class NeuralGovernor(nn.Module):
    def __init__(self, N=64):
        super().__init__()
        self.N = N
        self.encoder = nn.Sequential(
            nn.Linear(self.N//4, 128),
            nn.LeakyReLU(0.2),
            nn.Linear(128, 64),
            nn.LeakyReLU(0.2),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, 1)
        )

    def forward(self, u_hat):
        tail_magnitude = torch.abs(u_hat[:, -self.N//4:]).mean(dim=1)
        return self.encoder(tail_magnitude)

# Load physics governors
governor = NeuralGovernor(N).to(device)
if os.path.exists('neural_governor.pt'):
    governor.load_state_dict(torch.load('neural_governor.pt', map_location=device))
    governor.eval()
print('[OK] Physics Governor loaded')

# Load Moral Neural Governor
moral_gov = None
if MORAL_GOV_AVAILABLE:
    moral_gov = MoralNeuralGovernor(N).to(device)
    if os.path.exists('moral_neural_governor.pt'):
        moral_gov.load_state_dict(torch.load('moral_neural_governor.pt', map_location=device))
        moral_gov.eval()
        print('[OK] Moral Neural Governor loaded')
    else:
        print('[WARN] moral_neural_governor.pt not found - falling back')
        moral_gov = None

# Legacy ethical_gov
ethical_gov = None
if ETHICAL_GOV_AVAILABLE:
    ethical_gov = EthicalGovernor(input_dim=6).to(device)
    if os.path.exists('ethical_governor.pt'):
        ethical_gov.load_state_dict(torch.load('ethical_governor.pt', map_location=device))
        ethical_gov.eval()
        print('[OK] Ethical Governor loaded (legacy)')
    else:
        print('[WARN] ethical_governor.pt not found')

# Initial field
x = torch.linspace(0, L, N, device=device)
X, Y = torch.meshgrid(x, x, indexing='ij')
u = torch.sin(X) * torch.cos(Y) + 0.05 * torch.randn(N, N, device=device)

# Wavenumber grids
k_vec = 2 * torch.pi * torch.fft.fftfreq(N, d=L/N).to(device)
kx, ky = torch.meshgrid(k_vec, k_vec, indexing='ij')
k_squared = kx**2 + ky**2
k_squared[0, 0] = 0.0
low_k_mask = (torch.abs(kx) <= k_vec[N//3]) & (torch.abs(ky) <= k_vec[N//3])

# History for proxies
dt_history = deque(maxlen=20)
q_history = deque(maxlen=20)
low_k_history = deque(maxlen=5)
prev_q_score = 0.0
prev_low_k = 0.0

# ========================= SCORING & ETHICS =========================
def quetzalcoatl_score(u_hat):
    energy_total = torch.sum(torch.abs(u_hat)**2).item()
    energy_low = torch.sum(torch.abs(u_hat * low_k_mask)**2).item()
    decay_rate = max(0.01, 1 - (energy_total / (energy_total + 1e-8)))
    resilience = min(1.0, dt_use / dt_base) if 'dt_use' in globals() else 0.8
    score = 100 * (energy_low / (energy_total + 1e-8)) * decay_rate * resilience
    return min(100, max(0, score))

def compute_phys_state(u_hat, div_prob):
    global prev_low_k, prev_q_score
    tail_mag = torch.abs(u_hat[-N//4:]).mean().item()
    low_k_mag = torch.abs(u_hat * low_k_mask).mean().item()
    low_coher_delta = low_k_mag - prev_low_k
    div_proxy = div_prob
    osc_std = np.std(list(dt_history)) if len(dt_history) > 1 else 0.0
    progress_delta = q_score - prev_q_score if 'q_score' in globals() else 0.0
    prev_low_k = low_k_mag
    prev_q_score = q_score if 'q_score' in globals() else 0.0
    phys_state = np.array([tail_mag, low_k_mag, div_proxy, low_coher_delta, osc_std, progress_delta])
    return torch.tensor(phys_state[None, :], dtype=torch.float32).to(device), {
        'suffering': min(1.0, div_proxy + tail_mag),
        'love': max(0.0, low_coher_delta),
        'life': 0.1,  # Dummy emergence
        'conflict': osc_std,
        'time_value': max(0.0, progress_delta)
    }

# ========================= ADAPTIVE STEP WITH ETHICS =========================
def step_with_governors(u):
    global dt_use, ethical_eq, ethical_ea, ethical_estate
    u_hat = torch.fft.fft2(u)
    
    # Physics dt
    if governor is not None:
        tail_input = torch.abs(u_hat[None, -N//4:]).mean(dim=(1,2)).unsqueeze(0)  # Adjust dims
        dt_suggest = governor(tail_input).clamp(0, dt_base).item()
        dt_use = min(dt_base, max(0.001, dt_suggest))
    else:
        dt_use = dt_base
    dt_history.append(dt_use)

    # Spectral evolution (same)
    u_hat = u_hat * torch.exp(-nu * k_squared * dt_use)
    div_prob = 0.0  # Approx
    if div_governor is not None:
        div_prob = div_governor(torch.tensor([[torch.max(torch.abs(u_hat)).item()]]).to(device)).item()
    if div_prob > 0.7:
        dt_use *= 0.3

    ux = torch.fft.ifft2(1j * kx * u_hat).real
    uy = torch.fft.ifft2(1j * ky * u_hat).real
    nonlinear = u * ux + u * uy
    nl_hat = torch.fft.fft2(nonlinear)
    u_hat = u_hat - dt_use * nl_hat

    u_new = torch.fft.ifft2(u_hat).real

    # Ethical layer with Moral Gov
    phys_state_t, proxies = compute_phys_state(u_hat.cpu().numpy(), div_prob)
    ethical_eq = dream_metrics.ethical_quality(proxies) if DREAM_METRICS_AVAILABLE else 50.0
    ethical_ea = dream_metrics.ethical_alignment(proxies) if DREAM_METRICS_AVAILABLE else 0.5
    ethical_estate = dream_metrics.ethical_state(ethical_eq, ethical_ea) if DREAM_METRICS_AVAILABLE else 'Ethics Offline'
    
    weights = None
    if moral_gov is not None:
        # Prepare u_ri for moral_gov
        u_ri = torch.stack([u_hat.real[None, None, :, :], u_hat.imag[None, None, :, :]], 1).to(device)  # [1,2,N,N]
        _, weights = moral_gov(u_ri, phys_state_t)
        weights = weights[0]
        print(f'Moral weights: love={weights[0]:.2f} suffer={weights[1]:.2f}')
        if weights[1] > 0.3:  # suffering_w
            dt_use *= (1 - weights[1])  # Modulate by moral signal
    elif ethical_gov is not None:
        weights = ethical_gov(phys_state_t)[0]
        if proxies['suffering'] > 0.5:
            dt_use *= 0.5
    else:
        weights = torch.tensor([0.2,0.2,0.2,0.2,0.2])

    return u_new, dt_use, div_prob

# Audio with ethical modulation
def audio_thread():
    fs = 44100
    t = np.linspace(0, 0.1, int(0.1 * fs))
    while True:
        mag = torch.max(torch.abs(u)).item()
        q_score_val = quetzalcoatl_score(torch.fft.fft2(u)) / 100 if 'q_score' in globals() else 0.5
        ea_val = ethical_ea if 'ethical_ea' in globals() else 0.5
        freq = 144 + 800 * mag + 400 * q_score_val + 200 * ea_val
        tone = 0.3 * np.sin(2 * np.pi * freq * t)
        sd.play(tone, fs, blocking=False)
        time.sleep(0.08)

threading.Thread(target=audio_thread, daemon=True).start()

# ========================= ENHANCED DASHBOARD =========================
sg.theme('DarkBlack')
layout = [
    [sg.Text(\"IGNIS v4.0 — ETHICAL QUETZALCOATL LATTICE\", font=(\"Courier\", 16, 'bold'))],
    [sg.Canvas(key=\"-CANVAS-\")],
    [sg.Text(\"Adaptive Δt:\"), sg.Text(\"0.0100\", key=\"-DT-\", font=(\"Courier\", 12))],
    [sg.Text(\"Div Prob:\"), sg.Text(\"0.00\", key=\"-DIV-\", font=(\"Courier\", 12))],
    [sg.Text(\"Quetzalcoatl:\"), sg.Text(\"00.0\", key=\"-QSCORE-\", font=(\"Courier\", 14, 'bold'))],
    [sg.Text(\"Dream Quality:\"), sg.Text(\"50.0\", key=\"-DQ-\", font=(\"Courier\", 12))],
    [sg.Text(\"Ethical Quality:\"), sg.Text(\"50.0\", key=\"-EQ-\", font=(\"Courier\", 12, 'bold'))],
    [sg.Text(\"Ethical Alignment:\"), sg.Text(\"0.50\", key=\"-EA-\", font=(\"Courier\", 12))],
    [sg.Text(\"Ethical State:\"), sg.Text(\"Ethics Offline\", key=\"-ESTATE-\", font=(\"Courier\", 12))],
    [sg.Button(\"Pause\"), sg.Button(\"Reset\"), sg.Button(\"Exit\")]
]

window = sg.Window(\"Ethical Neural Governor Dashboard\", layout, finalize=True, size=(1000, 800))
fig = plt.figure(figsize=(9,6))
ax = fig.add_subplot(111, projection='3d')
canvas = window[\"-CANVAS-\"].TKCanvas

paused = False
step_count = 0
dt_use = dt_base
div_governor = None  # Assume not loaded

while True:
    event, _ = window.read(timeout=10)
    if event in (sg.WIN_CLOSED, 'Exit'):
        break
    if event == 'Pause':
        paused = not paused
    if event == 'Reset':
        u = torch.sin(X) * torch.cos(Y) + 0.05 * torch.randn(N, N, device=device)
        step_count = 0
        dt_history.clear()
        q_history.clear()

    if not paused:
        u, dt_use, div_prob = step_with_governors(u)
        step_count += 1
        u_hat_curr = torch.fft.fft2(u)
        q_score = quetzalcoatl_score(u_hat_curr)
        q_history.append(q_score.item())
        low_k_history.append(torch.abs(u_hat_curr * low_k_mask).mean().item())

        # Plot
        ax.clear()
        X_np = X.cpu().numpy()
        Y_np = Y.cpu().numpy()
        U_np = u.cpu().numpy()
        surf = ax.plot_surface(X_np, Y_np, U_np, cmap=cm.plasma, linewidth=0, antialiased=False)
        ax.set_zlim(-1.5, 1.5)
        ax.set_title(f'Step {step_count} | ActionScore {q_score*ethical_ea:.1f}')
        fig.canvas.draw()
        canvas.delete(\"all\")
        canvas.create_image(0, 0, image=fig.canvas.buffer_rgba(), anchor=\"nw\")

        # Update display
        window[\"-DT-\"].update(f\"{dt_use:.4f}\")
        window[\"-DIV-\"].update(f\"{div_prob:.2f}\")
        window[\"-QSCORE-\"].update(f\"{q_score:.1f}\")
        dq = dream_metrics.dream_quality(q_score=q_score, div_prob=div_prob) if DREAM_METRICS_AVAILABLE else 50.0
        window[\"-DQ-\"].update(f\"{dq:.1f}\")
        window[\"-EQ-\"].update(f\"{ethical_eq:.1f}\")
        window[\"-EA-\"].update(f\"{ethical_ea:.2f}\")
        window[\"-ESTATE-\"].update(ethical_estate)

        # Ledger (enhanced)
        if step_count % 100 == 0:
            ledger_path = 'ignis_ethical_ledger.csv'
            if not os.path.exists(ledger_path):
                with open(ledger_path, 'w') as f:
                    f.write('Timestamp,DQ,DState,EQ,EA,EState,Step,QScore,DivProb\\n')
            with open(ledger_path, 'a') as f:
                f.write(f'{datetime.now()}, {dq},{dream_metrics.dream_state(dq) if DREAM_METRICS_AVAILABLE else \"\"}, {ethical_eq},{ethical_ea},{ethical_estate},{step_count},{q_score:.1f},{div_prob:.2f}\\n')

        # Joker + Ethical trigger
        if q_score > 85 and div_prob < 0.3 and ethical_eq > 80:
            print(\"🜂 ETHICAL JOKER — Life/Love Aligned Sovereignty Confirmed\")

window.close()
print(\"Ethical Quetzalcoatl Lattice closed. Purpose preserved.\")

