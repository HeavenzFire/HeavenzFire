# Quantum Soft-Bowl Model

This module adds a reproducible one-dimensional quantum harmonic-oscillator baseline to the HeavenzFire Unified Field.

## Physics

\[
H = -\frac{\hbar^2}{2m}\frac{d^2}{dx^2} + \frac12 m\omega^2x^2
\]

The exact energy levels are \(E_n=(n+\frac12)\hbar\omega\). For the ground state, \(\Delta x=\sqrt{\hbar/(2m\omega)}\), \(\Delta p=\sqrt{m\hbar\omega/2}\), and \(\Delta x\Delta p=\hbar/2\).

## Run

Requires Python 3.10+ and NumPy.

From the repository root:

```powershell
python UnifiedField/quantum/soft_bowl.py
```

The program prints JSON containing the configuration, computed low-energy levels, relative errors versus the exact spectrum, discrete wavefunction norms, and basic validation results.

## Scope and limitations

- This is a classical numerical simulation of a quantum model, not a quantum processor or hardware connection.
- The second-order finite-difference approximation and finite spatial domain introduce discretization and boundary errors.
- The current solver uses a dense NumPy eigensolver; reduce `points` in `OscillatorConfig` for faster exploratory runs. A later performance pass can replace it with a tridiagonal eigensolver.
- Momentum uncertainty is reported as the exact ground-state reference; this first implementation does not yet calculate momentum-space wavefunctions.
- No experimental data or physical-device calibration is implied.
