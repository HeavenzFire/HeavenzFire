import os
import sys
import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
import dream_metrics
from ethical_governor import EthicalGovernor
import csv
from datetime import datetime

# --- PRE-IMPORT SHIELD ---
os.environ['CUDA_VISIBLE_DEVICES'] = '-1'  # Force CPU

try:
    import torch
except:
    print(\"[!] Install CPU PyTorch: pip install torch --index-url https://download.pytorch.org/whl/cpu\")
    sys.exit(1)

# --- SPECTRAL GOVERNOR (Unchanged core) ---
class SpectralGovernor(nn.Module):
    # ... (same as before, omitted for brevity; copy from original)
    def __init__(self, N=64):
        super().__init__()
        ch = 32
        self.enc1 = self.conv_block(2, ch, 3, 1)
        self.enc2 = self.conv_block(ch, ch*2, 3, 1)
        self.pool = nn.MaxPool2d(2)
        self.bottleneck = self.conv_block(ch*2, ch*4, 3, 1)
        self.up1 = nn.ConvTranspose2d(ch*4, ch*2, 2, 2)
        self.dec1 = self.conv_block(ch*4, ch*2, 3, 1)
        self.up2 = nn.ConvTranspose2d(ch*2, ch, 2, 2)
        self.dec2 = self.conv_block(ch*2, 2, 3, 1)  # Flux only
        self.N = N

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

# --- ETHICAL GOVERNOR INTEGRATION ---
class EthicalTrainingHead(nn.Module):
    \"\"\"Attached ethical head for SpectralGovernor (for future multi-head).\"\"\"
    def __init__(self):
        super().__init__()
        self.pool = nn.AdaptiveAvgPool2d(1)
        self.eth_fc = nn.Sequential(
            nn.Linear(32, 32),
            nn.GELU(),
            nn.Linear(32, 5)
        )

    def forward(self, features):
        pooled = self.pool(features).flatten(1)
        return F.softmax(self.eth_fc(pooled), dim=-1)

# --- SAFE DATASET with ETHICAL PROXIES ---
def generate_safe_dataset(num_samples=200, N=64):
    # (same as before)
    device = torch.device('cpu')
    # ... generate X_t, y_t
    # Add ethical proxies per sample (dummy realistic)
    proxy_list = []
    for i in range(num_samples):
        tail_ratio = np.random.uniform(0, 0.5)
        div_p = np.random.uniform(0, 0.3)
        low_coher_d = np.random.uniform(-0.1, 0.2)
        ent_d = np.random.uniform(0, 0.2)
        osc_s = np.random.uniform(0, 0.1)
        prog_d = np.random.uniform(0.1, 0.3)
        proxies = dream_metrics.compute_ethical_proxies(div_prob=div_p, tail_energy_ratio=tail_ratio, low_k_coherence_delta=low_coher_d, entropy_delta=ent_d, osc_std=osc_s, progress_delta=prog_d)
        proxy_list.append([proxies['suffering'], proxies['love'], proxies['life'], proxies['conflict'], proxies['time_value']])
    ethical_targets = torch.tensor(proxy_list, dtype=torch.float32).to(device)  # Target optimal proxies flipped (min suffer -> max (1-suffer))
    ethical_targets[:, [0,3]] = 1 - ethical_targets[:, [0,3]]  # Invert suffer/conflict
    ethical_targets = F.normalize(ethical_targets, dim=1)  # Normalized target
    return torch.utils.data.TensorDataset(X_t, y_t, ethical_targets)

def train_governor():
    device = torch.device('cpu')
    model_name = \"ethical_neural_governor.pt\"  # New name for ethical version
    ethical_name = \"ethical_governor.pt\"

    print(\"--- IGNIS ETHICAL NEURAL GOVERNOR TRAINING ---\")

    spectral_gov = SpectralGovernor().to(device)
    ethical_gov = EthicalGovernor(input_dim=6).to(device)  # Separate for simplicity
    optimizer_s = optim.Adam(spectral_gov.parameters(), lr=0.001)
    optimizer_e = optim.Adam(ethical_gov.parameters(), lr=0.001)
    mse = nn.MSELoss()
    ethical_loss_fn = nn.MSELoss()  # To target weights

    ledger_path = 'ignis_dream_ledger.csv'
    fieldnames = ['Timestamp', 'DreamQuality', 'DreamState', 'Epoch', 'AvgLoss', 'EthicalQuality', 'EthicalAlignment', 'EthicalState']
    if not os.path.exists(ledger_path):
        with open(ledger_path, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()

    dataset = generate_safe_dataset()
    dataloader = torch.utils.data.DataLoader(dataset, batch_size=8, shuffle=True)

    print(\"Training with Ethical Intentionality...\")
    for epoch in range(101):
        total_loss_s, total_loss_e = 0, 0
        for x_b, y_b, eth_target in dataloader:
            # Spectral flux
            optimizer_s.zero_grad()
            pred_flux = spectral_gov(x_b)
            loss_flux = mse(pred_flux, y_b)
            loss_flux.backward()
            optimizer_s.step()
            total_loss_s += loss_flux.item()

            # Ethical head (phys_state dummy from batch stats)
            batch_tail = torch.abs(x_b[:,0, -8:,:]).mean()  # Tail approx
            phys_state = torch.tensor([[batch_tail.cpu(), 0.1, 0.05, 0.1, 0.05, 0.2]], device=device)
            optimizer_e.zero_grad()
            pred_weights = ethical_gov(phys_state)
from self_identity import SelfIdentityModule, identity_loss
sid = SelfIdentityModule()
loss_eth = ethical_loss_fn(pred_weights, eth_target.mean(0).unsqueeze(0)) + 0.1 * identity_loss(pred_weights.mean(0), sid)
            loss_eth.backward()
            optimizer_e.step()
            total_loss_e += loss_eth.item()

            # Reg with ethics
            proxies = {'suffering': 0.1, 'love': 0.1, 'life': 0.1, 'conflict': 0.05, 'time_value': 0.2}
            eq = dream_metrics.ethical_quality(proxies)
            ea = dream_metrics.ethical_alignment(proxies)
            reg_eth = 1 - ea

        avg_loss_s = total_loss_s / len(dataloader)
        avg_loss_e = total_loss_e / len(dataloader)
        dq = dream_metrics.dream_quality(loss=avg_loss_s)
        eq_val = eq
        state = dream_metrics.ethical_state(eq_val, ea)

        log_entry = {
            'Timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],
            'DreamQuality': dq, 'DreamState': dream_metrics.dream_state(dq),
            'Epoch': epoch, 'AvgLoss': f'{avg_loss_s:.6f}',
            'EthicalQuality': eq_val, 'EthicalAlignment': ea, 'EthicalState': state
        }
        with open(ledger_path, 'a', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writerow(log_entry)

        if epoch % 20 == 0:
            print(f\"Epoch {epoch}: FluxLoss {avg_loss_s:.6f} | EthLoss {avg_loss_e:.6f} | EQ {eq_val:.1f} ({state})\")

    torch.save(spectral_gov.state_dict(), model_name)
    torch.save(ethical_gov.state_dict(), ethical_name)
    print(f\"[OK] Ethical models saved: {model_name}, {ethical_name}\")

if __name__ == '__main__':
    train_governor()

