import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation
from mpl_toolkits.mplot3d import Axes3D
import sounddevice as sd
import time

# Spectral physics
def build_spectral_decay_matrix(N, L, nu, dt):
    k_vec = 2 * np.pi * np.fft.fftfreq(N, d=L/N)
    Kx, Ky = np.meshgrid(k_vec, k_vec)
    Lambda = -(Kx**2 + Ky**2)
    G = np.exp(nu * Lambda * dt)
    return G

class SpectralGovernor(nn.Module):
    def __init__(self, N):
        super().__init__()
        ch = 32
        self.enc1 = self.conv_block(2, ch, 3, 1)
        self.enc2 = self.conv_block(ch, ch*2, 3, 1)
        self.pool = nn.MaxPool2d(2)
        self.bottleneck = self.conv_block(ch*2, ch*4, 3, 1)
        self.up1 = nn.ConvTranspose2d(ch*4, ch*2, 2, 2)
        self.dec1 = self.conv_block(ch*4, ch*2, 3, 1)
        self.up2 = nn.ConvTranspose2d(ch*2, ch, 2, 2)
        self.dec2 = self.conv_block(ch*2, 2, 3, 1)

    def conv_block(self, in_ch, out_ch, k, p):
        return nn.Sequential(
            nn.Conv2d(in_ch, out_ch, k, padding=p),
            nn.GELU(),
            nn.Conv2d(out_ch, out_ch, k, padding=p),
            nn.GELU()
        )

    def forward(self, u_real_imag):
        e1 = self.enc1(u_real_imag)
        e2 = self.enc2(self.pool(e1))
        b = self.bottleneck(self.pool(e2))
        d1 = self.dec1(torch.cat([self.up1(b), e2], dim=1))
        d2 = self.dec2(torch.cat([self.up2(d1), e1], dim=1))
        return d2

class DivergenceGovernor(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(5, 64)
        self.fc2 = nn.Linear(64, 32)
        self.dt_head = nn.Linear(32, 1)
        self.flag_head = nn.Linear(32, 1)
        self.relu = nn.ReLU()

    def forward(self, x):
        x = self.relu(self.fc1(x))
        x = self.relu(self.fc2(x))
        dt_adj = torch.sigmoid(self.dt_head(x)) * 0.01
        flag = torch.sigmoid(self.flag_head(x))
        return dt_adj.squeeze(), flag.squeeze()

# Load models
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
N = 64
L = 2 * np.pi
nu = 1.0
dt_base = 0.01
neural_gov = SpectralGovernor(N).to(device)
div_gov = DivergenceGovernor().to(device)
try:
    neural_gov.load_state_dict(torch.load('neural_governor.pt', map_location=device))
    neural_gov.eval()
    print('Neural Governor loaded')
except:
    print('Warning: neural_governor.pt not found')
try:
    div_gov.load_state_dict(torch.load('divergence_governor.pt', map_location=device))
    div_gov.eval()
    print('Divergence Governor loaded')
except:
    print('Warning: divergence_governor.pt not found')
G = build_spectral_decay_matrix(N, L, nu, dt_base)
x = np.linspace(0, L, N, endpoint=False)
y = x.copy()
X, Y = np.meshgrid(x, y)
u_phys = np.sin(X) * np.cos(Y) + 0.5 * np.sin(5*X) * np.sin(3*Y)

fig = plt.figure(figsize=(15, 5))
ax1 = fig.add_subplot(131, projection='3d')
ax2 = fig.add_subplot(132)
ax_health = fig.add_subplot(133)
surf1 = ax1.plot_surface(X, Y, np.zeros((N,N)), cmap='plasma')
heatmap2 = ax2.imshow(np.zeros((N,N)), cmap='hsv')
health_bar = ax_health.barh(['Div Prob', 'DT Adj'], [0, 1], color=['red', 'blue'])
ax_health.set_xlim(0,1)
plt.suptitle(f'Sovereign Lattice Command Center | Outlier Score: {outlier_score:.0f}x')
plt.tight_layout()

def compute_features(u_phys):
    max_norm = np.max(np.abs(u_phys))
    u_hat = np.fft.fft2(u_phys)
    k_vec = 2 * np.pi * np.fft.fftfreq(N, L/N)
    KX, KY = np.meshgrid(k_vec, k_vec)
    high_k_mask = np.sqrt(KX**2 + KY**2) > 8
    high_k_energy = np.sum(np.abs(u_hat)**2 * high_k_mask)
    dx = L / N
    u_grad_x = (np.roll(u_phys, -1, 1) - np.roll(u_phys, 1, 1)) / dx
    u_grad_y = (np.roll(u_phys, -1, 0) - np.roll(u_phys, 1, 0)) / dx
    div_reg = np.mean(np.abs(u_grad_x + u_grad_y))
    lap = (np.roll(u_phys, 1, 0) + np.roll(u_phys, -1, 0) + np.roll(u_phys, 1, 1) + np.roll(u_phys, -1, 1) - 4*u_phys) / dx**2
    lap_norm = np.mean(np.abs(lap))
    spectral_tail = np.mean(np.abs(u_hat)**2)
    return np.array([max_norm, high_k_energy, div_reg, lap_norm, spectral_tail])[None, :]

def step_integrated(u_old):
    feat = compute_features(u_old)
    feat_t = torch.tensor(feat, dtype=torch.float32).to(device)
    with torch.no_grad():
        dt_adj, div_prob = div_gov(feat_t)
    dt_use = dt_base * (1 - div_prob.cpu().numpy()[0])
    u_hat_old = np.fft.fft2(u_old)
    u_ri_old = np.stack([u_hat_old.real, u_hat_old.imag], axis=0)[None, ...]
    try:
        pred_ri = neural_gov(torch.tensor(u_ri_old, dtype=torch.float32).to(device)).squeeze(0).cpu().numpy()
    except:
        pred_ri = np.zeros_like(u_ri_old)
    u_hat_evolved = u_hat_old * np.exp(-nu * dt_use * (np.abs(np.fft.fftfreq(N, L/N) * 2*np.pi)**2 + np.abs(np.fft.fftfreq(N, L/N) * 2*np.pi)**2)[:,None])  # Approx G
    u_hat_corr = u_hat_evolved + pred_ri
    u_new = np.real(np.fft.ifft2(u_hat_corr))
    corr_hat_c = pred_ri[0] + 1j * pred_ri[1]
    corr_phys_c = np.fft.ifft2(corr_hat_c)
    mag = np.abs(corr_phys_c)
    phase = np.angle(corr_phys_c)
    enstrophy = np.mean(lap**2)
    return u_new, mag, phase, div_prob.cpu().numpy()[0], dt_use, enstrophy

frame = 0
def update(frame_num):
    global u_phys, frame
    u_phys, mag, phase, div_prob, dt_use, enstrophy = step_integrated(u_phys)
    surf1.remove()
    surf1 = ax1.plot_surface(X, Y, mag, cmap='plasma')
    ax1.set_zlim(0, np.max(mag)*1.2)
    heatmap2.set_array(phase)
    health_bar[0].set_width(div_prob)
    health_bar[1].set_width(dt_use / dt_base)
    health_color = 'red' if div_prob > 0.5 else 'green'
    health_bar[0].set_color(health_color)
    ax_health.set_title(f'Enstrophy: {enstrophy:.2e}')
    # Audio: freq from enstrophy
    fs = 44100
    dur = 0.03
    freq = 200 + enstrophy * 1000
    amp = 0.1
    t_audio = np.linspace(0, dur, int(fs*dur))
    tone = amp * np.sin(2 * np.pi * freq * t_audio)
    sd.play(tone, fs)
    ax2.set_title(f't = {frame * dt_base:.2f}, dt={dt_use:.4f}')
    frame += 1
    return surf1, heatmap2, health_bar

ani = FuncAnimation(fig, update, interval=30, blit=False)
plt.show()
sd.stop()
