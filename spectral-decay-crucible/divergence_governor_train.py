import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, Dataset, TensorDataset
from spectral_decay import explicit_fd_step, build_spectral_decay_matrix
from neural_governor_train import SpectralGovernor, generate_dataset, N_low, L, dx_low, nu, dt, k_cut, num_steps_fine

class DivergenceGovernor(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(5, 64)  # inputs: max_norm, high_k_energy, div_reg, lap_norm, spectral_tail
        self.fc2 = nn.Linear(64, 32)
        self.dt_head = nn.Linear(32, 1)  # adaptive dt
        self.flag_head = nn.Linear(32, 1)  # stability flag sigmoid
        self.relu = nn.ReLU()

    def forward(self, x):
        x = self.relu(self.fc1(x))
        x = self.relu(self.fc2(x))
        dt_adj = torch.sigmoid(self.dt_head(x)) * dt  # 0-dt range
        flag = torch.sigmoid(self.flag_head(x))  # 0-1 prob diverge
        return dt_adj.squeeze(), flag.squeeze()

def generate_divergence_dataset(num_samples):
    features = []
    dt_targets = []
    flag_targets = []
    for _ in range(num_samples):
        # Generate trajectory
        X, Y = np.meshgrid(np.linspace(0, L, N_low, endpoint=False), np.linspace(0, L, N_low, endpoint=False))
        u_phys = np.sin(X) * np.cos(Y) + 0.1 * np.random.randn(N_low, N_low)  # Noisy turbulent
        max_norm = np.max(np.abs(u_phys))
        u_hat = np.fft.fft2(u_phys)
        kx = 2 * np.pi * np.fft.fftfreq(N_low, dx_low)
        ky = kx.copy()
        KX, KY = np.meshgrid(kx, ky)
        high_k_energy = np.sum(np.abs(u_hat) ** 2 * (np.sqrt(KX**2 + KY**2) > k_cut))
        spectral_tail = np.mean(np.abs(u_hat) ** 2)
        
        # Simulate FD trajectory to label
        u_traj = u_phys.copy()
        div_reg = 0
        lap_norm = 0
        is_diverge = 0
        for step in range(10):  # Short traj
            lap = (np.roll(u_traj, 1, 0) + np.roll(u_traj, -1, 0) + np.roll(u_traj, 1, 1) + np.roll(u_traj, -1, 1) - 4*u_traj) / dx_low**2
            lap_norm = np.mean(np.abs(lap))
            u_grad_x = (np.roll(u_traj, -1, 1) - np.roll(u_traj, 1, 1)) / dx_low
            u_grad_y = (np.roll(u_traj, -1, 0) - np.roll(u_traj, 1, 0)) / dx_low
            div_reg = np.mean(np.abs(u_grad_x + u_grad_y))
            u_traj = u_traj + nu * dt * lap
            if np.max(np.abs(u_traj)) > 1e4:
                is_diverge = 1
                dt_target = dt * 0.5  # Reduce dt
                break
        else:
            dt_target = dt
            is_diverge = 0
        
        feat = np.array([max_norm, high_k_energy, div_reg, lap_norm, spectral_tail])
        features.append(feat)
        dt_targets.append(dt_target)
        flag_targets.append(is_diverge)
    
    X_t = torch.tensor(np.array(features), dtype=torch.float32)
    y_dt = torch.tensor(np.array(dt_targets), dtype=torch.float32)
    y_flag = torch.tensor(np.array(flag_targets), dtype=torch.float32)
    return TensorDataset(X_t, torch.stack([y_dt, y_flag], dim=1))

dataset = generate_divergence_dataset(2000)
dataloader = DataLoader(dataset, batch_size=64, shuffle=True)

governor = DivergenceGovernor()
optimizer = optim.Adam(governor.parameters(), lr=1e-3)
mse = nn.MSELoss()
bce = nn.BCEWithLogitsLoss()

for epoch in range(200):
    total_loss = 0
    governor.train()
    for x, y in dataloader:
        pred_dt, pred_flag = governor(x)
        loss_dt = mse(pred_dt, y[:,0])
        loss_flag = bce(pred_flag, y[:,1])
        loss = loss_dt + loss_flag
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        total_loss += loss.item()
    print(f'Epoch {epoch}: Loss {total_loss / len(dataloader):.4f} (dt {loss_dt:.4f}, flag {loss_flag:.4f})')

torch.save(governor.state_dict(), 'divergence_governor.pt')
print('Divergence Governor ready.')
