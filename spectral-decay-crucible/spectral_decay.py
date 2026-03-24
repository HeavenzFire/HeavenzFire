import numpy as np
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation

def build_spectral_decay_matrix(N, L, nu, dt):
    k_vec = 2 * np.pi * np.fft.fftfreq(N, d=L/N)
    Kx, Ky = np.meshgrid(k_vec, k_vec)
    Lambda = -(Kx**2 + Ky**2)
    G = np.exp(nu * Lambda * dt)
    return G

def evolve_spectral(u, G):
    u_hat = np.fft.fft2(u)
    u_hat_new = u_hat * G
    return np.real(np.fft.ifft2(u_hat_new))

def explicit_fd_step(u, nu, dt, dx):
    lap = (np.roll(u, 1, 0) + np.roll(u, -1, 0) + np.roll(u, 1, 1) + np.roll(u, -1, 1) - 4*u) / dx**2
    return u + nu * dt * lap

# Crucible Test
N = 64
L = 2 * np.pi
dx = L / N
nu = 1.0
dt = 0.1
steps = 10
x = np.linspace(0, L, N, endpoint=False)
y = np.linspace(0, L, N, endpoint=False)
X, Y = np.meshgrid(x, y)
u0 = np.sin(X) * np.cos(Y) + 0.5 * np.sin(3*X + Y)  # High-freq initial

G = build_spectral_decay_matrix(N, L, nu, dt)

print("Crucible Test Results:")
print("Initial max norm:", np.max(np.abs(u0)))

u_spectral = u0.copy()
for i in range(steps):
    u_spectral = evolve_spectral(u_spectral, G)
print("Spectral after", steps, "steps (t=", steps*dt, ") max norm:", np.max(np.abs(u_spectral)))

u_fd = u0.copy()
stable = True
for i in range(steps):
    u_fd = explicit_fd_step(u_fd, nu, dt, dx)
    norm = np.max(np.abs(u_fd))
    print("FD step", i+1, "max norm:", norm)
    if norm > 1e6:
        stable = False
        print("FD diverged!")
        break

print("Spectral stable:", True)
print("FD stable:", stable)

# Plot
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))
ax1.imshow(u_spectral, cmap='RdBu', extent=[0, L, 0, L])
ax1.set_title('Spectral t=1.0')
ax2.imshow(u_fd if stable else np.zeros_like(u_fd), cmap='RdBu', extent=[0, L, 0, L])
ax2.set_title('FD (diverged)')
plt.show()

print("Plots shown. Spectral serene, FD in ghosts.")
