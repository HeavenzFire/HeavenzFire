import torch
import torch.nn as nn
import torch.optim as optim
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset, TensorDataset
import numpy as np
from spectral_decay import explicit_fd_step, build_spectral_decay_matrix, evolve_spectral  # Reuse existing physics

# Sovereign Params
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
N_low = 64      # Student lattice
N_high = 256    # Teacher lattice
L = 2 * np.pi
dx_low = L / N_low
dx_high = L / N_high
nu = 1.0
dt = 0.01       # Smaller dt for stability
k_cut = 8       # Tail modes |k| > k_cut for loss focus
num_steps_fine = 4  # Teacher multi-step flux accumulation
batch_size = 16
num_samples = 1000
epochs = 100
lr = 1e-3
lambda_reg = 0.1  # Physics reg weight

class SpectralGovernor(nn.Module):
    """U-Net-like for sub-grid flux prediction in Fourier space."""
    def __init__(self, N):
        super().__init__()
        ch = 32
        self.enc1 = self.conv_block(2, ch, 3, 1)
        self.enc2 = self.conv_block(ch, ch*2, 3, 1)
        self.pool = nn.MaxPool2d(2)
        self.bottleneck = self.conv_block(ch*2, ch*4, 3, 1)
        self.up1 = nn.ConvTranspose2d(ch*4, ch*2, 2, 2)
        self.dec1 = self.conv_block(ch*4, ch*2, 3, 1)  # Skip
        self.up2 = nn.ConvTranspose2d(ch*2, ch, 2, 2)
        self.dec2 = self.conv_block(ch*2, 2, 3, 1)  # Skip
        self.N = N

    def conv_block(self, in_ch, out_ch, k, p):
        return nn.Sequential(
            nn.Conv2d(in_ch, out_ch, k, padding=p),
            nn.GELU(),
            nn.Conv2d(out_ch, out_ch, k, padding=p),
            nn.GELU()
        )

    def forward(self, u_real_imag):
        # Encoder
        e1 = self.enc1(u_real_imag)
        e2 = self.enc2(self.pool(e1))
        b = self.bottleneck(self.pool(e2))
        # Decoder
        d1 = self.dec1(torch.cat([self.up1(b), e2], dim=1))
        d2 = self.dec2(torch.cat([self.up2(d1), e1], dim=1))
        return d2  # [B,2,N,N] real/imag flux correction

def generate_dataset(num_samples):
    """Physics-based dataset: teacher FD high-res -> true SGS flux vs coarse spectral."""
    X_list, y_list = [], []
    kx = 2 * np.pi * np.fft.fftfreq(N_low, dx_low)
    ky = kx.copy()
    KX_low, KY_low = np.meshgrid(kx, ky)
    K2_low = KX_low**2 + KY_low**2
    mask_tail = np.sqrt(K2_low) > k_cut

    for _ in range(num_samples):
        # High-freq initial (turbulence-like)
        X_low, Y_low = np.meshgrid(np.linspace(0, L, N_low, endpoint=False),
                                   np.linspace(0, L, N_low, endpoint=False))
        u0_low_phys = np.sin(X_low) * np.cos(Y_low) + 0.5 * np.sin(3 * X_low + Y_low)
        u0_high_phys = np.sin(X_low * N_high/N_low) * np.cos(Y_low * N_high/N_low) + \
                       0.5 * np.sin(3 * X_low * N_high/N_low + Y_low * N_high/N_low)  # Finer

        # Teacher: unstable FD high-res multi-step (generates sub-grid physics)
        u_high = u0_high_phys.copy()
        for _ in range(num_steps_fine):
            u_high = explicit_fd_step(u_high, nu, dt, dx_high)

        # Student baseline: spectral low-res
        u0_hat_low = np.fft.fft2(u0_low_phys)
        G_low = np.exp(-nu * K2_low * dt * num_steps_fine)
        u_hat_low_pred = u0_hat_low * G_low
        u_low_spectral = np.real(np.fft.ifft2(u_hat_low_pred))

        # True SGS flux: interp high to low - spectral low
        from scipy.ndimage import zoom
        u_high_interp = zoom(u_high, N_low / N_high, order=1)  # Bilinear interp
        sgs_flux_phys = u_high_interp - u_low_spectral

        # Fourier SGS target (tail correction)
        sgs_flux_hat_real = np.fft.fft2(sgs_flux_phys).real
        sgs_flux_hat_imag = np.fft.fft2(sgs_flux_phys).imag
        y_phys = np.stack([sgs_flux_hat_real * mask_tail, sgs_flux_hat_imag * mask_tail], axis=0)

        # Input: low-res u_hat real/imag (full)
        u_hat_low_real_im = np.stack([u_hat_low_pred.real, u_hat_low_pred.imag], axis=0)
        X_phys = u_hat_low_real_im[np.newaxis, ...]  # [1,C,N,N]

        X_list.append(X_phys)
        y_list.append(y_phys[np.newaxis, ...])

    X_t = torch.tensor(np.concatenate(X_list), dtype=torch.float32).to(device)
    y_t = torch.tensor(np.concatenate(y_list), dtype=torch.float32).to(device)
    return TensorDataset(X_t, y_t)

# Dataset & Model
print("Generating physics dataset...")
dataset = generate_dataset(num_samples)
dataloader = DataLoader(dataset, batch_size=batch_size, shuffle=True)

governor = SpectralGovernor(N_low).to(device)
optimizer = optim.Adam(governor.parameters(), lr=lr)
mse_loss = nn.MSELoss()

def divergence_reg(u_real):  # Discrete div on physical space u correction
    u_grad_x = (torch.roll(u_real, -1, dims=2) - torch.roll(u_real, 1, dims=2)) / dx_low
    u_grad_y = (torch.roll(u_real, -1, dims=3) - torch.roll(u_real, 1, dims=3)) / dx_low
    return torch.mean(u_grad_x + u_grad_y)**2

print("Igniting Neural Governor training...")
for epoch in range(epochs):
    governor.train()
    total_loss = 0
    for x_batch, y_batch in dataloader:
        opt_zero = optimizer.zero_grad

        pred_ri = governor(x_batch)  # [B,2,N,N]
        pred_real = pred_ri[:,0]
        pred_imag = pred_ri[:,1]
        loss_tail = mse_loss(pred_ri, y_batch)  # Tail MSE

        u_hat_corr_real = x_batch[:,0] + pred_real
        u_hat_corr_imag = x_batch[:,1] + pred_imag
        u_corr_phys = torch.real(torch.fft.ifft2(torch.complex(u_hat_corr_real, u_hat_corr_imag)))
        loss_reg = divergence_reg(u_corr_phys)

        loss = loss_tail + lambda_reg * loss_reg
        loss.backward()
        optimizer.step()

        total_loss += loss.item()

    avg_loss = total_loss / len(dataloader)
    print(f"Epoch {epoch+1}/{epochs}: Loss={avg_loss:.4e} (tail={loss_tail:.4e}, reg={loss_reg:.4e})")

torch.save(governor.state_dict(), 'neural_governor.pt')
print("✅ Sovereign training complete. Model saved as neural_governor.pt")
