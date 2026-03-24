import torch
import torch.nn as nn
import torch.optim as optim
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset, TensorDataset
import numpy as np
from spectral_decay import explicit_fd_step
N_high = 256
import dream_metrics
from ethical_governor import EthicalGovernor
from self_identity import SelfIdentityModule, identity_loss
import csv
from datetime import datetime
import os

# Sovereign Params
device = torch.device('cpu')  # Match robust
N_low = 64
N_high = 256
L = 2 * np.pi
dx_low = L / N_low
dx_high = L / N_high
nu = 1.0
dt = 0.01
k_cut = 8
num_steps_fine = 4
batch_size = 16
num_samples = 2000  # Increased for ethics
epochs = 200
lr = 1e-3
lambda_reg = 0.1
lambda_moral = 0.5
lambda_id = 0.1
model_name = 'moral_neural_governor.pt'

class MoralNeuralGovernor(nn.Module):
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
        self.dec2 = self.conv_block(ch*2, 2, 3, 1)  # Flux RI
        # Ethical head from bottleneck features
        self.pool_feat = nn.AdaptiveAvgPool2d(1)
        self.eth_head = EthicalGovernor(input_dim=ch*4 + 6)  # feat flatten + phys_state
        self.N = N

    def conv_block(self, in_ch, out_ch, k, p):
        return nn.Sequential(
            nn.Conv2d(in_ch, out_ch, k, padding=p),
            nn.GELU(),
            nn.Conv2d(out_ch, out_ch, k, padding=p),
            nn.GELU()
        )

    def forward(self, u_ri, phys_state=None):
        e1 = self.enc1(u_ri)
        e2 = self.enc2(self.pool(e1))
        b = self.bottleneck(self.pool(e2))
        d1 = self.dec1(torch.cat([self.up1(b), e2], 1))
        d2 = self.dec2(torch.cat([self.up2(d1), e1], 1))
        flux = d2  # [B,2,N,N]
        # Ethical
        b_flat = self.pool_feat(b).flatten(1)  # [B, ch*4]
        if phys_state is None:
            phys_state = torch.zeros(1, 6, device=b.device)
        eth_input = torch.cat([b_flat, phys_state], 1)
        eth_weights = self.eth_head(eth_input)
        return flux, eth_weights

def compute_phys_state_from_sim(u_hat_low, mask_tail):
    tail_ratio = torch.mean(torch.abs(u_hat_low[:, :, -N_low//4:, :])**2).item()
    k_low_freq = 2*np.pi*np.fft.fftfreq(N_low, dx_low)
    k_low = torch.tensor(np.sqrt((k_low_freq**2).mean())).to(device)
    low_k_mag = torch.mean(torch.abs(u_hat_low[:, :, :k_cut, :k_cut])).item()
    div_p = 0.0  # Sim approx
    ent_d = 0.1  # Placeholder from spectrum
    osc_s = 0.05
    prog_d = 0.2
    return torch.tensor([[tail_ratio, low_k_mag, div_p, ent_d, osc_s, prog_d]], device=device)

def generate_moral_dataset(num_samples):
    X_list, y_flux_list, phys_states_list, y_moral_list = [], [], [], []
    kx = 2 * np.pi * np.fft.fftfreq(N_low, dx_low)
    ky = kx.copy()
    KX_low, KY_low = np.meshgrid(kx, ky)
    K2_low = KX_low**2 + KY_low**2
    mask_tail = np.sqrt(K2_low) > k_cut

    ideal_moral = torch.tensor([0.35, 0.05, 0.30, 0.05, 0.25]).to(device)  # love, suffer, life, conflict, time

    for _ in range(num_samples):
        X_low, Y_low = np.meshgrid(np.linspace(0, L, N_low, endpoint=False),
                                   np.linspace(0, L, N_low, endpoint=False))
        u0_low_phys = np.sin(X_low) * np.cos(Y_low) + 0.5 * np.sin(3 * X_low + Y_low)
        u0_high_phys = np.sin(X_low * N_high/N_low) * np.cos(Y_low * N_high/N_low) + \
                       0.5 * np.sin(3 * X_low * N_high/N_low + Y_low * N_high/N_low)

        u_high = u0_high_phys.copy()
        for __ in range(num_steps_fine):
            u_high = explicit_fd_step(u_high, nu, dt, dx_high)

        u0_hat_low = np.fft.fft2(u0_low_phys)
        G_low = np.exp(-nu * K2_low * dt * num_steps_fine)
        u_hat_low_pred = u0_hat_low * G_low
        u_low_spectral = np.real(np.fft.ifft2(u_hat_low_pred))

        from scipy.ndimage import zoom
        u_high_interp = zoom(u_high, N_low / N_high, order=1)
        sgs_flux_phys = u_high_interp - u_low_spectral
        sgs_flux_hat_real = np.fft.fft2(sgs_flux_phys).real * mask_tail
        sgs_flux_hat_imag = np.fft.fft2(sgs_flux_phys).imag * mask_tail
        y_flux = np.stack([sgs_flux_hat_real, sgs_flux_hat_imag], 0)[np.newaxis, ...]

        u_hat_low_ri = np.stack([u_hat_low_pred.real, u_hat_low_pred.imag], 0)[np.newaxis, ...]
        X = u_hat_low_ri

        phys_state = compute_phys_state_from_sim(torch.tensor(u_hat_low_ri), mask_tail)

        X_list.append(X)
        y_flux_list.append(y_flux)
        phys_states_list.append(phys_state)
        y_moral_list.append(ideal_moral[np.newaxis, ...])

    X_t = torch.tensor(np.concatenate(X_list), dtype=torch.float32).to(device)
    y_flux_t = torch.tensor(np.concatenate(y_flux_list), dtype=torch.float32).to(device)
    phys_t = torch.stack(phys_states_list).to(device)
    y_moral_t = torch.stack(y_moral_list).to(device)
    return TensorDataset(X_t, y_flux_t, phys_t, y_moral_t)

# Ledger
ledger_path = 'moral_dream_ledger.csv'
fieldnames = ['Timestamp', 'Epoch', 'FluxLoss', 'MoralLoss', 'IDLoss', 'PredDQ', 'EQ', 'EA', 'State']
if not os.path.exists(ledger_path):
    with open(ledger_path, 'w', newline='') as f:
        csv.DictWriter(f, fieldnames).writeheader()

print("Generating moral physics+ethical dataset...")
dataset = generate_moral_dataset(num_samples)
dataloader = DataLoader(dataset, batch_size=batch_size, shuffle=True)

model = MoralNeuralGovernor(N_low).to(device)
optimizer = optim.Adam(model.parameters(), lr=lr)
mse = nn.MSELoss()

sid = SelfIdentityModule().to(device)

print("Igniting Moral Neural Governor training...")
for epoch in range(epochs):
    model.train()
    total_flux, total_moral, total_id = 0, 0, 0
    for x_b, y_flux_b, phys_b, y_moral_b in dataloader:
        optimizer.zero_grad()

        flux_pred, eth_pred = model(x_b, phys_b)

        loss_flux = mse(flux_pred, y_flux_b)

        loss_moral = mse(eth_pred, y_moral_b)

        # Modulated reg
        u_hat_corr_r = x_b[:,0] + flux_pred[:,0]
        u_hat_corr_i = x_b[:,1] + flux_pred[:,1]
        u_corr = torch.real(torch.fft.ifft2(torch.complex(u_hat_corr_r, u_hat_corr_i)))
        u_grad_x = (torch.roll(u_corr, -1, dims=2) - torch.roll(u_corr, 1, dims=2)) / dx_low
        u_grad_y = (torch.roll(u_corr, -1, dims=3) - torch.roll(u_corr, 1, dims=3)) / dx_low
        div_reg = torch.mean(u_grad_x + u_grad_y)**2
        suffer_w = eth_pred[:,1].mean()
        loss_reg = suffer_w * lambda_reg * div_reg

        loss_id = identity_loss(eth_pred.mean(0), sid)

        loss = loss_flux + lambda_moral * loss_moral + lambda_id * loss_id + loss_reg
        loss.backward()
        optimizer.step()

        total_flux += loss_flux.item()
        total_moral += loss_moral.item()
        total_id += loss_id.item()

    avg_flux = total_flux / len(dataloader)
    avg_moral = total_moral / len(dataloader)
    avg_id = total_id / len(dataloader)
    # Pred DQ approx
    suffer_mean = eth_pred[:,1].mean().item()
    pred_dq = dream_metrics.dream_quality(loss=avg_flux, div_prob=suffer_mean)
    proxies = dream_metrics.compute_ethical_proxies(div_prob=suffer_mean, tail_energy_ratio=0.1)
    eq = dream_metrics.ethical_quality(proxies)
    ea = dream_metrics.ethical_alignment(proxies)
    state = dream_metrics.ethical_state(eq, ea)

    log_entry = {
        'Timestamp': datetime.now().isoformat(),
        'Epoch': epoch,
        'FluxLoss': f'{avg_flux:.6f}',
        'MoralLoss': f'{avg_moral:.6f}',
        'IDLoss': f'{avg_id:.6f}',
        'PredDQ': pred_dq,
        'EQ': eq,
        'EA': ea,
        'State': state
    }
    with open(ledger_path, 'a', newline='') as f:
        csv.DictWriter(f, fieldnames).writerow(log_entry)

    if epoch % 20 == 0:
        print(f"Epoch {epoch}: Flux={avg_flux:.4f} Moral={avg_moral:.4f} ID={avg_id:.4f} DQ={pred_dq:.1f} EQ={eq:.1f} ({state})")

torch.save(model.state_dict(), model_name)
print(f"✅ Moral Neural Governor trained/saved: {model_name}")
print("Run: python lattice_dashboard.py to test integration.")

